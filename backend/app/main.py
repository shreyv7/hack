"""
FastAPI application entry point.

Run locally with:
    uvicorn app.main:app --reload
"""

import asyncio
import re
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from app.core.config import settings
from app.routers import (
    admin,
    anonymisation,
    auth,
    childrens_data,
    compliance,
    consent,
    data_inventory,
    data_sources,
    dsar,
    masking,
    pii_scanner,
    retention,
    vajra_ai,
    users,
    workspace,
    policy,
)
from app.services.anonymisation_scheduler import anonymisation_engine_loop
from app.services.child_data_scheduler import child_data_engine_loop
from app.services.dsar_sla_scheduler import dsar_sla_engine_loop
from app.services.governance_schedule_engine import governance_schedule_engine_loop
from app.services.email_service import ConfigurationError, validate_smtp_config
from app.services.retention_scheduler import retention_engine_loop


from app.core.database import SessionLocal
from app.services.notice_delivery_service import NoticeOrchestrationWorkers

@asynccontextmanager
async def lifespan(_app: FastAPI):
    import os
    from app.core.startup_db import run_migrations, run_seeding
    
    # Programmatically run migrations
    run_migrations()
    
    # Run production seeding conditionally if credentials are in env
    admin_email = os.getenv("ADMIN_EMAIL")
    admin_password = os.getenv("ADMIN_PASSWORD")
    if admin_email and admin_password:
        run_seeding(admin_email, admin_password)

    try:
        validate_smtp_config()
    except ConfigurationError as exc:
        if settings.ENVIRONMENT == "production":
            raise exc
        print(f"[startup warning] SMTP not fully configured: {exc}")
    
    # Start background workers
    sla_task = asyncio.create_task(dsar_sla_engine_loop())
    retention_task = asyncio.create_task(retention_engine_loop())
    child_data_task = asyncio.create_task(child_data_engine_loop())
    anon_task = asyncio.create_task(anonymisation_engine_loop())
    governance_schedule_task = asyncio.create_task(governance_schedule_engine_loop())
    NoticeOrchestrationWorkers.start_workers(SessionLocal)

    # --- Vajra AI RAG: auto-index docs on startup ---
    if settings.RAG_AUTO_INDEX_ON_STARTUP and settings.ai_configured and settings.ai_provider in ("vertex", "bedrock"):
        import threading

        def _run_doc_indexing() -> None:
            import logging

            log = logging.getLogger("app.rag.startup")
            log.info("🔍 RAG auto-index: checking for documentation changes …")
            db = SessionLocal()
            try:
                from app.services.doc_ingestion_service import DocIngestionService

                stats = DocIngestionService(db).ingest_all()
                log.info("📊 RAG auto-index complete: %s", stats)
            except Exception:
                log.exception("RAG auto-index failed (non-fatal)")
            finally:
                db.close()

        threading.Thread(target=_run_doc_indexing, daemon=True, name="rag-indexer").start()

    yield

    # Stop background workers
    sla_task.cancel()
    retention_task.cancel()
    child_data_task.cancel()
    anon_task.cancel()
    governance_schedule_task.cancel()
    NoticeOrchestrationWorkers.stop_workers()

    for task in (sla_task, retention_task, child_data_task, anon_task, governance_schedule_task):
        try:
            await task
        except asyncio.CancelledError:
            pass


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# Dynamic Split-CORS Middleware
# ---------------------------------------------------------------------------
# /public/v1/* — CMP SDK routes used by client websites.
#   CORS is opened to any origin here because the real security gate is the
#   API key + per-property origin allowlist inside verify_api_key_or_session().
#   Adding 100 client domains to an env var would never scale.
#
# /api/v1/*   — Internal dashboard routes.
#   These remain restricted to BACKEND_CORS_ORIGINS (your own frontend URL).
#   Clients never call these directly.
# ---------------------------------------------------------------------------
_LOCALHOST_RE = re.compile(r"https?://(localhost|127\.0\.0\.1)(:\d+)?$")
_PUBLIC_PREFIX = "/public/"

_CORS_HEADERS = {
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key, X-Session-Token",
    "Access-Control-Max-Age": "600",
}


