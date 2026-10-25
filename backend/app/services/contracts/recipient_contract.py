from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.consent_receipt import ConsentReceipt
from app.models.dsar import DataRightsRequest
from app.models.child_data import ChildDataRecord
from app.models.notice_delivery import RecipientDeliveryStatus
from app.models.consent import Purpose, PurposeVersion, ConsentNotice

# DPDPA enactment date — consent captured before this may require §5(2) re-notice.
DPDPA_ENACTMENT_CUTOFF = datetime(2023, 8, 11, tzinfo=timezone.utc)


class RecipientContract:
    @staticmethod
    def get_recipients_by_segment(db: Session, org_id: UUID, segment: str, notice_id: UUID | None = None) -> list[dict]:
        # 1. Fetch unique emails/phones from ConsentReceipts
        receipts = db.query(
            ConsentReceipt.principal_email, 
            ConsentReceipt.principal_phone, 
            ConsentReceipt.consented_purposes
        ).filter(
            ConsentReceipt.organization_id == org_id,
            (ConsentReceipt.principal_email != None) | (ConsentReceipt.principal_phone != None)
        ).all()

        # 2. Fetch unique emails/phones from DataRightsRequests
        requests = db.query(
            DataRightsRequest.requester_name, 
            DataRightsRequest.requester_email, 
            DataRightsRequest.requester_phone
        ).filter(
            DataRightsRequest.organization_id == org_id,
            (DataRightsRequest.requester_email != None) | (DataRightsRequest.requester_phone != None)
        ).distinct().all()

        # 3. Fetch unique parent emails from ChildDataRecords
        children = db.query(
            ChildDataRecord.parent_name, 
            ChildDataRecord.parent_email
        ).filter(
            ChildDataRecord.organization_id == org_id,
            ChildDataRecord.parent_email != None,
            ChildDataRecord.aged_out_at == None
        ).distinct().all()

        # Build a unified dict of all unique principals
        principals = {}

        # Load marketing and special category purpose IDs/names for filtering
        marketing_purpose_ids = set()
        special_purpose_ids = set()
        try:
            purposes = db.query(Purpose.id, Purpose.name, PurposeVersion.is_special_category).join(
                PurposeVersion, Purpose.current_live_version_id == PurposeVersion.id
            ).filter(Purpose.organization_id == org_id).all()
            for pid, pname, is_special in purposes:
                pname_lower = pname.lower()
                if "marketing" in pname_lower or "advertising" in pname_lower or "analytics" in pname_lower:
                    marketing_purpose_ids.add(str(pid))
                    marketing_purpose_ids.add(pname)
                if is_special:
                    special_purpose_ids.add(str(pid))
                    special_purpose_ids.add(pname)
        except Exception as e:
            print(f"Error fetching purposes: {e}")

        # Helper to check if a consented_purposes dictionary has consent for specific purpose keys
        def matches_purpose_filter(consented_dict, target_filter_set, fallback_keywords):
            if not consented_dict:
                return False
            if isinstance(consented_dict, dict):
                for k, v in consented_dict.items():
                    if v is True:
                        if k in target_filter_set or any(kw in k.lower() for kw in fallback_keywords):
                            return True
            elif isinstance(consented_dict, list):
                for k in consented_dict:
                    if k in target_filter_set or any(kw in str(k).lower() for kw in fallback_keywords):
                        return True
            return False

        # Build individual sets for target segments
        marketing_keys = set()
        special_keys = set()

        for email, phone, consented_purposes in receipts:
            key = email or phone
            if not key:
                continue
            
            # Check if this receipt matches marketing or special categories
            is_marketing = matches_purpose_filter(consented_purposes, marketing_purpose_ids, ["marketing", "advertising", "analytics"])
            is_special = matches_purpose_filter(consented_purposes, special_purpose_ids, ["sensitive", "health", "financial", "biometric"])
            
            if is_marketing:
                marketing_keys.add(key)
            if is_special:
                special_keys.add(key)

            if key not in principals:
                username = email.split('@')[0].capitalize() if email else "Principal"
                principals[key] = {
                    "id": key,
                    "name": f"Data Principal ({username})" if email else f"Data Principal ({phone})",
                    "email": email,
                    "phone": phone,
                    "address": "Consent Banner Registered Address"
                }

        for name, email, phone in requests:
            key = email or phone
            if not key:
                continue
            if key not in principals:
                principals[key] = {
                    "id": key,
                    "name": name or "Data Principal (DSAR)",
                    "email": email,
                    "phone": phone,
                    "address": "DSAR Portal Registered Address"
                }
            else:
                if name and principals[key]["name"].startswith("Data Principal"):
                    principals[key]["name"] = name

        for parent_name, parent_email in children:
            key = parent_email
            if not key:
                continue
            if key not in principals:
                principals[key] = {
                    "id": key,
                    "name": parent_name or f"Parent of Minor",
                    "email": parent_email,
                    "phone": None,
                    "address": "Parent Registered Address"
                }

        # Filter the unified list based on the requested segment
        if segment == "all":
            return list(principals.values())
        
        elif segment == "marketing":
            return [p for k, p in principals.items() if k in marketing_keys]
        
        elif segment == "high_risk":
            return [p for k, p in principals.items() if k in special_keys]
        
        elif segment == "children":
            child_parent_emails = {parent_email for _, parent_email in children if parent_email}
            return [p for k, p in principals.items() if k in child_parent_emails]
        
        elif segment == "renewal_due":
            return RecipientContract._filter_not_acknowledged_latest_version(
                db, org_id, notice_id, principals,
            )

        elif segment == "legacy_pre_dpdpa":
            # §5(2) repapering: principals with pre-DPDPA consent receipts who still need the live notice.
            pre_dpdpa_keys: set[str] = set()
            pre_dpdpa_rows = db.query(
                ConsentReceipt.principal_email,
                ConsentReceipt.principal_phone,
            ).filter(
                ConsentReceipt.organization_id == org_id,
                ConsentReceipt.created_at < DPDPA_ENACTMENT_CUTOFF,
                (ConsentReceipt.principal_email != None) | (ConsentReceipt.principal_phone != None),
            ).all()
            for email, phone in pre_dpdpa_rows:
                key = email or phone
                if key:
                    pre_dpdpa_keys.add(key)

            if not pre_dpdpa_keys:
                return []

            legacy_principals = {
                k: p for k, p in principals.items() if k in pre_dpdpa_keys
            }
            return RecipientContract._filter_not_acknowledged_latest_version(
                db, org_id, notice_id, legacy_principals,
            )

        return list(principals.values())

    @staticmethod
    def _filter_not_acknowledged_latest_version(
        db: Session,
        org_id: UUID,
        notice_id: UUID | None,
        principals: dict[str, dict],
    ) -> list[dict]:
        if not notice_id:
            active_notice = db.query(ConsentNotice).filter(
                ConsentNotice.organization_id == org_id,
                ConsentNotice.archived_at == None,
            ).order_by(ConsentNotice.created_at.desc()).first()
            if active_notice:
                notice_id = active_notice.id

        if not notice_id:
            return list(principals.values())

        notice = db.query(ConsentNotice).filter(ConsentNotice.id == notice_id).first()
        if not notice or not notice.current_live_version_id:
            return list(principals.values())

        acknowledged_latest = db.query(RecipientDeliveryStatus.recipient_id).filter(
            RecipientDeliveryStatus.notice_id == notice_id,
            RecipientDeliveryStatus.last_acknowledged_version_id == notice.current_live_version_id,
        ).all()
        latest_ids = {r[0] for r in acknowledged_latest}

        return [p for k, p in principals.items() if k not in latest_ids]

    @staticmethod
    def get_recipient_details(db: Session, recipient_id: str) -> dict | None:
        u = db.query(ChildDataRecord).filter(ChildDataRecord.parent_email == recipient_id).first()
        if u:
            return {
                "id": recipient_id,
                "name": u.parent_name or "Parent of Minor",
                "email": u.parent_email,
                "phone": None,
                "address": "Parent Registered Address"
            }
        
        r = db.query(DataRightsRequest).filter(
            (DataRightsRequest.requester_email == recipient_id) | (DataRightsRequest.requester_phone == recipient_id)
        ).first()
        if r:
            return {
                "id": recipient_id,
                "name": r.requester_name or "Data Principal (DSAR)",
                "email": r.requester_email,
                "phone": r.requester_phone,
                "address": "DSAR Portal Registered Address"
            }

        c = db.query(ConsentReceipt).filter(
            (ConsentReceipt.principal_email == recipient_id) | (ConsentReceipt.principal_phone == recipient_id)
        ).first()
        if c:
            username = c.principal_email.split('@')[0].capitalize() if c.principal_email else "Principal"
            return {
                "id": recipient_id,
                "name": f"Data Principal ({username})" if c.principal_email else f"Data Principal ({recipient_id})",
                "email": c.principal_email,
                "phone": c.principal_phone,
                "address": "Consent Banner Registered Address"
            }

        return None
