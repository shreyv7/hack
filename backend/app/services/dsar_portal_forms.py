"""Per-organization customizable data-rights portal request forms."""

from __future__ import annotations

import copy
import uuid
from typing import Any

from fastapi import HTTPException, status

from app.models.dsar import DataRightType
from app.utils.india_phone import PHONE_ERROR, try_normalize_india_phone

CORE_FIELD_KEYS = frozenset(
    {"requester_name", "requester_email", "requester_phone", "request_details"}
)
REQUIRED_CORE_KEYS = frozenset({"requester_name", "request_details"})
CONTACT_FIELD_KEYS = frozenset({"requester_email", "requester_phone"})

FIELD_TYPES = frozenset(
    {"text", "email", "tel", "textarea", "number", "date", "select", "checkbox"}
)

DEFAULT_HELP_TEXT = (
    "After submission you will receive a verification code by email or SMS. Your request is processed "
    "only after identity verification (DPDPA Section 6)."
)

DEFAULT_FIELDS: list[dict[str, Any]] = [
    {
        "id": "f_name",
        "type": "text",
        "label": "Full name",
        "placeholder": "",
        "required": True,
        "key": "requester_name",
        "locked": True,
    },
    {
        "id": "f_email",
        "type": "email",
        "label": "Email",
        "placeholder": "",
        "required": True,
        "key": "requester_email",
        "locked": False,
    },
    {
        "id": "f_phone",
        "type": "tel",
        "label": "Phone",
        "placeholder": "10-digit mobile number",
        "required": False,
        "key": "requester_phone",
        "locked": False,
    },
    {
        "id": "f_details",
        "type": "textarea",
        "label": "Request details",
        "placeholder": "Describe your request with as much detail as possible…",
        "required": True,
        "key": "request_details",
        "locked": True,
    },
]


BANKING_PORTAL_FIELDS: list[dict[str, Any]] = [
    {
        "id": "f_cif",
        "type": "text",
        "label": "Customer ID / CIF",
        "placeholder": "Bank-issued customer reference token",
        "required": False,
        "key": "bank_customer_ref",
        "locked": False,
    },
    {
        "id": "f_account",
        "type": "text",
        "label": "Account number (tokenized)",
        "placeholder": "Masked or tokenized account reference",
        "required": False,
        "key": "account_number",
        "locked": False,
    },
    {
        "id": "f_username",
        "type": "text",
        "label": "Internet banking username",
        "placeholder": "",
        "required": False,
        "key": "username",
        "locked": False,
    },
]


def banking_enriched_form(right_type: DataRightType) -> dict[str, Any]:
    """Default portal form with banking identifiers for rural/branch customers without email."""
    form = default_portal_form(right_type)
    fields = list(form["fields"])
    phone_idx = next((i for i, f in enumerate(fields) if f.get("key") == "requester_phone"), 2)
    for offset, bf in enumerate(BANKING_PORTAL_FIELDS):
        fields.insert(phone_idx + 1 + offset, copy.deepcopy(bf))
    if right_type == DataRightType.withdraw_consent:
        form["help_text"] = (
            "Submit consent withdrawal using your registered mobile, CIF, or account token. "
            "Identity verification via OTP is required (DPDPA Section 6). "
            "Withdrawal does not trigger immediate deletion where RBI/AML/legal retention applies."
        )
    elif right_type in (DataRightType.masking, DataRightType.anonymization, DataRightType.erasure):
        form["help_text"] = (
            "Your request will be fulfilled per applicable retention policies. "
            "Data may be masked or anonymized rather than deleted where law requires retention "
            "(RBI, AML, fraud, taxation). Minimum evidentiary records are preserved under DPDPA."
        )
    form["fields"] = fields
    email_field = next((f for f in fields if f.get("key") == "requester_email"), None)
    if email_field:
        email_field["required"] = right_type not in (
            DataRightType.withdraw_consent,
            DataRightType.access,
        )
    return form


def default_portal_form(right_type: DataRightType) -> dict[str, Any]:
    return {
        "right_type": right_type.value,
        "help_text": DEFAULT_HELP_TEXT,
        "fields": copy.deepcopy(DEFAULT_FIELDS),
    }


def default_all_portal_forms() -> dict[str, dict[str, Any]]:
    return {rt.value: default_portal_form(rt) for rt in DataRightType}


def _normalize_field(raw: dict[str, Any], index: int) -> dict[str, Any]:
    field_type = raw.get("type", "text")
    if field_type not in FIELD_TYPES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid field type at position {index + 1}",
        )
    key = (raw.get("key") or raw.get("id") or f"field_{index}").strip()
    if not key:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Each field needs a key")
    field_id = raw.get("id") or str(uuid.uuid4())
    options = raw.get("options")
    if field_type == "select":
        if not options or not isinstance(options, list) or not all(isinstance(o, str) for o in options):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=f"Select field '{key}' requires a list of options",
            )
    elif options:
        options = None
    return {
        "id": field_id,
        "type": field_type,
        "label": (raw.get("label") or key).strip() or key,
        "placeholder": raw.get("placeholder") or "",
        "required": bool(raw.get("required")),
        "key": key,
        "locked": bool(raw.get("locked")),
        "options": options,
    }


