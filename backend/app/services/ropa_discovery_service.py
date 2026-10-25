"""RoPA auto-discovery — scan org data inventory and infer processing activities."""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status

from app.core.config import settings
from app.models.user import User
from app.models.ropa import (
    BusinessUnit,
    ProcessingActivity,
    RopaDiscoverySuggestion,
)
from app.services import vajra_ai_service
from app.services.ropa_discovery_context import (
    RopaDiscoveryContext,
    build_ropa_discovery_context,
)
from app.services.compliance_base import ComplianceBaseService
from app.services.ropa_service import RopaService
from app.services.vajra_ai_service import VajraAIError

logger = logging.getLogger(__name__)

_VALID_SOURCE_TYPES = frozenset({
    "api", "database", "openapi", "sdk", "queue", "job", "etl", "webhook", "warehouse",
})
_VALID_LAWFUL_BASES = frozenset({
    "consent", "contract", "legal-obligation", "legitimate-interest",
})
_ASSET_TYPE_TO_SOURCE: dict[str, str] = {
    "api": "api",
    "database": "database",
    "table": "database",
    "collection": "database",
    "warehouse": "warehouse",
    "application": "sdk",
    "file_system": "job",
    "other": "database",
}
_MAX_SUGGESTIONS_PER_SCAN = 10


