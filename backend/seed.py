"""One-time seed: load PDFs/markdown into chunks+embeddings, load CSV into sensor_data.

Idempotent. Re-running skips documents already present (by filename) and CSV rows
already loaded (by device + measured_at).
"""
from __future__ import annotations

import math
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Iterable

import psycopg
import pytesseract
from dotenv import load_dotenv
from openai import OpenAI
from pdf2image import convert_from_path
from pgvector.psycopg import register_vector
from pypdf import PdfReader

load_dotenv()

ROOT = Path(__file__).resolve().parents[1]
DOCS_DIR = ROOT / "docs"
DATA_DIR = ROOT / "data"
OCR_CACHE_DIR = ROOT / ".ocr_cache"

EMBEDDING_DIM = 768
CHUNK_SIZE_CHARS = 3200   # ~800 tokens at 4 chars/token
OVERLAP_CHARS = 400       # ~100 tokens
EMBED_BATCH = 32
OCR_MIN_CHARS_PER_PAGE = 50  # below this average, treat as scanned
MIN_QUALITY_CHARS = 100      # chunks shorter than this are likely PDF noise
MIN_ALPHA_RATIO = 0.5        # below this, chunk is mostly digits/punctuation

# Known PDF noise patterns. Matches case-insensitively; chunks dominated by these are dropped.
BOILERPLATE_PATTERNS = [
    "adobe acrobat",
    "acrobat reader",
    "click here to download",
]

# Per README §5. Used to populate `documents.source_url` and `documents.title`.
DOC_META: dict[str, tuple[str, str]] = {
    "rwqc2012.pdf": (
        "EPA Recreational Water Quality Criteria (2012)",
        "https://www.epa.gov/sites/default/files/2015-10/documents/rwqc2012.pdf",
    ),
    "ambient-wqc-dissolved-oxygen-1986.pdf": (
        "EPA Ambient Water Quality Criteria for Dissolved Oxygen (Freshwater), 1986",
        "https://www.epa.gov/sites/default/files/2019-03/documents/ambient-wqc-dissolved-oxygen-1986.pdf",
    ),
    "aquatic-life-criteria-table.md": (
        "EPA National Recommended Water Quality Criteria — Aquatic Life Criteria Table",
        "https://www.epa.gov/wqc/national-recommended-water-quality-criteria-aquatic-life-criteria-table",
    ),
    "volunteer_stream_monitoring_a_methods_manual.pdf": (
        "EPA Volunteer Stream Monitoring: A Methods Manual (1997)",
        "https://www.epa.gov/sites/default/files/2015-04/documents/volunteer_stream_monitoring_a_methods_manual.pdf",
    ),
    "tm9a6.2.pdf": (
        "USGS National Field Manual Chapter A6.2 — Dissolved Oxygen",
        "https://pubs.usgs.gov/tm/09/a6.2/tm9a6.2.pdf",
    ),
    "tm9a6.8.pdf": (
        "USGS National Field Manual Chapter A6.8 — Multiparameter Instruments",
        "https://pubs.usgs.gov/publication/tm9A6.8/full",
    ),
    "Dissolved Oxygen and Water _ U.S. Geological Survey.pdf": (
        "USGS Water Science School — Dissolved Oxygen and Water",
        "https://www.usgs.gov/water-science-school/science/dissolved-oxygen-and-water",
    ),
    "nutrient-lakes-reservoirs-factsheet-final.pdf": (
        "EPA Nutrient Pollution (Lakes and Reservoirs) — Fact Sheet",
        "https://www.epa.gov/nutrientpollution/ambient-water-quality-criteria-address-nutrient-pollution-lakes-and-reservoirs",
    ),
    "nutrient-lakes-reservoirs-report-final.pdf": (
        "EPA Ambient Water Quality Criteria for Nutrient Pollution (Lakes and Reservoirs)",
        "https://www.epa.gov/nutrientpollution/ambient-water-quality-criteria-address-nutrient-pollution-lakes-and-reservoirs",
    ),
}


# ---------- pure functions (tested in backend/tests/) ----------

