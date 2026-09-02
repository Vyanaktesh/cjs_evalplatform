"""
Phase 3: scheduled source recheck.

Periodically (every `settings.recheck_interval_days`) re-runs the exact
same fetch_and_persist() logic scripts/fetch_all_sources.py uses manually,
against every active registered source — same browser session reused
across the whole pass, same per-source isolation (one bad source logs a
failure and the run moves on). fetch_and_persist already tells a genuinely
new content_hash apart from an unchanged one (it's what makes a manual
re-fetch idempotent); a recheck run just means nobody has to trigger that
by hand every `recheck_interval_days`.

When a source's fetch DOES produce a new version, it's run through the
same extract/chunk/embed/index pipeline the manual-upload endpoint uses
(`app.ingestion.pipeline.embed_and_index_version`) immediately — landing as
new pending_review chunks and superseding the old ones. This is what
actually closes the loop: "the live source changed" becomes "staff have
something new to review," with no separate flag/notification step needed,
since a fresh pending_review chunk is itself the signal (visible via
kb_admin's GET /documents and GET /review/pending).

Runs as an APScheduler background job inside this FastAPI process, started
in main.py's startup and stopped on shutdown. `max_instances=1` means a
recheck that's still running when the next interval fires is left alone
rather than started twice against the same sources.
"""

import time
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler

from app.core.config import get_settings as get_chatbot_settings
from app.core.logging_config import get_logger
from app.db.connection import get_conn
from app.db.source_versions_repo import get_latest_version
from app.db.sources_repo import list_sources
from app.embedding.bge_m3 import BgeM3Embedder
from app.fetcher.orchestrate import fetch_and_persist
from app.fetcher.playwright_fetcher import browser_session
from app.ingestion.pipeline import embed_and_index_version
from app.vectorstore.qdrant_store import get_qdrant_client

from kb_admin.core.config import get_settings

logger = get_logger(__name__)

DELAY_BETWEEN_SOURCES_SECONDS = 1.5

_scheduler: Optional[BackgroundScheduler] = None


def run_recheck() -> dict:
    """One full pass over every active source. Returns a summary: which
    sources changed (and were re-embedded), which failed to fetch, and the
    total checked — the same information scripts/fetch_all_sources.py
    prints, plus what got re-embedded as a result."""
    chatbot_settings = get_chatbot_settings()

    with get_conn() as conn:
        sources = list_sources(conn, active_only=True)

    logger.info(f"scheduled recheck starting: {len(sources)} active source(s)")

    changed = []
    failed = []
    embedder = None  # loaded lazily — only if at least one source actually changed

    with browser_session(chatbot_settings.fetcher_user_agent) as context:
        for i, source in enumerate(sources, start=1):
            with get_conn() as conn:
                outcome = fetch_and_persist(
                    context,
                    conn,
                    chatbot_settings,
                    url=source.url,
                    source_type=source.source_type,
                    source_id=source.id,
                )

            if not outcome["success"]:
                failed.append(
                    {"source_id": str(source.id), "title": source.title, "error": outcome["error"]}
                )
            elif not outcome["unchanged"]:
                with get_conn() as conn:
                    version = get_latest_version(conn, source.id)
                    if embedder is None:
                        embedder = BgeM3Embedder(batch_size=12)
                    qdrant_client = get_qdrant_client()
                    try:
                        summary = embed_and_index_version(conn, qdrant_client, embedder, source, version)
                    except Exception as exc:
                        logger.error(
                            f"recheck: {source.title} fetched a new version but "
                            f"embedding failed: {exc}"
                        )
                        failed.append(
                            {"source_id": str(source.id), "title": source.title, "error": str(exc)}
                        )
                        continue
                changed.append(
                    {"source_id": str(source.id), "title": source.title, "version": version.version, **summary}
                )

            if i < len(sources):
                time.sleep(DELAY_BETWEEN_SOURCES_SECONDS)

    unchanged_count = len(sources) - len(changed) - len(failed)
    logger.info(
        f"scheduled recheck done: {len(changed)} changed, {len(failed)} failed, "
        f"{unchanged_count} unchanged"
    )
    return {
        "total": len(sources),
        "changed_count": len(changed),
        "failed_count": len(failed),
        "unchanged_count": unchanged_count,
        "changed": changed,
        "failed": failed,
    }


def start_scheduler() -> BackgroundScheduler:
    global _scheduler
    if _scheduler is not None:
        return _scheduler

    settings = get_settings()
    scheduler = BackgroundScheduler()
    scheduler.add_job(
        run_recheck,
        "interval",
        days=settings.recheck_interval_days,
        id="source_recheck",
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()
    _scheduler = scheduler
    logger.info(f"source recheck scheduled every {settings.recheck_interval_days} day(s)")
    return scheduler


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
