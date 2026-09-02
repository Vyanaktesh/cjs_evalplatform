"""
Admin chunk review — approve/reject and diff-against-previous-version.

This used to be part of consulate-rag-chatbot's own app/api/main.py,
unauthenticated on the same port-8000 process as the public /chat and
/generate endpoints. It has been moved here, behind kb_admin's
require_admin gate, reusing the exact same underlying app.review.* /
app.db.chunks_repo logic via the bootstrap sys.path bridge — nothing
about the review logic itself changed, only where it's exposed and who
can reach it.
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.db.chunks_repo import get_chunk, list_pending
from app.db.connection import get_conn
from app.review.diff import NoDiffAvailable, diff_latest_versions
from app.review.service import ChunkNotFound, decide_chunk
from app.vectorstore.qdrant_store import get_qdrant_client

router = APIRouter(prefix="/review", tags=["review"])


class ReviewDecisionRequest(BaseModel):
    actor: str
    reason: Optional[str] = None


@router.get("/pending")
def review_pending(
    service_category: Optional[str] = None,
    source_id: Optional[UUID] = None,
    limit: int = 50,
    offset: int = 0,
):
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    with get_conn() as conn:
        rows, total = list_pending(
            conn,
            service_category=service_category,
            source_id=source_id,
            limit=limit,
            offset=offset,
        )
    return {"total": total, "limit": limit, "offset": offset, "chunks": rows}


@router.get("/chunks/{chunk_id}")
def review_chunk_detail(chunk_id: UUID):
    with get_conn() as conn:
        chunk = get_chunk(conn, chunk_id)
    if chunk is None:
        raise HTTPException(status_code=404, detail=f"no such chunk: {chunk_id}")
    return chunk


@router.get("/sources/{source_id}/diff")
def review_source_diff(source_id: UUID):
    with get_conn() as conn:
        try:
            return diff_latest_versions(conn, source_id)
        except NoDiffAvailable as exc:
            raise HTTPException(status_code=409, detail=str(exc))
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc))


@router.post("/chunks/{chunk_id}/approve")
def review_approve(chunk_id: UUID, body: ReviewDecisionRequest):
    client = get_qdrant_client()
    with get_conn() as conn:
        try:
            return decide_chunk(conn, client, chunk_id, "approved", body.actor, body.reason)
        except ChunkNotFound:
            raise HTTPException(status_code=404, detail=f"no such chunk: {chunk_id}")


@router.post("/chunks/{chunk_id}/reject")
def review_reject(chunk_id: UUID, body: ReviewDecisionRequest):
    client = get_qdrant_client()
    with get_conn() as conn:
        try:
            return decide_chunk(conn, client, chunk_id, "rejected", body.actor, body.reason)
        except ChunkNotFound:
            raise HTTPException(status_code=404, detail=f"no such chunk: {chunk_id}")
