"""Reset partial migration state if upgrade failed mid-way."""
from sqlalchemy import create_engine, text

from app.core.config import settings

engine = create_engine(settings.DATABASE_URL, isolation_level="AUTOCOMMIT")
with engine.connect() as conn:
    conn.execute(text("DROP TABLE IF EXISTS users CASCADE"))
    conn.execute(text("DROP TABLE IF EXISTS organizations CASCADE"))
    conn.execute(text("DROP TABLE IF EXISTS alembic_version CASCADE"))
    for enum in ("user_status", "user_role", "organization_status"):
        conn.execute(text(f'DROP TYPE IF EXISTS "{enum}" CASCADE'))
print("Cleared partial schema — run alembic upgrade head again")
