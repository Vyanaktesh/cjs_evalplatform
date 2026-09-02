/**
 * Typed client for kb_admin's FastAPI backend (port 8100 by default — see
 * .env's VITE_API_BASE_URL). Every route (except POST /auth/login itself)
 * requires a Bearer JWT (kb_admin/core/auth.py's require_admin, applied
 * per-router), so every function here takes `token` explicitly rather than
 * reading some ambient global — see src/auth/AuthContext.tsx for where
 * that actually comes from and how it's persisted across a page refresh.
 */

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "http://127.0.0.1:8100";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      // response wasn't JSON — fall back to statusText
    }
    throw new ApiError(res.status, typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function getJson<T>(token: string, path: string): Promise<T> {
  return request<T>(token, path);
}

function postJson<T>(token: string, path: string, body: unknown): Promise<T> {
  return request<T>(token, path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// The only unauthenticated call — exchanges username/password for a JWT.
// Throws ApiError(401) on bad credentials, same shape every other call uses.
export async function login(username: string, password: string): Promise<string> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      // not JSON
    }
    throw new ApiError(res.status, typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  const body = (await res.json()) as { access_token: string };
  return body.access_token;
}

export async function checkHealth(token: string): Promise<boolean> {
  try {
    await getJson(token, "/health");
    return true;
  } catch {
    return false;
  }
}

// --- /documents ---

export type SourceOverview = {
  source_id: string;
  title: string | null;
  url: string;
  service_category: string;
  canonical: boolean;
  source_group: string | null;
  latest_chunked_version: number | null;
  pending_count: number;
  approved_count: number;
  rejected_count: number;
  superseded_count: number;
  total_chunks: number;
};

export type SourceVersion = {
  id: string;
  source_id: string;
  version: number;
  content_hash: string;
  retrieval_date: string;
  source_last_modified: string | null;
  raw_content_path: string;
  extracted_text_path: string | null;
  fetch_status: string;
  created_at: string | null;
};

export type Chunk = {
  id: string;
  source_id: string;
  source_version_id: string;
  chunk_index: number;
  chunk_text: string;
  review_status: "pending_review" | "approved" | "rejected" | "superseded";
  service_category: string;
  canonical: boolean;
  version: number;
  used_ocr: boolean;
  [key: string]: unknown;
};

export type Source = {
  id: string;
  url: string;
  source_type: string;
  service_category: string;
  canonical: boolean;
  jurisdiction: string[];
  applicant_variant: string[];
  active: boolean;
  notes: string | null;
  title: string | null;
  source_group: string | null;
};

export type DocumentDetail = {
  source: Source;
  versions: SourceVersion[];
  latest_version_chunks: Chunk[];
};

export function listDocuments(token: string): Promise<{ sources: SourceOverview[] }> {
  return getJson(token, "/documents");
}

export function getDocument(token: string, sourceId: string): Promise<DocumentDetail> {
  return getJson(token, `/documents/${sourceId}`);
}

export type UploadResult = {
  source_id: string;
  version: number;
  unchanged: boolean;
  message?: string;
  chunks_created?: number;
  chunks_superseded?: number;
};

export function uploadDocument(token: string, form: FormData): Promise<UploadResult> {
  return request(token, "/documents", { method: "POST", body: form });
}

// --- /review ---

export function getReviewPending(
  token: string,
  params: { service_category?: string; source_id?: string; limit?: number; offset?: number } = {},
): Promise<{ total: number; limit: number; offset: number; chunks: Chunk[] }> {
  const qs = new URLSearchParams();
  if (params.service_category) qs.set("service_category", params.service_category);
  if (params.source_id) qs.set("source_id", params.source_id);
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.offset) qs.set("offset", String(params.offset));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return getJson(token, `/review/pending${suffix}`);
}

export function getChunkDetail(token: string, chunkId: string): Promise<Chunk> {
  return getJson(token, `/review/chunks/${chunkId}`);
}

export type SourceDiff = {
  source_id: string;
  title: string | null;
  url: string;
  previous_version: number;
  latest_version: number;
  previous_chunk_count: number;
  latest_chunk_count: number;
  unchanged_chunk_count: number;
  added_chunk_indices: number[];
  removed_chunk_indices: number[];
  unified_diff: string;
};

export function getSourceDiff(token: string, sourceId: string): Promise<SourceDiff> {
  return getJson(token, `/review/sources/${sourceId}/diff`);
}

export type ReviewDecisionResult = {
  chunk_id: string;
  source_id: string;
  previous_review_status: string;
  review_status: string;
};

export function approveChunk(
  token: string,
  chunkId: string,
  actor: string,
  reason?: string,
): Promise<ReviewDecisionResult> {
  return postJson(token, `/review/chunks/${chunkId}/approve`, { actor, reason });
}

export function rejectChunk(
  token: string,
  chunkId: string,
  actor: string,
  reason?: string,
): Promise<ReviewDecisionResult> {
  return postJson(token, `/review/chunks/${chunkId}/reject`, { actor, reason });
}

// --- /recheck ---

export type RecheckResult = {
  total: number;
  changed_count: number;
  failed_count: number;
  unchanged_count: number;
  changed: Array<{ source_id: string; title: string | null; version: number; chunks_created: number; chunks_superseded: number }>;
  failed: Array<{ source_id: string; title: string | null; error: string }>;
};

export function triggerRecheck(token: string): Promise<RecheckResult> {
  return postJson(token, "/recheck", {});
}

// --- /eval ---

export type MetricSet = {
  precision_at_k?: number;
  recall_at_k?: number;
  hit_rate?: number;
  mrr?: number;
  ndcg_at_k?: number;
  faithfulness?: number;
  answer_relevancy?: number;
  context_recall?: number;
  citation_accuracy?: number;
  n: number;
};

export type EvalRunSummary = {
  run_id: string;
  golden_set_size: number;
  sme_reviewed_count: number;
  retrieval_overall: MetricSet;
  generation_overall?: MetricSet;
};

export type RetrievalItem = MetricSet & { id: string; query: string; category: string };
export type GenerationItem = MetricSet & {
  id: string;
  query: string;
  category: string;
  expect_decline: boolean;
  answer: string;
  retrieved_count: number;
};

export type EvalRunDetail = {
  run_id: string;
  golden_set_size: number;
  sme_reviewed_count: number;
  retrieval: {
    k: number;
    overall: MetricSet;
    by_category: Record<string, MetricSet>;
    per_item: RetrievalItem[];
    skipped_decline_items: number;
  };
  generation?: {
    overall: MetricSet;
    by_category: Record<string, MetricSet>;
    per_item: GenerationItem[];
    errors: Array<{ id: string; error: string }>;
  };
};

export function listEvalRuns(token: string): Promise<{ runs: EvalRunSummary[] }> {
  return getJson(token, "/eval/runs");
}

export function getEvalRun(token: string, runId: string): Promise<EvalRunDetail> {
  return getJson(token, `/eval/runs/${encodeURIComponent(runId)}`);
}

export function triggerEvalRun(
  token: string,
  body: { run_id?: string; include_generation?: boolean; k?: number },
): Promise<EvalRunDetail> {
  return postJson(token, "/eval/run", body);
}
