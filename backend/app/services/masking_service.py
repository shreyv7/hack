from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.crypto import encrypt_secret
from app.models.compliance import AuditEventType, AuditSeverity
from app.models.data_inventory import (
    DataInventoryAsset,
    DataInventoryField,
    FieldClassification,
    SecuritySafeguard,
)
from app.models.data_source import DataSource, IntegrationMode, SourceEnvironment
from app.models.enforcement import PurposeDataMapping
from app.models.masking import MaskingRule, MaskingStrategy
from app.models.masking_run import MaskingRun, MaskingRunTrigger
from app.models.organization import Organization, OrganizationStatus
from app.models.user import User, UserRole
from app.schemas.masking import (
    AnonymizeTextResult,
    ApplyMaskingResult,
    DetectedEntity,
    FieldPreviewPair,
    FieldPreviewResult,
    MaskingCapabilities,
    MaskingRuleRead,
    MaskingRuleUpsert,
    MaskingRunRead,
    MaskingSourceCoverage,
    MaskingSummary,
    PiiColumnTarget,
    PreviewResult,
)
from app.services import db_connector
from app.services.audit_events import record_audit_event
from app.services.pii_detectors import detect_value, mask_value
from app.services.proof_vault_service import ProofVaultService
from app.utils.masking_coverage import (
    DEFAULT_RULES,
    category_has_active_rule,
    covered_pii_field_count,
)

logger = logging.getLogger(__name__)

# Entities we keep (drops noisy DATE_TIME/URL; adds India-specific AADHAAR/PAN
# via custom recognizers registered in _get_analyzer).
CURATED_ENTITIES = [
    "PERSON",
    "EMAIL_ADDRESS",
    "PHONE_NUMBER",
    "LOCATION",
    "CREDIT_CARD",
    "IP_ADDRESS",
    "IBAN_CODE",
    "AADHAAR",
    "PAN",
    "NRP",
]

_ANALYZER_SCORE_THRESHOLD = 0.35

_EMAIL_FALLBACK_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
_PHONE_FALLBACK_RE = re.compile(r"(?:\+?91[\-\s]?)?[6-9]\d{9}")

# --- Presidio (lazy, cached, optional) ---
_analyzer = None
_analyzer_ready: bool | None = None
_anonymizer = None


def _ner_available() -> bool:
    """Cheap check (no engine build) — is the analyzer + spaCy model installed?"""
    try:
        import presidio_analyzer  # noqa: F401
        import spacy.util

        return bool(spacy.util.is_package("en_core_web_sm"))
    except Exception:  # noqa: BLE001
        return False


def _get_analyzer():
    """Build the Presidio analyzer once. Returns None if unavailable."""
    global _analyzer, _analyzer_ready
    if _analyzer_ready is None:
        try:
            from presidio_analyzer import AnalyzerEngine
            from presidio_analyzer.nlp_engine import NlpEngineProvider

            from presidio_analyzer import Pattern, PatternRecognizer

            provider = NlpEngineProvider(
                nlp_configuration={
                    "nlp_engine_name": "spacy",
                    "models": [{"lang_code": "en", "model_name": "en_core_web_sm"}],
                }
            )
            _analyzer = AnalyzerEngine(nlp_engine=provider.create_engine())
            # India-specific recognizers (higher confidence than generic NER).
            _analyzer.registry.add_recognizer(PatternRecognizer(
                supported_entity="AADHAAR",
                patterns=[Pattern("aadhaar", r"\b\d{4}\s?\d{4}\s?\d{4}\b", 0.6)],
            ))
            _analyzer.registry.add_recognizer(PatternRecognizer(
                supported_entity="PAN",
                patterns=[Pattern("pan", r"\b[A-Z]{5}[0-9]{4}[A-Z]\b", 0.8)],
            ))
            _analyzer.registry.add_recognizer(PatternRecognizer(
                supported_entity="PHONE_NUMBER",
                patterns=[Pattern("in_phone", r"\b(?:\+?91[\-\s]?)?[6-9]\d{9}\b", 0.7)],
            ))
            _analyzer_ready = True
        except Exception:  # noqa: BLE001
            logger.exception("Presidio analyzer unavailable; free-text uses regex fallback")
            _analyzer = None
            _analyzer_ready = False
    return _analyzer


def _get_anonymizer():
    global _anonymizer
    if _anonymizer is None:
        from presidio_anonymizer import AnonymizerEngine

        _anonymizer = AnonymizerEngine()
    return _anonymizer


