#!/usr/bin/env python3
"""
Phase 4: merges the per-category answer batches (drafted from real sampled
queries in data/eval/candidate_queries.json, against the actual approved
chunk text in data/eval/approved_chunks_by_category.json — see
scripts/sample_eval_queries.py for how the candidates were selected) into
the final golden set kb_admin/eval loads at eval-run time.

Items where a drafting pass couldn't confidently classify or answer a
query (expect_decline=false but no expected_key_facts were actually
drafted) are excluded here and written to data/eval/needs_retriage.json
instead of being silently dropped or force-answered without real
grounding.

Every item is stamped sme_reviewed=false: this is a CANDIDATE golden set,
built by drafting answers against real approved source content for real
sampled user queries -- it still needs an office SME to review/correct
before results from it should be treated as authoritative. Eval runs can
use it as-is in the meantime (a reviewed-in-progress set beats no set),
and the scorecard reports the reviewed fraction alongside every score for
exactly that reason.

Usage:
    python scripts/build_golden_set.py
"""

import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BATCH_DIR = REPO_ROOT / "data" / "eval" / "batches"
GOLDEN_SET_PATH = REPO_ROOT / "data" / "eval" / "golden_qa.json"
RETRIAGE_PATH = REPO_ROOT / "data" / "eval" / "needs_retriage.json"


def main() -> None:
    answer_files = sorted(BATCH_DIR.glob("*_answers.json"))
    if not answer_files:
        raise SystemExit(f"no *_answers.json files found under {BATCH_DIR}")

    all_items = []
    for path in answer_files:
        with open(path, encoding="utf-8") as f:
            items = json.load(f)
        print(f"{path.name}: {len(items)} items")
        all_items.extend(items)

    required_keys = {
        "id", "query", "category", "expect_decline", "decline_reason",
        "expected_key_facts", "reference_chunk_ids", "reference_source_ids",
    }
    malformed = [item for item in all_items if not required_keys.issubset(item.keys())]
    if malformed:
        raise SystemExit(f"{len(malformed)} item(s) missing required keys — fix the batch files first")

    needs_retriage = [item for item in all_items if not item["expect_decline"] and not item["expected_key_facts"]]
    usable = [item for item in all_items if item not in needs_retriage]

    for item in usable:
        item["sme_reviewed"] = False

    GOLDEN_SET_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(GOLDEN_SET_PATH, "w", encoding="utf-8") as f:
        json.dump(usable, f, indent=1, ensure_ascii=False)
    with open(RETRIAGE_PATH, "w", encoding="utf-8") as f:
        json.dump(needs_retriage, f, indent=1, ensure_ascii=False)

    print(f"\n{len(usable)} usable items -> {GOLDEN_SET_PATH}")
    print(f"{len(needs_retriage)} item(s) need re-triage -> {RETRIAGE_PATH}")

    decline_count = sum(1 for item in usable if item["expect_decline"])
    print(f"of the usable set: {len(usable) - decline_count} answerable, {decline_count} expect-decline")


if __name__ == "__main__":
    main()
