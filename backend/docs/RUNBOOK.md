# 🏃 DPDPA Shield Backend — RUNBOOK (team sync & daily workflow)

> The single page everyone keeps open. It answers: **"Someone changed code — how
> do I get it running with the same database here?"** and the **reverse**: **"I
> changed code — what do my teammates need to do?"**
>
> Golden rule: **code travels through git; database *schema* travels through
> Alembic migration files (which also travel through git); the database *data*
> does NOT travel — each person has their own local data.**

---

## 0. Mental model (read once)

Your project has three things that can change, and each syncs differently:

| Thing | How it syncs between machines | What you run to apply it |
|---|---|---|
| **Code** (routers, services, models…) | `git pull` | nothing — `uvicorn --reload` restarts itself |
| **DB schema** (tables, columns, enums) | migration files in `alembic/versions/` arrive via `git pull` | `alembic upgrade head` |
| **Dependencies** (libraries) | `requirements.txt` arrives via `git pull` | `pip install -r requirements.txt` |
| **Your `.env`** | **does NOT sync** (it's git-ignored) | manually add any new keys (compare with `.env.example`) |
| **Your DB rows/data** | **does NOT sync** | each dev seeds their own (e.g. `create_superadmin`) |

So "get it running the same" = same code + same migrations applied + same deps +
same `.env` keys. The actual *rows* will differ per machine, and that's fine.

---

## 1. One-time setup (a teammate cloning fresh)

```powershell
cd backend
py -m venv .venv
.venv\Scripts\Activate.ps1                 # bash: source .venv/Scripts/activate
pip install -r requirements.txt
copy .env.example .env                      # then edit .env (see §5)
alembic upgrade head                        # builds all tables from migrations
python -m app.scripts.create_superadmin     # creates the first superadmin row
uvicorn app.main:app --reload
```
Open http://localhost:8000/docs to confirm.

> Postgres must be running first. Either native Postgres, or
> `docker compose -f docker-compose.db.yml up -d`. See `README.md` §2.

---

## 2. ⬇️ DIRECTION A — "Someone pushed changes; I'm pulling them in"

This is the everyday case (e.g. you pull the intern's work, or an intern pulls
yours). Run this sequence **every time you pull**:

```powershell
git pull
.venv\Scripts\Activate.ps1                 # if not already active
pip install -r requirements.txt            # (1) harmless if nothing changed
alembic upgrade head                        # (2) harmless if no new migrations
uvicorn app.main:app --reload               # (3) run
```

**Why each step (and when it actually matters):**

| Step | Needed when… | Symptom if you skip it |
|---|---|---|
| `pip install -r requirements.txt` | a new library was added | `ModuleNotFoundError` on startup |
| `alembic upgrade head` | a new file appeared in `alembic/versions/` | app errors like `column ... does not exist` or `invalid input value for enum` |
| restart / `--reload` | always (code changed) | you keep seeing the old behavior |

> **Tip:** running `pip install` and `alembic upgrade head` even when not strictly
> needed costs nothing — both are no-ops if you're already up to date. When in
> doubt, run all four lines.

**How to tell if a pull included DB changes:** look at what git pulled —
```powershell
git log --stat -1
```
If you see a new file under `alembic/versions/`, you need `alembic upgrade head`.

---

## 3. ⬆️ DIRECTION B — "I changed something; what do teammates do?"

What you must do depends on **what** you changed:

### B1. You changed only logic (router/service/util) — no DB, no new library
- Just commit & push. Teammates `git pull` and restart. **Nothing else.**

### B2. You added a Python library
1. `pip install thelib`
2. Add it (pinned) to `requirements.txt`, e.g. `thelib==1.2.3`
3. Commit `requirements.txt` + push.
4. **Tell the team** "new dependency — run `pip install -r requirements.txt`".

### B3. You changed the database (added/edited a model = new table/column/enum)
This is the important one. **A model change is not real until there's a
migration.** Do this:

1. Edit/add the model under `app/models/` and **import it** in
   `app/models/__init__.py` (so Alembic can see it).
2. Make sure your own DB is current first:
   ```powershell
   git pull
   alembic upgrade head
   ```
3. Generate the migration:
   ```powershell
   alembic revision --autogenerate -m "short description of the change"
   ```
4. **Open the generated file** in `alembic/versions/` and sanity-check it
   (autogenerate isn't perfect — especially for enum value changes, see §6).
5. Apply it locally to test:
   ```powershell
   alembic upgrade head
   ```
6. Commit **both** the model change **and** the new migration file, then push.
7. Teammates pull and run `alembic upgrade head` — their DB now matches yours.

> The migration file is the contract. If you change a model but forget to commit
> the migration, teammates' apps will crash because their DB doesn't have your
> column.

### B4. You added a new `.env` setting
1. Add it to **`.env.example`** (with a placeholder / comment) and commit that.
2. Add the real value to your own `.env` (never committed).
3. Tell the team to copy the new key from `.env.example` into their `.env`.

---

## 4. Database: migrations explained simply

- **`alembic upgrade head`** = "apply every migration my DB hasn't run yet."
  Safe and idempotent — does nothing if you're already current.
- **`alembic current`** = which migration your DB is on.
- **`alembic history`** = the full ordered list of migrations.
- **`alembic downgrade -1`** = undo the most recent migration (use carefully).
- Alembic tracks progress in a hidden `alembic_version` table in your DB.

**Migrations are ordered like a chain.** Each file has a `revision` and a
`down_revision` pointing to the one before it:
```
20260602_auth  →  20260603_signup  →  (your next one)
```

### The #1 team pitfall: "multiple heads"
If two people both run `alembic revision` starting from the *same* latest
migration, you get **two** migrations both pointing back to the same parent — a
"branch." `alembic upgrade head` then complains about multiple heads.

**Prevent it:** always `git pull` + `alembic upgrade head` **before** you run
`alembic revision --autogenerate`. One migration per feature/PR.

**If it already happened**, fix with:
```powershell
alembic heads            # shows the two heads
alembic merge heads -m "merge migrations"
alembic upgrade head
```

---

## 5. The `.env` file (per-machine, never committed)

- `.env` is git-ignored. Each developer keeps their own.
- `.env.example` is the committed template listing **which keys exist**.
- After any pull, if the app complains about a missing/empty setting, compare:
  open `.env.example`, copy any new keys into your `.env`, fill in values.
- Keys that differ per person: `DATABASE_URL` (your local DB creds),
  `SECRET_KEY`, `SUPERADMIN_PASSWORD`, `SMTP_*`.
- `SUPERADMIN_PASSWORD` must be **≥ 8 characters** or `create_superadmin` refuses.

---

## 6. Special note: enum (status/role) changes

Postgres enums need explicit migration SQL — `--autogenerate` does **not**
reliably detect new enum values. When you add a value to a Python enum like
`UserStatus`, hand-write the migration (see
`alembic/versions/20260603_signup_status_values.py` as the template):

```python
def upgrade():
    op.execute("ALTER TYPE user_status ADD VALUE IF NOT EXISTS 'pending_approval'")
def downgrade():
    pass  # Postgres can't drop enum values without recreating the type
```

---

## 7. Running the server & common issues

```powershell
uvicorn app.main:app --reload          # dev: auto-restarts on code changes
```

| Problem | Cause | Fix |
|---|---|---|
| `error while attempting to bind ... 8000 ... only one usage of each socket address` | a server is already running on 8000 | use the one that's running, OR run on another port: `uvicorn app.main:app --reload --port 8001`, OR kill the old one (below) |
| `column "x" does not exist` / `invalid input value for enum` | you didn't apply migrations | `alembic upgrade head` |
| `ModuleNotFoundError` | missing dependency | `pip install -r requirements.txt` |
| `Missing required SMTP settings` | `.env` SMTP keys empty (only matters when sending invites) | fill `SMTP_*` in `.env`, or ignore in dev |
| `password must be at least 8 characters` (seed) | `SUPERADMIN_PASSWORD` too short | set ≥ 8 chars in `.env` |
| Multiple heads error | two parallel migrations | `alembic merge heads` (see §4) |

**Kill a stuck server on a port (Windows PowerShell):**
```powershell
Get-NetTCPConnection -LocalPort 8000 -State Listen | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }
```

---

## 8. Reset a developer's local database (nuke & rebuild)

Sometimes a dev's local DB gets messy and they just want a clean slate. This
only affects **their** machine's data:

```powershell
# Option 1: roll all the way back, then forward
alembic downgrade base
alembic upgrade head
python -m app.scripts.create_superadmin

# Option 2 (Docker Postgres): destroy the volume and recreate
docker compose -f docker-compose.db.yml down -v
docker compose -f docker-compose.db.yml up -d
alembic upgrade head
python -m app.scripts.create_superadmin
```

---

## 9. Changing the superadmin password

> Important: `create_superadmin` is **idempotent** — if a superadmin already
> exists, re-running it does **nothing**. Editing `SUPERADMIN_PASSWORD` in `.env`
> and re-running will NOT change an existing superadmin's password. Use one of
> these instead.

**Option A — you know the current password (normal change):**
Call the change-password endpoint (any logged-in user can change their own).
Easiest via Swagger at http://localhost:8000/docs → `POST /api/auth/change-password`
(click **Authorize**, paste the access token from `/auth/login` first):
```json
{ "old_password": "<current>", "new_password": "<new, min 8 chars>" }
```

**Option B — forgot it / force-reset from the terminal:**
Set the new value in `.env` (`SUPERADMIN_PASSWORD=...`, ≥ 8 chars), then:
```powershell
python -m app.scripts.create_superadmin --reset-password
```
This overwrites the existing superadmin's password from `.env` and clears the
"must change password" flag, so you can log in with the new password immediately.

> Each developer has their **own** local superadmin (data doesn't sync — see §0),
> so an intern resets *their* local superadmin the same way on their machine.

---

## 10. TL;DR cheat sheet

```powershell
# After pulling anyone's changes:
git pull; pip install -r requirements.txt; alembic upgrade head; uvicorn app.main:app --reload

# After YOU change a model:
alembic revision --autogenerate -m "what changed"   # then review the file
alembic upgrade head
git add app/models alembic/versions; git commit -m "..."; git push

# First-time / fresh clone:
py -m venv .venv; .venv\Scripts\Activate.ps1; pip install -r requirements.txt
copy .env.example .env   # edit it
alembic upgrade head; python -m app.scripts.create_superadmin; uvicorn app.main:app --reload
```
