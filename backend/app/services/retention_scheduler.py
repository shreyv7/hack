"""Background engine loop for retention policies.

Periodically evaluates due active policies across all organizations. Policies
marked `auto_delete` (with a delete action + configured target) have their
expired rows deleted; all others are flagged as pending runs for human review.
Mirrors the DSAR SLA scheduler pattern (in-process asyncio, not Celery).
"""

from __future__ import annotations

import asyncio
import logging

from app.core.database import SessionLocal
from app.services.retention_service import RetentionService

logger = logging.getLogger(__name__)

RETENTION_ENGINE_INTERVAL_SECONDS = 3600  # hourly; per-policy cadence is 24h


async def retention_engine_loop() -> None:
    while True:
        try:
            await asyncio.sleep(RETENTION_ENGINE_INTERVAL_SECONDS)
            db = SessionLocal()
            try:
                result = RetentionService(db).run_engine_all_orgs()
                if result.runs_created:
                    logger.info(
                        "Retention engine: evaluated=%s created=%s executed=%s deleted=%s flagged=%s",
                        result.policies_evaluated,
                        result.runs_created,
                        result.runs_executed,
                        result.rows_deleted,
                        result.flagged,
                    )
            finally:
                db.close()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Retention engine tick failed")
