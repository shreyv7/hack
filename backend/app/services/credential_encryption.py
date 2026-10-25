"""
Utility module for encrypting and decrypting provider credentials using symmetric Fernet encryption.
"""

from app.core.crypto import encrypt_secret, decrypt_secret

def encrypt_value(plaintext: str) -> str:
    """
    Encrypt a credential value.
    """
    if not plaintext:
        return ""
    return encrypt_secret(plaintext)

def decrypt_value(ciphertext: str) -> str:
    """
    Decrypt a credential value. Falls back to plaintext for legacy values.
    """
    if not ciphertext:
        return ""
    return decrypt_secret(ciphertext)
