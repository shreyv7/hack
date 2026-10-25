"""add vendor risk columns

Revision ID: e9f291a27eef
Revises: bedc3da9cc87
Create Date: 2026-06-18 21:35:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'e9f291a27eef'
down_revision: Union[str, None] = ('bedc3da9cc87', '2776c22ef050')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Update DpaStatus enum in Postgres
    op.execute("ALTER TYPE dpa_status ADD VALUE IF NOT EXISTS 'under_review'")

    # 2. Add columns to data_processors table
    op.add_column('data_processors', sa.Column('category', sa.String(length=128), server_default='Other', nullable=False))
    op.add_column('data_processors', sa.Column('security_score', sa.Integer(), server_default='80', nullable=False))
    op.add_column('data_processors', sa.Column('monitoring', sa.String(length=64), server_default='Continuous', nullable=False))
    op.add_column('data_processors', sa.Column('logo', sa.String(length=64), nullable=True))
    op.add_column('data_processors', sa.Column('last_audit_date', sa.Date(), nullable=True))
    op.add_column('data_processors', sa.Column('certifications', postgresql.JSONB(astext_type=sa.Text()), server_default='[]', nullable=True))
    op.add_column('data_processors', sa.Column('encryption', sa.String(length=128), nullable=True))
    op.add_column('data_processors', sa.Column('tier', sa.String(length=32), server_default='Tier 3', nullable=False))
    op.add_column('data_processors', sa.Column('assessment_status', sa.String(length=32), server_default='not_started', nullable=False))
    op.add_column('data_processors', sa.Column('assessment_completed_at', sa.Date(), nullable=True))
    op.add_column('data_processors', sa.Column('last_monitored_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('data_processors', sa.Column('monitoring_status', sa.String(length=32), server_default='healthy', nullable=False))
    op.add_column('data_processors', sa.Column('monitoring_details', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=True))

    # 3. Create evidence vendor mapping table
    op.create_table('ciso_evidence_vendor_mappings',
    sa.Column('vendor_id', sa.UUID(), nullable=False),
    sa.Column('evidence_id', sa.UUID(), nullable=False),
    sa.ForeignKeyConstraint(['evidence_id'], ['ciso_evidence.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['vendor_id'], ['data_processors.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('vendor_id', 'evidence_id')
    )


def downgrade() -> None:
    # Drop mapping table
    op.drop_table('ciso_evidence_vendor_mappings')

    # Drop added columns
    op.drop_column('data_processors', 'monitoring_details')
    op.drop_column('data_processors', 'monitoring_status')
    op.drop_column('data_processors', 'last_monitored_at')
    op.drop_column('data_processors', 'assessment_completed_at')
    op.drop_column('data_processors', 'assessment_status')
    op.drop_column('data_processors', 'tier')
    op.drop_column('data_processors', 'encryption')
    op.drop_column('data_processors', 'certifications')
    op.drop_column('data_processors', 'last_audit_date')
    op.drop_column('data_processors', 'logo')
    op.drop_column('data_processors', 'monitoring')
    op.drop_column('data_processors', 'security_score')
    op.drop_column('data_processors', 'category')
