"""
Symmetric encryption for secrets stored at rest (e.g. data-source passwords).

Uses Fernet (AES-128-CBC + HMAC). The key comes from
`DATA_SOURCE_ENCRYPTION_KEY` if set (a valid 44-char urlsafe-base64 Fernet key);
otherwise it is derived deterministically from `SECRET_KEY` so encryption works
out of the box in development.

In production, set an explicit `DATA_SOURCE_ENCRYPTION_KEY` and rotate `SECRET_KEY`
independently — generate one with:

    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

`decrypt_secret` tolerates legacy plaintext values written before encryption was
added, so existing rows keep working.
"""

from __future__ import annotations

import base64
import hashlib
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings


@lru_cache(maxsize=1)
def _fernet() -> Fernet:
    configured = settings.DATA_SOURCE_ENCRYPTION_KEY
    if configured:
        return Fernet(configured.encode() if isinstance(configured, str) else configured)
    # Derive a stable Fernet key from SECRET_KEY (32-byte digest -> urlsafe b64).
    derived = base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest())
    return Fernet(derived)


def encrypt_secret(plaintext: str) -> str:
    """Encrypt a secret for storage. Returns a urlsafe token string."""
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_secret(token: str) -> str:
    """Decrypt a stored secret. Falls back to returning the value unchanged if it
    isn't a valid token (legacy plaintext written before encryption existed)."""
    if not token:
        return ""
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        return token
