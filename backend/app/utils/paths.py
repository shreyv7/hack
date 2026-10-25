"""Filesystem path helpers resolved relative to the backend root."""

from pathlib import Path

from app.core.config import settings


def get_backend_root() -> Path:
    """Return the backend package root (parent of ``app/``)."""
    return Path(__file__).resolve().parents[2]


def resolve_backend_path(relative_or_absolute: str) -> Path:
    path = Path(relative_or_absolute)
    if path.is_absolute():
        return path
    return get_backend_root() / path


def get_ciso_report_dir() -> Path:
    report_dir = resolve_backend_path(settings.CISO_REPORT_DIR)
    report_dir.mkdir(parents=True, exist_ok=True)
    return report_dir


def get_ciso_report_path(report_id) -> Path:
    return get_ciso_report_dir() / f"report_{report_id}.pdf"