class SplitCORSMiddleware(BaseHTTPMiddleware):
    """Route-aware CORS middleware.

    * Public SDK routes (/public/*): echo the request origin back so any
      registered client domain can load the consent banner.  The API key
      validation layer is the real security gate for these endpoints.
    * All other routes (/api/v1, etc.): enforce BACKEND_CORS_ORIGINS so only
      your own dashboard frontend can make authenticated requests.
    """

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)
        self._dashboard_origins: set[str] = set(settings.cors_origins)
        self._is_dev: bool = settings.ENVIRONMENT == "development"

    def _is_public_route(self, path: str) -> bool:
        return path.startswith(_PUBLIC_PREFIX)

    def _dashboard_origin_allowed(self, origin: str) -> bool:
        if self._is_dev and _LOCALHOST_RE.match(origin):
            return True
        return origin in self._dashboard_origins

    async def dispatch(self, request: Request, call_next):
        origin = request.headers.get("origin", "")
        is_public = self._is_public_route(request.url.path)

        # Determine allowed origin to reflect
        if is_public:
            # Public/SDK routes: accept any origin — API key gates actual data
            allowed_origin = origin or "*"
        elif origin and self._dashboard_origin_allowed(origin):
            allowed_origin = origin
        else:
            allowed_origin = ""

        # Handle CORS preflight (OPTIONS)
        if request.method == "OPTIONS" and origin:
            headers = {"Access-Control-Allow-Origin": allowed_origin or origin, **_CORS_HEADERS}
            return Response(status_code=204, headers=headers)

        response = await call_next(request)

        if allowed_origin:
            response.headers["Access-Control-Allow-Origin"] = allowed_origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Vary"] = "Origin"

        return response


app.add_middleware(SplitCORSMiddleware)


from fastapi.exceptions import RequestValidationError
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_request, exc):
    return JSONResponse(
        status_code=422,
        content={"detail": jsonable_encoder(exc.errors(), custom_encoder={ValueError: str})},
    )


@app.get("/api/health", tags=["system"])
def health_check():
    return {
        "status": "ok",
        "service": settings.PROJECT_NAME,
        "environment": settings.ENVIRONMENT,
    }


api_prefix = settings.API_V1_PREFIX
app.include_router(auth.router, prefix=api_prefix)
app.include_router(users.router, prefix=api_prefix)
app.include_router(admin.router, prefix=api_prefix)
app.include_router(workspace.router, prefix=api_prefix)
app.include_router(consent.router, prefix=api_prefix)
from app.routers import enforcement
app.include_router(enforcement.router, prefix=api_prefix)
from app.routers import overlay
app.include_router(overlay.router, prefix=api_prefix)
app.include_router(dsar.router, prefix=api_prefix)
app.include_router(data_sources.router, prefix=api_prefix)
app.include_router(data_inventory.router, prefix=api_prefix)
app.include_router(childrens_data.router, prefix=api_prefix)
app.include_router(retention.router, prefix=api_prefix)
app.include_router(pii_scanner.router, prefix=api_prefix)
app.include_router(masking.router, prefix=api_prefix)
app.include_router(anonymisation.router, prefix=api_prefix)
app.include_router(compliance.router, prefix=api_prefix)
app.include_router(vajra_ai.router, prefix=api_prefix)
app.include_router(policy.router, prefix=api_prefix)

from app.routers import integrations
app.include_router(integrations.router, prefix=api_prefix)

from app.routers import consent_ai
app.include_router(consent_ai.router, prefix=api_prefix)


from app.routers import integrations_public
app.include_router(integrations_public.router)

from app.routers import childrens_data_public
app.include_router(childrens_data_public.router)

from app.routers import retention_public
app.include_router(retention_public.router)

from app.routers import consent_managers
app.include_router(consent_managers.router, prefix=api_prefix)

from app.routers import tag_manager
app.include_router(tag_manager.router, prefix=api_prefix)

from app.routers import notice_delivery
app.include_router(notice_delivery.router, prefix=api_prefix)

from app.routers import campaign_public
app.include_router(campaign_public.router)

from app.routers import proof_vault
from app.routers import consent_banking
app.include_router(proof_vault.router, prefix=api_prefix)
app.include_router(consent_banking.router, prefix=api_prefix)

from app.routers import dpia
app.include_router(dpia.router, prefix=api_prefix)

from app.routers import ropa
app.include_router(ropa.router, prefix=api_prefix)

from app.routers import ciso
app.include_router(ciso.router, prefix=api_prefix)

from app.routers import dashboard, overview, governance_dashboards, org_hierarchy, regulatory_reports
app.include_router(dashboard.router, prefix=api_prefix)
app.include_router(overview.router, prefix=api_prefix)
app.include_router(governance_dashboards.router, prefix=api_prefix)
app.include_router(org_hierarchy.router, prefix=api_prefix)
app.include_router(regulatory_reports.router, prefix=api_prefix)

from app.routers import cross_border_transfer
app.include_router(cross_border_transfer.router, prefix=api_prefix)

from app.routers import legitimate_use, regulatory_proceeding, rights_ops
app.include_router(legitimate_use.router, prefix=api_prefix)
app.include_router(regulatory_proceeding.router, prefix=api_prefix)
app.include_router(rights_ops.router, prefix=api_prefix)

# Healthcare uses the shared frontend contract independently of the legacy prefix.
from app.routers import healthcare, healthcare_ai
app.include_router(healthcare.router, prefix="/api/v1")
app.include_router(healthcare_ai.router, prefix="/api/v1")

