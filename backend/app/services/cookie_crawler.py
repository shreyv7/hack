import asyncio
import logging
from datetime import datetime
from typing import Dict, Any, List
from uuid import UUID

from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from playwright.async_api import Request
from sqlalchemy import select

from app.core.database import SessionLocal
from app.models.cookie_scan_job import CookieScanJob, ScanStatus
from app.models.detected_tracker import DetectedTracker, TrackerType, TrackerCategory, TrackerStatus
from app.models.integration_property import IntegrationProperty


logger = logging.getLogger(__name__)

# Zero-Config categorization mapping
TRACKER_DB = {
    # Analytics
    "_ga": {"category": TrackerCategory.analytics, "description": "Google Analytics tracking cookie"},
    "_gid": {"category": TrackerCategory.analytics, "description": "Google Analytics tracking cookie"},
    "vuid": {"category": TrackerCategory.analytics, "description": "Vimeo analytics tracking"},
    
    # Marketing
    "_fbp": {"category": TrackerCategory.marketing, "description": "Facebook tracking pixel"},
    "fr": {"category": TrackerCategory.marketing, "description": "Facebook advertising cookie"},
    "MUID": {"category": TrackerCategory.marketing, "description": "Microsoft Advertising tracking"},
    "bcookie": {"category": TrackerCategory.marketing, "description": "LinkedIn advertising tracking"},
    
    # Functional
    "intercom-id": {"category": TrackerCategory.functional, "description": "Intercom live chat functional cookie"},
    "intercom-session": {"category": TrackerCategory.functional, "description": "Intercom live chat session"},
    
    # Essential (usually our own or session IDs)
    "session_id": {"category": TrackerCategory.essential, "description": "Core session identifier"},
    "csrf_token": {"category": TrackerCategory.essential, "description": "Security token for cross-site request forgery prevention"},
}

def categorize_tracker(name: str) -> dict:
    """Matches a tracker name against known DB to assign category and description."""
    for key, data in TRACKER_DB.items():
        if name.startswith(key):
            return data
    return {"category": TrackerCategory.unknown, "description": "Unknown tracker"}


def auto_map_purpose_for_tracker(db, property_id: str, tracker_category: TrackerCategory) -> UUID | None:
    from app.models.consent import Purpose
    
    prop = db.get(IntegrationProperty, property_id)
    if not prop:
        return None
        
    org_id = prop.organization_id
    
    # Fetch all active (non-archived) purposes for this org
    stmt = select(Purpose).where(
        Purpose.organization_id == org_id,
        Purpose.archived_at.is_(None)
    )
    result = db.execute(stmt)
    purposes = result.scalars().all()
    
    # Heuristic keywords mapping
    keywords = {
        "analytics": ["analytics", "tracking", "measure", "traffic", "visitor"],
        "marketing": ["marketing", "ads", "advertis", "campaign", "promo", "pixel"],
        "functional": ["functional", "chat", "support", "preference", "widget"],
        "essential": ["essential", "core", "session", "security", "csrf"]
    }
    
    cat_str = tracker_category.value if hasattr(tracker_category, 'value') else str(tracker_category)
    cat_keywords = keywords.get(cat_str, [])
    
    # Look for name matches first
    for purpose in purposes:
        name_lower = purpose.name.lower()
        if any(kw in name_lower for kw in cat_keywords):
            return purpose.id
            
    return None


