#!/usr/bin/env python3
"""
Phase 4: build a candidate golden-set question list from REAL user queries
instead of synthetic ones.

Input: tickets_queries_only.csv (46,540 real citizen queries from the
legacy live-chat/ticket channel, deduped, no PII columns). These predate
the RAG chatbot and carry no bot answers -- they're a realistic QUESTION
distribution, not Q&A pairs. This script:

  1. Filters obvious junk (too short / no alphabetic content).
  2. Classifies each query into one of the 47 sources' service_category
     values via keyword rules, or into 'known_gap' if it matches one of
     the 16 documented gap topics from
     consulate_chatbot_qa_test_pack.xlsx's "Known Gaps" sheet (things the
     bot should decline on, not fabricate an answer for).
  3. Samples a stratified candidate set: roughly proportional to each
     category's share of the 47 sources, with a floor so singleton
     categories aren't skipped entirely, preferring higher duplicate_count
     (asked more often) as a realness signal -- plus a fixed allotment of
     known_gap queries.

Output: data/eval/candidate_queries.json -- still needs expected answers /
reference chunks drafted (next script) and SME review before it's a real
golden set.

Usage:
    python scripts/sample_eval_queries.py
"""

import csv
import json
import re
from collections import defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
TICKETS_CSV = REPO_ROOT.parent / "tickets_queries_only.csv"
OUTPUT_PATH = REPO_ROOT / "data" / "eval" / "candidate_queries.json"

# Target sample size per real source category, roughly proportional to that
# category's share of the 47 sources (see kb_admin /documents overview),
# with a floor of 3 so the six singleton categories aren't skipped.
CATEGORY_TARGETS = {
    "oci": 20,
    "surrender_renunciation": 15,
    "misc_services": 10,
    "visa": 12,
    "passport_lost_damaged": 10,
    "community_events": 6,
    "status_tracking": 8,
    "registration": 5,
    "death_documents": 3,
    "police_clearance": 3,
    "attestation": 3,
    "global_entry": 3,
    "fraud_advisory": 3,
    "out_of_remit": 3,
}
KNOWN_GAP_TARGET = 25

CATEGORY_KEYWORDS = {
    "oci": [r"\boci\b", r"overseas citizen"],
    "surrender_renunciation": [r"surrender", r"renounc", r"give up.*citizenship"],
    "visa": [r"\bvisa\b"],
    "passport_lost_damaged": [r"lost passport", r"passport.*lost", r"damaged passport", r"torn passport", r"stolen passport"],
    "community_events": [r"\bevent\b", r"outreach", r"grievance", r"community"],
    "status_tracking": [r"application status", r"track.*application", r"where is my", r"\bstatus\b"],
    "registration": [r"\bregist(er|ration)\b(?!.*marriage)"],
    "death_documents": [r"death certificate", r"\bdeath\b"],
    "police_clearance": [r"police clearance", r"\bpcc\b"],
    "attestation": [r"\battest", r"attestation"],
    "global_entry": [r"global entry"],
    "fraud_advisory": [r"\bfraud\b", r"\bscam\b"],
    "misc_services": [r"misc(ellaneous)? service"],
}

# Ordered: checked before the general category keywords above, since e.g.
# "attestation of will" must win over the generic "attestation" category.
KNOWN_GAP_PATTERNS = [
    r"misc(ellaneous)? services? checklist",
    r"marriage.*(regist|certificate)",
    r"regist.*marriage",
    r"nri certificate",
    r"attest.*will",
    r"will.*attest",
    r"affidavit.*(child|minor).*passport",
    r"statement of need",
    r"international driving permit",
    r"driving licen[cs]e.*authenticat",
    r"emergency certificate",
    r"\bcustoms\b",
    r"court order",
    r"\bsummons\b",
    r"\bpio card\b",
    r"holiday.*(closure|closed)",
    r"(counter|office) hours",
    r"midday closure",
    r"service (center|centre).*(hours|appointment)",
    r"appointment.*service (center|centre)",
    r"\bnori fee\b",
    r"consolidated.*fee schedule",
]


def classify(query: str) -> tuple[str, bool]:
    """Returns (category_or_known_gap, is_known_gap)."""
    q = query.lower()
    for pattern in KNOWN_GAP_PATTERNS:
        if re.search(pattern, q):
            return "known_gap", True
    for category, patterns in CATEGORY_KEYWORDS.items():
        for pattern in patterns:
            if re.search(pattern, q):
                return category, False
    return "unclassified", False


def is_junk(query: str, query_words: int) -> bool:
    if query_words < 3:
        return True
    if not re.search(r"[a-zA-Z]{3,}", query):
        return True
    return False


def load_queries() -> list[dict]:
    rows = []
    with open(TICKETS_CSV, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            query = (row.get("query") or "").strip()
            try:
                query_words = int(row.get("query_words") or 0)
                dup_count = int(row.get("duplicate_count") or 1)
            except ValueError:
                continue
            if not query or is_junk(query, query_words):
                continue
            rows.append(
                {
                    "ticket_id": row.get("Ticket ID"),
                    "query": query,
                    "duplicate_count": dup_count,
                    "created_year_month": row.get("created_year_month"),
                }
            )
    return rows


def main() -> None:
    all_rows = load_queries()
    print(f"{len(all_rows)} usable queries after junk filtering (of raw CSV rows).")

    buckets: dict[str, list[dict]] = defaultdict(list)
    for row in all_rows:
        category, is_gap = classify(row["query"])
        row["category"] = category
        row["expect_decline"] = is_gap
        buckets[category].append(row)

    print("\nClassified counts by bucket:")
    for cat, items in sorted(buckets.items(), key=lambda kv: -len(kv[1])):
        print(f"  {cat:24s} {len(items)}")

    sample: list[dict] = []
    seen_queries: set[str] = set()

    def take(category: str, n: int) -> list[dict]:
        items = buckets.get(category, [])
        items_sorted = sorted(items, key=lambda r: -r["duplicate_count"])
        picked = []
        for item in items_sorted:
            key = item["query"].lower()
            if key in seen_queries:
                continue
            seen_queries.add(key)
            picked.append(item)
            if len(picked) >= n:
                break
        return picked

    for category, target in CATEGORY_TARGETS.items():
        picked = take(category, target)
        sample.extend(picked)
        print(f"sampled {len(picked)}/{target} for {category}")

    gap_picked = take("known_gap", KNOWN_GAP_TARGET)
    sample.extend(gap_picked)
    print(f"sampled {len(gap_picked)}/{KNOWN_GAP_TARGET} for known_gap")

    print(f"\nTotal candidate sample: {len(sample)}")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(sample, f, indent=2, ensure_ascii=False)
    print(f"Wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
