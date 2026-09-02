"""
Phase 4: retrieval metrics — no LLM involved, computed directly against the
golden set's known-correct chunk IDs.

Only meaningful for golden items where expect_decline is false (there IS a
correct chunk to find); decline items have no reference_chunk_ids by
design (see kb_admin/eval/golden_set.py) and are scored separately, at the
generation layer, on whether the bot actually declined — precision/recall
against an empty relevant-set isn't a coherent retrieval question.

Uses the exact same app.retrieval.retriever.search() the live chatbot
calls, hard-restricted to review_status='approved' the same way — so this
measures exactly what a real user's query would surface, not a
reimplementation of retrieval logic that could quietly drift from it.
"""

import math
from typing import Any, Optional

from app.embedding.bge_m3 import BgeM3Embedder
from app.retrieval.retriever import search as retrieval_search
from app.vectorstore.qdrant_store import get_qdrant_client


def _dcg(relevances: list[int]) -> float:
    return sum(rel / math.log2(i + 2) for i, rel in enumerate(relevances))


def _ndcg_at_k(retrieved_ids: list[str], relevant_ids: set[str], k: int) -> float:
    relevances = [1 if cid in relevant_ids else 0 for cid in retrieved_ids[:k]]
    dcg = _dcg(relevances)
    ideal = sorted(relevances, reverse=True)
    # ideal ordering has min(k, |relevant|) ones up front
    n_relevant_in_k = min(k, len(relevant_ids))
    ideal_relevances = [1] * n_relevant_in_k + [0] * (k - n_relevant_in_k)
    idcg = _dcg(ideal_relevances)
    return dcg / idcg if idcg > 0 else 0.0


def score_one(query_result: list[dict[str, Any]], reference_chunk_ids: list[str], k: int) -> dict[str, float]:
    retrieved_ids = [r["chunk_id"] for r in query_result[:k]]
    relevant_ids = set(reference_chunk_ids)

    hits = [cid for cid in retrieved_ids if cid in relevant_ids]
    precision = len(hits) / k if k else 0.0
    recall = len(hits) / len(relevant_ids) if relevant_ids else 0.0
    hit_rate = 1.0 if hits else 0.0

    mrr = 0.0
    for i, cid in enumerate(retrieved_ids):
        if cid in relevant_ids:
            mrr = 1.0 / (i + 1)
            break

    ndcg = _ndcg_at_k(retrieved_ids, relevant_ids, k)

    return {
        "precision_at_k": precision,
        "recall_at_k": recall,
        "hit_rate": hit_rate,
        "mrr": mrr,
        "ndcg_at_k": ndcg,
    }


def run_retrieval_eval(
    golden_items: list[dict[str, Any]],
    *,
    k: int = 8,
    embedder: Optional[BgeM3Embedder] = None,
    client=None,
) -> dict[str, Any]:
    """Runs retrieval for every answerable (non-decline) golden item and
    returns per-item scores plus aggregate + per-category averages."""
    embedder = embedder or BgeM3Embedder(batch_size=1)
    client = client or get_qdrant_client()

    answerable = [item for item in golden_items if not item.get("expect_decline")]
    per_item = []
    for item in answerable:
        results = retrieval_search(item["query"], limit=k, embedder=embedder, client=client)
        scores = score_one(results, item.get("reference_chunk_ids") or [], k)
        per_item.append({"id": item["id"], "query": item["query"], "category": item["category"], **scores})

    def _aggregate(items: list[dict[str, Any]]) -> dict[str, float]:
        if not items:
            return {"precision_at_k": 0.0, "recall_at_k": 0.0, "hit_rate": 0.0, "mrr": 0.0, "ndcg_at_k": 0.0, "n": 0}
        n = len(items)
        return {
            "precision_at_k": sum(i["precision_at_k"] for i in items) / n,
            "recall_at_k": sum(i["recall_at_k"] for i in items) / n,
            "hit_rate": sum(i["hit_rate"] for i in items) / n,
            "mrr": sum(i["mrr"] for i in items) / n,
            "ndcg_at_k": sum(i["ndcg_at_k"] for i in items) / n,
            "n": n,
        }

    by_category: dict[str, list[dict[str, Any]]] = {}
    for item in per_item:
        by_category.setdefault(item["category"], []).append(item)

    return {
        "k": k,
        "overall": _aggregate(per_item),
        "by_category": {cat: _aggregate(items) for cat, items in by_category.items()},
        "per_item": per_item,
        "skipped_decline_items": len(golden_items) - len(answerable),
    }
