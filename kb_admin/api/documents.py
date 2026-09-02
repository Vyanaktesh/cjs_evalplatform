"""
Phase 2: document upload + browse.

Reuses the chatbot's own extract -> chunk -> embed -> index pipeline
(`app.ingestion.pipeline.embed_and_index_version`) in-process via the
bootstrap sys.path bridge — the same logic the bulk fetcher uses, and the
same logic that used to live behind consulate-rag-chatbot's own
(unauthenticated, port-8000) `/upload` endpoint before it was moved here
behind kb_admin's require_admin gate. Every chunk written here lands as
`review_status='pending_review'`; nothing here bypasses that gate.

Unlike the chatbot's old PDF-only `/upload`, this accepts PDF or HTML,
detected from the file content/extension rather than assumed.
"""

import hashlib
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.db.audit_repo import log_event
from app.db.chunks_repo import counts_by_source, list_by_source_version
from app.db.connection import get_conn
from app.db.source_versions_repo import create_version, get_latest_version, list_versions
from app.db.sources_repo import get_by_id, get_by_url, upsert_source
from app.embedding.bge_m3 import BgeM3Embedder
from app.ingestion.pipeline import embed_and_index_version
from app.vectorstore.qdrant_store import get_qdrant_client

from kb_admin.bootstrap import CHATBOT_REPO_PATH

router = APIRouter(prefix="/documents", tags=["documents"])

RAW_STORAGE_DIR = CHATBOT_REPO_PATH / "data" / "raw"

_PDF_MAGIC = b"%PDF"


def _safe_filename(name: str) -> str:
    name = Path(name).name  # strip any directory components
    name = re.sub(r"[^A-Za-z0-9._-]", "_", name)
    return name or "upload"


def _detect_source_type(filename: str, content: bytes) -> str:
    if content.startswith(_PDF_MAGIC):
        return "pdf"
    lowered = (filename or "").lower()
    if lowered.endswith((".htm", ".html")) or b"<html" in content[:2048].lower():
        return "html"
    raise HTTPException(status_code=400, detail="file must be a PDF (%PDF header) or HTML (.html/.htm)")


@router.post("")
async def upload_document(
    file: UploadFile = File(...),
    url: str = Form(
        ...,
        description="Canonical identifier for this content: a real URL if it has one, "
        "or a manual:// identifier if not. Re-uploading the same url with new content "
        "creates a new version and supersedes the old one, exactly like a re-fetch.",
    ),
    service_category: str = Form(...),
    canonical: bool = Form(False),
    title: Optional[str] = Form(None),
    source_group: Optional[str] = Form(None),
    jurisdiction: Optional[str] = Form(None, description="comma-separated, defaults to 'all'"),
    applicant_variant: Optional[str] = Form(None, description="comma-separated, optional"),
    notes: Optional[str] = Form(None),
    actor: str = Form(..., description="staff member performing this upload, for the audit log"),
):
    content = await file.read()
    source_type = _detect_source_type(file.filename or "", content)

    jurisdiction_list = [j.strip() for j in jurisdiction.split(",")] if jurisdiction else ["all"]
    applicant_variant_list = [v.strip() for v in applicant_variant.split(",")] if applicant_variant else []

    content_hash = hashlib.sha256(content).hexdigest()

    with get_conn() as conn:
        try:
            source = get_by_url(conn, url)
            if source is None:
                source = upsert_source(
                    conn,
                    url=url,
                    source_type=source_type,
                    service_category=service_category,
                    canonical=canonical,
                    jurisdiction=jurisdiction_list,
                    applicant_variant=applicant_variant_list,
                    notes=notes,
                    title=title,
                    source_group=source_group or "Manual uploads",
                )
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"could not create source: {exc}")

        latest = get_latest_version(conn, source.id)
        if latest is not None and latest.content_hash == content_hash:
            return {
                "source_id": str(source.id),
                "version": latest.version,
                "unchanged": True,
                "message": "content_hash matches the existing latest version — nothing new to embed",
            }

        next_version = (latest.version + 1) if latest else 1
        version_dir = RAW_STORAGE_DIR / str(source.id) / f"v{next_version}"
        version_dir.mkdir(parents=True, exist_ok=True)
        raw_path = version_dir / _safe_filename(file.filename or f"upload.{source_type}")
        raw_path.write_bytes(content)

        version = create_version(
            conn,
            source_id=source.id,
            content_hash=content_hash,
            retrieval_date=datetime.now(timezone.utc),
            raw_content_path=str(raw_path.relative_to(CHATBOT_REPO_PATH)),
            fetch_status="success",
        )
        assert version.version == next_version, (
            f"version numbering mismatch for source {source.id}: computed {next_version}, "
            f"DB assigned {version.version}"
        )

        log_event(
            conn,
            entity_type="source_version",
            entity_id=version.id,
            action="manual_upload",
            actor=actor,
            details={
                "url": url,
                "content_hash": content_hash,
                "version": version.version,
                "filename": file.filename,
            },
        )

        try:
            embedder = BgeM3Embedder(batch_size=12)
            qdrant_client = get_qdrant_client()
            summary = embed_and_index_version(conn, qdrant_client, embedder, source, version)
        except Exception as exc:
            raise HTTPException(
                status_code=422,
                detail=f"uploaded and versioned successfully, but extraction/embedding failed: {exc}",
            )

    return {
        "source_id": str(source.id),
        "version": version.version,
        "unchanged": False,
        **summary,
    }


@router.get("")
def list_documents():
    """Per-source overview (review-status counts, latest version) — the
    browse screen staff start from to see what's pending."""
    with get_conn() as conn:
        rows = counts_by_source(conn)
    return {"sources": rows}


@router.get("/{source_id}")
def get_document(source_id: UUID):
    with get_conn() as conn:
        source = get_by_id(conn, source_id)
        if source is None:
            raise HTTPException(status_code=404, detail=f"no such source: {source_id}")
        versions = list_versions(conn, source_id)
        latest_chunks = list_by_source_version(conn, versions[-1].id) if versions else []
    return {
        "source": source,
        "versions": versions,
        "latest_version_chunks": latest_chunks,
    }
