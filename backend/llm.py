"""Fireworks LLM client + embedding helper.

Uses the OpenAI Python SDK pointed at Fireworks' OpenAI-compatible endpoint
(per README §6). Reads FIREWORKS_API_KEY and LLM_MODEL from env.
"""
from __future__ import annotations

import os

from openai import OpenAI

FIREWORKS_BASE_URL = "https://api.fireworks.ai/inference/v1"


def get_client() -> OpenAI:
    api_key = os.environ.get("FIREWORKS_API_KEY")
    if not api_key:
        raise RuntimeError("FIREWORKS_API_KEY not set")
    return OpenAI(base_url=FIREWORKS_BASE_URL, api_key=api_key)


def embed_query(client: OpenAI, text: str) -> list[float]:
    """Embed a query. Uses the 'search_query:' task prefix that nomic-embed-text-v1.5
    expects (the document side uses 'search_document:'; see seed.embed_batch)."""
    model = os.environ.get("EMBEDDING_MODEL", "nomic-ai/nomic-embed-text-v1.5")
    resp = client.embeddings.create(model=model, input=[f"search_query: {text}"])
    return resp.data[0].embedding
