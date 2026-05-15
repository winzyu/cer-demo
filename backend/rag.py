"""Retrieval pipeline: embed query, fetch top-k chunks via pgvector.

Thin glue between llm.embed_query and tools.search_documents.
"""
from __future__ import annotations

import psycopg
from openai import OpenAI

from backend.llm import embed_query
from backend.tools import search_documents


def retrieve(conn: psycopg.Connection, client: OpenAI, query: str, top_k: int = 5) -> list[dict]:
    return search_documents(conn, embed_fn=lambda q: embed_query(client, q), query=query, top_k=top_k)
