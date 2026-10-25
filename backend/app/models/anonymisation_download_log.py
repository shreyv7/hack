"""
Anonymisation download audit log.

Every time a user downloads an anonymised dataset they must state *why* they need
it and *where/with whom* it will be shared. Each download is recorded here (and
in the central tamper-evident audit log) so the org has a defensible trail of who
took data out of the platform, when, and for what purpose.
"""

from sqlalchemy import Column, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel


class AnonymisationDownloadLog(Base, BaseModel):
    __tablename__ = "anonymisation_download_logs"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    job_id = Column(
        UUID(as_uuid=True),
        ForeignKey("anonymisation_jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    downloaded_by_user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    downloaded_by_email = Column(String(320), nullable=True)  # snapshot for the record
    file_name = Column(String(512), nullable=True)

    # The mandatory justification captured at download time.
    purpose = Column(Text, nullable=False)          # why it's being downloaded
    shared_with = Column(String(512), nullable=False)  # where / with whom
    recipient_type = Column(String(64), nullable=True)  # internal | external_vendor | regulator | other
    notes = Column(Text, nullable=True)
    ip_address = Column(String(64), nullable=True)

    organization = relationship("Organization")
    job = relationship("AnonymisationJob")
