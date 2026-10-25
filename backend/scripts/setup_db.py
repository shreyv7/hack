"""
One-off: test Postgres connection and create dpdpa_shield database.

Reads DATABASE_URL from .env (copy .env.example to .env first).
Run: python scripts/setup_db.py  (from backend/, with venv active)
"""
import os
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

DATABASE_URL = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL:
    raise SystemExit("Set DATABASE_URL in backend/.env before running this script.")

parsed = urlparse(DATABASE_URL.replace("+psycopg2", ""))
DB_NAME = (parsed.path or "/dpdpa_shield").lstrip("/") or "dpdpa_shield"
user = parsed.username or "postgres"
password = parsed.password or ""
host = parsed.hostname or "localhost"
port = parsed.port or 5432

admin_url = f"postgresql+psycopg2://{user}:{password}@{host}:{port}/postgres"

try:
    engine = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    print(f"Connected as {user}")

    with engine.connect() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM pg_database WHERE datname = :name"),
            {"name": DB_NAME},
        ).scalar()
        if not exists:
            conn.execute(text(f'CREATE DATABASE "{DB_NAME}"'))
            print(f"Created database {DB_NAME}")
        else:
            print(f"Database {DB_NAME} already exists")
except Exception as exc:
    raise SystemExit(f"Database setup failed: {exc}") from exc
