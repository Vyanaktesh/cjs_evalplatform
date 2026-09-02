"""
Phase 4: evaluation module — run the golden set against retrieval (always)
and, optionally, the full generation pipeline + external judge, and browse
past runs for a trend over time.
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from kb_admin.eval.runner import get_run, list_runs, run_eval

router = APIRouter(prefix="/eval", tags=["eval"])


class RunEvalRequest(BaseModel):
    run_id: Optional[str] = None
    include_generation: bool = False
    k: int = 8


@router.post("/run")
def trigger_eval_run(body: RunEvalRequest):
    run_id = body.run_id or datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    try:
        return run_eval(run_id, include_generation=body.include_generation, k=body.k)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


@router.get("/runs")
def get_runs():
    return {"runs": list_runs()}


@router.get("/runs/{run_id}")
def get_run_detail(run_id: str):
    run = get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail=f"no such eval run: {run_id}")
    return run
