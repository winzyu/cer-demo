"""Tests for backend/tools.py.

The parser tests are pure. The DB tests use the live Postgres seeded by `backend.seed`
(per CLAUDE.md: tests may hit the DB; only mock the LLM client). search_documents takes
embed_fn as a parameter so we mock it.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

import psycopg
import pytest
from dotenv import load_dotenv
from pgvector.psycopg import register_vector

from backend.tools import (
    TimeRange,
    parse_time_range,
    query_sensor_data,
    search_documents,
)

load_dotenv()


REF = datetime(2026, 5, 7, 12, 0, tzinfo=timezone.utc)


# ---------- parse_time_range (pure) ----------

def test_parse_last_n_days():
    tr = parse_time_range("last 7 days", REF)
    assert tr is not None
    assert tr.end == REF
    assert tr.start == REF - timedelta(days=7)


def test_parse_last_day_singular():
    tr = parse_time_range("last day", REF)
    assert tr is not None
    assert tr.start == REF - timedelta(days=1)


def test_parse_last_n_weeks():
    tr = parse_time_range("last 2 weeks", REF)
    assert tr is not None
    assert tr.start == REF - timedelta(weeks=2)


def test_parse_today():
    tr = parse_time_range("today", REF)
    assert tr is not None
    assert tr.start == REF.replace(hour=0, minute=0, second=0, microsecond=0)
    assert tr.end == REF


def test_parse_this_week():
    # REF is Thursday 2026-05-07 (weekday=3). Monday is 2026-05-04.
    tr = parse_time_range("this week", REF)
    assert tr is not None
    assert tr.start.date() == datetime(2026, 5, 4).date()


def test_parse_iso_range():
    tr = parse_time_range("2026-04-01 to 2026-04-15", REF)
    assert tr is not None
    assert tr.start.date() == datetime(2026, 4, 1).date()
    assert tr.end.date() == datetime(2026, 4, 15).date()


def test_parse_single_iso_date():
    tr = parse_time_range("2026-05-01", REF)
    assert tr is not None
    assert tr.start.date() == datetime(2026, 5, 1).date()
    assert tr.end.date() == datetime(2026, 5, 1).date()


def test_parse_garbage_returns_none():
    assert parse_time_range("sometime last summer", REF) is None
    assert parse_time_range("", REF) is None


# ---------- DB-backed tests ----------

@pytest.fixture(scope="module")
def conn():
    c = psycopg.connect(os.environ["DATABASE_URL"])
    register_vector(c)
    yield c
    c.close()


def test_query_unknown_metric_returns_error(conn):
    out = query_sensor_data(conn, metric="turbidity", time_range="last 7 days", aggregation="mean")
    assert "error" in out


def test_query_unknown_aggregation_returns_error(conn):
    out = query_sensor_data(conn, metric="ph", time_range="last 7 days", aggregation="stddev")
    assert "error" in out


def test_query_bad_time_range_returns_error(conn):
    out = query_sensor_data(conn, metric="ph", time_range="whenever", aggregation="mean")
    assert "error" in out


def test_query_mean_over_full_range_has_samples(conn):
    out = query_sensor_data(conn, metric="ph", time_range="last 60 days", aggregation="mean")
    assert "error" not in out
    assert out["metric"] == "ph"
    assert out["unit"] == "unitless"
    assert out["n_samples"] > 0
    assert isinstance(out["value"], float)


def test_query_latest_returns_most_recent(conn):
    out = query_sensor_data(conn, metric="dissolved_oxygen", time_range="last 60 days", aggregation="latest")
    assert "error" not in out
    assert out["n_samples"] > 0
    assert isinstance(out["value"], dict)
    assert "measured_at" in out["value"] and "value" in out["value"]


def test_query_raw_capped_and_ordered(conn):
    out = query_sensor_data(conn, metric="temperature", time_range="last 60 days", aggregation="raw")
    assert "error" not in out
    assert isinstance(out["value"], list)
    assert len(out["value"]) <= 200
    times = [v["measured_at"] for v in out["value"]]
    assert times == sorted(times)


def test_query_min_max_median_succeed(conn):
    for agg in ("min", "max", "median"):
        out = query_sensor_data(conn, metric="conductivity", time_range="last 60 days", aggregation=agg)
        assert "error" not in out, f"{agg} failed: {out}"
        assert out["n_samples"] > 0
        assert isinstance(out["value"], float)


def test_search_documents_dense_arm_finds_target(conn):
    """If embed_fn returns a chunk's exact embedding and the query word doesn't appear
    in any chunk (so BM25 returns nothing), the dense arm alone should put that chunk
    at rank 1 in the fused results."""
    with conn.cursor() as cur:
        cur.execute("SELECT id, embedding FROM chunks LIMIT 1")
        target_id, target_vec = cur.fetchone()
    results = search_documents(
        conn, embed_fn=lambda q: target_vec.tolist(),
        query="zzzqqqimprobableunusedtoken", top_k=3,
    )
    assert len(results) >= 1
    assert results[0]["chunk_id"] == target_id
    assert results[0]["score"] > 0  # RRF score


def test_search_documents_bm25_arm_catches_acronyms(conn):
    """BM25 should surface chunks containing the exact term 'ORP' even when the
    embed_fn returns a vector unrelated to ORP."""
    results = search_documents(
        conn, embed_fn=lambda q: [0.0362] * 768,
        query="ORP", top_k=5,
    )
    assert results, "expected at least one result"
    # At least one result should be from a doc that actually mentions ORP (the USGS
    # multiparameter chapter is the canonical one).
    filenames = {r["document_filename"] for r in results}
    assert any("tm9a6.8" in fn or "tm9a6.2" in fn for fn in filenames), (
        f"BM25 didn't surface a USGS NFM chapter for 'ORP'; got: {filenames}"
    )


def test_search_documents_empty_query(conn):
    assert search_documents(conn, embed_fn=lambda q: [0.0] * 768, query="", top_k=5) == []
