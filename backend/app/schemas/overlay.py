"""Pydantic schemas for the floating assistant overlay."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CommentCreate(BaseModel):
    body: str = Field(..., min_length=1, max_length=2000)


class CommentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    user_id: UUID
    author_name: str
    body: str
    created_at: datetime


class VisionQueryRequest(BaseModel):
    image_base64: str = Field(..., min_length=1, max_length=7_000_000)
    question: str = Field(..., min_length=1, max_length=500)


class VisionQueryResponse(BaseModel):
    answer: str
