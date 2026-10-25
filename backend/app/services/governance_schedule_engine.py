"""Background engine for scheduled governance dashboard exports."""

from __future__ import annotations

import asyncio
import logging

from app.core.database import SessionLocal
from app.services.governance_schedule_service import GovernanceScheduleService

logger = logging.getLogger(__name__)

GOVERNANCE_SCHEDULE_INTERVAL_SECONDS = 900  # 15 minutes


async def governance_schedule_engine_loop() -> None:
    while True:
        try:
            await asyncio.sleep(GOVERNANCE_SCHEDULE_INTERVAL_SECONDS)
            db = SessionLocal()
            try:
                result = GovernanceScheduleService(db).run_due_schedules()
                if result["due"]:
                    logger.info(
                        "Governance schedule engine: due=%s processed=%s emails=%s failed=%s",
                        result["due"],
                        result["processed"],
                        result["emails_sent"],
                        result["failed"],
                    )
            finally:
                db.close()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Governance schedule engine tick failed")