class RopaDiscoveryService(ComplianceBaseService):
    def count_pending_suggestions(self, org_id: UUID) -> int:
        return (
            self.db.query(RopaDiscoverySuggestion)
            .filter(
                RopaDiscoverySuggestion.organization_id == org_id,
                RopaDiscoverySuggestion.status == "pending",
            )
            .count()
        )

    def _assert_suggestion_access(self, user: User, suggestion: RopaDiscoverySuggestion) -> None:
        self._resolve_org_id(user, suggestion.organization_id)

    def list_suggestions(self, user: User, org_id: UUID | None = None) -> list[RopaDiscoverySuggestion]:
        target_org_id = self._resolve_org_id(user, org_id)
        return (
            self.db.query(RopaDiscoverySuggestion)
            .filter(
                RopaDiscoverySuggestion.organization_id == target_org_id,
                RopaDiscoverySuggestion.status == "pending",
            )
            .order_by(RopaDiscoverySuggestion.created_at.desc())
            .all()
        )

    def dismiss_suggestion(self, user: User, suggestion_id: UUID) -> RopaDiscoverySuggestion:
        suggestion = (
            self.db.query(RopaDiscoverySuggestion)
            .filter(RopaDiscoverySuggestion.id == suggestion_id)
            .first()
        )
        if not suggestion:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Suggestion not found.",
            )
        self._assert_suggestion_access(user, suggestion)

        suggestion.status = "dismissed"
        suggestion.updated_at = datetime.now(timezone.utc)
        self.db.commit()
        self.db.refresh(suggestion)
        return suggestion

    def accept_suggestion(self, user: User, suggestion_id: UUID) -> ProcessingActivity:
        suggestion = (
            self.db.query(RopaDiscoverySuggestion)
            .filter(RopaDiscoverySuggestion.id == suggestion_id)
            .first()
        )
        if not suggestion:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Suggestion not found.",
            )
        self._assert_suggestion_access(user, suggestion)

        if suggestion.status != "pending":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot accept suggestion with status: {suggestion.status}",
            )

        bu = (
            self.db.query(BusinessUnit)
            .filter(BusinessUnit.organization_id == suggestion.organization_id)
            .first()
        )
        if not bu:
            bu = BusinessUnit(
                organization_id=suggestion.organization_id,
                name="Technology",
                code="TECH",
                head_user_id=user.id,
            )
            self.db.add(bu)
            self.db.flush()

        from app.models.data_processor import DataProcessor
        from app.schemas.ropa import (
            ActivityDataCategoryCreate,
            ActivityDataPrincipalCreate,
            ActivityLawfulBasisCreate,
            ActivityOwnerCreate,
            ActivityRecipientCreate,
            ActivitySystemCreate,
            ProcessingActivityCreate,
        )

        categories = []
        for cat_name in suggestion.suggested_data_categories:
            is_special = any(
                sensitive in cat_name.lower()
                for sensitive in ["health", "biometric", "payment", "card", "finance", "children"]
            )
            sensitivity = "sensitive" if is_special else "standard"
            categories.append(
                ActivityDataCategoryCreate(
                    category_name=cat_name,
                    is_special=is_special,
                    sensitivity=sensitivity,
                )
            )

        principals = [
            ActivityDataPrincipalCreate(
                category_name="Customers",
                description="End users/customers of the platform",
                includes_children=False,
            )
        ]

        lawful_bases = []
        if suggestion.suggested_lawful_basis:
            lawful_bases.append(
                ActivityLawfulBasisCreate(
                    basis_type=suggestion.suggested_lawful_basis,
                    justification=(
                        f"Basis identified during auto-discovery scan on source "
                        f"{suggestion.source_name}."
                    ),
                    dpdpa_section="Section 6",
                )
            )

        recipients = []
        processor_id = None
        if suggestion.suggested_recipient:
            processor = (
                self.db.query(DataProcessor)
                .filter(
                    DataProcessor.organization_id == suggestion.organization_id,
                    DataProcessor.name.ilike(suggestion.suggested_recipient),
                )
                .first()
            )
            processor_id = processor.id if processor else None
            recipients.append(
                ActivityRecipientCreate(
                    recipient_type="vendor",
                    name=suggestion.suggested_recipient,
                    data_shared=", ".join(suggestion.suggested_data_categories),
                    data_processor_id=processor_id,
                )
            )

        system_location = None
        system_name = suggestion.source_name
        if " · " in system_name:
            location_part, name_part = system_name.split(" · ", 1)
            system_location = location_part.strip() or None
            system_name = name_part.strip() or suggestion.source_name

        systems = [
            ActivitySystemCreate(
                system_name=system_name,
                system_type=suggestion.source_type,
                location=system_location,
                description=suggestion.description,
            )
        ]

        owners = []
        if user.id:
            owners.append(
                ActivityOwnerCreate(
                    user_id=user.id,
                    owner_role="business_owner",
                )
            )

        create_payload = ProcessingActivityCreate(
            title=suggestion.suggested_title,
            description=suggestion.suggested_description or suggestion.description,
            business_unit_id=bu.id,
            purposes=[],
            owners=owners,
            data_categories=categories,
            data_principals=principals,
            lawful_bases=lawful_bases,
            systems=systems,
            recipients=recipients,
            security_measures=[],
        )

        activity = RopaService(self.db).create_activity(
            user=user,
            payload=create_payload,
            org_id=suggestion.organization_id,
        )

        suggestion.status = "accepted"
        suggestion.updated_at = datetime.now(timezone.utc)
        self.db.commit()

        return activity

    def scan_sources(self, user: User, org_id: UUID | None = None) -> list[RopaDiscoverySuggestion]:
        target_org_id = self._resolve_org_id(user, org_id)
        context = build_ropa_discovery_context(self.db, target_org_id)

        if not context.has_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "No data sources or inventory found. Connect data sources and "
                    "run a schema or PII scan before using auto-discovery."
                ),
            )

        raw_suggestions = self._infer_suggestions(context)
        inserted = self._persist_suggestions(target_org_id, raw_suggestions, context)

        if inserted:
            self.db.commit()
            logger.info(
                "RoPA auto-discovery scan for org %s created %d suggestion(s)",
                target_org_id,
                len(inserted),
            )
        else:
            logger.info(
                "RoPA auto-discovery scan for org %s found no new suggestions",
                target_org_id,
            )

        return self.list_suggestions(user, org_id)

    # --- inference -----------------------------------------------------------

    def _infer_suggestions(self, context: RopaDiscoveryContext) -> list[dict]:
        if settings.ai_configured:
            try:
                items = vajra_ai_service.ropa_discovery_suggestions(
                    context=context.to_json(),
                    max_suggestions=_MAX_SUGGESTIONS_PER_SCAN,
                )
                if items:
                    return [self._normalize_suggestion(item) for item in items]
                logger.info("AI provider returned no RoPA suggestions; using rule-based fallback")
            except VajraAIError as exc:
                logger.warning("RoPA discovery AI call failed, using fallback: %s", exc)

        return self._fallback_rule_based_suggestions(context)

    def _fallback_rule_based_suggestions(self, context: RopaDiscoveryContext) -> list[dict]:
        """Derive one suggestion per inventory asset with PII that lacks RoPA coverage."""
        suggestions: list[dict] = []

        for asset in context.inventory_assets:
            if self._asset_covered_by_ropa(asset, context.existing_ropa):
                continue

            pii_fields = asset.get("pii_fields") or []
            categories = asset.get("data_categories") or []
            field_names = [f["pii_category"] or f["name"] for f in pii_fields]
            data_categories = list(dict.fromkeys(categories + field_names))[:8]
            if not data_categories:
                continue

            asset_type = asset.get("asset_type", "other")
            source_type = _ASSET_TYPE_TO_SOURCE.get(asset_type, "database")
            source_name = asset.get("name", "Unknown asset")
            if asset.get("location"):
                source_name = f"{asset['location']} · {source_name}"

            has_sensitive = any(
                f.get("classification") == "sensitive" for f in pii_fields
            )
            lawful_basis = "consent" if has_sensitive else "contract"

            suggestions.append(
                self._normalize_suggestion({
                    "source_type": source_type,
                    "source_name": source_name,
                    "description": (
                        f"Data inventory asset with {len(pii_fields)} classified PII field(s) "
                        f"not yet documented in RoPA."
                    ),
                    "suggested_title": f"{asset.get('name', 'Asset')} data processing",
                    "suggested_description": (
                        f"Processing personal data stored in {asset.get('name')} "
                        f"({asset_type})."
                    ),
                    "suggested_data_categories": data_categories,
                    "suggested_lawful_basis": lawful_basis,
                    "suggested_recipient": None,
                })
            )
            if len(suggestions) >= _MAX_SUGGESTIONS_PER_SCAN:
                break

        if len(suggestions) < _MAX_SUGGESTIONS_PER_SCAN:
            suggestions.extend(
                self._suggestions_from_pii_findings(context, _MAX_SUGGESTIONS_PER_SCAN - len(suggestions))
            )

        for tracker in context.discovered_trackers:
            tracker_name = tracker.get("name", "")
            if not tracker_name or self._name_covered_by_ropa(tracker_name, context.existing_ropa):
                continue
            suggestions.append(
                self._normalize_suggestion({
                    "source_type": "sdk",
                    "source_name": f"{tracker_name} ({tracker.get('domain', 'web')})",
                    "description": (
                        f"Active {tracker.get('category', 'unknown')} tracker detected "
                        f"on {tracker.get('domain', 'website')}."
                    ),
                    "suggested_title": f"{tracker_name} tracking integration",
                    "suggested_description": (
                        f"Client-side {tracker.get('type', 'tracker')} collecting "
                        f"behavioral data via {tracker_name}."
                    ),
                    "suggested_data_categories": ["IP Address", "Device ID", "Behavioral analytics"],
                    "suggested_lawful_basis": "consent",
                    "suggested_recipient": tracker_name,
                })
            )
            if len(suggestions) >= _MAX_SUGGESTIONS_PER_SCAN:
                break

        if len(suggestions) < _MAX_SUGGESTIONS_PER_SCAN:
            for vendor in context.vendors:
                vendor_name = vendor.get("name", "")
                if not vendor_name or self._name_covered_by_ropa(vendor_name, context.existing_ropa):
                    continue
                vendor_categories = vendor.get("data_categories") or ["Personal data"]
                if isinstance(vendor_categories, str):
                    vendor_categories = [vendor_categories]
                suggestions.append(
                    self._normalize_suggestion({
                        "source_type": "api",
                        "source_name": vendor_name,
                        "description": (
                            f"Registered data processor {vendor_name} "
                            f"without a linked RoPA processing activity."
                        ),
                        "suggested_title": f"{vendor_name} data processing",
                        "suggested_description": (
                            f"Personal data shared with processor {vendor_name} "
                            f"for {vendor.get('purpose') or vendor.get('category') or 'processing'}."
                        ),
                        "suggested_data_categories": list(vendor_categories)[:8],
                        "suggested_lawful_basis": "contract",
                        "suggested_recipient": vendor_name,
                    })
                )
                if len(suggestions) >= _MAX_SUGGESTIONS_PER_SCAN:
                    break

        if suggestions:
            return suggestions

        for source in context.data_sources:
            source_name = source.get("name", "")
            if not source_name or self._name_covered_by_ropa(source_name, context.existing_ropa):
                continue
            category = source.get("category") or source.get("source_type") or "database"
            source_type = _ASSET_TYPE_TO_SOURCE.get(category, "database")
            if category == "api":
                source_type = "api"
            elif category == "logs":
                source_type = "api"
            suggestions.append(
                self._normalize_suggestion({
                    "source_type": source_type,
                    "source_name": source_name,
                    "description": (
                        f"Connected {source.get('source_type', 'data')} source "
                        f"without a documented RoPA activity."
                    ),
                    "suggested_title": f"{source_name} data processing",
                    "suggested_description": (
                        f"Personal data processing via connected source {source_name}."
                    ),
                    "suggested_data_categories": ["Personal data"],
                    "suggested_lawful_basis": "contract",
                    "suggested_recipient": None,
                })
            )
            if len(suggestions) >= _MAX_SUGGESTIONS_PER_SCAN:
                break

        return suggestions

    def _suggestions_from_pii_findings(
        self, context: RopaDiscoveryContext, limit: int
    ) -> list[dict]:
        if limit <= 0 or not context.pii_findings:
            return []

        grouped: dict[str, list[dict]] = {}
        for finding in context.pii_findings:
            table_name = finding.get("table_name") or "unknown_table"
            grouped.setdefault(table_name, []).append(finding)

        suggestions: list[dict] = []
        for table_name, findings in grouped.items():
            if self._name_covered_by_ropa(table_name, context.existing_ropa):
                continue

            categories = list(
                dict.fromkeys(
                    f.get("pii_category")
                    for f in findings
                    if f.get("pii_category")
                )
            )[:8]
            if not categories:
                categories = ["Personal data"]

            has_sensitive = any(
                f.get("classification") == "sensitive" for f in findings
            )
            lawful_basis = "consent" if has_sensitive else "contract"

            suggestions.append(
                self._normalize_suggestion({
                    "source_type": "database",
                    "source_name": table_name,
                    "description": (
                        f"PII scanner detected {len(findings)} classified field(s) "
                        f"in {table_name} without RoPA coverage."
                    ),
                    "suggested_title": f"{table_name} data processing",
                    "suggested_description": (
                        f"Processing personal data in database table {table_name} "
                        f"identified by automated PII discovery."
                    ),
                    "suggested_data_categories": categories,
                    "suggested_lawful_basis": lawful_basis,
                    "suggested_recipient": None,
                })
            )
            if len(suggestions) >= limit:
                break

        return suggestions

    # --- persistence ---------------------------------------------------------

    def _persist_suggestions(
        self,
        org_id: UUID,
        raw_suggestions: list[dict],
        context: RopaDiscoveryContext,
    ) -> list[RopaDiscoverySuggestion]:
        inserted: list[RopaDiscoverySuggestion] = []
        now = datetime.now(timezone.utc)

        for item in raw_suggestions:
            if not item.get("suggested_title") or not item.get("source_name"):
                continue
            if self._already_pending(org_id, item):
                continue
            if self._covered_by_existing_ropa(item, context.existing_ropa):
                continue

            sug = RopaDiscoverySuggestion(
                organization_id=org_id,
                source_type=item["source_type"],
                source_name=item["source_name"],
                description=item.get("description"),
                suggested_title=item["suggested_title"],
                suggested_description=item.get("suggested_description"),
                suggested_data_categories=item.get("suggested_data_categories") or [],
                suggested_lawful_basis=item.get("suggested_lawful_basis"),
                suggested_recipient=item.get("suggested_recipient"),
                status="pending",
                created_at=now,
                updated_at=now,
            )
            self.db.add(sug)
            inserted.append(sug)

        return inserted

    # --- normalization & dedup -------------------------------------------------

    @staticmethod
    def _normalize_suggestion(item: dict) -> dict:
        source_type = str(item.get("source_type", "database")).lower().strip()
        if source_type not in _VALID_SOURCE_TYPES:
            source_type = "database"

        lawful = item.get("suggested_lawful_basis")
        if lawful:
            lawful = str(lawful).lower().strip()
            if lawful not in _VALID_LAWFUL_BASES:
                lawful = None

        categories = item.get("suggested_data_categories") or []
        if isinstance(categories, str):
            categories = [c.strip() for c in categories.split(",") if c.strip()]
        categories = [str(c).strip() for c in categories if str(c).strip()][:12]

        recipient = item.get("suggested_recipient")
        recipient = str(recipient).strip() if recipient else None

        return {
            "source_type": source_type,
            "source_name": str(item.get("source_name", "")).strip()[:255],
            "description": (str(item["description"]).strip() if item.get("description") else None),
            "suggested_title": str(item.get("suggested_title", "")).strip()[:255],
            "suggested_description": (
                str(item["suggested_description"]).strip()
                if item.get("suggested_description")
                else None
            ),
            "suggested_data_categories": categories,
            "suggested_lawful_basis": lawful,
            "suggested_recipient": recipient,
        }

    def _already_pending(self, org_id: UUID, item: dict) -> bool:
        return (
            self.db.query(RopaDiscoverySuggestion)
            .filter(
                RopaDiscoverySuggestion.organization_id == org_id,
                RopaDiscoverySuggestion.source_type == item["source_type"],
                RopaDiscoverySuggestion.source_name == item["source_name"],
                RopaDiscoverySuggestion.status == "pending",
            )
            .first()
            is not None
        )

    @staticmethod
    def _normalize_name(value: str) -> str:
        return re.sub(r"\s+", " ", value.lower().strip())

    @classmethod
    def _titles_overlap(cls, a: str, b: str) -> bool:
        na, nb = cls._normalize_name(a), cls._normalize_name(b)
        if not na or not nb:
            return False
        if na == nb or na in nb or nb in na:
            return True
        words_a = set(na.split())
        words_b = set(nb.split())
        if len(words_a) < 2 or len(words_b) < 2:
            return False
        overlap = words_a & words_b
        return len(overlap) >= min(2, min(len(words_a), len(words_b)) // 2 + 1)

    @classmethod
    def _name_covered_by_ropa(cls, name: str, existing_ropa: list[dict]) -> bool:
        norm = cls._normalize_name(name)
        for entry in existing_ropa:
            if cls._titles_overlap(name, entry.get("title", "")):
                return True
            for system in entry.get("systems") or []:
                if norm in cls._normalize_name(system):
                    return True
            for recipient in entry.get("recipients") or []:
                if norm in cls._normalize_name(recipient):
                    return True
        return False

    @classmethod
    def _asset_covered_by_ropa(cls, asset: dict, existing_ropa: list[dict]) -> bool:
        asset_name = asset.get("name", "")
        location = asset.get("location", "")
        for entry in existing_ropa:
            if cls._titles_overlap(asset_name, entry.get("title", "")):
                return True
            for system in entry.get("systems") or []:
                sys_norm = cls._normalize_name(system)
                if cls._normalize_name(asset_name) in sys_norm:
                    return True
                if location and cls._normalize_name(location) in sys_norm:
                    return True
        return False

    @classmethod
    def _covered_by_existing_ropa(cls, item: dict, existing_ropa: list[dict]) -> bool:
        title = item.get("suggested_title", "")
        source = item.get("source_name", "")
        if cls._name_covered_by_ropa(title, existing_ropa):
            return True
        norm_source = cls._normalize_name(source)
        for entry in existing_ropa:
            for system in entry.get("systems") or []:
                if norm_source in cls._normalize_name(system):
                    return True
                if cls._normalize_name(system) in norm_source:
                    return True
        return False
