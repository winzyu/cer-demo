"""FastAPI app: POST /chat with tool-calling orchestration loop, GET /health."""
from __future__ import annotations

import json
import os
from contextlib import contextmanager
from typing import Any

import psycopg
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pgvector.psycopg import register_vector
from pydantic import BaseModel, Field

from backend.llm import embed_query, get_client
from backend.tools import query_sensor_data, search_documents

load_dotenv()

MAX_TOOL_ROUNDS = 5


# ---------- request / response models ----------

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = Field(default_factory=list)


class Citation(BaseModel):
    document_title: str
    filename: str
    chunk_excerpt: str


class ToolCallTrace(BaseModel):
    name: str
    arguments: dict
    result: Any


class ChatResponse(BaseModel):
    response: str
    citations: list[Citation]
    tool_calls: list[ToolCallTrace]


# ---------- tool schemas exposed to the LLM ----------

TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "query_sensor_data",
            "description": (
                "Get a statistic from the local sensor database for one of the metrics this device measures. "
                "Use for any question about the user's actual water readings."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "metric": {
                        "type": "string",
                        "enum": ["dissolved_oxygen", "orp", "ph", "conductivity", "temperature"],
                    },
                    "time_range": {
                        "type": "string",
                        "description": (
                            "Natural-language time range. Accepted forms: 'last N days', 'last N weeks', "
                            "'last day', 'last week', 'today', 'yesterday', 'this week', "
                            "'YYYY-MM-DD to YYYY-MM-DD', 'YYYY-MM-DD' (single day). 'Now' resolves to the "
                            "latest sensor reading in the database."
                        ),
                    },
                    "aggregation": {
                        "type": "string",
                        "enum": ["min", "max", "mean", "median", "latest", "raw"],
                        "description": "'latest' = most recent reading; 'raw' = capped list of readings.",
                    },
                },
                "required": ["metric", "time_range", "aggregation"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_documents",
            "description": (
                "Semantic search over the corpus of authoritative water-quality documents "
                "(EPA, USGS). Use for questions about what a metric means, how it's measured, "
                "regulatory context, or interpretive guidance. Do NOT use this to look up the "
                "normal range for a metric — those are in the system prompt."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Natural-language search query."},
                    "top_k": {"type": "integer", "default": 5, "minimum": 1, "maximum": 10},
                },
                "required": ["query"],
            },
        },
    },
]


# ---------- system prompt builder ----------

def conductivity_range_text(water_type: str) -> str:
    if water_type == "saltwater":
        return "40,000 to 50,000"
    return "0 to 1,500"  # freshwater default


def build_system_prompt() -> str:
    water_type = os.environ.get("WATER_TYPE", "freshwater")
    return f"""You are a water-quality assistant for a single sensor deployment. You answer
questions about the sensor's readings and about authoritative water-quality
documents.

AUTHORITATIVE NORMAL RANGES (operator-provided, take precedence over documents):
- pH: 6.5 to 8.5
- ORP: 200 to 400 mV
- Dissolved oxygen: 5 to 14 mg/L
- Temperature: 32 to 95 °F
- Conductivity (this deployment is {water_type}): {conductivity_range_text(water_type)} µS/cm

You have two tools:
- query_sensor_data: get statistics from the local sensor database
- search_documents: search regulatory and interpretive documents

Rules:
- For questions about the user's actual water, call query_sensor_data.
- For questions about thresholds, normal ranges, or what a metric means:
  - If the question is about whether a reading is normal, use the
    AUTHORITATIVE NORMAL RANGES above. Do not retrieve a document for this.
  - For everything else (what a metric means, why it matters, how it's
    measured, regulatory context), call search_documents.
- For questions that mix both ("is my pH normal?"), call query_sensor_data
  for the reading and compare against the AUTHORITATIVE NORMAL RANGES.
- If a retrieved document chunk disagrees with the AUTHORITATIVE NORMAL
  RANGES, prefer the operator-provided ranges and note the discrepancy
  if it's relevant to the user's question.
- Always cite the document filename when you use information from a document.
- The sensor measures dissolved oxygen, ORP, pH, conductivity, and temperature.
  It does NOT measure pathogens, bacteria, chemicals, or turbidity. If asked
  whether water is safe to swim in or drink, say plainly that the sensor cannot
  answer that and the user should consult local public-health authorities.
- IN-SCOPE topics are ONLY: this sensor's readings (dissolved oxygen, ORP,
  pH, conductivity, temperature) and content returned by search_documents
  over the loaded corpus. The AUTHORITATIVE NORMAL RANGES above are also
  in-scope.
- If a question is outside that scope, or if your tool calls return no
  useful data (search_documents returns nothing relevant, or
  query_sensor_data returns an error or empty result), DO NOT answer from
  prior knowledge. Respond with exactly:
    "I can only answer questions grounded in this sensor's readings or
    the loaded water-quality documents, and I don't have enough
    information to answer that."
  Then add one short sentence describing what was missing.
- Never use general world knowledge to fill gaps. If the tools do not
  support the answer, refuse using the line above.
- Do not fabricate readings or citations.
- Keep answers short and direct. Cite specific numbers from the data."""


