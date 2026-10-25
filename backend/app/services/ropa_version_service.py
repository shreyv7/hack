from datetime import datetime, timezone
from uuid import UUID
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.ropa import (
    ProcessingActivity,
    ActivityVersion,
    ActivityOwner,
    ActivityPurpose,
    ActivityDataCategory,
    ActivityDataPrincipal,
    ActivityLawfulBasis,
    ActivitySystem,
    ActivityRecipient,
    ActivityCrossBorderTransfer,
    ActivityRetentionPolicy,
    ActivitySecurityMeasure,
)
from app.models.user import User
from app.services.ropa_service import RopaService
from app.services.ropa_workflow_service import RopaWorkflowService


class RopaVersionService:
    def checkout_new_version(self, db: Session, activity_id: UUID, changelog: str, actor: User) -> ActivityVersion:
        activity = db.query(ProcessingActivity).filter(
            ProcessingActivity.id == activity_id,
            ProcessingActivity.is_deleted == False
        ).first()
        if not activity:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processing activity not found")

        current_ver = db.query(ActivityVersion).filter(ActivityVersion.id == activity.current_version_id).first()
        current_num = current_ver.version_number if current_ver else 0

        # Snapshot current state
        ropa_service = RopaService(db)
        snapshot = ropa_service._create_snapshot_dict(activity)

        # Create new version in draft status
        new_version = ActivityVersion(
            activity_id=activity.id,
            version_number=current_num + 1,
            status="draft",
            snapshot_json=snapshot,
            changelog=changelog,
            created_by_id=actor.id
        )
        db.add(new_version)
        db.flush()

        activity.current_version_id = new_version.id
        activity.status = "draft"

        RopaWorkflowService.record_event(
            db=db,
            activity_id=activity.id,
            event_type="activity.version_created",
            actor_id=actor.id,
            details={"version_number": new_version.version_number, "changelog": changelog}
        )

        db.commit()
        return new_version

    def compare_versions(self, db: Session, version_a_id: UUID, version_b_id: UUID) -> dict:
        ver_a = db.get(ActivityVersion, version_a_id)
        ver_b = db.get(ActivityVersion, version_b_id)

        if not ver_a or not ver_b:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")

        snap_a = ver_a.snapshot_json
        snap_b = ver_b.snapshot_json

        diff = {}
        all_keys = set(snap_a.keys()).union(snap_b.keys())
        for k in all_keys:
            val_a = snap_a.get(k)
            val_b = snap_b.get(k)
            if val_a != val_b:
                diff[k] = {"from": val_a, "to": val_b}

        return {
            "version_a_number": ver_a.version_number,
            "version_b_number": ver_b.version_number,
            "diff_data": diff
        }

    def rollback_to_version(self, db: Session, activity_id: UUID, version_id: UUID, actor: User) -> ActivityVersion:
        activity = db.query(ProcessingActivity).filter(
            ProcessingActivity.id == activity_id,
            ProcessingActivity.is_deleted == False
        ).first()
        if not activity:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processing activity not found")

        target_version = db.get(ActivityVersion, version_id)
        if not target_version or target_version.activity_id != activity_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target version not found for this activity")

        snapshot = target_version.snapshot_json

        # Restore flat properties
        activity.title = snapshot.get("title", activity.title)
        activity.description = snapshot.get("description", activity.description)
        activity.risk_score = snapshot.get("risk_score", activity.risk_score)
        activity.risk_level = snapshot.get("risk_level", activity.risk_level)

        if snapshot.get("business_unit_id"):
            activity.business_unit_id = UUID(snapshot["business_unit_id"])
        if snapshot.get("department_id"):
            activity.department_id = UUID(snapshot["department_id"])
        else:
            activity.department_id = None
        if snapshot.get("team_id"):
            activity.team_id = UUID(snapshot["team_id"])
        else:
            activity.team_id = None

        # 1. Clear current relation tables
        db.query(ActivityOwner).filter(ActivityOwner.activity_id == activity.id).delete()
        db.query(ActivityPurpose).filter(ActivityPurpose.activity_id == activity.id).delete()
        db.query(ActivityDataCategory).filter(ActivityDataCategory.activity_id == activity.id).delete()
        db.query(ActivityDataPrincipal).filter(ActivityDataPrincipal.activity_id == activity.id).delete()
        db.query(ActivityLawfulBasis).filter(ActivityLawfulBasis.activity_id == activity.id).delete()
        db.query(ActivitySystem).filter(ActivitySystem.activity_id == activity.id).delete()
        db.query(ActivityRecipient).filter(ActivityRecipient.activity_id == activity.id).delete()
        db.query(ActivityCrossBorderTransfer).filter(ActivityCrossBorderTransfer.activity_id == activity.id).delete()
        db.query(ActivityRetentionPolicy).filter(ActivityRetentionPolicy.activity_id == activity.id).delete()
        db.query(ActivitySecurityMeasure).filter(ActivitySecurityMeasure.activity_id == activity.id).delete()

        # 2. Populate from snapshot dicts
        for owner in snapshot.get("owners", []):
            db.add(ActivityOwner(activity_id=activity.id, user_id=UUID(owner["user_id"]), owner_role=owner["owner_role"]))

        for sort_idx, p_id in enumerate(snapshot.get("purposes", [])):
            db.add(ActivityPurpose(activity_id=activity.id, purpose_id=UUID(p_id), sort_order=sort_idx))

        for cat in snapshot.get("data_categories", []):
            db.add(ActivityDataCategory(
                activity_id=activity.id,
                category_name=cat["category_name"],
                is_special=cat["is_special"],
                sensitivity=cat.get("sensitivity", "standard")
            ))

        for princ in snapshot.get("data_principals", []):
            db.add(ActivityDataPrincipal(
                activity_id=activity.id,
                category_name=princ["category_name"],
                description=princ.get("description"),
                includes_children=princ.get("includes_children", False)
            ))

        for lb in snapshot.get("lawful_bases", []):
            db.add(ActivityLawfulBasis(
                activity_id=activity.id,
                basis_type=lb["basis_type"],
                justification=lb.get("justification"),
                dpdpa_section=lb.get("dpdpa_section")
            ))

        for sys in snapshot.get("systems", []):
            db.add(ActivitySystem(
                activity_id=activity.id,
                system_name=sys["system_name"],
                system_type=sys["system_type"],
                location=sys.get("location"),
                description=sys.get("description")
            ))

        for rec in snapshot.get("recipients", []):
            db.add(ActivityRecipient(
                activity_id=activity.id,
                recipient_type=rec["recipient_type"],
                name=rec["name"],
                data_shared=rec.get("data_shared"),
                data_processor_id=UUID(rec["data_processor_id"]) if rec.get("data_processor_id") else None
            ))

        for cb in snapshot.get("cross_border_transfers", []):
            db.add(ActivityCrossBorderTransfer(
                activity_id=activity.id,
                destination_country=cb["destination_country"],
                destination_entity=cb.get("destination_entity"),
                adequacy_status=cb.get("adequacy_status", "unknown"),
                safeguard_mechanism=cb.get("safeguard_mechanism"),
                legal_basis=cb.get("legal_basis")
            ))

        for ret in snapshot.get("retention_policies", []):
            db.add(ActivityRetentionPolicy(
                activity_id=activity.id,
                retention_period=ret["retention_period"],
                trigger_event=ret.get("trigger_event"),
                legal_basis=ret.get("legal_basis"),
                auto_delete=ret.get("auto_delete", False)
            ))

        for sec in snapshot.get("security_measures", []):
            db.add(ActivitySecurityMeasure(
                activity_id=activity.id,
                measure_type=sec["measure_type"],
                description=sec.get("description"),
                status=sec.get("status", "active")
            ))

        db.flush()

        # Create new version representing the rolled-back state
        current_ver = db.query(ActivityVersion).filter(ActivityVersion.id == activity.current_version_id).first()
        current_num = current_ver.version_number if current_ver else 0

        new_version = ActivityVersion(
            activity_id=activity.id,
            version_number=current_num + 1,
            status="draft",
            snapshot_json=snapshot,
            changelog=f"Rollback to version {target_version.version_number}",
            created_by_id=actor.id
        )
        db.add(new_version)
        db.flush()

        activity.current_version_id = new_version.id
        activity.status = "draft"

        RopaWorkflowService.record_event(
            db=db,
            activity_id=activity.id,
            event_type="activity.version_created",
            actor_id=actor.id,
            details={"version_number": new_version.version_number, "changelog": new_version.changelog}
        )

        db.commit()
        return new_version
