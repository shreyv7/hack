"""
API routers (URL endpoints) live in this package.

Convention: one file per module, e.g. app/routers/auth.py:

    from fastapi import APIRouter
    router = APIRouter(prefix="/auth", tags=["auth"])

    @router.post("/login")
    def login(...): ...

Register each router in app/main.py:

    from app.routers import auth
    app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
"""