# ---------- DB connection ----------

@contextmanager
def db_connection():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    register_vector(conn)
    try:
        yield conn
    finally:
        conn.close()


# ---------- tool dispatch ----------

def execute_tool(name: str, args: dict, conn: psycopg.Connection, client: OpenAI) -> Any:
    if name == "query_sensor_data":
        return query_sensor_data(
            conn,
            metric=args.get("metric", ""),
            time_range=args.get("time_range", ""),
            aggregation=args.get("aggregation", ""),
        )
    if name == "search_documents":
        return search_documents(
            conn,
            embed_fn=lambda q: embed_query(client, q),
            query=args.get("query", ""),
            top_k=int(args.get("top_k", 5)),
        )
    return {"error": f"unknown tool '{name}'"}


# ---------- orchestration loop ----------

def run_chat(client: OpenAI, conn: psycopg.Connection, user_message: str, history: list[ChatMessage]) -> ChatResponse:
    model = os.environ["LLM_MODEL"]

    messages: list[dict] = [{"role": "system", "content": build_system_prompt()}]
    for h in history:
        messages.append({"role": h.role, "content": h.content})
    messages.append({"role": "user", "content": user_message})

    tool_traces: list[ToolCallTrace] = []
    citations: list[Citation] = []

    for round_n in range(1, MAX_TOOL_ROUNDS + 2):
        use_tools = round_n <= MAX_TOOL_ROUNDS
        kwargs = {"model": model, "messages": messages, "max_tokens": 800}
        if use_tools:
            kwargs["tools"] = TOOL_SCHEMAS
        resp = client.chat.completions.create(**kwargs)
        msg = resp.choices[0].message

        # Append the assistant message to history in OpenAI's expected shape.
        assistant_entry: dict = {"role": "assistant", "content": msg.content or ""}
        if msg.tool_calls:
            assistant_entry["tool_calls"] = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                }
                for tc in msg.tool_calls
            ]
        messages.append(assistant_entry)

        if not msg.tool_calls:
            return ChatResponse(
                response=msg.content or "",
                citations=citations,
                tool_calls=tool_traces,
            )

        # Execute each tool call and append the results before re-calling.
        for tc in msg.tool_calls:
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}
            result = execute_tool(tc.function.name, args, conn, client)
            tool_traces.append(ToolCallTrace(name=tc.function.name, arguments=args, result=result))
            if tc.function.name == "search_documents" and isinstance(result, list):
                for r in result:
                    citations.append(Citation(
                        document_title=r["document_title"],
                        filename=r["document_filename"],
                        chunk_excerpt=(r["content"][:300] + ("..." if len(r["content"]) > 300 else "")),
                    ))
            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": json.dumps(result, default=str),
            })

    # Round cap exceeded — the for-loop ran MAX_TOOL_ROUNDS + 1 times without the model
    # producing a final answer. Return whatever last message we have.
    last_assistant = next(
        (m for m in reversed(messages) if m.get("role") == "assistant"),
        None,
    )
    final_text = (last_assistant or {}).get("content") or (
        f"(Tool-call cap of {MAX_TOOL_ROUNDS} rounds reached without a final answer.)"
    )
    return ChatResponse(response=final_text, citations=citations, tool_calls=tool_traces)


# ---------- FastAPI app ----------

app = FastAPI(title="Clean Earth RAG")

# Frontend is a static index.html opened from disk or served separately; allow it to call us.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    db_ok = False
    db_err = None
    try:
        with db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
        db_ok = True
    except Exception as e:
        db_err = str(e)

    fireworks_configured = bool(os.environ.get("FIREWORKS_API_KEY"))
    return {
        "db_ok": db_ok,
        "db_error": db_err,
        "fireworks_configured": fireworks_configured,
        "model": os.environ.get("LLM_MODEL", ""),
        "water_type": os.environ.get("WATER_TYPE", "freshwater"),
    }


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest) -> ChatResponse:
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="message is empty")
    client = get_client()
    with db_connection() as conn:
        return run_chat(client, conn, req.message, req.history)
