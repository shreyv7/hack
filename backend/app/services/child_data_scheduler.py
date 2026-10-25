"""Background lifecycle engine for Children's Data (DPDPA Section 9).

Once a day it sweeps every organization to:
  * re-detect new minors from connected data sources,
  * age out subjects who have turned 18 (lift restrictions),
  * expire parental consents past their validity (flag for renewal).

In-process asyncio loop (not Celery), mirroring the retention / DSAR SLA engines.
"""

from __future__ import annotations

import asyncio
import logging

from app.core.database import SessionLocal
from app.services.child_data_service import ChildDataService

logger = logging.getLogger(__name__)

# How often the loop wakes. The work is idempotent, so a daily cadence is fine;
# admins can also trigger it on demand from the UI.
CHILD_MAINTENANCE_INTERVAL_SECONDS = 24 * 3600


async def child_data_engine_loop() -> None:
    while True:
        try:
            await asyncio.sleep(CHILD_MAINTENANCE_INTERVAL_SECONDS)
            db = SessionLocal()
            try:
                result = ChildDataService(db).run_maintenance_all_orgs()
                if (
                    result.records_created
                    or result.aged_out
                    or result.consents_expired
                ):
                    logger.info(
                        "Children's data engine: orgs=%s new=%s updated=%s aged_out=%s expired=%s",
                        result.orgs_processed,
                        result.records_created,
                        result.records_updated,
                        result.aged_out,
                        result.consents_expired,
                    )
            finally:
                db.close()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Children's data engine tick failed")
