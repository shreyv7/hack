"""Background SLA engine loop for DSAR reminders."""

from __future__ import annotations

import asyncio
import logging

from app.core.database import SessionLocal
from app.services.dsar_service import DsarService

logger = logging.getLogger(__name__)

SLA_ENGINE_INTERVAL_SECONDS = 3600  # hourly


async def dsar_sla_engine_loop() -> None:
    while True:
        try:
            await asyncio.sleep(SLA_ENGINE_INTERVAL_SECONDS)
            db = SessionLocal()
            try:
                result = DsarService(db).run_sla_engine_once()
                if result.reminders_sent or result.breaches_marked:
                    logger.info(
                        "DSAR SLA engine: processed=%s reminders=%s breaches=%s",
                        result.processed,
                        result.reminders_sent,
                        result.breaches_marked,
                    )
            finally:
                db.close()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("DSAR SLA engine tick failed")
