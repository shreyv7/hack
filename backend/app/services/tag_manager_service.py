from datetime import date, datetime, timedelta, timezone
from uuid import UUID
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.tag_manager import (
    TagManagerContainer,
    ManagedTag,
    TagExecutionRule,
    TagViolation,
    TagManagerDailyMetric,
    TagExecutionLog,
    TagManagerSettings,
)
from app.models.consent import Purpose
from app.models.integration_property import IntegrationProperty
from app.models.user import User, UserRole
from app.services.consent_service import ConsentService
from app.schemas.tag_manager import (
    TagManagerContainerCreate,
    TagManagerContainerUpdate,
    ManagedTagCreate,
    ManagedTagUpdate,
    TagExecutionRuleCreate,
    TagExecutionRuleUpdate,
    TagViolationCreate,
    TagManagerSettingsUpdate,
    SimulatedTagResult,
)

PURPOSE_METRIC_BUCKETS = ("analytics", "marketing", "functional", "necessary")


class TagManagerService:
    def __init__(self, db: Session):
        self.db = db
        self.consent_service = ConsentService(db)

    def _get_property(self, property_id: UUID, org_id: UUID) -> IntegrationProperty:
        prop = self.db.query(IntegrationProperty).filter(
            IntegrationProperty.id == property_id,
            IntegrationProperty.organization_id == org_id
        ).first()
        if not prop:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Property not found")
        return prop

    # --- Containers ---

    def list_containers(self, user: User, org_id: UUID | None = None) -> list[TagManagerContainer]:
        resolved_org_id = self.consent_service._resolve_org_id(user, org_id)
        containers = self.db.query(TagManagerContainer).filter(
            TagManagerContainer.organization_id == resolved_org_id
        ).all()
        # Prepopulate property domains for response
        for c in containers:
            if c.property:
                c.property_domain = c.property.domain
            else:
                c.property_domain = None
        return containers

    def get_container(self, container_id: UUID, user: User, org_id: UUID | None = None) -> TagManagerContainer:
        resolved_org_id = self.consent_service._resolve_org_id(user, org_id)
        container = self.db.query(TagManagerContainer).filter(
            TagManagerContainer.id == container_id,
            TagManagerContainer.organization_id == resolved_org_id
        ).first()
        if not container:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Container not found")
        if container.property:
            container.property_domain = container.property.domain
        return container

    def create_container(self, user: User, schema: TagManagerContainerCreate, org_id: UUID | None = None) -> TagManagerContainer:
        self.consent_service._require_admin(user)
        resolved_org_id = self.consent_service._resolve_org_id(user, org_id)
        self._get_property(schema.property_id, resolved_org_id)

        container = TagManagerContainer(
            organization_id=resolved_org_id,
            property_id=schema.property_id,
            provider=schema.provider,
            container_name=schema.container_name,
            container_identifier=schema.container_identifier,
            environment=schema.environment,
            status=schema.status,
            auto_sync=schema.auto_sync,
            consent_mode=schema.consent_mode,
        )
        self.db.add(container)
        self.db.commit()
        self.db.refresh(container)
        if container.property:
            container.property_domain = container.property.domain
        return container

    def update_container(self, container_id: UUID, user: User, schema: TagManagerContainerUpdate, org_id: UUID | None = None) -> TagManagerContainer:
        self.consent_service._require_admin(user)
        resolved_org_id = self.consent_service._resolve_org_id(user, org_id)
        container = self.get_container(container_id, user, org_id=resolved_org_id)

        for field, val in schema.model_dump(exclude_unset=True).items():
            setattr(container, field, val)

        self.db.commit()
        self.db.refresh(container)
        return container

    def delete_container(self, container_id: UUID, user: User, org_id: UUID | None = None) -> None:
        self.consent_service._require_admin(user)
        resolved_org_id = self.consent_service._resolve_org_id(user, org_id)
        container = self.get_container(container_id, user, org_id=resolved_org_id)
        self.db.delete(container)
        self.db.commit()

    # --- Tags ---

    def list_tags(self, container_id: UUID | None, property_id: UUID | None, user: User, org_id: UUID | None = None) -> list[ManagedTag]:
        resolved_org_id = self.consent_service._resolve_org_id(user, org_id)
        query = self.db.query(ManagedTag).join(TagManagerContainer)
        query = query.filter(TagManagerContainer.organization_id == resolved_org_id)
        if container_id:
            query = query.filter(ManagedTag.container_id == container_id)
        if property_id:
            query = query.filter(ManagedTag.property_id == property_id)
        
        tags = query.all()
        for t in tags:
            t.purpose_name = t.purpose.name if t.purpose else None
        return tags

    def create_tag(self, user: User, schema: ManagedTagCreate, org_id: UUID | None = None) -> ManagedTag:
        resolved_org_id = self.consent_service._resolve_org_id(user, org_id)
        
        # Verify container belongs to org
        container = self.get_container(schema.container_id, user, org_id=resolved_org_id)
        
        tag = ManagedTag(
            container_id=schema.container_id,
            property_id=container.property_id,
            provider=schema.provider,
            purpose_id=schema.purpose_id,
            tag_name=schema.tag_name,
            trigger=schema.trigger,
            execution_type=schema.execution_type,
            script_url=schema.script_url,
            inline_script=schema.inline_script,
            status=schema.status,
            priority=schema.priority,
        )
        self.db.add(tag)
        self.db.commit()
        self.db.refresh(tag)
        tag.purpose_name = tag.purpose.name if tag.purpose else None
        return tag

    def update_tag(self, tag_id: UUID, user: User, schema: ManagedTagUpdate, org_id: UUID | None = None) -> ManagedTag:
        resolved_org_id = self.consent_service._resolve_org_id(user, org_id)
        tag = self.db.query(ManagedTag).join(TagManagerContainer).filter(
            ManagedTag.id == tag_id,
            TagManagerContainer.organization_id == resolved_org_id
        ).first()

        if not tag:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Tag not found")

        for field, val in schema.model_dump(exclude_unset=True).items():
            setattr(tag, field, val)

        self.db.commit()
        self.db.refresh(tag)
        tag.purpose_name = tag.purpose.name if tag.purpose else None
        return tag

    def delete_tag(self, tag_id: UUID, user: User, org_id: UUID | None = None) -> None:
        resolved_org_id = self.consent_service._resolve_org_id(user, org_id)
        tag = self.db.query(ManagedTag).join(TagManagerContainer).filter(
            ManagedTag.id == tag_id,
            TagManagerContainer.organization_id == resolved_org_id
        ).first()

        if not tag:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Tag not found")

        self.db.delete(tag)
        self.db.commit()

    # --- Rules ---

    def list_rules(self, property_id: UUID | None, user: User, org_id: UUID | None = None) -> list[TagExecutionRule]:
        resolved_org_id = self.consent_service._resolve_org_id(user, org_id)
        query = self.db.query(TagExecutionRule).join(IntegrationProperty)
        query = query.filter(IntegrationProperty.organization_id == resolved_org_id)
        if property_id:
            query = query.filter(TagExecutionRule.property_id == property_id)
        return query.all()

    def create_rule(self, user: User, schema: TagExecutionRuleCreate, org_id: UUID | None = None) -> TagExecutionRule:
        self.consent_service._require_admin(user)
        resolved_org_id = self.consent_service._resolve_org_id(user, org_id)
        self._get_property(schema.property_id, resolved_org_id)

        rule = TagExecutionRule(
            property_id=schema.property_id,
            priority=schema.priority,
            rule_json=schema.rule_json,
            status=schema.status,
        )
        self.db.add(rule)
        self.db.commit()
        self.db.refresh(rule)
        return rule

    def update_rule(self, rule_id: UUID, user: User, schema: TagExecutionRuleUpdate, org_id: UUID | None = None) -> TagExecutionRule:
        self.consent_service._require_admin(user)
        resolved_org_id = self.consent_service._resolve_org_id(user, org_id)
        rule = self.db.query(TagExecutionRule).join(IntegrationProperty).filter(
            TagExecutionRule.id == rule_id,
            IntegrationProperty.organization_id == resolved_org_id
        ).first()

        if not rule:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Rule not found")

        for field, val in schema.model_dump(exclude_unset=True).items():
            setattr(rule, field, val)

        self.db.commit()
        self.db.refresh(rule)
        return rule

    def delete_rule(self, rule_id: UUID, user: User, org_id: UUID | None = None) -> None:
        self.consent_service._require_admin(user)
        resolved_org_id = self.consent_service._resolve_org_id(user, org_id)
        rule = self.db.query(TagExecutionRule).join(IntegrationProperty).filter(
            TagExecutionRule.id == rule_id,
            IntegrationProperty.organization_id == resolved_org_id
        ).first()

        if not rule:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Rule not found")

        self.db.delete(rule)
        self.db.commit()

    # --- Violations ---

    def list_violations(self, property_id: UUID | None, user: User, org_id: UUID | None = None) -> list[TagViolation]:
        resolved_org_id = self.consent_service._resolve_org_id(user, org_id)
        query = self.db.query(TagViolation).join(IntegrationProperty)
        query = query.filter(IntegrationProperty.organization_id == resolved_org_id)
        if property_id:
            query = query.filter(TagViolation.property_id == property_id)
        violations = query.all()
        for v in violations:
            v.property_domain = v.property.domain if v.property else None
            v.tag_name = v.tag.tag_name if v.tag else "Unknown Script"
            v.resolved_by_name = v.resolver.full_name if v.resolver else None
        return violations

    def resolve_violation(self, violation_id: UUID, user: User, org_id: UUID | None = None) -> TagViolation:
        self.consent_service._require_admin(user)
        resolved_org_id = self.consent_service._resolve_org_id(user, org_id)
        violation = self.db.query(TagViolation).join(IntegrationProperty).filter(
            TagViolation.id == violation_id,
            IntegrationProperty.organization_id == resolved_org_id
        ).first()

        if not violation:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Violation not found")

        violation.resolved = True
        violation.resolved_by = user.id
        self.db.commit()
        self.db.refresh(violation)
        
        violation.property_domain = violation.property.domain if violation.property else None
        violation.tag_name = violation.tag.tag_name if violation.tag else "Unknown Script"
        violation.resolved_by_name = user.full_name
        return violation

    def create_violation(
        self,
        user: User,
        schema: TagViolationCreate,
        org_id: UUID | None = None,
    ) -> TagViolation:
        self.consent_service._require_admin(user)
        resolved_org_id = self.consent_service._resolve_org_id(user, org_id)
        self._get_property(schema.property_id, resolved_org_id)

        violation = TagViolation(
            property_id=schema.property_id,
            tag_id=schema.tag_id,
            page=schema.page,
            severity=schema.severity,
            reason=schema.reason,
        )
        self.db.add(violation)
        self.db.commit()
        self.db.refresh(violation)
        violation.property_domain = violation.property.domain if violation.property else None
        violation.tag_name = violation.tag.tag_name if violation.tag else "Unknown Script"
        return violation

    def _consent_granted_for_purpose(self, purpose_name: str, consent_choices: dict[str, bool]) -> bool:
        for choice, value in consent_choices.items():
            if choice.lower() == purpose_name.lower():
                return bool(value)
        return False

    def _rule_conditions_match(
        self,
        rule_json: dict,
        purpose_name: str,
        consent_choices: dict[str, bool],
    ) -> bool:
        conditions = rule_json.get("conditions") or []
        if not conditions:
            return False

        for condition in conditions:
            field = str(condition.get("field", "")).lower()
            operator = str(condition.get("operator", "=="))
            expected = condition.get("value")

            if field == "purpose":
                actual = purpose_name
                if operator == "==" and str(actual).lower() != str(expected).lower():
                    return False
            elif field == "consent":
                granted = self._consent_granted_for_purpose(purpose_name, consent_choices)
                consent_label = "Granted" if granted else "Denied"
                if operator == "==" and str(consent_label).lower() != str(expected).lower():
                    return False
            else:
                return False
        return True

    def _find_matching_rule(
        self,
        rules: list[TagExecutionRule],
        purpose_name: str,
        consent_choices: dict[str, bool],
    ) -> TagExecutionRule | None:
        for rule in sorted(rules, key=lambda r: r.priority):
            if rule.status != "active":
                continue
            if self._rule_conditions_match(rule.rule_json, purpose_name, consent_choices):
                return rule
        return None

    def _evaluate_tag_status(
        self,
        purpose_name: str,
        consent_choices: dict[str, bool],
        rules: list[TagExecutionRule],
    ) -> tuple[str, str, bool, UUID | None]:
        matching_rule = self._find_matching_rule(rules, purpose_name, consent_choices)
        if matching_rule:
            action = str(matching_rule.rule_json.get("action", "block")).lower()
            if action == "execute":
                return (
                    "EXECUTED",
                    f"Execution rule applied (priority {matching_rule.priority})",
                    True,
                    matching_rule.id,
                )
            return (
                "BLOCKED",
                f"Execution rule blocked tag (priority {matching_rule.priority})",
                True,
                matching_rule.id,
            )

        if purpose_name.lower() in ("necessary", "strictly necessary"):
            return "EXECUTED", "Necessary tag executed without restrictions", False, None

        if self._consent_granted_for_purpose(purpose_name, consent_choices):
            return "EXECUTED", f"{purpose_name} consent granted", False, None
        return "BLOCKED", f"{purpose_name} consent denied", False, None

    def detect_violations(
        self,
        property_id: UUID,
        simulation_results: list[SimulatedTagResult],
        page: str = "Simulation",
    ) -> None:
        today_start = datetime.combine(date.today(), datetime.min.time()).replace(tzinfo=timezone.utc)

        for result in simulation_results:
            if result.status != "BLOCKED":
                continue

            existing = (
                self.db.query(TagViolation)
                .filter(
                    TagViolation.property_id == property_id,
                    TagViolation.tag_id == result.tag_id,
                    TagViolation.resolved == False,  # noqa: E712
                    TagViolation.created_at >= today_start,
                )
                .first()
            )
            if existing:
                continue

            purpose_lower = (result.purpose_name or "").lower()
            severity = "High" if any(k in purpose_lower for k in ("market", "analytic", "ad")) else "Medium"

            violation = TagViolation(
                property_id=property_id,
                tag_id=result.tag_id,
                page=page,
                severity=severity,
                reason=f"Tag blocked: {result.reason}",
            )
            self.db.add(violation)

    def record_tag_executions(
        self,
        property_id: UUID,
        simulation_results: list[SimulatedTagResult],
    ) -> None:
        today = date.today()
        for result in simulation_results:
            log = (
                self.db.query(TagExecutionLog)
                .filter(
                    TagExecutionLog.property_id == property_id,
                    TagExecutionLog.tag_id == result.tag_id,
                    TagExecutionLog.date == today,
                )
                .first()
            )
            if not log:
                log = TagExecutionLog(
                    property_id=property_id,
                    tag_id=result.tag_id,
                    date=today,
                    executed=0,
                    blocked=0,
                    purpose_name=result.purpose_name or "Unknown",
                )
                self.db.add(log)

            if result.status == "EXECUTED":
                log.executed += 1
            else:
                log.blocked += 1

    # --- Simulator ---

    def simulate_tag_trigger(
        self,
        property_id: UUID,
        consent_choices: dict[str, bool],
        user: User,
        org_id: UUID | None = None,
        record_metrics: bool = True,
    ) -> list[SimulatedTagResult]:
        resolved_org_id = self.consent_service._resolve_org_id(user, org_id)
        
        # Verify property exists
        self._get_property(property_id, resolved_org_id)
        
        active_rules = (
            self.db.query(TagExecutionRule)
            .filter(
                TagExecutionRule.property_id == property_id,
                TagExecutionRule.status == "active",
            )
            .order_by(TagExecutionRule.priority.asc())
            .all()
        )

        # Get all tags for this property
        tags = self.db.query(ManagedTag).join(TagManagerContainer).filter(
            TagManagerContainer.property_id == property_id,
            TagManagerContainer.organization_id == resolved_org_id,
            ManagedTag.status == "active"
        ).all()

        results = []
        for tag in tags:
            purpose_name = tag.purpose.name if tag.purpose else "Necessary"
            status_res, reason_res, rule_applied, rule_id = self._evaluate_tag_status(
                purpose_name, consent_choices, active_rules
            )
            
            results.append(SimulatedTagResult(
                tag_id=tag.id,
                tag_name=tag.tag_name,
                provider=tag.provider,
                purpose_name=purpose_name,
                status=status_res,
                reason=reason_res,
                rule_applied=rule_applied,
                rule_id=rule_id,
            ))

        if record_metrics and results:
            self.record_consent_enforcement(property_id, consent_choices)
            self.record_tag_executions(property_id, results)
            self.detect_violations(property_id, results)
            self.db.commit()
        
        return results

    # --- Analytics ---

    def get_analytics(
        self,
        property_id: UUID | None,
        user: User,
        org_id: UUID | None = None,
        days: int = 7,
    ) -> list[TagManagerDailyMetric]:
        resolved_org_id = self.consent_service._resolve_org_id(user, org_id)
        query = self.db.query(TagManagerDailyMetric).join(IntegrationProperty)
        query = query.filter(IntegrationProperty.organization_id == resolved_org_id)
        if property_id:
            query = query.filter(TagManagerDailyMetric.property_id == property_id)
        if days > 0:
            since = date.today() - timedelta(days=days - 1)
            query = query.filter(TagManagerDailyMetric.date >= since)
        return query.order_by(TagManagerDailyMetric.date.asc()).all()

    def _purpose_bucket(self, purpose_key: str) -> str:
        normalized = purpose_key.lower().strip()
        if normalized in PURPOSE_METRIC_BUCKETS:
            return normalized
        if "analytic" in normalized:
            return "analytics"
        if "market" in normalized or "ad" in normalized or "advertis" in normalized:
            return "marketing"
        if "necessary" in normalized or "essential" in normalized or "strict" in normalized:
            return "necessary"
        return "functional"

    def record_consent_enforcement(
        self,
        property_id: UUID,
        consented_purposes: dict | list | None,
    ) -> None:
        """Upsert today's tag-manager metrics from a live consent decision."""
        if not consented_purposes:
            return

        purposes: dict[str, bool]
        if isinstance(consented_purposes, list):
            purposes = {key: True for key in consented_purposes}
        else:
            purposes = {str(k): bool(v) for k, v in consented_purposes.items()}

        executed = 0
        blocked = 0
        bucket_counts = {bucket: 0 for bucket in PURPOSE_METRIC_BUCKETS}

        for purpose_key, granted in purposes.items():
            bucket = self._purpose_bucket(purpose_key)
            if granted:
                executed += 1
                bucket_counts[bucket] += 1
            else:
                blocked += 1

        if executed == 0 and blocked == 0:
            return

        today = date.today()
        metric = self.db.query(TagManagerDailyMetric).filter(
            TagManagerDailyMetric.property_id == property_id,
            TagManagerDailyMetric.date == today,
        ).first()

        if not metric:
            metric = TagManagerDailyMetric(
                property_id=property_id,
                date=today,
                executed=0,
                blocked=0,
                analytics=0,
                marketing=0,
                functional=0,
                necessary=0,
            )
            self.db.add(metric)

        metric.executed += executed
        metric.blocked += blocked
        metric.analytics += bucket_counts["analytics"]
        metric.marketing += bucket_counts["marketing"]
        metric.functional += bucket_counts["functional"]
        metric.necessary += bucket_counts["necessary"]
        self.db.commit()

    def get_overview_stats(
        self,
        property_id: UUID | None,
        user: User,
        org_id: UUID | None = None,
    ) -> dict:
        resolved_org_id = self.consent_service._resolve_org_id(user, org_id)

        containers_q = self.db.query(TagManagerContainer).filter(
            TagManagerContainer.organization_id == resolved_org_id
        )
        tags_q = self.db.query(ManagedTag).join(TagManagerContainer).filter(
            TagManagerContainer.organization_id == resolved_org_id
        )
        rules_q = self.db.query(TagExecutionRule).join(IntegrationProperty).filter(
            IntegrationProperty.organization_id == resolved_org_id
        )
        violations_q = self.db.query(TagViolation).join(IntegrationProperty).filter(
            IntegrationProperty.organization_id == resolved_org_id
        )
        metrics_q = self.db.query(TagManagerDailyMetric).join(IntegrationProperty).filter(
            IntegrationProperty.organization_id == resolved_org_id
        )

        if property_id:
            containers_q = containers_q.filter(TagManagerContainer.property_id == property_id)
            tags_q = tags_q.filter(ManagedTag.property_id == property_id)
            rules_q = rules_q.filter(TagExecutionRule.property_id == property_id)
            violations_q = violations_q.filter(TagViolation.property_id == property_id)
            metrics_q = metrics_q.filter(TagManagerDailyMetric.property_id == property_id)

        containers = containers_q.all()
        tags = tags_q.all()
        rules = rules_q.all()
        violations = violations_q.all()

        today = date.today()
        metrics_today = metrics_q.filter(TagManagerDailyMetric.date == today).all()
        metrics_recent = metrics_q.filter(
            TagManagerDailyMetric.date >= today - timedelta(days=6)
        ).all()

        blocked_today = sum(m.blocked for m in metrics_today)
        executed_today = sum(m.executed for m in metrics_today)
        total_today = blocked_today + executed_today

        if total_today > 0:
            consent_success_rate = round((executed_today / total_today) * 100, 1)
        else:
            executed_recent = sum(m.executed for m in metrics_recent)
            blocked_recent = sum(m.blocked for m in metrics_recent)
            total_recent = executed_recent + blocked_recent
            consent_success_rate = (
                round((executed_recent / total_recent) * 100, 1) if total_recent > 0 else 0.0
            )

        misconfigured_tags = sum(1 for tag in tags if not tag.purpose_id)
        tag_mappings_score = 100 if misconfigured_tags == 0 else max(0, 100 - misconfigured_tags * 5)

        active_rules = [rule for rule in rules if rule.status == "active"]
        if not tags:
            execution_rules_score = 100
        elif not active_rules:
            execution_rules_score = 40
        else:
            coverage = min(1.0, len(active_rules) / len(tags))
            inactive_penalty = sum(1 for rule in rules if rule.status != "active") * 5
            execution_rules_score = max(0, min(100, int(coverage * 100) - inactive_penalty))

        unresolved_violations = sum(1 for violation in violations if not violation.resolved)
        blocked_violations_score = (
            100 if unresolved_violations == 0 else max(0, 100 - unresolved_violations * 10)
        )

        stale_cutoff = datetime.now(timezone.utc) - timedelta(days=7)
        stale_containers = [
            container
            for container in containers
            if not container.auto_sync
            or container.status != "active"
            or (container.updated_at and container.updated_at < stale_cutoff)
        ]
        if not containers:
            stale_containers_score = 100
        else:
            stale_containers_score = int(
                (1 - len(stale_containers) / len(containers)) * 100
            )

        health_score = int(
            round(
                (
                    tag_mappings_score
                    + execution_rules_score
                    + blocked_violations_score
                    + stale_containers_score
                )
                / 4
            )
        )

        if property_id:
            connected_properties = 1
        else:
            connected_property_ids = {container.property_id for container in containers}
            connected_properties = len(connected_property_ids)

        purpose_totals = {
            "necessary": sum(m.necessary for m in metrics_recent),
            "analytics": sum(m.analytics for m in metrics_recent),
            "marketing": sum(m.marketing for m in metrics_recent),
            "functional": sum(m.functional for m in metrics_recent),
        }

        return {
            "connected_properties": connected_properties,
            "connected_containers": len(containers),
            "managed_tags": len(tags),
            "blocked_today": blocked_today,
            "consent_success_rate": consent_success_rate,
            "misconfigured_tags": misconfigured_tags,
            "health_score": health_score,
            "tag_mappings_score": tag_mappings_score,
            "execution_rules_score": execution_rules_score,
            "blocked_violations_score": blocked_violations_score,
            "stale_containers_score": stale_containers_score,
            "purpose_totals": purpose_totals,
        }

    # --- Container Sync ---

    def sync_container(
        self,
        container_id: UUID,
        user: User,
        org_id: UUID | None = None,
    ) -> TagManagerContainer:
        self.consent_service._require_admin(user)
        resolved_org_id = self.consent_service._resolve_org_id(user, org_id)
        container = self.get_container(container_id, user, org_id=resolved_org_id)

        container.status = "active"
        container.updated_at = datetime.now(timezone.utc)

        if container.container_identifier.upper().startswith("GTM-"):
            from app.models.integration_event import IntegrationEvent

            event = IntegrationEvent(
                property_id=container.property_id,
                event_type="tag_manager_sync",
                session_id=f"sync-{container.id}",
                ip_hash="admin-panel",
                user_agent="ZeroShield Tag Manager",
                payload={
                    "container_id": str(container.id),
                    "container_identifier": container.container_identifier,
                    "synced_by": str(user.id),
                },
                created_at=datetime.now(timezone.utc),
            )
            self.db.add(event)

        self.db.commit()
        self.db.refresh(container)
        if container.property:
            container.property_domain = container.property.domain
        return container

    # --- Settings ---

    def get_settings(
        self,
        property_id: UUID,
        user: User,
        org_id: UUID | None = None,
    ) -> TagManagerSettings:
        resolved_org_id = self.consent_service._resolve_org_id(user, org_id)
        self._get_property(property_id, resolved_org_id)

        settings = (
            self.db.query(TagManagerSettings)
            .filter(TagManagerSettings.property_id == property_id)
            .first()
        )
        if not settings:
            settings = TagManagerSettings(
                property_id=property_id,
                consent_mode_v2=True,
                auto_blocker_strict=True,
                datalayer_event_prefix="zeroshield",
                blocked_purposes=[],
            )
            self.db.add(settings)
            self.db.commit()
            self.db.refresh(settings)
        return settings

    def update_settings(
        self,
        property_id: UUID,
        user: User,
        schema: TagManagerSettingsUpdate,
        org_id: UUID | None = None,
    ) -> TagManagerSettings:
        self.consent_service._require_admin(user)
        settings = self.get_settings(property_id, user, org_id=org_id)

        for field, val in schema.model_dump(exclude_unset=True).items():
            setattr(settings, field, val)
        settings.updated_by = user.id

        self.db.commit()
        self.db.refresh(settings)
        return settings

    # --- Per-tag analytics ---

    def get_tag_analytics(
        self,
        property_id: UUID | None,
        user: User,
        org_id: UUID | None = None,
        days: int = 7,
    ) -> list[TagExecutionLog]:
        resolved_org_id = self.consent_service._resolve_org_id(user, org_id)
        query = self.db.query(TagExecutionLog).join(IntegrationProperty)
        query = query.filter(IntegrationProperty.organization_id == resolved_org_id)
        if property_id:
            query = query.filter(TagExecutionLog.property_id == property_id)
        if days > 0:
            since = date.today() - timedelta(days=days - 1)
            query = query.filter(TagExecutionLog.date >= since)

        logs = query.all()
        for log in logs:
            log.tag_name = log.tag.tag_name if log.tag else "Unknown Tag"
        return logs

    @staticmethod
    def list_providers() -> list[str]:
        return ["Google Tag Manager", "Adobe Launch", "Tealium", "Custom JS Blocker"]
