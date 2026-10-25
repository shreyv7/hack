"""
Database engine, session factory, and the declarative Base.

How it fits together:
  * `engine`       — one connection pool to PostgreSQL, created from DATABASE_URL.
  * `SessionLocal` — a factory that hands out short-lived DB sessions.
  * `Base`         — every SQLAlchemy model inherits from this (directly or via
                     the mixins in app/models/base.py). Alembic reads
                     `Base.metadata` to know what tables should exist.
  * `get_db`       — a FastAPI dependency. Use it in routes like:

        from fastapi import Depends
        from sqlalchemy.orm import Session
        from app.core.database import get_db

        @router.get("/things")
        def list_things(db: Session = Depends(get_db)):
            return db.query(Thing).all()

    It opens a session per request and always closes it afterwards.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from app.core.config import settings

# `connect_args` is only needed for SQLite (single-thread guard). It is ignored
# for Postgres, so this keeps the fallback SQLite URL working too.
_connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    _connect_args = {"check_same_thread": False}

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,      # transparently recycle dropped connections
    connect_args=_connect_args,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# All models inherit from this.
Base = declarative_base()


def get_db():
    """Yield a database session and guarantee it is closed."""
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
