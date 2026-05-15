"""Tools the LLM can call: query_sensor_data, search_documents.

Per README §8. Both functions take a psycopg connection so the caller controls
its lifetime. `search_documents` takes the embedding function as a parameter so
tests can mock it.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Callable, Literal

import psycopg

METRIC_COLS = {
    "dissolved_oxygen": "dissolved_oxygen",
    "orp": "orp",
    "ph": "ph",
    "conductivity": "conductivity",
    "temperature": "temperature",
}

# Units returned by query_sensor_data. Match the CSV / operator-provided ranges in README §7.
UNITS = {
    "dissolved_oxygen": "mg/L",
    "orp": "mV",
    "ph": "unitless",
    "conductivity": "µS/cm",
    "temperature": "°F",
}

VALID_AGGREGATIONS = {"min", "max", "mean", "median", "latest", "raw"}
RAW_LIMIT = 200  # cap rows returned by aggregation="raw" so we don't blow up the prompt


@dataclass
class TimeRange:
    start: datetime
    end: datetime


def get_reference_time(conn: psycopg.Connection) -> datetime:
    """The 'now' used to resolve relative time ranges.

    Returns max(measured_at) so phrases like 'last 7 days' resolve relative to the
    latest sensor reading. The CSV is a historical snapshot; using wall-clock 'now'
    would resolve every relative range to an empty interval.
    """
    with conn.cursor() as cur:
        cur.execute("SELECT MAX(measured_at) FROM sensor_data")
        row = cur.fetchone()
    if row is None or row[0] is None:
        return datetime.now(tz=timezone.utc)
    return row[0]


def parse_time_range(spec: str, reference: datetime) -> TimeRange | None:
    """Parse a natural-language time range. Returns None on failure.

    Supported:
      - "last N days"   / "last N weeks"   / "last day" / "last week"
      - "today" / "yesterday" / "this week"
      - "YYYY-MM-DD to YYYY-MM-DD"
      - "YYYY-MM-DD" (single day)
    """
    s = spec.strip().lower()

    m = re.fullmatch(r"last\s+(?:(\d+)\s+)?(day|days|week|weeks)", s)
    if m:
        n = int(m.group(1)) if m.group(1) else 1
        unit = m.group(2)
        delta = timedelta(days=n) if unit.startswith("day") else timedelta(weeks=n)
        return TimeRange(reference - delta, reference)

    if s == "today":
        start = reference.replace(hour=0, minute=0, second=0, microsecond=0)
        return TimeRange(start, reference)

    if s == "yesterday":
        end = reference.replace(hour=0, minute=0, second=0, microsecond=0)
        start = end - timedelta(days=1)
        return TimeRange(start, end)

    if s == "this week":
        # ISO weeks start Monday. Step back to the Monday of `reference`.
        start = reference.replace(hour=0, minute=0, second=0, microsecond=0)
        start = start - timedelta(days=reference.weekday())
        return TimeRange(start, reference)

    m = re.fullmatch(r"(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})", s)
    if m:
        try:
            start = datetime.fromisoformat(m.group(1)).replace(tzinfo=timezone.utc)
            end = datetime.fromisoformat(m.group(2)).replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
            return TimeRange(start, end)
        except ValueError:
            return None

    m = re.fullmatch(r"\d{4}-\d{2}-\d{2}", s)
    if m:
        try:
            day = datetime.fromisoformat(s).replace(tzinfo=timezone.utc)
            end = day.replace(hour=23, minute=59, second=59)
            return TimeRange(day, end)
        except ValueError:
            return None

    return None


def query_sensor_data(
    conn: psycopg.Connection,
    metric: str,
    time_range: str,
    aggregation: str,
) -> dict:
    """Per README §8. Returns a dict; on error returns {'error': '...'} so the LLM can recover."""
    if metric not in METRIC_COLS:
        return {"error": f"unknown metric '{metric}'. Allowed: {sorted(METRIC_COLS)}"}
    if aggregation not in VALID_AGGREGATIONS:
        return {"error": f"unknown aggregation '{aggregation}'. Allowed: {sorted(VALID_AGGREGATIONS)}"}

    ref = get_reference_time(conn)
    tr = parse_time_range(time_range, ref)
    if tr is None:
        return {
            "error": (
                f"could not parse time_range {time_range!r}. "
                "Try: 'last 7 days', 'this week', 'today', 'YYYY-MM-DD to YYYY-MM-DD'."
            )
        }

    col = METRIC_COLS[metric]
    unit = UNITS[metric]
    resolved = {"start": tr.start.isoformat(), "end": tr.end.isoformat()}

    with conn.cursor() as cur:
        if aggregation == "raw":
            cur.execute(
                f"SELECT measured_at, {col} FROM sensor_data "
                f"WHERE measured_at BETWEEN %s AND %s AND {col} IS NOT NULL "
                f"ORDER BY measured_at LIMIT %s",
                (tr.start, tr.end, RAW_LIMIT),
            )
            rows = cur.fetchall()
            return {
                "metric": metric,
                "time_range_resolved": resolved,
                "aggregation": aggregation,
                "value": [{"measured_at": t.isoformat(), "value": float(v)} for t, v in rows],
                "unit": unit,
                "n_samples": len(rows),
            }

        if aggregation == "latest":
            cur.execute(
                f"SELECT measured_at, {col} FROM sensor_data "
                f"WHERE measured_at BETWEEN %s AND %s AND {col} IS NOT NULL "
                f"ORDER BY measured_at DESC LIMIT 1",
                (tr.start, tr.end),
            )
            row = cur.fetchone()
            if row is None:
                return {
                    "metric": metric,
                    "time_range_resolved": resolved,
                    "aggregation": aggregation,
                    "value": None,
                    "unit": unit,
                    "n_samples": 0,
                }
            cur.execute(
                f"SELECT COUNT(*) FROM sensor_data "
                f"WHERE measured_at BETWEEN %s AND %s AND {col} IS NOT NULL",
                (tr.start, tr.end),
            )
            n = cur.fetchone()[0]
            return {
                "metric": metric,
                "time_range_resolved": resolved,
                "aggregation": aggregation,
                "value": {"measured_at": row[0].isoformat(), "value": float(row[1])},
                "unit": unit,
                "n_samples": n,
            }

        agg_sql = {
            "min": "MIN",
            "max": "MAX",
            "mean": "AVG",
            "median": "PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY",
        }[aggregation]
        if aggregation == "median":
            query = (
                f"SELECT {agg_sql} {col}), COUNT({col}) FROM sensor_data "
                f"WHERE measured_at BETWEEN %s AND %s"
            )
        else:
            query = (
                f"SELECT {agg_sql}({col}), COUNT({col}) FROM sensor_data "
                f"WHERE measured_at BETWEEN %s AND %s"
            )
        cur.execute(query, (tr.start, tr.end))
        val, n = cur.fetchone()

    return {
        "metric": metric,
        "time_range_resolved": resolved,
        "aggregation": aggregation,
        "value": float(val) if val is not None else None,
        "unit": unit,
        "n_samples": int(n),
    }


HYBRID_FETCH = 20   # how many to pull from each side before fusing
RRF_K = 60          # reciprocal-rank-fusion constant (the standard default)


def _rrf_merge(dense: list[dict], bm25: list[dict], top_k: int) -> list[dict]:
    """Reciprocal Rank Fusion. Score = sum over rankers of 1/(k + rank)."""
    fused: dict[int, dict] = {}
    for rank, row in enumerate(dense):
        cid = row["chunk_id"]
        fused.setdefault(cid, {**row, "rrf_score": 0.0})["rrf_score"] += 1.0 / (RRF_K + rank + 1)
    for rank, row in enumerate(bm25):
        cid = row["chunk_id"]
        fused.setdefault(cid, {**row, "rrf_score": 0.0})["rrf_score"] += 1.0 / (RRF_K + rank + 1)
    out = sorted(fused.values(), key=lambda r: r["rrf_score"], reverse=True)[:top_k]
    # Expose the fused score as `score` and drop the internal field.
    for r in out:
        r["score"] = r.pop("rrf_score")
    return out


def search_documents(
    conn: psycopg.Connection,
    embed_fn: Callable[[str], list[float]],
    query: str,
    top_k: int = 5,
) -> list[dict]:
    """Per README §8. Hybrid retrieval: dense (pgvector cosine) + BM25-ish (Postgres
    full-text `ts_rank_cd`) merged via reciprocal rank fusion. Dense catches paraphrase;
    BM25 catches acronyms and exact tokens (e.g. 'ORP') that dense underweights.

    `embed_fn` returns the embedding for a single query string; the caller is responsible
    for any task-prefixing nomic expects.

    Returns a list of {chunk_id, document_filename, document_title, content, score}.
    """
    if not query.strip():
        return []
    if top_k <= 0:
        return []

    vec = embed_fn(query)
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT c.id, d.filename, d.title, c.content
            FROM chunks c
            JOIN documents d ON d.id = c.document_id
            ORDER BY c.embedding <=> %s::vector
            LIMIT %s
            """,
            (vec, HYBRID_FETCH),
        )
        dense_rows = cur.fetchall()

        # BM25-ish via Postgres FTS. websearch_to_tsquery accepts free-text queries
        # (handles quotes, OR, -negation) without throwing on unparseable input.
        cur.execute(
            """
            SELECT c.id, d.filename, d.title, c.content
            FROM chunks c
            JOIN documents d ON d.id = c.document_id
            WHERE c.content_tsv @@ websearch_to_tsquery('english', %s)
            ORDER BY ts_rank_cd(c.content_tsv, websearch_to_tsquery('english', %s)) DESC
            LIMIT %s
            """,
            (query, query, HYBRID_FETCH),
        )
        bm25_rows = cur.fetchall()

    def _shape(rows):
        return [
            {"chunk_id": cid, "document_filename": fn, "document_title": title, "content": content}
            for cid, fn, title, content in rows
        ]

    return _rrf_merge(_shape(dense_rows), _shape(bm25_rows), top_k)
