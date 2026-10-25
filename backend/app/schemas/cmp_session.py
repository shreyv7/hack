"""
Schemas for CMP SDK session token exchange.
"""

from pydantic import BaseModel, Field


class TokenExchangeRequest(BaseModel):
    api_key: str = Field(..., description="The property API key")
    origin: str | None = Field(None, description="The client origin requesting the session token")


class TokenExchangeResponse(BaseModel):
    session_token: str
    token_type: str = "Bearer"
    expires_in: int = 1800  # 30 minutes in seconds
    property_id: str
