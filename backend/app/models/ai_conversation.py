"""Vajra AI — persisted conversations and messages."""

from sqlalchemy import Column, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel


class AiConversation(Base, BaseModel):
    __tablename__ = "ai_conversations"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Conversations are personal to the user who created them.
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title = Column(String(255), nullable=False, default="New conversation")
    # Snapshot of workspace context source labels attached to this chat (the
    # "Referenced in this chat" panel). Null/empty when company data was off.
    context_used = Column(JSON, nullable=False, server_default="[]")

    messages = relationship(
        "AiMessage",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="AiMessage.created_at",
    )


class AiMessage(Base, BaseModel):
    __tablename__ = "ai_messages"

    conversation_id = Column(
        UUID(as_uuid=True),
        ForeignKey("ai_conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role = Column(String(16), nullable=False)  # "user" | "assistant"
    content = Column(Text, nullable=False)

    conversation = relationship("AiConversation", back_populates="messages")