def split_text(text: str, chunk_size: int = CHUNK_SIZE_CHARS, overlap: int = OVERLAP_CHARS) -> list[str]:
    """Recursive character splitter. Tries separators in priority order and
    recurses on oversized pieces. Adds character overlap between adjacent chunks."""
    separators = ["\n\n", "\n", ". ", " ", ""]

    def _split(t: str, seps: list[str]) -> list[str]:
        if len(t) <= chunk_size:
            return [t] if t.strip() else []
        sep = seps[0]
        parts = t.split(sep) if sep else list(t)
        out: list[str] = []
        buf = ""
        for p in parts:
            piece = (buf + sep + p) if (buf and sep) else (buf + p if buf else p)
            if len(piece) <= chunk_size:
                buf = piece
            else:
                if buf:
                    out.append(buf)
                if len(p) > chunk_size and len(seps) > 1:
                    out.extend(_split(p, seps[1:]))
                    buf = ""
                else:
                    buf = p
        if buf:
            out.append(buf)
        return out

    pieces = [p for p in _split(text, separators) if p.strip()]
    if overlap <= 0 or len(pieces) < 2:
        return pieces
    overlapped = [pieces[0]]
    for i in range(1, len(pieces)):
        tail = pieces[i - 1][-overlap:]
        overlapped.append(tail + pieces[i])
    return overlapped


def is_quality_chunk(text: str) -> bool:
    """Reject chunks that are mostly PDF noise: too-short, low alpha ratio, or boilerplate."""
    t = text.strip()
    if len(t) < MIN_QUALITY_CHARS:
        return False
    alpha = sum(1 for c in t if c.isalpha())
    if alpha / len(t) < MIN_ALPHA_RATIO:
        return False
    low = t.lower()
    if any(p in low for p in BOILERPLATE_PATTERNS):
        return False
    return True


def parse_csv_date(s: str) -> datetime:
    """Parse the project CSV's date format: 'HH:MM MM/DD/YYYY' (e.g. '02:35 05/07/2026')."""
    return datetime.strptime(s.strip(), "%H:%M %m/%d/%Y")


def detect_units(rows: list[dict]) -> tuple[dict[str, str], list[str]]:
    """Heuristically detect units for the ambiguous CSV columns.

    Returns (units, flags). `flags` is human-readable warnings to print so the
    user can correct course if a heuristic disagrees with the operator-provided
    ranges in README §7.
    """
    def stats(col: str) -> tuple[float | None, float | None, int]:
        vals = []
        for r in rows:
            v = r.get(col)
            if v in (None, "", "NA"):
                continue
            try:
                vals.append(float(v))
            except ValueError:
                continue
        if not vals:
            return None, None, 0
        return min(vals), max(vals), len(vals)

    units: dict[str, str] = {"ph": "unitless", "orp": "mV"}
    flags: list[str] = []

    do_min, do_max, n = stats("dissolved_oxygen")
    if n:
        if do_max is not None and do_max <= 20:
            units["dissolved_oxygen"] = "mg/L"
        elif do_max is not None and do_max <= 200:
            units["dissolved_oxygen"] = "% saturation"
            flags.append(
                f"DO range {do_min:.2f}..{do_max:.2f} looks like % saturation, not mg/L. "
                f"Operator range (5–14 mg/L) assumes mg/L — comparisons will be wrong."
            )
        else:
            units["dissolved_oxygen"] = "unknown"
            flags.append(f"DO range {do_min}..{do_max} doesn't match expected mg/L or % saturation patterns.")

    t_min, t_max, n = stats("temperature")
    if n:
        if t_max is not None and t_max > 40:
            units["temperature"] = "°F"
        elif t_min is not None and t_min >= 0:
            units["temperature"] = "°C"
            flags.append(
                f"Temperature range {t_min:.2f}..{t_max:.2f} looks like °C, not °F. "
                f"Operator range (32–95 °F) assumes °F — system prompt will need to be updated."
            )
        else:
            units["temperature"] = "unknown"
            flags.append(f"Temperature range {t_min}..{t_max} doesn't match °C or °F bounds.")

    c_min, c_max, n = stats("conductivity")
    if n:
        if c_max is not None and c_max <= 100000:
            units["conductivity"] = "µS/cm"
        else:
            units["conductivity"] = "unknown"
            flags.append(f"Conductivity range {c_min}..{c_max} unusually large.")

    return units, flags


# ---------- I/O helpers ----------

