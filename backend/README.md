# 🛡️ Vajra — Backend

FastAPI + PostgreSQL + SQLAlchemy + Alembic.

This backend includes the existing compliance modules and the HealthShield
healthcare gateway. See [HEALTHCARE.md](HEALTHCARE.md) for healthcare setup,
authenticated API integration, demo seeding, AI configuration, and verification.

---

## 1. What's in here

```
backend/
├── app/
│   ├── main.py              # FastAPI app + CORS + health check + where routers get registered
│   ├── core/
│   │   ├── config.py        # Settings (reads .env) — the one place for config
│   │   ├── database.py      # SQLAlchemy engine, SessionLocal, Base, get_db()
│   │   ├── security.py      # password hashing + JWT helpers (no routes)
│   │   └── dependencies.py  # shared FastAPI Depends() helpers (get_db, future get_current_user)
│   ├── models/              # SQLAlchemy models (DB tables)  → base.py has shared mixins
│   ├── schemas/             # Pydantic schemas (request/response shapes)
│   ├── routers/             # API endpoints (one file per module)
│   ├── services/            # business logic (keep it out of routers)
│   └── utils/               # small generic helpers
├── alembic/                 # database migrations
│   ├── env.py               # already wired to app settings + models
│   └── versions/            # generated migration scripts land here
├── alembic.ini
├── requirements.txt
├── .env.example             # copy to .env
├── Dockerfile               # for later (dockerizing)
├── docker-compose.yml       # for later (full stack in Docker)
└── docker-compose.db.yml    # optional: run ONLY Postgres in Docker now
```

---

## 2. First-time setup (local, no Docker)

> Run everything from the `backend/` folder. Commands shown for **Windows
> PowerShell**; bash equivalents in parentheses.

### Step 1 — Get PostgreSQL running

Pick **one** of the two options (see Section 7 for the recommendation):

**Option A — Native Postgres** (you install it on Windows):
1. Download & install PostgreSQL 16 from <https://www.postgresql.org/download/windows/>.
   During install, set a password for the `postgres` superuser and keep port `5432`.
2. Create the database and user (open "SQL Shell (psql)" or pgAdmin and run):
   ```sql
   CREATE USER dpdpa WITH PASSWORD 'dpdpa';
   CREATE DATABASE dpdpa_shield OWNER dpdpa;
   ```

**Option B — Postgres in Docker only** (you have Docker Desktop, but run the app locally):
```powershell
docker compose -f docker-compose.db.yml up -d
```
That's it — user/db/password are created automatically (`dpdpa` / `dpdpa` / `dpdpa_shield`).
Stop it later with `docker compose -f docker-compose.db.yml down`.

### Step 2 — Python virtual environment + dependencies

```powershell
py -m venv .venv
.venv\Scripts\Activate.ps1          # (bash: source .venv/Scripts/activate)
pip install -r requirements.txt
```

> If PowerShell blocks the activate script, run once:
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

### Step 3 — Environment file

```powershell
copy .env.example .env               # (bash: cp .env.example .env)
```
Open `.env` and set at least:

- `DATABASE_URL` — your PostgreSQL user/password (Option A: often `postgres`; Option B Docker DB: `dpdpa` / `dpdpa` as in `docker-compose.db.yml`)
- `SECRET_KEY` — generate with:
  ```powershell
  python -c "import secrets; print(secrets.token_urlsafe(48))"
  ```
- `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` — for `python -m app.scripts.create_superadmin`
- `SMTP_*` — if you need invite emails (Gmail App Password, not your normal password)

Never commit `.env`; only placeholders belong in `.env.example`.

### Step 4 — Run migrations (creates tables)

Apply the migrations to build or update the database schema:
```powershell
alembic upgrade head
```

### Step 5 — Start the API

```powershell
uvicorn app.main:app --reload
```

Open in your browser:
- <http://localhost:8000/api/health> → `{"status":"ok",...}`
- <http://localhost:8000/docs> → **Swagger UI** (interactive API explorer)
- <http://localhost:8000/redoc> → ReDoc API docs

`--reload` auto-restarts on code changes. Stop with `Ctrl+C`.

---

## 3. How it works (the request flow)

```
React frontend (Vite :5173)
        │  HTTP/JSON
        ▼
FastAPI (app/main.py)  ── CORS allows the frontend origin
        │
        ▼
Router (app/routers/<module>.py)      ← defines the URL + HTTP method
        │  validates input/output using …
        ▼
Schema (app/schemas/<module>.py)      ← Pydantic request/response models
        │  calls …
        ▼
Service (app/services/<module>.py)    ← business logic lives here
        │  reads/writes via …
        ▼
Model  (app/models/<module>.py)       ← SQLAlchemy table classes
        │
        ▼
PostgreSQL                            ← actual data, schema managed by Alembic
```

**Rule of thumb:**
- **Routers** stay thin — parse request, call a service, return a schema.
- **Services** hold the real logic (SLA countdowns, scoring, workflows).
- **Models** = database tables. **Schemas** = API JSON shapes. Keep them separate.
- **get_db** (in `core/database.py`) gives each request its own DB session.

---

## 4. Where do I write things? (cheat sheet for implementers)

