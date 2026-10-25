"""FastAPI integration for ZeroShield consent enforcement."""

from __future__ import annotations

import functools
import inspect
from typing import Any, Callable, Literal

from zeroshield.config import ZeroShieldConfig
from zeroshield.enforcement import ConsentEvaluation, evaluate_consent

DenyBehavior = Literal["reject", "strip_fields", "queue_pending"]

_STRIP_FIELD_NAMES = frozenset(
    {
        "email",
        "principal_email",
        "phone",
        "principal_phone",
        "mobile",
        "marketing_opt_in",
        "newsletter",
        "sms_opt_in",
    }
)


class ConsentDeniedError(Exception):
  def __init__(self, evaluation: ConsentEvaluation):
      self.evaluation = evaluation
      super().__init__(f"Consent denied for purpose '{evaluation.purpose_key}'")


def require_consent(
    purpose_key: str,
    *,
    deny_behavior: DenyBehavior = "reject",
    config: ZeroShieldConfig | None = None,
    session_header: str = "X-ZS-Session-Id",
    token_header: str = "X-ZS-Decision-Token",
):
    """Decorator that enforces consent for a route using token verify + API fallback."""

    def decorator(func: Callable[..., Any]):
        signature = inspect.signature(func)

        @functools.wraps(func)
        async def async_wrapper(*args: Any, **kwargs: Any):
            request = _extract_request(signature, args, kwargs)
            cfg = config or ZeroShieldConfig.from_env()
            evaluation = evaluate_consent(
                purpose_key=purpose_key,
                config=cfg,
                token=request.headers.get(token_header) if request else None,
                session_id=request.headers.get(session_header) if request else None,
                principal_email=_header(request, "X-ZS-Principal-Email"),
                principal_phone=_header(request, "X-ZS-Principal-Phone"),
            )
            if evaluation.should_block:
                deny_response = _apply_deny_behavior(request, evaluation, deny_behavior)
                if deny_response is not None:
                    return deny_response
            if request is not None:
                request.state.zeroshield_consent = evaluation
            result = func(*args, **kwargs)
            if inspect.isawaitable(result):
                return await result
            return result

        @functools.wraps(func)
        def sync_wrapper(*args: Any, **kwargs: Any):
            request = _extract_request(signature, args, kwargs)
            cfg = config or ZeroShieldConfig.from_env()
            evaluation = evaluate_consent(
                purpose_key=purpose_key,
                config=cfg,
                token=request.headers.get(token_header) if request else None,
                session_id=request.headers.get(session_header) if request else None,
                principal_email=_header(request, "X-ZS-Principal-Email"),
                principal_phone=_header(request, "X-ZS-Principal-Phone"),
            )
            if evaluation.should_block:
                deny_response = _apply_deny_behavior(request, evaluation, deny_behavior)
                if deny_response is not None:
                    return deny_response
            if request is not None:
                request.state.zeroshield_consent = evaluation
            return func(*args, **kwargs)

        return async_wrapper if inspect.iscoroutinefunction(func) else sync_wrapper

    return decorator


def _extract_request(signature: inspect.Signature, args: tuple[Any, ...], kwargs: dict[str, Any]):
    if "request" in kwargs:
        return kwargs["request"]
    for name, param in signature.parameters.items():
        if param.annotation.__class__.__name__ == "_GenericAlias":
            continue
        annotation = str(param.annotation)
        if "Request" in annotation and name in kwargs:
            return kwargs[name]
    for value in args:
        if value.__class__.__name__ == "Request":
            return value
    return None


def _header(request, name: str) -> str | None:
    if request is None:
        return None
    value = request.headers.get(name)
    return value.strip() if value else None


def _apply_deny_behavior(request, evaluation: ConsentEvaluation, deny_behavior: DenyBehavior):
    if deny_behavior == "queue_pending":
        try:
            from fastapi.responses import JSONResponse

            return JSONResponse(
                status_code=202,
                content={
                    "detail": "Consent pending — submission queued for review",
                    "purpose": evaluation.purpose_key,
                    "decision": evaluation.decision,
                },
            )
        except ImportError:
            raise ConsentDeniedError(evaluation) from None

    if deny_behavior == "strip_fields" and request is not None:
        _strip_pii_fields(request)
        return None

    try:
        from fastapi import HTTPException

        raise HTTPException(
            status_code=403,
            detail={
                "message": "Consent required for this action",
                "purpose": evaluation.purpose_key,
                "decision": evaluation.decision,
                "effective_mode": evaluation.effective_mode,
            },
        )
    except ImportError:
        raise ConsentDeniedError(evaluation) from None


def _strip_pii_fields(request) -> None:
    if not hasattr(request, "_json"):
        return
    body = getattr(request, "_json", None)
    if not isinstance(body, dict):
        return
    for key in list(body.keys()):
        if key.lower() in _STRIP_FIELD_NAMES:
            body.pop(key, None)
