from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.data_inventory import DataInventoryAsset, DataInventoryField, FieldClassification
from app.models.data_source import DataSource
from app.models.organization import Organization, OrganizationStatus
from app.models.retention import (
    PolicyStatus,
    RetentionAction,
    RetentionPeriodUnit,
    RetentionPolicy,
    RetentionRun,
    RunStatus,
)
from app.models.user import User, UserRole
from app.schemas.retention import (
    PolicyCreate,
    PolicyImpact,
    PolicyRead,
    PolicyUpdate,
    RetentionEngineResult,
    RetentionSummary,
    RunRead,
)
from app.services import db_connector

# A policy is re-evaluated by the engine at most once per this window.
RUN_CADENCE_HOURS = 24

# DPDP baseline: records under a legal hold (processing/traffic logs, etc.) are
# retained at least this long, even after consent withdrawal. Used when a field is
# flagged mandatory_retention but no explicit day count is given.
DEFAULT_HOLD_DAYS = 365

_UNIT_DAYS = {
    RetentionPeriodUnit.days: 1,
    RetentionPeriodUnit.months: 30,
    RetentionPeriodUnit.years: 365,
}


def retention_days(policy: RetentionPolicy) -> int:
    return policy.period_value * _UNIT_DAYS[policy.period_unit]