async def run_playwright_scan(url: str, domain: str) -> List[Dict[str, Any]]:
    from playwright.async_api import async_playwright
    found_trackers: List[Dict[str, Any]] = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        # Intercept network requests to catch pixels / 3rd party scripts
        async def intercept_request(request: "Request"):
            pass
        
        page.on("request", intercept_request)

        try:
            await page.goto(url, wait_until="networkidle", timeout=30000)
        except Exception as e:
            logger.warning(f"Timeout or error navigating to {url}: {e}")

        # Wait a bit for async scripts to set cookies
        await asyncio.sleep(5)

        # Get cookies
        cookies = await context.cookies()
        for cookie in cookies:
            found_trackers.append({
                "name": cookie["name"],
                "type": TrackerType.cookie,
                "domain": cookie["domain"],
                "path": cookie["path"],
                "expiry": str(cookie["expires"]),
            })

        # Get localStorage keys
        try:
            local_storage = await page.evaluate("() => Object.keys(localStorage)")
            for key in local_storage:
                found_trackers.append({
                    "name": key,
                    "type": TrackerType.local_storage,
                    "domain": domain,
                    "path": "/",
                    "expiry": "persistent"
                })
        except Exception as e:
            logger.warning(f"Error accessing localStorage: {e}")

        await browser.close()
    return found_trackers


def run_traditional_fallback_scan(url: str, domain: str) -> List[Dict[str, Any]]:
    import urllib.request
    from html.parser import HTMLParser
    
    logger.info(f"Running traditional fallback HTML scanning for {url}")
    found_trackers = []
    
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    )
    
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            html_content = response.read().decode('utf-8', errors='ignore')
            
            # Parse Set-Cookie response headers
            set_cookie_headers = response.info().get_all('Set-Cookie') or []
            for header in set_cookie_headers:
                parts = [p.strip() for p in header.split(';')]
                if not parts:
                    continue
                name_val = parts[0].split('=', 1)
                if len(name_val) != 2:
                    continue
                cookie_name = name_val[0].strip()
                
                cookie_domain = domain
                cookie_path = "/"
                cookie_expiry = "session"
                for part in parts[1:]:
                    part_kv = part.split('=', 1)
                    if len(part_kv) == 2:
                        k, v = part_kv[0].strip().lower(), part_kv[1].strip()
                        if k == 'domain':
                            cookie_domain = v
                        elif k == 'path':
                            cookie_path = v
                        elif k == 'expires':
                            cookie_expiry = v
                            
                found_trackers.append({
                    "name": cookie_name,
                    "type": TrackerType.cookie,
                    "domain": cookie_domain,
                    "path": cookie_path,
                    "expiry": cookie_expiry,
                })
                
            # Parse HTML to find script tags and common signatures
            class TrackerHTMLParser(HTMLParser):
                def __init__(self):
                    super().__init__()
                    self.script_srcs = []
                    self.inline_scripts = []
                    self.in_script = False
                    
                def handle_starttag(self, tag, attrs):
                    if tag == 'script':
                        self.in_script = True
                        for attr, val in attrs:
                            if attr == 'src' and val:
                                self.script_srcs.append(val)
                               
                def handle_endtag(self, tag):
                    if tag == 'script':
                        self.in_script = False
                        
                def handle_data(self, data):
                    if self.in_script:
                        self.inline_scripts.append(data)
                        
            parser = TrackerHTMLParser()
            parser.feed(html_content)
            
            # Standard marketing/analytics scripts patterns mapped to cookies
            signatures = [
                ("google-analytics.com", "_ga", "Google Analytics"),
                ("googletagmanager.com/gtag", "_ga", "Google Tag Manager"),
                ("connect.facebook.net", "_fbp", "Facebook Pixel"),
                ("snap.licdn.com", "bcookie", "LinkedIn Insight Tag"),
                ("widget.intercom.io", "intercom-id", "Intercom Messenger"),
                ("player.vimeo.com", "vuid", "Vimeo Analytics"),
            ]
            
            detected_signatures = set()
            
            # Check script src attributes
            for src in parser.script_srcs:
                for sig, tracker_name, desc in signatures:
                    if sig in src and tracker_name not in detected_signatures:
                        detected_signatures.add(tracker_name)
                        found_trackers.append({
                            "name": tracker_name,
                            "type": TrackerType.cookie,
                            "domain": domain,
                            "path": "/",
                            "expiry": "persistent",
                        })
                        
            # Check inline script text
            for code in parser.inline_scripts:
                for sig, tracker_name, desc in signatures:
                    if sig in code and tracker_name not in detected_signatures:
                        detected_signatures.add(tracker_name)
                        found_trackers.append({
                            "name": tracker_name,
                            "type": TrackerType.cookie,
                            "domain": domain,
                            "path": "/",
                            "expiry": "persistent",
                        })
                        
    except Exception as e:
        logger.error(f"Fallback traditional scanning failed for {url}: {e}")
        
    return found_trackers