def is_likely_scanned(text: str, n_pages: int, threshold: int = OCR_MIN_CHARS_PER_PAGE) -> bool:
    """A PDF is treated as scanned when pypdf extracts fewer than `threshold` chars per page on average."""
    if n_pages <= 0:
        return False
    return (len(text) / n_pages) < threshold


def ocr_pdf(path: Path) -> str:
    """OCR a PDF via pdf2image + tesseract. Caches result to .ocr_cache/<filename>.txt."""
    OCR_CACHE_DIR.mkdir(exist_ok=True)
    cache = OCR_CACHE_DIR / f"{path.name}.txt"
    if cache.exists():
        return cache.read_text(encoding="utf-8")

    print(f"[seed] OCR: {path.name} (this can take several minutes)...", flush=True)
    pages = convert_from_path(str(path), dpi=200)
    parts = []
    for i, img in enumerate(pages, 1):
        parts.append(pytesseract.image_to_string(img))
        if i % 5 == 0:
            print(f"[seed] OCR: {path.name} page {i}/{len(pages)}", flush=True)
    text = "\n\n".join(parts)
    cache.write_text(text, encoding="utf-8")
    return text


def extract_text(path: Path) -> str:
    if path.suffix.lower() == ".pdf":
        reader = PdfReader(str(path))
        n_pages = len(reader.pages)
        text = "\n\n".join((page.extract_text() or "") for page in reader.pages)
        if is_likely_scanned(text, n_pages):
            print(f"[seed] {path.name}: pypdf yielded {len(text)} chars over {n_pages} pages — running OCR.")
            return ocr_pdf(path)
        return text
    return path.read_text(encoding="utf-8")


def get_db() -> psycopg.Connection:
    url = os.environ["DATABASE_URL"]
    conn = psycopg.connect(url, autocommit=False)
    register_vector(conn)
    return conn


def get_client() -> OpenAI:
    return OpenAI(
        base_url="https://api.fireworks.ai/inference/v1",
        api_key=os.environ["FIREWORKS_API_KEY"],
    )


def embed_batch(client: OpenAI, model: str, texts: list[str]) -> list[list[float]]:
    # nomic-embed-text-v1.5 expects the "search_document: " task prefix for stored
    # passages and "search_query: " for queries. Without it, retrieval quality drops.
    prefixed = [f"search_document: {t}" for t in texts]
    resp = client.embeddings.create(model=model, input=prefixed)
    return [d.embedding for d in resp.data]


def chunked(seq: list, size: int) -> Iterable[list]:
    for i in range(0, len(seq), size):
        yield seq[i : i + size]


# ---------- ingest functions ----------

def ingest_documents(conn: psycopg.Connection, client: OpenAI, model: str) -> int:
    if not DOCS_DIR.exists():
        print(f"[seed] {DOCS_DIR} not found; skipping document ingest.")
        return 0

    files = sorted(
        p for p in DOCS_DIR.iterdir()
        if p.is_file() and p.suffix.lower() in {".pdf", ".md", ".txt"}
    )

    inserted_chunks = 0
    with conn.cursor() as cur:
        for path in files:
            filename = path.name
            cur.execute("SELECT id FROM documents WHERE filename = %s", (filename,))
            if cur.fetchone() is not None:
                print(f"[seed] skipping (already ingested): {filename}")
                continue

            title, url = DOC_META.get(filename, (filename, None))
            text = extract_text(path)
            chunks_raw = split_text(text)
            before = len(chunks_raw)
            chunks = [c for c in chunks_raw if is_quality_chunk(c)]
            dropped = before - len(chunks)
            if dropped:
                print(f"[seed] {filename}: dropped {dropped} low-quality chunks (of {before}).")
            if not chunks:
                print(f"[seed] {filename}: extracted 0 quality chunks; skipping.")
                continue

            cur.execute(
                "INSERT INTO documents (filename, title, source_url) VALUES (%s, %s, %s) RETURNING id",
                (filename, title, url),
            )
            doc_id = cur.fetchone()[0]

            print(f"[seed] {filename}: {len(chunks)} chunks, embedding...", flush=True)
            chunk_idx = 0
            for batch in chunked(chunks, EMBED_BATCH):
                vectors = embed_batch(client, model, batch)
                rows = [(doc_id, chunk_idx + i, batch[i], vectors[i]) for i in range(len(batch))]
                cur.executemany(
                    "INSERT INTO chunks (document_id, chunk_index, content, embedding) VALUES (%s, %s, %s, %s)",
                    rows,
                )
                chunk_idx += len(batch)
                inserted_chunks += len(batch)
            conn.commit()
            print(f"[seed] {filename}: done ({chunk_idx} chunks).")

    return inserted_chunks


