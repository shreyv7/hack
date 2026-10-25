"""Background engine for Data Anonymisation (DPDPA Section 8).

Hourly it (a) re-runs recurring anonymisation jobs that are due, keeping their
anonymised exports fresh as the source data changes, and (b) re-checks completed
jobs' re-identification risk against the current data to flag drift
("re-anonymise recommended"). In-process asyncio loop, like the other engines.
"""

from __future__ import annotations

import asyncio
import logging

from app.core.database import SessionLocal
from app.services.anonymisation_service import AnonymisationService

logger = logging.getLogger(__name__)

ANON_ENGINE_INTERVAL_SECONDS = 3600  # hourly; per-job cadence is daily/weekly/etc.


async def anonymisation_engine_loop() -> None:
    while True:
        try:
            await asyncio.sleep(ANON_ENGINE_INTERVAL_SECONDS)
            db = SessionLocal()
            try:
                result = AnonymisationService(db).run_scheduler_all()
                if result["reran"] or result["monitored"]:
                    logger.info(
                        "Anonymisation engine: reran=%s monitored=%s",
                        result["reran"], result["monitored"],
                    )
            finally:
                db.close()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Anonymisation engine tick failed")
