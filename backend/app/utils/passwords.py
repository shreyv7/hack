import secrets


def generate_temp_password() -> str:
    """Generate a URL-safe temporary password (9 bytes of entropy)."""
    return secrets.token_urlsafe(9)
