# KB Admin & Evaluation Service

A staff-facing admin console and RAG evaluation platform for the **Consular Chatbot** — the tool office staff use to upload source documents, review and approve what the chatbot is allowed to answer from, and track retrieval/generation quality over time against a golden set of real citizen queries.

It runs as its own FastAPI service (port `8100`), separate from the citizen-facing chatbot (port `8000`), and shares the chatbot's own Postgres + Qdrant instances rather than duplicating any ingestion, retrieval, or generation logic.

## What it does

- **Document upload & review** — staff upload a PDF or HTML source through the same extract → chunk → embed → index pipeline the bulk fetcher uses. Every new or changed chunk lands as `pending_review`; nothing is answerable by the live chatbot until a staff member approves it.
- **Source registry** — browse every registered source, filter by category, and see at a glance how many of its chunks are pending, approved, or rejected.
- **Scheduled + on-demand recheck** — a background job re-fetches every active source on a configurable interval and re-runs anything whose content changed through the same pipeline, so content drift gets caught without a manual script run. Staff can also trigger a recheck immediately.
- **Evaluation module** — runs a golden set of real (anonymized) citizen queries against the retrieval pipeline (Precision@K, Recall@K, Hit Rate, MRR) and, optionally, the full generation pipeline plus an external LLM judge (faithfulness, answer relevancy, context recall, citation accuracy). Every run is saved so score trends are visible over time, per metric and per category.
- **JWT-based staff auth** — `POST /auth/login` exchanges a shared admin username/password for a short-lived signed token; every other route requires it as a Bearer token instead of resending credentials on every request.

## How it relates to the chatbot repo

This service is deliberately **not** a fork or a copy of the chatbot's code. It imports the sibling `consulate-rag-chatbot` repo's own `app` package in-process (via a `sys.path` bridge — see `kb_admin/bootstrap.py`) and reuses its ingestion, review, fetcher, retrieval, and generation modules directly. The two services:

- never call each other over HTTP,
- read and write the **same** Postgres and Qdrant instances (no separate containers, no sync job — an approved chunk here is immediately visible to the chatbot's next query),
- and the sibling repo is never modified by this project.

```
../consulate-rag-chatbot/   # sibling checkout — imported in-process, never edited
./consulate-kb-admin/       # this repo
├── kb_admin/                # FastAPI backend
│   ├── api/                 # auth, documents, review, recheck, eval routers
│   ├── core/                # settings, JWT auth
│   ├── eval/                # golden-set runner, retrieval + generation metrics, LLM judge
│   ├── bootstrap.py          # sys.path bridge into the sibling repo
│   └── main.py                # app entrypoint
├── scripts/                 # golden-set build/sampling utilities
├── data/eval/                # golden-set batches + saved eval run history (JSON)
└── frontend/                 # React + TypeScript + Tailwind admin UI
```

## Tech stack

**Backend:** FastAPI, Postgres (via the bridged `psycopg2` layer), Qdrant, PyJWT, APScheduler. Ingestion reuses BGE-M3 embeddings (`FlagEmbedding`/`torch`, CPU) and a cross-encoder reranker from the sibling repo; OCR fallback uses `pdf2image` + `pytesseract` (needs `poppler` and `tesseract` installed on the host).

**Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4.

## Getting started

### Prerequisites

- A checked-out copy of `consulate-rag-chatbot` alongside this repo (default expected path `../consulate-rag-chatbot`, configurable via `CONSULATE_RAG_CHATBOT_PATH`), with its Postgres + Qdrant containers running.
- Python 3.12, Node 20+.
- `poppler` and `tesseract` available on `PATH` (PDF page inspection and OCR fallback for scanned pages).

### Backend

```bash
python -m venv .venv
.venv/Scripts/activate          # .venv/bin/activate on macOS/Linux
pip install -r requirements.txt

cp .env.example .env            # then fill in Postgres/Qdrant/API keys —
                                 # copy the DB/Qdrant values from the chatbot's own .env

uvicorn kb_admin.main:app --reload --port 8100
```

### Frontend

```bash
cd frontend
npm install
npm run dev                     # http://localhost:5174
```

Sign in with the `ADMIN_USERNAME` / `ADMIN_PASSWORD` set in `.env`.

## Running an evaluation

```bash
curl -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" -X POST http://127.0.0.1:8100/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "'"$ADMIN_USERNAME"'", "password": "'"$ADMIN_PASSWORD"'"}'
# then, with the returned access_token:
curl -H "Authorization: Bearer $TOKEN" -X POST http://127.0.0.1:8100/eval/run \
  -H "Content-Type: application/json" \
  -d '{"include_generation": false, "k": 8}'
```

or just click **Run eval** from the Evaluation page in the UI — retrieval-only runs finish in seconds; including generation calls the live chatbot pipeline plus an LLM judge per item, so it's rate-limited and takes longer.

## Status

Placeholder shared-password auth is intentional for now — a TODO in `kb_admin/core/config.py` flags the move to per-staff accounts or SSO as a follow-up decision, not yet made.
