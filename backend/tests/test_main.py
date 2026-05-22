"""Tests for backend/main.py.

The LLM client is mocked per CLAUDE.md: 'Don't write tests that hit the live
Fireworks API. Mock the LLM client.' The Postgres DB is real (seeded chunks +
sensor data) so the orchestration loop's tool dispatch runs against actual data.
"""
from __future__ import annotations

import json
import os
from types import SimpleNamespace

import pytest
from dotenv import load_dotenv
from fastapi.testclient import TestClient

import backend.main as main_mod
from backend.main import app, build_system_prompt, conductivity_range_text, run_chat

load_dotenv()


# ---------- helpers to build canned LLM responses ----------

def msg(content: str | None = None, tool_calls: list[dict] | None = None):
    """Build a fake OpenAI-style response message."""
    tcs = None
    if tool_calls:
        tcs = [
            SimpleNamespace(
                id=tc["id"],
                function=SimpleNamespace(name=tc["name"], arguments=json.dumps(tc["args"])),
            )
            for tc in tool_calls
        ]
    return SimpleNamespace(content=content, tool_calls=tcs)


def fake_client_returning(*responses, embed_vec: list[float] | None = None):
    """Build a fake OpenAI client.

    chat.completions.create yields the canned `responses` in turn.
    embeddings.create returns `embed_vec` (or a uniform non-zero vector) for every input.
    """
    iterator = iter(responses)
    vec = embed_vec or ([0.0362] * 768)  # any 768-dim non-zero vector works for retrieval

    def create_chat(**kwargs):
        m = next(iterator)
        return SimpleNamespace(choices=[SimpleNamespace(message=m)])

    def create_embed(**kwargs):
        n = len(kwargs.get("input", [""])) or 1
        return SimpleNamespace(data=[SimpleNamespace(embedding=vec) for _ in range(n)])

    return SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=create_chat)),
        embeddings=SimpleNamespace(create=create_embed),
    )


# ---------- system prompt builder ----------

def test_system_prompt_includes_operator_ranges():
    p = build_system_prompt()
    assert "pH: 6.5 to 8.5" in p
    assert "Dissolved oxygen: 5 to 14 mg/L" in p
    assert "ORP: 200 to 400 mV" in p


def test_conductivity_range_freshwater_vs_saltwater():
    assert conductivity_range_text("freshwater") == "0 to 1,500"
    assert conductivity_range_text("saltwater") == "40,000 to 50,000"


def test_system_prompt_includes_in_scope_refusal_contract():
    """The model must be told (a) what counts as in-scope, and (b) the exact
    refusal line to emit when a question is out of scope or tools return
    nothing useful. Regression guard for README §13 acceptance test #6."""
    p = build_system_prompt()
    assert "IN-SCOPE" in p
    assert "I can only answer questions grounded in this sensor's readings" in p
    assert "Never use general world knowledge to fill gaps" in p


# ---------- orchestration loop ----------

@pytest.fixture
def conn():
    from backend.main import db_connection
    with db_connection() as c:
        yield c


def test_run_chat_no_tools(conn):
    client = fake_client_returning(msg(content="Hello, water!"))
    out = run_chat(client, conn, "hi", history=[])
    assert out.response == "Hello, water!"
    assert out.tool_calls == []
    assert out.citations == []


def test_run_chat_sensor_tool(conn):
    client = fake_client_returning(
        msg(tool_calls=[{
            "id": "t1",
            "name": "query_sensor_data",
            "args": {"metric": "ph", "time_range": "last 60 days", "aggregation": "mean"},
        }]),
        msg(content="Your mean pH was 7.5."),
    )
    out = run_chat(client, conn, "mean ph?", history=[])
    assert out.response == "Your mean pH was 7.5."
    assert len(out.tool_calls) == 1
    assert out.tool_calls[0].name == "query_sensor_data"
    assert "value" in out.tool_calls[0].result or "error" in out.tool_calls[0].result
    assert out.citations == []  # sensor tool produces no citations


def test_run_chat_search_tool_populates_citations(conn):
    client = fake_client_returning(
        msg(tool_calls=[{
            "id": "t1",
            "name": "search_documents",
            "args": {"query": "dissolved oxygen criteria", "top_k": 3},
        }]),
        msg(content="DO criteria are 5 mg/L per the 1986 EPA doc."),
    )
    out = run_chat(client, conn, "what is the DO criterion?", history=[])
    assert out.response.startswith("DO")
    assert len(out.tool_calls) == 1
    assert out.tool_calls[0].name == "search_documents"
    assert len(out.citations) > 0
    assert all(c.document_title and c.filename and c.chunk_excerpt for c in out.citations)


def test_run_chat_round_cap_honored(conn):
    """Model that keeps requesting tools should be cut off and forced to answer."""
    # Send MAX_TOOL_ROUNDS + 1 responses; all but the last include tool_calls.
    keep_calling = [
        msg(tool_calls=[{"id": f"t{i}", "name": "query_sensor_data",
                         "args": {"metric": "ph", "time_range": "last 60 days", "aggregation": "mean"}}])
        for i in range(main_mod.MAX_TOOL_ROUNDS)
    ]
    final = msg(content="Forced answer after cap.")
    client = fake_client_returning(*keep_calling, final)
    out = run_chat(client, conn, "loop?", history=[])
    assert out.response == "Forced answer after cap."
    assert len(out.tool_calls) == main_mod.MAX_TOOL_ROUNDS


def test_run_chat_handles_bad_json_args(conn):
    """Malformed tool arguments shouldn't crash the loop — the tool sees {} and the
    error dict (or empty result) flows back to the LLM."""
    iterator = iter([
        SimpleNamespace(content=None, tool_calls=[SimpleNamespace(
            id="t1",
            function=SimpleNamespace(name="query_sensor_data", arguments="not-json"),
        )]),
        msg(content="couldn't read your request"),
    ])

    def create(**kwargs):
        m = next(iterator)
        return SimpleNamespace(choices=[SimpleNamespace(message=m)])

    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    out = run_chat(client, conn, "anything", history=[])
    assert out.response == "couldn't read your request"
    assert out.tool_calls[0].arguments == {}


# ---------- FastAPI ----------

def test_health_returns_db_and_model():
    with TestClient(app) as c:
        r = c.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["db_ok"] is True
    assert body["fireworks_configured"] is True
    assert "gpt-oss-20b" in body["model"]
    assert body["water_type"] == "freshwater"


def test_chat_empty_message_returns_400():
    with TestClient(app) as c:
        r = c.post("/chat", json={"message": "   ", "history": []})
    assert r.status_code == 400