def ensure_chunk_index(conn: psycopg.Connection) -> None:
    """Create the IVFFlat cosine index after data is loaded, sizing `lists` from row count."""
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM chunks")
        n = cur.fetchone()[0]
        if n == 0:
            print("[seed] no chunks present; skipping IVFFlat index.")
            return
        cur.execute(
            "SELECT 1 FROM pg_indexes WHERE indexname = 'idx_chunks_embedding'"
        )
        if cur.fetchone() is not None:
            return
        lists = max(10, min(100, int(math.sqrt(n))))
        cur.execute(
            f"CREATE INDEX idx_chunks_embedding ON chunks "
            f"USING ivfflat (embedding vector_cosine_ops) WITH (lists = {lists})"
        )
        conn.commit()
        print(f"[seed] created IVFFlat index with lists={lists} over {n} chunks.")


def ingest_csv(conn: psycopg.Connection, csv_path: Path) -> tuple[int, int, dict]:
    """Returns (rows_before, rows_after, units)."""
    import csv

    with csv_path.open() as f:
        reader = csv.DictReader(f)
        raw_rows = list(reader)

    # Normalize column names to snake_case (README §4).
    col_map = {
        "DEVICE": "device",
        "DATE": "date",
        "DISSOLVED OXYGEN": "dissolved_oxygen",
        "ORP": "orp",
        "PH": "ph",
        "CONDUCTIVITY": "conductivity",
        "TEMPERATURE": "temperature",
    }
    rows: list[dict] = []
    for r in raw_rows:
        rows.append({col_map.get(k, k.lower()): v for k, v in r.items()})

    units, flags = detect_units(rows)
    print(f"[seed] detected units: {units}")
    for f in flags:
        print(f"[seed] WARNING: {f}")

    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM sensor_data")
        before = cur.fetchone()[0]

        records = []
        for r in rows:
            try:
                ts = parse_csv_date(r["date"])
            except (KeyError, ValueError):
                continue
            def num(v):
                if v in (None, "", "NA"):
                    return None
                try:
                    return float(v)
                except ValueError:
                    return None
            records.append((
                r["device"],
                ts,
                num(r.get("dissolved_oxygen")),
                num(r.get("orp")),
                num(r.get("ph")),
                num(r.get("conductivity")),
                num(r.get("temperature")),
            ))

        cur.executemany(
            "INSERT INTO sensor_data "
            "(device, measured_at, dissolved_oxygen, orp, ph, conductivity, temperature) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s) "
            "ON CONFLICT (device, measured_at) DO NOTHING",
            records,
        )
        conn.commit()

        cur.execute("SELECT COUNT(*) FROM sensor_data")
        after = cur.fetchone()[0]

    return before, after, units


def main() -> int:
    if not os.environ.get("FIREWORKS_API_KEY"):
        print("ERROR: FIREWORKS_API_KEY not set. Copy .env.example to .env and fill it in.", file=sys.stderr)
        return 1
    if not os.environ.get("DATABASE_URL"):
        print("ERROR: DATABASE_URL not set.", file=sys.stderr)
        return 1

    embedding_model = os.environ.get("EMBEDDING_MODEL", "nomic-ai/nomic-embed-text-v1.5")

    conn = get_db()
    try:
        client = get_client()
        n_chunks = ingest_documents(conn, client, embedding_model)
        print(f"[seed] inserted {n_chunks} new chunks.")
        ensure_chunk_index(conn)

        csv_candidates = sorted(DATA_DIR.glob("*.csv"))
        if not csv_candidates:
            print("[seed] no CSV files in data/; skipping sensor ingest.")
        else:
            csv_path = csv_candidates[0]
            before, after, units = ingest_csv(conn, csv_path)
            print(f"[seed] sensor_data rows: {before} → {after} (added {after - before}).")
    finally:
        conn.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
