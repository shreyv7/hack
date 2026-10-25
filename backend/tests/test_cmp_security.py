"""
Tests for CMP.js SDK Security Hardening.
"""

from fastapi import HTTPException
from app.routers.integrations_public import validate_origin_against_allowlist
from app.core.security import create_cmp_session_token, decode_cmp_session_token
from app.core.rate_limit import RateLimiter


def test_validate_origin_allowlist_matching():
    allowed = ["example.com", "app.mysite.org", "*.trusted.in"]

    # Allowed matches
    assert validate_origin_against_allowlist(allowed, "https://example.com") is True
    assert validate_origin_against_allowlist(allowed, "http://example.com") is True
    assert validate_origin_against_allowlist(allowed, "https://sub.trusted.in") is True
    assert validate_origin_against_allowlist(allowed, "http://localhost:5173") is True
    assert validate_origin_against_allowlist(allowed, "http://127.0.0.1:8000") is True

    # Disallowed matches
    assert validate_origin_against_allowlist(allowed, "https://malicious.com") is False
    assert validate_origin_against_allowlist(allowed, "https://fake-example.com") is False
    assert validate_origin_against_allowlist(allowed, "https://untrusted.in") is False


def test_validate_origin_empty_allowlist():
    # If no allowlist configured, all origins are permitted
    assert validate_origin_against_allowlist([], "https://anywhere.com") is True
    assert validate_origin_against_allowlist(None, "https://anywhere.com") is True


def test_cmp_session_token_encode_decode():
    prop_id = "00000000-0000-0000-0000-000000000001"
    origin = "https://client-site.com"

    token = create_cmp_session_token(prop_id, origin, ttl_minutes=15)
    assert isinstance(token, str) and len(token) > 20

    payload = decode_cmp_session_token(token)
    assert payload is not None
    assert payload["sub"] == prop_id
    assert payload["type"] == "cmp_session"
    assert payload["origin"] == origin


def test_cmp_session_token_invalid():
    assert decode_cmp_session_token("invalid.jwt.token") is None


def test_rate_limiter():
    limiter = RateLimiter()

    class MockRequest:
        def __init__(self, ip):
            self.client = type("Client", (), {"host": ip})()
            self.headers = {}

    req = MockRequest("192.168.1.100")

    # Fire 5 allowed requests (limit=5)
    for _ in range(5):
        limiter.check_rate_limit(req, "test_action", max_requests=5, window_seconds=60)

    # 6th request should raise HTTP 429
    raised = False
    try:
        limiter.check_rate_limit(req, "test_action", max_requests=5, window_seconds=60)
    except HTTPException as exc_info:
        raised = True
        assert exc_info.status_code == 429
        assert "Rate limit exceeded" in exc_info.detail

    assert raised, "Expected HTTPException 429 not raised"


if __name__ == "__main__":
    print("Running CMP Security Tests...")
    test_validate_origin_allowlist_matching()
    print("  ✓ test_validate_origin_allowlist_matching passed")
    test_validate_origin_empty_allowlist()
    print("  ✓ test_validate_origin_empty_allowlist passed")
    test_cmp_session_token_encode_decode()
    print("  ✓ test_cmp_session_token_encode_decode passed")
    test_cmp_session_token_invalid()
    print("  ✓ test_cmp_session_token_invalid passed")
    test_rate_limiter()
    print("  ✓ test_rate_limiter passed")
    print("All CMP Security Unit Tests PASSED!")