def validate_portal_form_schema(body: dict[str, Any]) -> dict[str, Any]:
    fields_raw = body.get("fields")
    if not isinstance(fields_raw, list) or len(fields_raw) == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="At least one field is required")

    fields = [_normalize_field(f, i) for i, f in enumerate(fields_raw)]
    keys = [f["key"] for f in fields]
    if len(keys) != len(set(keys)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Field keys must be unique")

    present_core = {k for k in keys if k in CORE_FIELD_KEYS}
    missing = REQUIRED_CORE_KEYS - present_core
    if missing:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Form must include name and request details fields",
        )
    if not present_core & CONTACT_FIELD_KEYS:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Form must include at least an email or phone field for verification",
        )

    for field in fields:
        if field["key"] in REQUIRED_CORE_KEYS and not field["required"]:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=f"Field '{field['key']}' is required for portal submissions",
            )

    help_text = body.get("help_text")
    if help_text is not None and not isinstance(help_text, str):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="help_text must be a string")

    right_type = body.get("right_type")
    if right_type is not None:
        try:
            DataRightType(right_type)
        except ValueError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid right_type") from exc

    return {
        "right_type": right_type,
        "help_text": help_text if help_text is not None else DEFAULT_HELP_TEXT,
        "fields": fields,
    }


def merge_stored_form(
    right_type: DataRightType,
    stored: dict[str, Any] | None,
    *,
    banking: bool = False,
) -> dict[str, Any]:
    base = banking_enriched_form(right_type) if banking else default_portal_form(right_type)
    if not stored:
        return base
    fields = stored.get("fields")
    if isinstance(fields, list) and fields:
        base["fields"] = fields
    if stored.get("help_text"):
        base["help_text"] = stored["help_text"]
    return base


def map_submission_to_request(
    form: dict[str, Any], values: dict[str, Any]
) -> tuple[str, str, str | None, str, dict[str, Any]]:
    """Map dynamic form values to portal request columns."""
    name = email = details = ""
    phone: str | None = None
    extra: dict[str, Any] = {}

    field_by_key = {f["key"]: f for f in form.get("fields", [])}

    for key, value in values.items():
        field = field_by_key.get(key)
        if field and field.get("required") and (value is None or str(value).strip() == ""):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=f"Field '{field.get('label', key)}' is required",
            )

    for key, value in values.items():
        if value is None:
            continue
        if field_by_key.get(key, {}).get("type") == "checkbox":
            normalized: Any = bool(value)
        else:
            normalized = str(value).strip() if isinstance(value, str) else value
            if normalized == "":
                continue

        if key == "requester_name":
            name = str(normalized)
        elif key == "requester_email":
            email = str(normalized).lower()
        elif key == "requester_phone":
            try:
                phone = try_normalize_india_phone(str(normalized))
            except ValueError as exc:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    detail=PHONE_ERROR,
                ) from exc
        elif key == "request_details":
            details = str(normalized)
        elif key not in CORE_FIELD_KEYS:
            if field_by_key.get(key, {}).get("type") == "tel" and isinstance(normalized, str):
                try:
                    extra[key] = try_normalize_india_phone(normalized)
                except ValueError as exc:
                    raise HTTPException(
                        status.HTTP_400_BAD_REQUEST,
                        detail=f"{field_by_key[key].get('label', key)}: {PHONE_ERROR}",
                    ) from exc
            else:
                extra[key] = normalized

    if not name or not details:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Name and request details are required",
        )
    if not email and not phone:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Email or phone is required for verification",
        )
    return name, email or "", phone, details, extra


def form_has_email_field(form: dict[str, Any]) -> bool:
    return any(f.get("key") == "requester_email" for f in form.get("fields", []))


def form_has_phone_field(form: dict[str, Any]) -> bool:
    return any(f.get("key") == "requester_phone" for f in form.get("fields", []))


def resolve_verification_method(
    form: dict[str, Any],
    *,
    requested: str | None,
    has_email: bool,
    has_phone: bool,
) -> str:
    has_email_field = form_has_email_field(form)
    has_phone_field = form_has_phone_field(form)

    if has_email_field and not has_phone_field:
        if not has_email:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Email is required")
        return "email"
    if has_phone_field and not has_email_field:
        if not has_phone:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Phone number is required")
        return "sms"
    if has_email_field and has_phone_field:
        if requested not in ("email", "sms"):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Choose email or SMS verification when both contact fields are present",
            )
        if requested == "email" and not has_email:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Email is required")
        if requested == "sms" and not has_phone:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Phone number is required")
        return requested
    raise HTTPException(
        status.HTTP_400_BAD_REQUEST,
        detail="Form must include email or phone for verification",
    )
