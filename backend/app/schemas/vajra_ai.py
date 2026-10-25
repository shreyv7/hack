from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1)
    # Optional free-text workspace context to ground the answer.
    context: str | None = None


class ChatResponse(BaseModel):
    reply: str


class RecommendationsRequest(BaseModel):
    # e.g. "privacy risks and mitigations", "RoPA entries", "breach response steps"
    topic: str = Field(min_length=1, max_length=200)
    context: str | None = None
    count: int = Field(default=4, ge=1, le=10)


class RecommendationsResponse(BaseModel):
    suggestions: list[str]


class GenerateRequest(BaseModel):
    # Instruction describing what to produce, e.g.
    # "Draft DPDPA-compliant consent banner body text".
    task: str = Field(min_length=1, max_length=2000)
    context: str | None = None
    max_tokens: int | None = Field(default=None, ge=16, le=8192)


class GenerateResponse(BaseModel):
    text: str


class StatusResponse(BaseModel):
    configured: bool
    # Echoed for the UI so users can confirm which backend/model is active. Never a secret.
    provider: str | None = None
    model_id: str | None = None
    region: str | None = None


# --- Persisted conversations -------------------------------------------------


class ConversationSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    created_at: datetime
    updated_at: datetime


class MessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    role: str
    content: str
    created_at: datetime


class ConversationDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    created_at: datetime
    updated_at: datetime
    context_used: list[str] = Field(default_factory=list)
    messages: list[MessageRead] = Field(default_factory=list)


class ConversationCreate(BaseModel):
    title: str | None = Field(default=None, max_length=255)


class ConversationRename(BaseModel):
    title: str = Field(min_length=1, max_length=255)


class SendMessageRequest(BaseModel):
    content: str = Field(min_length=1)
    use_company_data: bool = True


# --- Workspace context (Current data access) ---------------------------------


class ContextItemRead(BaseModel):
    id: str
    label: str
    value: str


class ContextResponse(BaseModel):
    items: list[ContextItemRead]


# --- Consent Notice Drafting -------------------------------------------------


class ConsentDraftResult(BaseModel):
    notice_title: str | None = None
    display_name: str | None = None
    language: str | None = "English"
    opening_statement: str | None = None
    contact_email: str | None = None
    contact_website: str | None = None
    dpo_name: str | None = None
    dpo_email: str | None = None
    rights_exercise: str | None = None
    complaint_process: str | None = None
    retention_policy: str | None = None


class ConsentDraftFromQuestionsRequest(BaseModel):
    org_name: str = Field(min_length=1, max_length=300)
    industry: str = Field(min_length=1, max_length=300)
    data_types: str = Field(min_length=1, max_length=300)
    dpo_name: str = Field(min_length=1, max_length=300)
    dpo_email: str = Field(min_length=1, max_length=300)
    retention_period: str = Field(min_length=1, max_length=300)
    purpose: str = Field(min_length=1, max_length=300)
    language: str | None = Field(default="English", max_length=100)