def _generalize(value: str) -> str:
    v = value.strip()
    m = re.match(r"(\d{4})-\d{2}-\d{2}", v)
    if m:
        return m.group(1)
    if v.isdigit():
        n = int(v)
        low = (n // 10) * 10
        return f"{low}-{low + 9}"
    return (v[0] if v else "") + "***"


def transform_value(
    value: str, strategy: MaskingStrategy, category: str | None = None, params: dict | None = None
) -> str:
    """Apply a masking strategy to a single value using Presidio operators
    (with our own logic for encrypt/generalize and the email-partial nicety)."""
    params = params or {}
    if not value:
        return value
    if strategy == MaskingStrategy.encrypt:
        return encrypt_secret(value)
    if strategy == MaskingStrategy.generalize:
        return _generalize(value)
    # Keep the domain on emails for a readable partial mask.
    if strategy == MaskingStrategy.mask and category == "email" and "@" in value:
        local, _, domain = value.partition("@")
        head = local[0] if local else ""
        return f"{head}{'•' * max(len(local) - 1, 1)}@{domain}"

    from presidio_anonymizer.entities import OperatorConfig, RecognizerResult

    if strategy == MaskingStrategy.mask:
        keep_last = int(params.get("keep_last", 2))
        char = params.get("masking_char", "•")
        op = OperatorConfig(
            "mask",
            {"masking_char": char, "chars_to_mask": max(len(value) - keep_last, 0), "from_end": False},
        )
    elif strategy == MaskingStrategy.redact:
        op = OperatorConfig("replace", {"new_value": "[REDACTED]"})
    elif strategy == MaskingStrategy.hash:
        op = OperatorConfig("hash", {"hash_type": "sha256"})
    elif strategy == MaskingStrategy.replace:
        token = params.get("new_value") or (f"<{category.upper()}>" if category else "<REDACTED>")
        op = OperatorConfig("replace", {"new_value": token})
    else:  # pragma: no cover — exhaustive
        return value

    result = [RecognizerResult(entity_type="PII", start=0, end=len(value), score=1.0)]
    return _get_anonymizer().anonymize(
        text=value, analyzer_results=result, operators={"PII": op}
    ).text


class MaskingService:
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
                raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Masking requires an organization context")
            self._ensure_org_accessible(org_id)
            return org_id
        if user.organization_id is None:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Masking requires an organization context")
        if org_id is not None and org_id != user.organization_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Organization not found")
        self._ensure_org_accessible(user.organization_id)
        return user.organization_id

    # --- rules ---

    def get_rules(self, user: User, org_id: UUID | None = None) -> list[MaskingRuleRead]:
        resolved = self._resolve_org_id(user, org_id)
        stored = {
            r.pii_category: r
            for r in self.db.execute(
                select(MaskingRule).where(MaskingRule.organization_id == resolved)
            ).scalars().all()
        }
        out: list[MaskingRuleRead] = []
        for category, (strategy, params) in DEFAULT_RULES.items():
            if category in stored:
                r = stored[category]
                out.append(MaskingRuleRead(
                    id=r.id, pii_category=r.pii_category, strategy=r.strategy,
                    params=r.params or {}, enabled=r.enabled, is_default=False,
                ))
            else:
                out.append(MaskingRuleRead(
                    pii_category=category, strategy=strategy, params=params,
                    enabled=True, is_default=True,
                ))
        # Any stored rules for categories not in defaults.
        for category, r in stored.items():
            if category not in DEFAULT_RULES:
                out.append(MaskingRuleRead(
                    id=r.id, pii_category=r.pii_category, strategy=r.strategy,
                    params=r.params or {}, enabled=r.enabled, is_default=False,
                ))
        return out

    def _rule_for(self, org_id: UUID, category: str | None) -> tuple[MaskingStrategy, dict] | None:
        if category:
            stored = self.db.execute(
                select(MaskingRule).where(
                    MaskingRule.organization_id == org_id, MaskingRule.pii_category == category
                )
            ).scalar_one_or_none()
            if stored is not None:
                if stored.enabled:
                    return stored.strategy, (stored.params or {})
                return None
            if category in DEFAULT_RULES:
                return DEFAULT_RULES[category]
        wildcard = self.db.execute(
            select(MaskingRule).where(
                MaskingRule.organization_id == org_id, MaskingRule.pii_category == "*"
            )
        ).scalar_one_or_none()
        if wildcard is not None:
            if wildcard.enabled:
                return wildcard.strategy, (wildcard.params or {})
            return None
        return DEFAULT_RULES["*"]

    def _stored_rules(self, org_id: UUID) -> list[MaskingRule]:
        return list(
            self.db.execute(select(MaskingRule).where(MaskingRule.organization_id == org_id)).scalars().all()
        )

    def upsert_rule(self, user: User, body: MaskingRuleUpsert, org_id: UUID | None = None) -> MaskingRuleRead:
        resolved = self._resolve_org_id(user, org_id)
        rule = self.db.execute(
            select(MaskingRule).where(
                MaskingRule.organization_id == resolved,
                MaskingRule.pii_category == body.pii_category,
            )
        ).scalar_one_or_none()
        if rule is None:
            rule = MaskingRule(organization_id=resolved, pii_category=body.pii_category)
            self.db.add(rule)
        rule.strategy = body.strategy
        rule.params = body.params
        rule.enabled = body.enabled
        self.db.commit()
        self.db.refresh(rule)
        return MaskingRuleRead(
            id=rule.id, pii_category=rule.pii_category, strategy=rule.strategy,
            params=rule.params or {}, enabled=rule.enabled, is_default=False,
        )

    # --- previews ---

    def preview(self, strategy: MaskingStrategy, value: str, params: dict, category: str | None = None) -> PreviewResult:
        return PreviewResult(
            original=value, masked=transform_value(value, strategy, category, params), strategy=strategy
        )

    def list_pii_columns(self, user: User, org_id: UUID | None = None) -> list[PiiColumnTarget]:
        """Columns the PII scanner classified (personal/sensitive), ready to mask."""
        resolved = self._resolve_org_id(user, org_id)
        rows = self.db.execute(
            select(DataInventoryField, DataInventoryAsset, DataSource)
            .join(DataInventoryAsset, DataInventoryField.asset_id == DataInventoryAsset.id)
            .join(DataSource, DataInventoryAsset.data_source_id == DataSource.id, isouter=True)
            .where(
                DataInventoryAsset.organization_id == resolved,
                DataInventoryField.classification.in_(
                    [FieldClassification.personal, FieldClassification.sensitive]
                ),
            )
            .order_by(DataSource.name, DataInventoryAsset.name, DataInventoryField.name)
        ).all()

        field_ids = [field.id for field, _, _ in rows]
        purpose_counts: dict[UUID, int] = {}
        if field_ids:
            mappings = self.db.execute(
                select(PurposeDataMapping.inventory_field_id).where(
                    PurposeDataMapping.organization_id == resolved,
                    PurposeDataMapping.inventory_field_id.in_(field_ids),
                )
            ).scalars().all()
            for fid in mappings:
                purpose_counts[fid] = purpose_counts.get(fid, 0) + 1

        last_applied: dict[tuple[UUID, str], datetime] = {}
        run_rows = self.db.execute(
            select(
                MaskingRun.asset_id,
                MaskingRun.column_name,
                func.max(MaskingRun.created_at),
            )
            .where(MaskingRun.organization_id == resolved)
            .group_by(MaskingRun.asset_id, MaskingRun.column_name)
        ).all()
        for asset_id, col, ts in run_rows:
            last_applied[(asset_id, col)] = ts

        targets: list[PiiColumnTarget] = []
        for field, asset, source in rows:
            can_apply = source is not None and db_connector.supports_introspection(source)
            note = None
            if source is None:
                note = "No connected data source — masking cannot be applied."
            elif not can_apply:
                note = f"Masking in place is not available for '{source.source_type}' sources."
            rule = self._rule_for(resolved, field.pii_category)
            stored = self.db.execute(
                select(MaskingRule).where(
                    MaskingRule.organization_id == resolved,
                    MaskingRule.pii_category == (field.pii_category or "*"),
                )
            ).scalar_one_or_none()
            rule_enabled = stored.enabled if stored is not None else True
            env = source.environment.value if source and source.environment else None
            mode = source.integration_mode.value if source and source.integration_mode else None
            safeguard = (
                field.security_safeguard.value
                if field.security_safeguard and field.security_safeguard != SecuritySafeguard.none
                else None
            )
            targets.append(
                PiiColumnTarget(
                    data_source_id=source.id if source else None,
                    data_source_name=source.name if source else None,
                    source_type=source.source_type if source else None,
                    asset_id=asset.id,
                    field_id=field.id,
                    table=asset.name,
                    column=field.name,
                    pii_category=field.pii_category,
                    classification=field.classification.value,
                    strategy=rule[0] if rule else None,
                    rule_enabled=rule_enabled and rule is not None,
                    environment=env,
                    integration_mode=mode,
                    security_safeguard=safeguard,
                    purpose_count=purpose_counts.get(field.id, 0),
                    last_applied_at=last_applied.get((asset.id, field.name)),
                    can_apply=can_apply and rule is not None,
                    apply_note=note if can_apply else (note or "No active masking rule for this category."),
                )
            )
        return targets

    def preview_field(
        self, user: User, data_source_id: UUID, table: str, column: str,
        strategy: MaskingStrategy | None, limit: int, org_id: UUID | None = None,
    ) -> FieldPreviewResult:
        resolved = self._resolve_org_id(user, org_id)
        from app.models.data_source import DataSource

        source = self.db.get(DataSource, data_source_id)
        if source is None or source.organization_id != resolved:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Data source not found")
        if not db_connector.supports_introspection(source):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Masking preview supports connected SQL or MongoDB sources only.")
        try:
            cols, rows = db_connector.sample_table(source, table, limit * 3)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"Sampling failed: {exc}") from exc
        if column not in cols:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Column not found in table.")
        idx = cols.index(column)
        values = [str(r[idx]) for r in rows if idx < len(r) and r[idx] is not None][:limit]
        # Determine the category from the sampled values.
        category = None
        for v in values:
            hit = detect_value(v)
            if hit:
                category = hit[1]
                break
        chosen_strategy = strategy
        params: dict = {}
        if chosen_strategy is None:
            rule = self._rule_for(resolved, category)
            if rule is None:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="No active masking rule for this category.")
            chosen_strategy, params = rule
        pairs = [
            FieldPreviewPair(before=v, after=transform_value(v, chosen_strategy, category, params))
            for v in values
        ]
        return FieldPreviewResult(
            table=table, column=column, pii_category=category, strategy=chosen_strategy, samples=pairs
        )

    def apply_to_column(
        self, user: User, data_source_id: UUID, table: str, column: str,
        strategy: MaskingStrategy | None, id_column: str | None, org_id: UUID | None = None,
        *,
        asset_id: UUID | None = None,
        inventory_field_id: UUID | None = None,
        trigger: MaskingRunTrigger = MaskingRunTrigger.manual,
    ) -> ApplyMaskingResult:
        """DESTRUCTIVE: rewrite the column's values in the live source database."""
        resolved = self._resolve_org_id(user, org_id)
        from app.models.data_source import DataSource

        source = self.db.get(DataSource, data_source_id)
        if source is None or source.organization_id != resolved:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Data source not found")
        from app.utils.data_source_integration import assert_write_actions_allowed

        assert_write_actions_allowed(source, action="masking")
        if not db_connector.supports_introspection(source):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Masking apply supports SQL/Mongo sources only.")

        # Determine category from a sample, then pick the strategy.
        try:
            cols, rows = db_connector.sample_table(source, table, 30)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"Sampling failed: {exc}") from exc
        if column not in cols:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Column not found in table.")
        idx = cols.index(column)
        category = None
        for r in rows:
            if idx < len(r) and r[idx] is not None:
                hit = detect_value(str(r[idx]))
                if hit:
                    category = hit[1]
                    break
        chosen_strategy = strategy
        params: dict = {}
        if chosen_strategy is None:
            rule = self._rule_for(resolved, category)
            if rule is None:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="No active masking rule for this category.")
            chosen_strategy, params = rule

        if asset_id is None or inventory_field_id is None:
            asset = self.db.execute(
                select(DataInventoryAsset).where(
                    DataInventoryAsset.organization_id == resolved,
                    DataInventoryAsset.data_source_id == data_source_id,
                    DataInventoryAsset.name == table,
                )
            ).scalar_one_or_none()
            if asset:
                asset_id = asset_id or asset.id
                field = self.db.execute(
                    select(DataInventoryField).where(
                        DataInventoryField.asset_id == asset.id,
                        DataInventoryField.name == column,
                    )
                ).scalar_one_or_none()
                if field:
                    inventory_field_id = inventory_field_id or field.id

        resolved_id = id_column or db_connector.find_identifier_column(source, table)
        cat = category

        def _transform(value: object) -> object:
            return transform_value(str(value), chosen_strategy, cat, params)

        try:
            updated = db_connector.apply_column_masking(
                source, table, column, resolved_id, _transform
            )
        except ValueError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"Apply failed: {exc}") from exc

        proof_id: UUID | None = None
        try:
            rec = ProofVaultService.seal_event(
                self.db,
                resolved,
                None,
                event_type="data_masking_applied",
                action="MASK",
                purposes=category or "*",
                channel="data_masking",
                source=f"{table}.{column};strategy={chosen_strategy.value};rows={updated}",
            )
            proof_id = rec.id
        except Exception:  # noqa: BLE001
            logger.exception("Proof Vault seal failed for masking apply")

        run = MaskingRun(
            organization_id=resolved,
            data_source_id=data_source_id,
            asset_id=asset_id,
            inventory_field_id=inventory_field_id,
            table_name=table,
            column_name=column,
            pii_category=category,
            strategy=chosen_strategy,
            rows_updated=updated,
            trigger=trigger,
            triggered_by_user_id=user.id,
            proof_vault_record_id=proof_id,
        )
        self.db.add(run)
        record_audit_event(
            self.db,
            resolved,
            user=user,
            action="masking_apply",
            details=f"Masked {updated} rows in {table}.{column} ({chosen_strategy.value})",
            event_type=AuditEventType.deletion,
            severity=AuditSeverity.warning if updated > 0 else AuditSeverity.info,
            resource_type="data_source",
            resource_id=str(data_source_id),
            commit=False,
        )
        self.db.commit()

        return ApplyMaskingResult(
            table=table, column=column, pii_category=category,
            strategy=chosen_strategy, rows_updated=updated,
        )

    def get_summary(self, user: User, org_id: UUID | None = None) -> MaskingSummary:
        resolved = self._resolve_org_id(user, org_id)
        stored_rules = self._stored_rules(resolved)

        pii_rows = self.db.execute(
            select(DataInventoryField, DataInventoryAsset, DataSource)
            .join(DataInventoryAsset, DataInventoryField.asset_id == DataInventoryAsset.id)
            .join(DataSource, DataInventoryAsset.data_source_id == DataSource.id, isouter=True)
            .where(
                DataInventoryAsset.organization_id == resolved,
                DataInventoryField.classification.in_(
                    [FieldClassification.personal, FieldClassification.sensitive]
                ),
            )
        ).all()

        pii_fields = [f for f, _, _ in pii_rows]
        total_pii = len(pii_fields)
        covered = covered_pii_field_count(pii_fields, stored_rules)

        sources = self.db.execute(
            select(DataSource).where(DataSource.organization_id == resolved)
        ).scalars().all()
        sources_maskable = sum(1 for s in sources if db_connector.supports_introspection(s))
        sources_read_write = sum(
            1 for s in sources if s.integration_mode == IntegrationMode.read_write
        )

        cutoff = datetime.now(timezone.utc) - timedelta(days=30)
        columns_applied = (
            self.db.execute(
                select(func.count(MaskingRun.id)).where(
                    MaskingRun.organization_id == resolved,
                    MaskingRun.created_at >= cutoff,
                )
            ).scalar()
            or 0
        )

        uncovered: set[str] = set()
        for field in pii_fields:
            if field.pii_category and not category_has_active_rule(field.pii_category, stored_rules):
                uncovered.add(field.pii_category)

        prod_discovery = 0
        source_pii: dict[UUID, list] = {}
        for field, asset, source in pii_rows:
            if source and source.id:
                source_pii.setdefault(source.id, []).append(field)
        for source in sources:
            fields = source_pii.get(source.id, [])
            if not fields:
                continue
            if (
                source.environment == SourceEnvironment.production
                and source.integration_mode != IntegrationMode.read_write
                and db_connector.supports_introspection(source)
            ):
                prod_discovery += 1

        safeguard_unapplied = 0
        applied_keys = {
            (r.asset_id, r.column_name)
            for r in self.db.execute(
                select(MaskingRun.asset_id, MaskingRun.column_name).where(
                    MaskingRun.organization_id == resolved
                )
            ).all()
            if r.asset_id
        }
        for field, asset, _source in pii_rows:
            if field.security_safeguard == SecuritySafeguard.masking:
                if (asset.id, field.name) not in applied_keys:
                    safeguard_unapplied += 1

        source_coverages: list[MaskingSourceCoverage] = []
        for source in sources:
            fields = source_pii.get(source.id, [])
            if not fields:
                continue
            src_covered = covered_pii_field_count(fields, stored_rules)
            total = len(fields)
            source_coverages.append(
                MaskingSourceCoverage(
                    data_source_id=source.id,
                    data_source_name=source.name,
                    environment=source.environment.value if source.environment else None,
                    integration_mode=source.integration_mode.value if source.integration_mode else None,
                    total_pii_fields=total,
                    covered_by_rules=src_covered,
                    coverage_pct=round((src_covered / total) * 100, 1) if total else 0.0,
                    maskable=db_connector.supports_introspection(source),
                )
            )
        source_coverages.sort(key=lambda s: s.coverage_pct)

        return MaskingSummary(
            total_pii_fields=total_pii,
            covered_by_rules=covered,
            coverage_pct=round((covered / total_pii) * 100, 1) if total_pii else 0.0,
            sources_maskable=sources_maskable,
            sources_read_write=sources_read_write,
            columns_applied_last_30d=columns_applied,
            uncovered_categories=sorted(uncovered),
            prod_sources_discovery_only=prod_discovery,
            fields_safeguard_masking_unapplied=safeguard_unapplied,
            sources=source_coverages,
        )

    def list_runs(
        self, user: User, org_id: UUID | None = None, limit: int = 50, offset: int = 0
    ) -> list[MaskingRunRead]:
        resolved = self._resolve_org_id(user, org_id)
        rows = self.db.execute(
            select(MaskingRun, DataSource.name)
            .join(DataSource, MaskingRun.data_source_id == DataSource.id, isouter=True)
            .where(MaskingRun.organization_id == resolved)
            .order_by(MaskingRun.created_at.desc())
            .offset(offset)
            .limit(limit)
        ).all()
        return [
            MaskingRunRead(
                id=run.id,
                organization_id=run.organization_id,
                data_source_id=run.data_source_id,
                data_source_name=source_name,
                asset_id=run.asset_id,
                table_name=run.table_name,
                column_name=run.column_name,
                pii_category=run.pii_category,
                strategy=run.strategy,
                rows_updated=run.rows_updated,
                trigger=run.trigger,
                triggered_by_user_id=run.triggered_by_user_id,
                proof_vault_record_id=run.proof_vault_record_id,
                created_at=run.created_at,
            )
            for run, source_name in rows
        ]

    # --- free-text anonymisation (Presidio NER) ---

    def anonymize_text(self, text: str) -> AnonymizeTextResult:
        analyzer = _get_analyzer()
        if analyzer is not None:
            from presidio_anonymizer.entities import OperatorConfig

            results = analyzer.analyze(
                text=text, language="en", entities=CURATED_ENTITIES,
                score_threshold=_ANALYZER_SCORE_THRESHOLD,
            )
            operators = {
                et: OperatorConfig("replace", {"new_value": f"<{et}>"}) for et in CURATED_ENTITIES
            }
            anonymized = _get_anonymizer().anonymize(
                text=text, analyzer_results=results, operators=operators
            ).text
            entities = [
                DetectedEntity(
                    entity_type=r.entity_type,
                    score=round(float(r.score), 2),
                    masked_sample=mask_value(text[r.start:r.end], ""),
                )
                for r in sorted(results, key=lambda x: x.start)
            ]
            return AnonymizeTextResult(
                original_length=len(text), anonymized_text=anonymized, entities=entities, ner_engine="presidio"
            )

        # Regex fallback (email + phone only) when Presidio isn't installed.
        entities: list[DetectedEntity] = []
        anonymized = text
        for label, pattern in (("EMAIL_ADDRESS", _EMAIL_FALLBACK_RE), ("PHONE_NUMBER", _PHONE_FALLBACK_RE)):
            for m in pattern.finditer(text):
                entities.append(DetectedEntity(entity_type=label, score=0.6, masked_sample=mask_value(m.group(), "")))
            anonymized = pattern.sub(f"<{label}>", anonymized)
        return AnonymizeTextResult(
            original_length=len(text), anonymized_text=anonymized, entities=entities, ner_engine="regex-fallback"
        )

    def capabilities(self) -> MaskingCapabilities:
        available = _ner_available()
        return MaskingCapabilities(
            ner_available=available,
            engine="Microsoft Presidio (spaCy en_core_web_sm)" if available else "regex fallback",
            strategies=[s.value for s in MaskingStrategy],
            entity_types=CURATED_ENTITIES,
        )
