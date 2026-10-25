"""
Parse an uploaded file into a form the PII Scanner can read.

Two shapes come out of `parse_file`:
  * `tables`  — structured data (CSV/TSV/XLSX/JSON arrays) as (columns, rows),
                scanned column-by-column with the same detectors used for DBs.
  * `text`    — free text (PDF/DOCX/TXT/LOG, or non-tabular JSON) scanned with
                regex token detectors + Presidio NER (names, addresses).

Everything is bounded (row / cell / character caps) so a large file can't blow
up memory or the scan time.
"""

from __future__ import annotations

import csv
import json
import logging
import os
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)

# Bounds.
MAX_ROWS = 1000          # rows per table actually sampled
MAX_COLS = 200
MAX_TEXT_CHARS = 200_000  # free-text chars handed to the analyzer
MAX_CELL = 1000           # truncate huge cells

SUPPORTED_EXTENSIONS = {
    ".csv", ".tsv", ".xlsx", ".json", ".txt", ".log", ".pdf", ".docx",
}


@dataclass
class ParsedTable:
    name: str
    columns: list[str]
    rows: list[tuple]


@dataclass
class ParsedFile:
    tables: list[ParsedTable] = field(default_factory=list)
    text: str | None = None


def is_supported(filename: str) -> bool:
    return Path(filename).suffix.lower() in SUPPORTED_EXTENSIONS


def parse_bytes(data: bytes, filename: str, max_rows: int = MAX_ROWS) -> ParsedFile:
    """Parse in-memory file bytes (e.g. downloaded from S3/Drive) by spilling to a
    temp file and reusing the path-based parsers. Raises ValueError for unsupported
    types."""
    ext = Path(filename).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise ValueError(f"Unsupported file type '{ext or filename}'.")
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(data)
        tmp_path = tmp.name
    try:
        return parse_file(tmp_path, filename, max_rows)
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:  # pragma: no cover
            pass


def parse_file(path: str, filename: str, max_rows: int = MAX_ROWS) -> ParsedFile:
    """Dispatch by extension. Raises ValueError for unsupported types."""
    ext = Path(filename).suffix.lower()
    p = Path(path)
    if not p.exists():
        raise ValueError("The uploaded file is missing on the server.")
    max_rows = max(1, min(max_rows, MAX_ROWS))

    if ext in (".csv", ".tsv"):
        return _parse_delimited(p, filename, "\t" if ext == ".tsv" else ",", max_rows)
    if ext == ".xlsx":
        return _parse_xlsx(p, filename, max_rows)
    if ext == ".json":
        return _parse_json(p, filename, max_rows)
    if ext in (".txt", ".log"):
        return ParsedFile(text=_read_text(p))
    if ext == ".pdf":
        return ParsedFile(text=_parse_pdf(p))
    if ext == ".docx":
        return ParsedFile(text=_parse_docx(p))
    raise ValueError(
        f"Unsupported file type '{ext or filename}'. Supported: "
        + ", ".join(sorted(SUPPORTED_EXTENSIONS))
    )


# --------------------------------------------------------------------------- #
# structured
# --------------------------------------------------------------------------- #

def _clip_row(values: list) -> tuple:
    out = []
    for v in values[:MAX_COLS]:
        if isinstance(v, str) and len(v) > MAX_CELL:
            v = v[:MAX_CELL]
        out.append(v)
    return tuple(out)


def _parse_delimited(p: Path, filename: str, delimiter: str, max_rows: int) -> ParsedFile:
    with p.open("r", encoding="utf-8-sig", errors="replace", newline="") as fh:
        reader = csv.reader(fh, delimiter=delimiter)
        rows_iter = iter(reader)
        try:
            header = next(rows_iter)
        except StopIteration:
            return ParsedFile()
        columns = [(h or f"col_{i + 1}").strip() for i, h in enumerate(header[:MAX_COLS])]
        rows: list[tuple] = []
        for r in rows_iter:
            rows.append(_clip_row(r))
            if len(rows) >= max_rows:
                break
    return ParsedFile(tables=[ParsedTable(name=filename, columns=columns, rows=rows)])


def _parse_xlsx(p: Path, filename: str, max_rows: int) -> ParsedFile:
    from openpyxl import load_workbook

    wb = load_workbook(p, read_only=True, data_only=True)
    tables: list[ParsedTable] = []
    try:
        for ws in wb.worksheets:
            it = ws.iter_rows(values_only=True)
            header = next(it, None)
            if not header:
                continue
            columns = [
                (str(h) if h is not None else f"col_{i + 1}").strip()
                for i, h in enumerate(list(header)[:MAX_COLS])
            ]
            rows: list[tuple] = []
            for r in it:
                rows.append(_clip_row(list(r)))
                if len(rows) >= max_rows:
                    break
            if columns:
                name = filename if len(wb.worksheets) == 1 else f"{filename}:{ws.title}"
                tables.append(ParsedTable(name=name, columns=columns, rows=rows))
    finally:
        wb.close()
    return ParsedFile(tables=tables)


def _parse_json(p: Path, filename: str, max_rows: int) -> ParsedFile:
    try:
        data = json.loads(p.read_text(encoding="utf-8", errors="replace"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON: {exc}") from exc

    # A list of flat objects → a table. Anything else → free text (dumped).
    if isinstance(data, list) and data and all(isinstance(x, dict) for x in data):
        columns: list[str] = []
        seen: set[str] = set()
        for obj in data[:max_rows]:
            for k in obj.keys():
                if k not in seen and len(columns) < MAX_COLS:
                    seen.add(k)
                    columns.append(str(k))
        rows = [_clip_row([_json_cell(obj.get(c)) for c in columns]) for obj in data[:max_rows]]
        return ParsedFile(tables=[ParsedTable(name=filename, columns=columns, rows=rows)])

    text = json.dumps(data, ensure_ascii=False, indent=1)[:MAX_TEXT_CHARS]
    return ParsedFile(text=text)


def _json_cell(value) -> object:
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return value


# --------------------------------------------------------------------------- #
# free text
# --------------------------------------------------------------------------- #

def _read_text(p: Path) -> str:
    return p.read_text(encoding="utf-8", errors="replace")[:MAX_TEXT_CHARS]


def _parse_pdf(p: Path) -> str:
    from pypdf import PdfReader

    reader = PdfReader(str(p))
    chunks: list[str] = []
    total = 0
    for page in reader.pages:
        try:
            t = page.extract_text() or ""
        except Exception:  # noqa: BLE001 — skip unreadable pages
            t = ""
        chunks.append(t)
        total += len(t)
        if total >= MAX_TEXT_CHARS:
            break
    return "\n".join(chunks)[:MAX_TEXT_CHARS]


def _parse_docx(p: Path) -> str:
    from docx import Document

    doc = Document(str(p))
    parts: list[str] = [para.text for para in doc.paragraphs if para.text]
    # Include table cell text too — DPDPA data often lives in document tables.
    for table in doc.tables:
        for row in table.rows:
            parts.append(" ".join(cell.text for cell in row.cells if cell.text))
    return "\n".join(parts)[:MAX_TEXT_CHARS]
