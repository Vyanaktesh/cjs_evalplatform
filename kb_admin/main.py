"""
Knowledge Base Admin & Evaluation Service — a separate FastAPI process from
the Consular Chatbot (port 8000). Runs on port 8100.

Reuses the chatbot's own ingestion/review/fetcher/retrieval/generation code
in-process via the sys.path bridge in kb_admin.bootstrap (see that module's
docstring) — this service and the chatbot never call each other over HTTP.
Both talk to the same Postgres and Qdrant instances; approved chunks written
here are picked up by the chatbot's existing retrieval code on its next
query, with no coordination needed between the two processes.

Endpoints:
  POST /auth/login                          - exchange admin username/password for a
                                                short-lived JWT; every other route
                                                below requires it as a Bearer token
  GET  /health                              - liveness check (Postgres + Qdrant)
  POST /documents                            - upload a PDF or HTML document
                                                through the shared ingestion
                                                pipeline (pending_review)
  GET  /documents                            - per-source review-status overview
  GET  /documents/{source_id}                - source detail: versions + latest chunks
  GET  /review/pending                      - list chunks awaiting review
  GET  /review/chunks/{chunk_id}             - full chunk detail
  GET  /review/sources/{source_id}/diff      - diff latest vs previous version
  POST /review/chunks/{chunk_id}/approve     - approve a chunk
  POST /review/chunks/{chunk_id}/reject      - reject a chunk
  POST /recheck                              - run the Phase 3 source recheck now,
                                                instead of waiting for the next
                                                scheduled tick
  POST /eval/run                             - Phase 4: run the golden set against
                                                retrieval (+ optionally generation)
  GET  /eval/runs                            - past eval runs, for a trend view
  GET  /eval/runs/{run_id}                   - one run's full per-item detail

The /documents and /review/* routes used to live, unauthenticated, on the
chatbot's own port-8000 API (app/api/main.py). They were moved here so
every staff-facing action sits behind require_admin — the chatbot's port
8000 now serves only /health, /search, /generate, /chat.

Phase 3: a background job (see kb_admin/scheduler.py) re-fetches every
active source every `recheck_interval_days` and, for anything whose
content actually changed, runs it straight through the same
embed_and_index_version pipeline /documents uses — new pending_review
chunks appear for staff to review with no manual script run needed.
Started on this app's startup and stopped on shutdown, below.

Run with: uvicorn kb_admin.main:app --reload --port 8100
"""

# Must run before any `import app...` anywhere in this process.
import kb_admin.bootstrap  # noqa: F401  isort:skip

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings as get_chatbot_settings
from app.core.logging_config import configure_logging
from app.db.connection import get_conn
from app.vectorstore.qdrant_store import get_qdrant_client

from kb_admin.api import auth as auth_module
from kb_admin.api import documents as documents_module
from kb_admin.api import eval as eval_module
from kb_admin.api import recheck as recheck_module
from kb_admin.api import review as review_module
from kb_admin.core.auth import require_admin
from kb_admin.scheduler import start_scheduler, stop_scheduler

configure_logging(get_chatbot_settings().log_level)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(
    title="Consular Chatbot — Knowledge Base Admin & Evaluation Service",
    version="0.3.0",
    lifespan=lifespan,
)

# Phase 5: the admin frontend (kb_admin/frontend, dev server on 5174) is a
# separate origin from this API — Starlette's CORS middleware answers the
# browser's preflight OPTIONS request itself, before require_admin ever
# runs, so it isn't blocked by auth. Scoped to the known local dev origins
# rather than "*" since every real route here is a write-capable admin
# action, not read-only public content like the chatbot's /search.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5174", "http://127.0.0.1:5174"],
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)

# auth.router is the one exception that must NOT require an existing
# token — everything else stays behind require_admin, now applied
# per-router instead of app-wide so /auth/login can be excluded.
app.include_router(auth_module.router)
app.include_router(documents_module.router, dependencies=[Depends(require_admin)])
app.include_router(review_module.router, dependencies=[Depends(require_admin)])
app.include_router(recheck_module.router, dependencies=[Depends(require_admin)])
app.include_router(eval_module.router, dependencies=[Depends(require_admin)])


@app.get("/health", dependencies=[Depends(require_admin)])
def health():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1;")
            cur.fetchone()
    client = get_qdrant_client()
    client.get_collections()
    return {"status": "ok"}
