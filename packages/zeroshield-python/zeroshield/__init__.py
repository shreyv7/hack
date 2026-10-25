"""ZeroShield consent decision token verification for server-side enforcement."""

from zeroshield.config import ZeroShieldConfig
from zeroshield.enforcement import ConsentEvaluation, evaluate_consent, filter_consented
from zeroshield.fastapi import ConsentDeniedError, require_consent
from zeroshield.token import (
    DecisionTokenPayload,
    is_purpose_allowed,
    lookup_purpose_allowed,
    verify_decision_token,
)

__all__ = [
    "ConsentDeniedError",
    "ConsentEvaluation",
    "DecisionTokenPayload",
    "ZeroShieldConfig",
    "evaluate_consent",
    "filter_consented",
    "is_purpose_allowed",
    "lookup_purpose_allowed",
    "require_consent",
    "verify_decision_token",
]
