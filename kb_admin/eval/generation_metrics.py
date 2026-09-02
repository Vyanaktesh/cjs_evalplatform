"""
Phase 4: generation-quality metrics — faithfulness, answer relevancy,
context recall, citation accuracy — via the external judge in
kb_admin/eval/judge.py. Answers are generated through the EXACT same
app.generation.service.answer_question() the live chatbot uses (same
retrieval, same prompt, same backend from GENERATION_BACKEND), so this
measures the real pipeline, not a stand-in.

answer_question() doesn't return the actual retrieved chunk text (only
citation metadata) — deliberately not changing that public return shape
just for eval instrumentation, since the live /chat and /generate
endpoints depend on it staying as-is. Instead this calls
app.retrieval.retriever.search() separately with the same
no-history query to get chunk text for the judge; answer_question()
re-runs the identical search internally. A doubled retrieval call per
golden item is a fine trade for an offline, infrequently-run eval script.
"""

from typing import Any, Optional

from app.generation.service import answer_question
from app.retrieval.retriever import search as retrieval_search

from kb_admin.eval.judge import score_answer


def run_generation_eval(golden_items: list[dict[str, Any]], *, limit_per_query: int = 6) -> dict[str, Any]:
    per_item = []
    errors = []

    for item in golden_items:
        result = answer_question(item["query"], limit=limit_per_query)
        retrieved_chunks = retrieval_search(item["query"], limit=limit_per_query)
        try:
            judged = score_answer(
                item["query"],
                item.get("expected_key_facts") or [],
                retrieved_chunks,
                result["answer"],
            )
        except Exception as exc:
            errors.append({"id": item["id"], "error": str(exc)})
            continue
        per_item.append(
            {
                "id": item["id"],
                "query": item["query"],
                "category": item["category"],
                "expect_decline": item.get("expect_decline", False),
                "answer": result["answer"],
                "retrieved_count": result.get("retrieved_count", 0),
                **judged,
            }
        )

    def _aggregate(items: list[dict[str, Any]]) -> dict[str, float]:
        if not items:
            return {"faithfulness": 0.0, "answer_relevancy": 0.0, "context_recall": 0.0, "citation_accuracy": 0.0, "n": 0}
        n = len(items)
        return {
            "faithfulness": sum(i["faithfulness"] for i in items) / n,
            "answer_relevancy": sum(i["answer_relevancy"] for i in items) / n,
            "context_recall": sum(i["context_recall"] for i in items) / n,
            "citation_accuracy": sum(i["citation_accuracy"] for i in items) / n,
            "n": n,
        }

    by_category: dict[str, list[dict[str, Any]]] = {}
    for item in per_item:
        by_category.setdefault(item["category"], []).append(item)

    return {
        "overall": _aggregate(per_item),
        "by_category": {cat: _aggregate(items) for cat, items in by_category.items()},
        "per_item": per_item,
        "errors": errors,
    }