class RetentionService:
    def __init__(self, db: Session):
        self.db = db

    # --- tenant scoping ---

    def _ensure_org_accessible(self, org_id: UUID) -> Organization:
        org = self.db.get(Organization, org_id)
        if org is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Organization not found")
        if org.status not in (OrganizationStatus.active, OrganizationStatus.pending):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Organization is not active")
        return org

    def _resolve_org_id(self, user: User, org_id: UUID | None = None) -> UUID:
        if user.role == UserRole.superadmin:
            if org_id is None:
                raise HTTPException(
                    status.HTTP_403_FORBIDDEN,
                    detail="Retention management requires an organization context",
                )
            self._ensure_org_accessible(org_id)
            return org_id
        if user.organization_id is None:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                detail="Retention management requires an organization context",
            )
        if org_id is not None and org_id != user.organization_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Organization not found")
        self._ensure_org_accessible(user.organization_id)
        return user.organization_id

    def _get_policy(self, user: User, policy_id: UUID, org_id: UUID | None) -> RetentionPolicy:
        resolved = self._resolve_org_id(user, org_id)
        policy = self.db.get(RetentionPolicy, policy_id)
        if policy is None or policy.organization_id != resolved:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Retention policy not found")
        return policy

    def _validate_targets(self, resolved_org: UUID, body: PolicyCreate | PolicyUpdate, data: dict) -> None:
        if data.get("data_source_id"):
            src = self.db.get(DataSource, data["data_source_id"])
            if src is None or src.organization_id != resolved_org:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Data source not found")
        if data.get("asset_id"):
            asset = self.db.get(DataInventoryAsset, data["asset_id"])
            if asset is None or asset.organization_id != resolved_org:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Asset not found")

    # --- serialization ---

    @staticmethod
    def _enforcement(policy: RetentionPolicy) -> tuple[str, str | None]:
        """Is this policy actually enforced, or documentation-only? Returns
        (state, reason). Only delete/anonymize with a complete target enforce."""
        if policy.status != PolicyStatus.active:
            return "documentation", f"Policy is {policy.status.value} — not evaluated by the engine."
        if policy.action in (RetentionAction.manual_review, RetentionAction.archive):
            return (
                "documentation",
                f"Action '{policy.action.value}' is tracked for audit; nothing is deleted automatically.",
            )
        if not (policy.data_source_id and policy.asset_id and policy.trigger_field):
            return (
                "documentation",
                "No target set (needs data source + asset + date column) — this policy does not act on any data.",
            )
        return "enforced", None

    def _serialize(self, policy: RetentionPolicy) -> PolicyRead:
        state, reason = self._enforcement(policy)
        return PolicyRead(
            id=policy.id,
            organization_id=policy.organization_id,
            name=policy.name,
            data_category=policy.data_category,
            data_source_id=policy.data_source_id,
            asset_id=policy.asset_id,
            trigger_field=policy.trigger_field,
            period_value=policy.period_value,
            period_unit=policy.period_unit,
            trigger_event=policy.trigger_event,
            legal_basis=policy.legal_basis,
            action=policy.action,
            auto_delete=policy.auto_delete,
            notify_before_days=policy.notify_before_days,
            status=policy.status,
            notes=policy.notes,
            retention_days=retention_days(policy),
            enforcement_state=state,
            enforcement_reason=reason,
            last_run_at=policy.last_run_at,
            run_count=len(policy.runs),
            created_at=policy.created_at,
            updated_at=policy.updated_at,
        )

    def preview_impact(self, user: User, policy_id: UUID, org_id: UUID | None = None) -> PolicyImpact:
        """What would running this policy do right now: expiring-row count +
        primary-key / foreign-key warnings. Read-only; never deletes."""
        policy = self._get_policy(user, policy_id, org_id)
        state, reason = self._enforcement(policy)
        if state != "enforced":
            return PolicyImpact(enforced=False, reason=reason, action=policy.action)

        eff_days = self._effective_retention_days(policy)
        cutoff = datetime.now(timezone.utc) - timedelta(days=eff_days)
        source = self.db.get(DataSource, policy.data_source_id)
        asset = self.db.get(DataInventoryAsset, policy.asset_id)
        if source is None or asset is None:
            return PolicyImpact(
                enforced=False, reason="Target source or asset no longer exists.", action=policy.action
            )

        matched: int | None = None
        count_note: str | None = None
        warnings: list[str] = []
        has_pk: bool | None = None
        dependent: list[str] = []

        # Legal hold summary for this asset.
        held = self._held_fields(asset.id)
        hold_days = self._hold_days_for_asset(asset.id)
        held_names = [f.name for f in held]
        if held:
            if policy.action == RetentionAction.delete and hold_days > retention_days(policy):
                warnings.append(
                    f"Legal hold: field(s) {', '.join(held_names)} must be kept ≥ {hold_days} days. "
                    f"The effective deletion cutoff is extended to {hold_days} days, so newer rows are retained."
                )
            elif policy.action == RetentionAction.anonymize:
                warnings.append(
                    f"Legal hold: field(s) {', '.join(held_names)} will be left unmasked (kept for the record)."
                )

        if not db_connector.supports_introspection(source):
            count_note = f"A live count isn't supported for '{source.source_type}' sources."
        else:
            try:
                matched = db_connector.count_rows_older_than(
                    source, asset.name, policy.trigger_field, cutoff
                )
            except Exception as exc:  # noqa: BLE001
                count_note = f"Count failed: {exc}"

            try:
                deps = db_connector.table_dependencies(source, asset.name)
                if deps.supported:
                    has_pk = deps.has_primary_key
                    dependent = deps.referencing_tables
                    if policy.action == RetentionAction.delete and not deps.has_primary_key:
                        warnings.append(
                            "Target table has no primary key — safe row-level deletion isn't possible."
                        )
                    if policy.action == RetentionAction.delete and dependent:
                        warnings.append(
                            "Deleting rows may violate foreign keys from: "
                            f"{', '.join(dependent)}. Set ON DELETE CASCADE at the database, "
                            "anonymise instead, or purge the child rows first."
                        )
                elif deps.note:
                    warnings.append(deps.note)
            except Exception as exc:  # noqa: BLE001
                warnings.append(f"Could not analyse table relationships: {exc}")

        return PolicyImpact(
            enforced=True,
            reason=None,
            action=policy.action,
            cutoff_date=cutoff,
            matched=matched,
            count_note=count_note,
            has_primary_key=has_pk,
            dependent_tables=dependent,
            legal_hold_days=hold_days,
            legal_hold_fields=held_names,
            warnings=warnings,
        )

    # --- CRUD ---

    def list_policies(self, user: User, org_id: UUID | None = None) -> list[PolicyRead]:
        resolved = self._resolve_org_id(user, org_id)
        rows = (
            self.db.execute(
                select(RetentionPolicy)
                .where(RetentionPolicy.organization_id == resolved)
                .order_by(RetentionPolicy.created_at.desc())
            )
            .scalars()
            .all()
        )
        return [self._serialize(p) for p in rows]

    def get_policy(self, user: User, policy_id: UUID, org_id: UUID | None = None) -> PolicyRead:
        return self._serialize(self._get_policy(user, policy_id, org_id))

    def create_policy(self, user: User, body: PolicyCreate, org_id: UUID | None = None) -> PolicyRead:
        resolved = self._resolve_org_id(user, org_id)
        data = body.model_dump()
        self._validate_targets(resolved, body, data)
        policy = RetentionPolicy(organization_id=resolved, **data)
        self.db.add(policy)
        self.db.commit()
        self.db.refresh(policy)
        return self._serialize(policy)

    def update_policy(
        self, user: User, policy_id: UUID, body: PolicyUpdate, org_id: UUID | None = None
    ) -> PolicyRead:
        policy = self._get_policy(user, policy_id, org_id)
        data = body.model_dump(exclude_unset=True)
        self._validate_targets(policy.organization_id, body, data)
        for attr, value in data.items():
            setattr(policy, attr, value)
        self.db.commit()
        self.db.refresh(policy)
        return self._serialize(policy)

    def delete_policy(self, user: User, policy_id: UUID, org_id: UUID | None = None) -> None:
        policy = self._get_policy(user, policy_id, org_id)
        self.db.delete(policy)
        self.db.commit()

    # --- legal hold (per-field mandatory retention) ---

    def _held_fields(self, asset_id: UUID) -> list[DataInventoryField]:
        """Fields on an asset that are under a legal-retention hold."""
        return list(
            self.db.execute(
                select(DataInventoryField).where(
                    DataInventoryField.asset_id == asset_id,
                    DataInventoryField.mandatory_retention.is_(True),
                )
            )
            .scalars()
            .all()
        )

    def _hold_days_for_asset(self, asset_id: UUID | None) -> int:
        """Strongest legal-retention hold (in days) across an asset's fields; 0 if none."""
        if asset_id is None:
            return 0
        held = self._held_fields(asset_id)
        return max((f.mandatory_retention_days or DEFAULT_HOLD_DAYS for f in held), default=0)

    def _effective_retention_days(self, policy: RetentionPolicy) -> int:
        """A delete never removes rows still inside a legal hold, so its effective
        retention is at least the strongest hold on the target. Anonymise keeps
        rows, so it isn't extended (held fields are skipped instead)."""
        base = retention_days(policy)
        if policy.action == RetentionAction.delete:
            return max(base, self._hold_days_for_asset(policy.asset_id))
        return base

    # --- runs (dry-run flag + confirm) ---

    @staticmethod
    def _certificate_ref() -> str:
        return f"DEL-{datetime.now(timezone.utc).year}-{secrets.token_hex(2).upper()}"

    def _evaluate_policy(
        self, policy: RetentionPolicy, executed_by: str, allow_execute: bool
    ) -> RetentionRun:
        """Create a run for a policy: dry-run COUNT, and — only if allow_execute
        and it's a delete-policy with a working target — perform the deletion.
        Caller commits."""
        now = datetime.now(timezone.utc)
        eff_days = self._effective_retention_days(policy)
        cutoff = now - timedelta(days=eff_days)
        hold_note = (
            f" Legal hold in effect — deletion cutoff extended to {eff_days} days."
            if eff_days > retention_days(policy)
            else ""
        )
        matched = 0
        run_status = RunStatus.pending_confirmation
        has_target = bool(policy.data_source_id and policy.asset_id and policy.trigger_field)
        source = asset = None
        detail: str

        if has_target:
            source = self.db.get(DataSource, policy.data_source_id)
            asset = self.db.get(DataInventoryAsset, policy.asset_id)
            if source is None or asset is None:
                has_target = False
                detail = "Target source/asset missing; flagged for manual review."
            elif not db_connector.supports_introspection(source):
                has_target = False
                detail = (
                    f"Live count not supported for '{source.source_type}' sources; "
                    "flagged for manual review."
                )
            else:
                try:
                    matched = db_connector.count_rows_older_than(
                        source, asset.name, policy.trigger_field, cutoff
                    )
                    detail = (
                        f"{matched} records in '{asset.name}' older than "
                        f"{cutoff.date().isoformat()} (dry-run, nothing deleted).{hold_note}"
                    )
                except Exception as exc:  # noqa: BLE001 — surface the DB error
                    run_status = RunStatus.failed
                    detail = f"Dry-run failed: {exc}"
        else:
            detail = "No source/asset/trigger field configured; flagged for manual review."

        run = RetentionRun(
            organization_id=policy.organization_id,
            policy_id=policy.id,
            run_at=now,
            cutoff_date=cutoff,
            records_matched=matched,
            records_deleted=0,
            action=policy.action,
            status=run_status,
            certificate_ref=self._certificate_ref(),
            executed_by=executed_by,
            detail=detail,
        )
        policy.last_run_at = now
        self.db.add(run)

        if (
            allow_execute
            and run_status == RunStatus.pending_confirmation
            and policy.action
            in (
                RetentionAction.delete,
                RetentionAction.anonymize,
                RetentionAction.mask,
                RetentionAction.pseudonymize,
            )
            and has_target
            and matched > 0
        ):
            self._execute_action(policy, run, source, asset)
        return run

    def _perform_delete(self, policy: RetentionPolicy, run: RetentionRun, source, asset) -> None:
        """Execute the destructive DELETE for a run; updates run in place."""
        from app.utils.data_source_integration import assert_write_actions_allowed

        assert_write_actions_allowed(source, action="deletion")
        try:
            deleted = db_connector.delete_rows_older_than(
                source, asset.name, policy.trigger_field, run.cutoff_date
            )
            run.records_deleted = deleted
            run.status = RunStatus.executed
            run.detail = (run.detail or "") + f" EXECUTED: deleted {deleted} row(s)."
        except Exception as exc:  # noqa: BLE001
            run.status = RunStatus.failed
            run.detail = (run.detail or "") + f" Execution failed: {exc}"

    def _evidentiary_keep_fields(self, policy: RetentionPolicy) -> set[str]:
        from app.models.organization_settings import OrganizationSettings

        keep: set[str] = set()
        if policy.evidentiary_profile and isinstance(policy.evidentiary_profile, dict):
            keep.update(policy.evidentiary_profile.get("keep_fields") or [])
        settings = (
            self.db.query(OrganizationSettings)
            .filter(OrganizationSettings.organization_id == policy.organization_id)
            .first()
        )
        if settings and settings.retention_evidentiary_config:
            cfg = settings.retention_evidentiary_config
            if isinstance(cfg, dict):
                keep.update(cfg.get("keep_fields") or [])
        return {str(k).lower() for k in keep if k}

    def _perform_anonymize(self, policy: RetentionPolicy, run: RetentionRun, source, asset) -> None:
        """Anonymise (mask) the PII columns of expired rows instead of deleting them."""
        from app.utils.data_source_integration import assert_write_actions_allowed

        assert_write_actions_allowed(source, action="anonymization")
        from app.services.masking_service import MaskingService, transform_value

        pii_fields = self.db.execute(
            select(DataInventoryField).where(
                DataInventoryField.asset_id == asset.id,
                DataInventoryField.classification.in_(
                    [FieldClassification.personal, FieldClassification.sensitive]
                ),
                # Fields under a legal-retention hold must be kept as-is, not masked.
                DataInventoryField.mandatory_retention.is_(False),
            )
        ).scalars().all()
        keep = self._evidentiary_keep_fields(policy)
        if keep:
            pii_fields = [f for f in pii_fields if f.name.lower() not in keep]
        held = self._held_fields(asset.id)
        held_note = (
            f" {len(held)} field(s) under legal hold left unmasked." if held else ""
        )
        if not pii_fields:
            run.status = RunStatus.executed
            run.records_deleted = 0
            run.detail = (
                (run.detail or "")
                + " ANONYMISE: no maskable PII columns."
                + held_note
            )
            return

        masking = MaskingService(self.db)
        column_transforms: list[tuple] = []
        for fld in pii_fields:
            strategy, params = masking._rule_for(policy.organization_id, fld.pii_category)

            def _fn(value, s=strategy, p=params, c=fld.pii_category):
                return transform_value(str(value), s, c, p)

            column_transforms.append((fld.name, _fn))

        try:
            id_col = db_connector.find_identifier_column(source, asset.name)
            updated = db_connector.anonymize_rows_older_than(
                source, asset.name, id_col, policy.trigger_field, run.cutoff_date, column_transforms
            )
            run.records_deleted = updated
            run.status = RunStatus.executed
            run.detail = (run.detail or "") + (
                f" ANONYMISED: {updated} row(s) across {len(pii_fields)} PII column(s).{held_note}"
            )
        except Exception as exc:  # noqa: BLE001
            run.status = RunStatus.failed
            run.detail = (run.detail or "") + f" Anonymise failed: {exc}"

    def _perform_mask(self, policy: RetentionPolicy, run: RetentionRun, source, asset) -> None:
        """Mask PII columns on expired rows (partial redaction — Req 6)."""
        self._perform_anonymize(policy, run, source, asset)
        if run.detail:
            run.detail = run.detail.replace("ANONYMISED", "MASKED")

    def _perform_pseudonymize(self, policy: RetentionPolicy, run: RetentionRun, source, asset) -> None:
        """Irreversible pseudonymization (hash) of PII columns on expired rows."""
        from app.utils.data_source_integration import assert_write_actions_allowed
        from app.models.masking import MaskingStrategy
        from app.services.masking_service import MaskingService, transform_value

        assert_write_actions_allowed(source, action="pseudonymization")
        pii_fields = self.db.execute(
            select(DataInventoryField).where(
                DataInventoryField.asset_id == asset.id,
                DataInventoryField.classification.in_(
                    [FieldClassification.personal, FieldClassification.sensitive]
                ),
                DataInventoryField.mandatory_retention.is_(False),
            )
        ).scalars().all()
        keep = self._evidentiary_keep_fields(policy)
        if keep:
            pii_fields = [f for f in pii_fields if f.name.lower() not in keep]
        held = self._held_fields(asset.id)
        held_note = f" {len(held)} field(s) under legal hold left unchanged." if held else ""
        if not pii_fields:
            run.status = RunStatus.executed
            run.detail = (run.detail or "") + " PSEUDONYMIZE: no eligible columns." + held_note
            return
        masking = MaskingService(self.db)
        column_transforms: list[tuple] = []
        for fld in pii_fields:
            strategy, params = MaskingStrategy.hash, {}

            def _fn(value, s=strategy, p=params, c=fld.pii_category):
                return transform_value(str(value), s, c, p)

            column_transforms.append((fld.name, _fn))
        try:
            id_col = db_connector.find_identifier_column(source, asset.name)
            updated = db_connector.anonymize_rows_older_than(
                source, asset.name, id_col, policy.trigger_field, run.cutoff_date, column_transforms
            )
            run.records_deleted = updated
            run.status = RunStatus.executed
            run.detail = (run.detail or "") + (
                f" PSEUDONYMIZED: {updated} row(s) across {len(pii_fields)} column(s).{held_note}"
            )
        except Exception as exc:  # noqa: BLE001
            run.status = RunStatus.failed
            run.detail = (run.detail or "") + f" Pseudonymize failed: {exc}"

    def _perform_archive(self, policy: RetentionPolicy, run: RetentionRun, source, asset) -> None:
        """Record archival manifest for expired rows (discovery-safe — no row deletion)."""
        from app.utils.data_source_integration import effective_integration_mode
        from app.models.data_source import IntegrationMode

        mode = effective_integration_mode(source)
        try:
            matched = run.records_matched or 0
            if matched == 0 and policy.trigger_field and hasattr(db_connector, "count_rows_older_than"):
                matched = db_connector.count_rows_older_than(
                    source, asset.name, policy.trigger_field, run.cutoff_date
                )
        except Exception as exc:  # noqa: BLE001
            run.status = RunStatus.failed
            run.detail = (run.detail or "") + f" Archive manifest failed: {exc}"
            return
        run.status = RunStatus.executed
        run.records_deleted = 0
        run.detail = (run.detail or "") + (
            f" ARCHIVED: manifest for {matched or 0} row(s) recorded "
            f"(integration={mode.value}). Operational PII remains until cold-store connector runs."
        )

    def _execute_action(self, policy: RetentionPolicy, run: RetentionRun, source, asset) -> None:
        """Dispatch retention action across connected systems."""
        if policy.action == RetentionAction.anonymize:
            self._perform_anonymize(policy, run, source, asset)
        elif policy.action == RetentionAction.mask:
            self._perform_mask(policy, run, source, asset)
        elif policy.action == RetentionAction.pseudonymize:
            self._perform_pseudonymize(policy, run, source, asset)
        elif policy.action == RetentionAction.archive:
            self._perform_archive(policy, run, source, asset)
        elif policy.action == RetentionAction.delete:
            self._perform_delete(policy, run, source, asset)
        else:
            run.status = RunStatus.completed
            run.detail = (run.detail or "") + " — manual review required (no automated action)."

    def run_policy(self, user: User, policy_id: UUID, org_id: UUID | None = None) -> RunRead:
        """Manual dry-run: COUNT what would expire. Never deletes."""
        policy = self._get_policy(user, policy_id, org_id)
        run = self._evaluate_policy(policy, user.email, allow_execute=False)
        self.db.commit()
        self.db.refresh(run)
        return RunRead.model_validate(run)

    def execute_run(self, user: User, run_id: UUID, org_id: UUID | None = None) -> RunRead:
        """Explicitly execute a pending delete-run: really delete the matched rows."""
        resolved = self._resolve_org_id(user, org_id)
        run = self.db.get(RetentionRun, run_id)
        if run is None or run.organization_id != resolved:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Run not found")
        if run.status != RunStatus.pending_confirmation:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Run is not pending")
        policy = self.db.get(RetentionPolicy, run.policy_id)
        if policy is None or policy.action not in (
            RetentionAction.delete,
            RetentionAction.anonymize,
            RetentionAction.mask,
            RetentionAction.pseudonymize,
            RetentionAction.archive,
        ):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Execution is only for delete, anonymize, mask, pseudonymize, or archive policies.",
            )
        if not (policy.data_source_id and policy.asset_id and policy.trigger_field):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, detail="Policy has no configured target to act on."
            )
        source = self.db.get(DataSource, policy.data_source_id)
        asset = self.db.get(DataInventoryAsset, policy.asset_id)
        if source is None or asset is None or not db_connector.supports_introspection(source):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Target source/asset unavailable.")
        run.executed_by = user.email
        self._execute_action(policy, run, source, asset)
        self.db.commit()
        self.db.refresh(run)
        return RunRead.model_validate(run)

    def confirm_run(self, user: User, run_id: UUID, org_id: UUID | None = None) -> RunRead:
        """Acknowledge a pending run (audit only — does NOT delete). For non-delete
        actions (anonymize/archive/manual_review) handled out-of-band."""
        resolved = self._resolve_org_id(user, org_id)
        run = self.db.get(RetentionRun, run_id)
        if run is None or run.organization_id != resolved:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Run not found")
        if run.status != RunStatus.pending_confirmation:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, detail="Run is not pending confirmation"
            )
        run.status = RunStatus.completed
        run.records_deleted = 0
        run.executed_by = user.email
        run.detail = (run.detail or "") + " — acknowledged (audit only; no rows deleted)."
        self.db.commit()
        self.db.refresh(run)
        return RunRead.model_validate(run)

    # --- engine (scheduler core) ---

    def _due_policies(self, org_id: UUID | None) -> list[RetentionPolicy]:
        cutoff_time = datetime.now(timezone.utc) - timedelta(hours=RUN_CADENCE_HOURS)
        stmt = select(RetentionPolicy).where(
            RetentionPolicy.status == PolicyStatus.active,
            or_(
                RetentionPolicy.last_run_at.is_(None),
                RetentionPolicy.last_run_at < cutoff_time,
            ),
        )
        if org_id is not None:
            stmt = stmt.where(RetentionPolicy.organization_id == org_id)
        return list(self.db.execute(stmt).scalars().all())

    def _run_engine(self, policies: list[RetentionPolicy], executed_by: str) -> RetentionEngineResult:
        runs_created = runs_executed = rows_deleted = flagged = 0
        for policy in policies:
            run = self._evaluate_policy(policy, executed_by, allow_execute=policy.auto_delete)
            runs_created += 1
            if run.status == RunStatus.executed:
                runs_executed += 1
                rows_deleted += run.records_deleted
            elif run.status == RunStatus.pending_confirmation:
                flagged += 1
        return RetentionEngineResult(
            policies_evaluated=len(policies),
            runs_created=runs_created,
            runs_executed=runs_executed,
            rows_deleted=rows_deleted,
            flagged=flagged,
        )

    def run_due_for_org(self, user: User, org_id: UUID | None = None) -> RetentionEngineResult:
        resolved = self._resolve_org_id(user, org_id)
        result = self._run_engine(self._due_policies(resolved), executed_by=f"manual:{user.email}")
        self.db.commit()
        return result

    def run_engine_all_orgs(self) -> RetentionEngineResult:
        """Used by the background scheduler — evaluates due policies across all orgs."""
        result = self._run_engine(self._due_policies(None), executed_by="scheduler")
        self.db.commit()
        return result

    def list_runs(
        self, user: User, policy_id: UUID | None = None, org_id: UUID | None = None
    ) -> list[RunRead]:
        resolved = self._resolve_org_id(user, org_id)
        stmt = (
            select(RetentionRun)
            .where(RetentionRun.organization_id == resolved)
            .order_by(RetentionRun.run_at.desc())
        )
        if policy_id is not None:
            stmt = stmt.where(RetentionRun.policy_id == policy_id)
        rows = self.db.execute(stmt).scalars().all()
        return [RunRead.model_validate(r) for r in rows]

    # --- summary ---

    def get_summary(self, user: User, org_id: UUID | None = None) -> RetentionSummary:
        resolved = self._resolve_org_id(user, org_id)

        total = self.db.scalar(
            select(func.count(RetentionPolicy.id)).where(
                RetentionPolicy.organization_id == resolved
            )
        ) or 0
        active = self.db.scalar(
            select(func.count(RetentionPolicy.id)).where(
                RetentionPolicy.organization_id == resolved,
                RetentionPolicy.status == PolicyStatus.active,
            )
        ) or 0
        pending = self.db.scalar(
            select(func.count(RetentionRun.id)).where(
                RetentionRun.organization_id == resolved,
                RetentionRun.status == RunStatus.pending_confirmation,
            )
        ) or 0
        flagged = self.db.scalar(
            select(func.coalesce(func.sum(RetentionRun.records_matched), 0)).where(
                RetentionRun.organization_id == resolved,
                RetentionRun.status == RunStatus.pending_confirmation,
            )
        ) or 0
        deleted = self.db.scalar(
            select(func.coalesce(func.sum(RetentionRun.records_deleted), 0)).where(
                RetentionRun.organization_id == resolved,
                RetentionRun.status == RunStatus.executed,
            )
        ) or 0

        return RetentionSummary(
            active_policies=active,
            total_policies=total,
            pending_confirmations=pending,
            records_flagged=int(flagged),
            records_deleted_total=int(deleted),
        )