| I want to… | Put it in… |
|---|---|
| Add a new DB table | `app/models/<thing>.py` (inherit `Base, BaseModel`), then import it in `app/models/__init__.py` |
| Define request/response JSON | `app/schemas/<thing>.py` |
| Add an API endpoint | `app/routers/<thing>.py`, then `include_router(...)` in `app/main.py` |
| Write business logic | `app/services/<thing>_service.py` |
| Add a config value / secret | `app/core/config.py` + `.env` |
| Add a reusable dependency (auth, roles) | `app/core/dependencies.py` |
| Add a small helper | `app/utils/` |

### Adding a table → migration (the standard loop)

1. Write the model in `app/models/foo.py`:
   ```python
   from sqlalchemy import Column, String
   from app.core.database import Base
   from app.models.base import BaseModel

   class Foo(Base, BaseModel):
       __tablename__ = "foos"
       name = Column(String, nullable=False)
   ```
2. Register it so Alembic sees it — add to `app/models/__init__.py`:
   ```python
   from app.models.foo import Foo  # noqa: F401
   ```
3. Generate + apply the migration:
   ```powershell
   alembic revision --autogenerate -m "create foos"
   alembic upgrade head
   ```

> ⚠️ **Always** use Alembic for schema changes. Never edit tables by hand —
> that's how migration conflicts happen across the team.

Useful Alembic commands:
```powershell
alembic current            # which migration is applied
alembic history            # list all migrations
alembic downgrade -1       # roll back one step
```

---

## 5. How to use / view the database locally

- **DATABASE_URL** in `.env` is the single source of truth for the connection.
  The app and Alembic both read it.
- **Browse the data visually** with one of:
  - **pgAdmin** (ships with the native Postgres installer) — connect to
    `localhost:5432`, db `dpdpa_shield`, user `dpdpa`.
  - **DBeaver** (free, cross-DB) — <https://dbeaver.io/>.
  - **VS Code** extensions like *SQLTools* or the *PostgreSQL* extension.
- **Command line** (if `psql` is installed):
  ```powershell
  psql "postgresql://dpdpa:dpdpa@localhost:5432/dpdpa_shield"
  ```
  Then `\dt` to list tables, `\d foos` to describe one, `\q` to quit.
- **In code**, never create sessions ad hoc — depend on `get_db`:
  ```python
  from fastapi import Depends
  from sqlalchemy.orm import Session
  from app.core.dependencies import get_db

  @router.get("/foos")
  def list_foos(db: Session = Depends(get_db)):
      return db.query(Foo).all()
  ```

---

## 6. Connecting the frontend

The frontend (this repo's parent folder) runs on Vite at `http://localhost:5173`,
which is already allowed by CORS (`BACKEND_CORS_ORIGINS` in `.env`). In the
frontend, point API calls at `http://localhost:8000/api/...`. When you add an
auth endpoint, the typical contract is documented automatically at `/docs`.

---

## 7. Database strategy — what should you actually do?

You asked: Postgres from the start, SQLite, or Postgres-in-Docker — what's easiest?

**Recommendation: use PostgreSQL from the start.** Concretely:

- **Easiest path that won't bite you later → Option B (Postgres in Docker, app local).**
  One command (`docker compose -f docker-compose.db.yml up -d`) gives you a real
  Postgres with zero Windows install pain, while you keep running the API with
  `uvicorn` locally (fast, debuggable, no rebuilds). This is the sweet spot and
  it still honours "no Docker for the app yet."
- **No Docker at all → Option A (native Postgres install).** Totally fine; just a
  heavier one-time install. After that it behaves identically.
- **SQLite → only as a 5-minute throwaway.** The scaffold supports it (flip
  `DATABASE_URL` to the commented `sqlite:///...` line) so a new dev can boot
  instantly. **But don't build on it:** production uses Postgres-specific types
  (native `UUID`, `JSON/JSONB`, timezone-aware timestamps). Building on SQLite
  now means reworking models and migrations later. Use it to *try the server*,
  not to *develop features*.

**Bottom line:** start on Postgres (Option B is the least friction). The whole
app is driven by one `DATABASE_URL`, so switching environments is a one-line change.

---

## 8. Dockerizing later — will it be easy? Yes.

The scaffold is already Docker-ready, so when you're done with local dev:

1. **Already done for you:** `Dockerfile` (backend image) and `docker-compose.yml`
   (Postgres + backend together) exist and are wired up.
2. **The only real change** between local and Docker is the DB host: locally it's
   `localhost:5432`; inside compose it's the service name `db:5432`. The
   `docker-compose.yml` already sets `DATABASE_URL=...@db:5432/...` for you.
3. **To run the full stack in Docker:**
   ```powershell
   docker compose up --build
   ```
   This starts Postgres, waits until it's healthy, runs `alembic upgrade head`
   automatically, then serves the API on `http://localhost:8000`.
4. **Later additions** (Redis, Celery workers, MinIO) become extra services in
   the same compose file — no app rewrites needed.

Because config is environment-driven and migrations are automated, going from
"local" to "containerized" is essentially: install Docker Desktop → `docker
compose up --build`. That's it.

---

## 9. Quick reference

```powershell
# activate venv
.venv\Scripts\Activate.ps1

# run the API (auto-reload)
uvicorn app.main:app --reload

# migrations
alembic revision --autogenerate -m "message"
alembic upgrade head
alembic downgrade -1

# optional: start/stop Postgres in Docker
docker compose -f docker-compose.db.yml up -d
docker compose -f docker-compose.db.yml down

# later: full stack in Docker
docker compose up --build
```

See the repo root development plan for the module-by-module schema and API plan.
```
