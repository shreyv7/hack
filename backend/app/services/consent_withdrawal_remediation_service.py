"""Wire consent withdrawal events to retention obligations and remediation tasks."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.consent import Purpose
from app.models.consent_principal import ConsentPrincipal
from app.models.data_inventory import DataInventoryAsset, DataInventoryField
from app.models.enforcement import (
    PurposeDataMapping,
    RemediationTaskStatus,
    WithdrawalAction,
    WithdrawalRemediationTask,
)
from app.models.retention import (
    PolicyStatus,
    RetentionAction,
    RetentionPeriodUnit,
    RetentionPolicy,
    RetentionRun,
    RunStatus,
    TriggerEvent,
)
from app.schemas.retention import ObligationCreate
from app.services.proof_vault_service import ProofVaultService
from app.services.retention_obligation_service import RetentionObligationService

MANUAL_REMEDIATION_SLA_HOURS = 72

_WITHDRAWAL_TO_RETENTION: dict[WithdrawalAction, RetentionAction] = {
    WithdrawalAction.mask: RetentionAction.mask,
    WithdrawalAction.anonymize: RetentionAction.anonymize,
    WithdrawalAction.delete: RetentionAction.delete,
    WithdrawalAction.pseudonymize: RetentionAction.pseudonymize,
    WithdrawalAction.flag_manual_review: RetentionAction.manual_review,
}


def detect_withdrawn_purpose_keys(
    prior: dict[str, bool] | None,
    current: dict[str, bool] | None,
) -> list[str]:
    """Return purpose keys that were consented before but are now denied."""
    if not prior:
        return []
    current_map = current or {}
    withdrawn: list[str] = []
    for key, was_allowed in prior.items():
        if key == "necessary":
            continue
        if was_allowed and not current_map.get(key, False):
            withdrawn.append(key)
    return withdrawn


@dataclass
class WithdrawalRemediationResult:
    withdrawn_purpose_keys: list[str] = field(default_factory=list)
    resolved_purpose_ids: list[UUID] = field(default_factory=list)
    obligations_created: int = 0
    remediation_tasks_created: int = 0
    retention_runs_created: int = 0
    purposes_suppressed: int = 0
    proof_vault_record_id: UUID | None = None
    skipped_no_mappings: int = 0


class ConsentWithdrawalRemediationService:
    def __init__(self, db: Session):
        self.db = db
        self._obligations = RetentionObligationService(db)

    def handle_consent_withdrawal(
        self,
        *,
        organization_id: UUID,
        principal_id: UUID | None,
        withdrawn_purpose_keys: list[str],
        receipt_id: UUID | None = None,
        property_id: UUID | None = None,
    ) -> WithdrawalRemediationResult:
        result = WithdrawalRemediationResult(withdrawn_purpose_keys=withdrawn_purpose_keys)
        if not withdrawn_purpose_keys or principal_id is None:
            return result

        purpose_ids = self._resolve_purpose_ids(organization_id, withdrawn_purpose_keys)
        result.resolved_purpose_ids = purpose_ids
        if not purpose_ids:
            return result

        mappings = (
            self.db.execute(
                select(PurposeDataMapping).where(
                    PurposeDataMapping.organization_id == organization_id,
                    PurposeDataMapping.purpose_id.in_(purpose_ids),
                )
            )
            .scalars()
            .all()
        )
        if not mappings:
            result.skipped_no_mappings = len(purpose_ids)
            return result

        principal = self.db.get(ConsentPrincipal, principal_id)
        subject_ref = principal.canonical_ref if principal else str(principal_id)

        for mapping in mappings:
            field = self.db.get(DataInventoryField, mapping.inventory_field_id)
            if field is None:
                continue
            asset = self.db.get(DataInventoryAsset, field.asset_id)
            if asset is None:
                continue

            if mapping.withdrawal_action == WithdrawalAction.suppress:
                result.purposes_suppressed += 1
                continue

            if asset.data_source_id is not None:
                policy = self._ensure_policy_for_mapping(mapping, field, asset)
                action = _WITHDRAWAL_TO_RETENTION.get(mapping.withdrawal_action, RetentionAction.delete)
                purpose = self.db.get(Purpose, mapping.purpose_id)
                purpose_label = purpose.name if purpose else str(mapping.purpose_id)
                self._obligations.create_from_event(
                    organization_id,
                    ObligationCreate(
                        subject_ref=subject_ref,
                        trigger_event=TriggerEvent.consent_withdrawal,
                        data_category=field.pii_category or field.name,
                        purpose=purpose_label,
                        occurred_at=datetime.now(timezone.utc),
                        action=action,
                        retention_days=0,
                        notes=(
                            f"Auto-created from purpose_data_mapping {mapping.id} "
                            f"for field '{field.name}' (receipt {receipt_id})"
                        ),
                    ),
                    source="consent_withdrawal",
                )
                result.obligations_created += 1
                run = self._create_scoped_retention_run(
                    organization_id=organization_id,
                    policy=policy,
                    principal_id=principal_id,
                    mapping=mapping,
                    field=field,
                    receipt_id=receipt_id,
                )
                if run is not None:
                    result.retention_runs_created += 1
            else:
                task = self._create_remediation_task(
                    mapping=mapping,
                    principal_id=principal_id,
                    receipt_id=receipt_id,
                    property_id=property_id,
                )
                if task is not None:
                    result.remediation_tasks_created += 1

        if result.obligations_created or result.remediation_tasks_created or result.purposes_suppressed:
            event_type = (
                "purpose_suppressed"
                if result.purposes_suppressed and not result.obligations_created and not result.remediation_tasks_created
                else "withdrawal_remediation_initiated"
            )
            proof_id = self._seal_proof(
                organization_id=organization_id,
                receipt_id=receipt_id,
                purpose_ids=purpose_ids,
                result=result,
                event_type=event_type,
            )
            result.proof_vault_record_id = proof_id

        return result

    def _resolve_purpose_ids(self, organization_id: UUID, keys: list[str]) -> list[UUID]:
        resolved: list[UUID] = []
        for key in keys:
            try:
                purpose_uuid = UUID(key)
                purpose = self.db.get(Purpose, purpose_uuid)
                if purpose and purpose.organization_id == organization_id:
                    resolved.append(purpose.id)
                    continue
            except ValueError:
                pass
            purpose = (
                self.db.execute(
                    select(Purpose).where(
                        Purpose.organization_id == organization_id,
                        Purpose.name.ilike(key),
                    )
                )
                .scalars()
                .first()
            )
            if purpose:
                resolved.append(purpose.id)
        return list(dict.fromkeys(resolved))

    def _ensure_policy_for_mapping(
        self,
        mapping: PurposeDataMapping,
        field: DataInventoryField,
        asset: DataInventoryAsset,
    ) -> RetentionPolicy:
        existing = (
            self.db.execute(
                select(RetentionPolicy).where(
                    RetentionPolicy.organization_id == mapping.organization_id,
                    RetentionPolicy.source_purpose_id == mapping.purpose_id,
                    RetentionPolicy.asset_id == asset.id,
                )
            )
            .scalars()
            .first()
        )
        if existing:
            return existing

        purpose = self.db.get(Purpose, mapping.purpose_id)
        action = _WITHDRAWAL_TO_RETENTION.get(mapping.withdrawal_action, RetentionAction.delete)
        policy = RetentionPolicy(
            organization_id=mapping.organization_id,
            name=f"Withdrawal: {purpose.name if purpose else mapping.purpose_id} → {field.name}",
            data_category=field.pii_category or field.name,
            data_source_id=asset.data_source_id,
            asset_id=asset.id,
            trigger_field="created_at",
            period_value=1,
            period_unit=RetentionPeriodUnit.days,
            trigger_event=TriggerEvent.consent_withdrawal,
            action=action,
            auto_delete=False,
            status=PolicyStatus.active,
            source_purpose_id=mapping.purpose_id,
            notes=f"Auto-generated from purpose_data_mapping {mapping.id}",
        )
        self.db.add(policy)
        self.db.commit()
        self.db.refresh(policy)
        return policy

    def _create_scoped_retention_run(
        self,
        *,
        organization_id: UUID,
        policy: RetentionPolicy,
        principal_id: UUID,
        mapping: PurposeDataMapping,
        field: DataInventoryField,
        receipt_id: UUID | None,
    ) -> RetentionRun | None:
        now = datetime.now(timezone.utc)
        run = RetentionRun(
            organization_id=organization_id,
            policy_id=policy.id,
            run_at=now,
            cutoff_date=now,
            records_matched=0,
            records_deleted=0,
            action=policy.action,
            status=RunStatus.pending_confirmation,
            detail=(
                f"Principal-scoped withdrawal remediation (principal_id={principal_id}, "
                f"field={field.name}, mapping={mapping.id}, receipt={receipt_id}). "
                "Confirm after verifying subject-specific rows."
            ),
        )
        self.db.add(run)
        self.db.commit()
        self.db.refresh(run)
        return run

    def _create_remediation_task(
        self,
        *,
        mapping: PurposeDataMapping,
        principal_id: UUID,
        receipt_id: UUID | None,
        property_id: UUID | None,
    ) -> WithdrawalRemediationTask | None:
        now = datetime.now(timezone.utc)
        existing = (
            self.db.execute(
                select(WithdrawalRemediationTask).where(
                    WithdrawalRemediationTask.organization_id == mapping.organization_id,
                    WithdrawalRemediationTask.purpose_id == mapping.purpose_id,
                    WithdrawalRemediationTask.inventory_field_id == mapping.inventory_field_id,
                    WithdrawalRemediationTask.principal_id == principal_id,
                    WithdrawalRemediationTask.status.in_(
                        [RemediationTaskStatus.pending, RemediationTaskStatus.in_progress]
                    ),
                )
            )
            .scalars()
            .first()
        )
        if existing:
            return None

        task = WithdrawalRemediationTask(
            organization_id=mapping.organization_id,
            purpose_id=mapping.purpose_id,
            inventory_field_id=mapping.inventory_field_id,
            principal_id=principal_id,
            property_id=property_id,
            receipt_id=receipt_id,
            mapping_id=mapping.id,
            action=mapping.withdrawal_action,
            status=RemediationTaskStatus.pending,
            sla_due_at=now + timedelta(hours=MANUAL_REMEDIATION_SLA_HOURS),
            notes="Unconnected inventory field — manual remediation required within 72 hours.",
        )
        self.db.add(task)
        self.db.commit()
        self.db.refresh(task)
        return task

    def _seal_proof(
        self,
        *,
        organization_id: UUID,
        receipt_id: UUID | None,
        purpose_ids: list[UUID],
        result: WithdrawalRemediationResult,
        event_type: str = "withdrawal_remediation_initiated",
    ) -> UUID | None:
        try:
            purposes = ",".join(str(pid) for pid in purpose_ids)
            rec = ProofVaultService.seal_event(
                self.db,
                organization_id,
                receipt_id,
                event_type=event_type,
                action="REMEDIATE" if event_type != "purpose_suppressed" else "SUPPRESS",
                purposes=purposes,
                channel="consent_withdrawal",
                source=(
                    f"obligations={result.obligations_created}; "
                    f"tasks={result.remediation_tasks_created}; "
                    f"runs={result.retention_runs_created}; "
                    f"suppressed={result.purposes_suppressed}"
                ),
            )
            self.db.commit()
            return rec.id
        except Exception as exc:  # noqa: BLE001
            print(f"Proof Vault seal failed for withdrawal remediation: {exc}")
            return None
