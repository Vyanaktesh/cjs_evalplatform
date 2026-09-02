"""
Loads/saves the Phase 4 golden evaluation set.

The set is a plain JSON file, not a database table — it's edited by hand
(an SME reviewing/correcting drafted answers) far more often than it's
queried programmatically, so a file a person can open and diff in git is
more useful here than a DB table would be. See data/eval/golden_qa.json.

Each item:
  id                 - stable identifier (the source ticket_id it came from)
  query              - the real user question text
  category           - service_category, or "known_gap"
  expect_decline     - true if the bot should decline rather than answer
  decline_reason     - why, if expect_decline
  expected_key_facts - list of short facts a correct answer must contain
                        (empty for decline items)
  reference_chunk_ids / reference_source_ids - grounding chunks (empty for
                        decline items)
  sme_reviewed       - false until an office SME has confirmed/corrected
                        this item; eval runs still use un-reviewed items
                        (better than no eval set) but the scorecard reports
                        the reviewed fraction so results are read with that
                        caveat in mind.
"""

import json
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
GOLDEN_SET_PATH = REPO_ROOT / "data" / "eval" / "golden_qa.json"


def load_golden_set(path: Path = GOLDEN_SET_PATH) -> list[dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(
            f"no golden set at {path} — run scripts/build_golden_set.py first"
        )
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save_golden_set(items: list[dict[str, Any]], path: Path = GOLDEN_SET_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(items, f, indent=1, ensure_ascii=False)
