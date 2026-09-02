"""
Phase 4: ties retrieval + (optional) generation metrics together into one
timestamped eval run, saved as a plain JSON file under data/eval/runs/ —
a file per run rather than a DB table, so `GET /eval/runs` can build a
trend-over-time view just by listing and reading these files back, no
migration needed for something that's purely kb_admin's own concern (the
chatbot's operational DB stays untouched by eval bookkeeping).

Generation metrics are opt-in (`include_generation=True`) because they
cost a real LLM call per item through both the live generation backend
(Gemini/Qwen) AND the external Anthropic judge — retrieval metrics alone
are free of any third-party API and safe to run anytime the DB is up.
"""

import re
from pathlib import Path
from typing import Any, Optional

from kb_admin.eval.golden_set import load_golden_set
from kb_admin.eval.generation_metrics import run_generation_eval
from kb_admin.eval.retrieval_metrics import run_retrieval_eval

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
RUNS_DIR = REPO_ROOT / "data" / "eval" / "runs"


def _safe_run_id(run_id: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9_.:-]+", run_id):
        raise ValueError(f"invalid run_id: {run_id!r}")
    return run_id


def run_eval(run_id: str, *, include_generation: bool = False, k: int = 8) -> dict[str, Any]:
    run_id = _safe_run_id(run_id)
    golden_items = load_golden_set()
    reviewed_count = sum(1 for item in golden_items if item.get("sme_reviewed"))

    result: dict[str, Any] = {
        "run_id": run_id,
        "golden_set_size": len(golden_items),
        "sme_reviewed_count": reviewed_count,
        "retrieval": run_retrieval_eval(golden_items, k=k),
    }

    if include_generation:
        result["generation"] = run_generation_eval(golden_items)

    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    import json

    with open(RUNS_DIR / f"{run_id}.json", "w", encoding="utf-8") as f:
        json.dump(result, f, indent=1, ensure_ascii=False)

    return result


def list_runs() -> list[dict[str, Any]]:
    """Summary (not full per-item detail) of every saved run, oldest first
    — what GET /eval/runs uses to show a trend line."""
    if not RUNS_DIR.exists():
        return []
    import json

    summaries = []
    for path in sorted(RUNS_DIR.glob("*.json")):
        with open(path, encoding="utf-8") as f:
            run = json.load(f)
        summary = {
            "run_id": run["run_id"],
            "golden_set_size": run["golden_set_size"],
            "sme_reviewed_count": run["sme_reviewed_count"],
            "retrieval_overall": run["retrieval"]["overall"],
        }
        if "generation" in run:
            summary["generation_overall"] = run["generation"]["overall"]
        summaries.append(summary)
    return summaries


def get_run(run_id: str) -> Optional[dict[str, Any]]:
    run_id = _safe_run_id(run_id)
    path = RUNS_DIR / f"{run_id}.json"
    if not path.exists():
        return None
    import json

    with open(path, encoding="utf-8") as f:
        return json.load(f)
