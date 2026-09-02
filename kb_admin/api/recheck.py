"""
Manual trigger for the Phase 3 scheduled recheck job — lets staff run a
check right now instead of waiting for the next `recheck_interval_days`
tick (and is how this feature gets exercised in testing without an actual
multi-day wait).
"""

from fastapi import APIRouter

from kb_admin.scheduler import run_recheck

router = APIRouter(prefix="/recheck", tags=["recheck"])


@router.post("")
def trigger_recheck():
    return run_recheck()
