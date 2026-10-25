"""
Pydantic schemas (request/response shapes) live in this package.

Convention: one file per domain, e.g. app/schemas/user.py with classes like
`UserCreate`, `UserUpdate`, `UserRead`. These define the JSON contract
the React frontend relies on, and FastAPI uses them for validation + docs.

Keep schemas (API shapes) separate from models (DB tables).
"""