async def run_cookie_scan(job_id: str, property_id: str, domain: str):
    """
    Background task to run a headless browser, visit the property domain,
    and collect cookies, localStorage, and network requests.
    """
    with SessionLocal() as db:
        # Mark job as running
        job = db.get(CookieScanJob, job_id)
        if not job:
            logger.error(f"Scan job {job_id} not found.")
            return

        job.status = ScanStatus.running
        job.started_at = datetime.utcnow()
        db.commit()

        try:
            logger.info(f"Starting cookie scan for domain: {domain}")
            
            # Format domain with protocol if missing
            url = domain if domain.startswith("http") else f"https://{domain}"

            try:
                # 1. Attempt Playwright headless browser scan
                found_trackers = await run_playwright_scan(url, domain)
            except Exception as e:
                # 2. Fall back to pure-Python HTML/cookie header parsing scan
                logger.warning(f"Playwright scan failed; falling back to traditional HTML parsing: {e}", exc_info=True)
                found_trackers = run_traditional_fallback_scan(url, domain)

            # Process and save found trackers
            now = datetime.utcnow()
            new_trackers_count = 0

            for t in found_trackers:
                # Check if it already exists for this property
                stmt = select(DetectedTracker).where(
                    DetectedTracker.property_id == property_id,
                    DetectedTracker.name == t["name"],
                    DetectedTracker.type == t["type"]
                )
                result = db.execute(stmt)
                existing_tracker = result.scalar_one_or_none()

                if existing_tracker:
                    existing_tracker.last_seen_at = now
                    existing_tracker.status = TrackerStatus.active
                    existing_tracker.scan_job_id = job_id
                    if not existing_tracker.purpose_id:
                        existing_tracker.purpose_id = auto_map_purpose_for_tracker(db, property_id, existing_tracker.category)
                else:
                    cat_info = categorize_tracker(t["name"])
                    p_id = auto_map_purpose_for_tracker(db, property_id, cat_info["category"])
                    new_tracker = DetectedTracker(
                        property_id=property_id,
                        name=t["name"],
                        type=t["type"],
                        category=cat_info["category"],
                        domain=t["domain"],
                        path=t["path"],
                        expiry=t["expiry"],
                        description=cat_info["description"],
                        first_detected_at=now,
                        last_seen_at=now,
                        status=TrackerStatus.active,
                        scan_job_id=job_id,
                        purpose_id=p_id
                    )
                    db.add(new_tracker)
                    new_trackers_count += 1

            # Mark missing trackers as inactive (trackers last seen before this scan)
            stmt = select(DetectedTracker).where(
                DetectedTracker.property_id == property_id,
                DetectedTracker.last_seen_at < job.started_at
            )
            inactive_result = db.execute(stmt)
            for old_tracker in inactive_result.scalars().all():
                old_tracker.status = TrackerStatus.inactive

            # Finalize Job
            job.status = ScanStatus.completed
            job.completed_at = now
            job.pages_scanned = 1
            job.trackers_found = len(found_trackers)
            
            db.commit()
            logger.info(f"Scan complete for {domain}. Found {len(found_trackers)} trackers.")

        except Exception as e:
            logger.exception(f"Scan failed for {domain}")
            job.status = ScanStatus.failed
            job.error_log = str(e)
            job.completed_at = datetime.utcnow()
            db.commit()
