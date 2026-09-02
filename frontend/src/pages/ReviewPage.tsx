import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, X } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { getReviewPending, approveChunk, rejectChunk, type Chunk } from "../api/client";
import { PageHeader, RefreshButton } from "../components/Nav";
import { Card, LoadingBlock, ErrorBlock, EmptyState } from "../components/Common";
import { CategoryBadge } from "../components/StatusBadge";
import { KNOWN_CATEGORIES } from "../constants";

const PAGE_SIZE = 20;

export function ReviewPage() {
  const { credentials } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const sourceId = searchParams.get("source_id") ?? undefined;
  const category = searchParams.get("category") ?? "";

  const [chunks, setChunks] = useState<Chunk[] | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actor, setActor] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reasonDraft, setReasonDraft] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await getReviewPending(credentials, {
        service_category: category || undefined,
        source_id: sourceId,
        limit: PAGE_SIZE,
        offset,
      });
      setChunks(res.chunks);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId, category, offset]);

  async function decide(chunkId: string, decision: "approve" | "reject") {
    if (!actor.trim()) {
      setError("Enter your name/email first — every decision is written to the audit log with an actor.");
      return;
    }
    setBusyId(chunkId);
    setError(null);
    try {
      const fn = decision === "approve" ? approveChunk : rejectChunk;
      await fn(credentials, chunkId, actor.trim(), reasonDraft[chunkId] || undefined);
      setChunks((prev) => (prev ? prev.filter((c) => c.id !== chunkId) : prev));
      setTotal((t) => t - 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  const canPrev = offset > 0;
  const canNext = offset + PAGE_SIZE < total;

  const rangeLabel = useMemo(() => {
    if (total === 0) return "0 of 0";
    return `${offset + 1}-${Math.min(offset + PAGE_SIZE, total)} of ${total}`;
  }, [offset, total]);

  return (
    <div>
      <PageHeader
        title="Review queue"
        description="Chunks awaiting approval — nothing here is answerable by the chatbot until it's approved."
        action={<RefreshButton onClick={load} loading={loading} />}
      />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          value={category}
          onChange={(e) => {
            setOffset(0);
            const next = new URLSearchParams(searchParams);
            if (e.target.value) next.set("category", e.target.value);
            else next.delete("category");
            setSearchParams(next);
          }}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="">All categories</option>
          {KNOWN_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {sourceId && (
          <span className="text-xs text-slate-500 bg-slate-100 rounded-full px-2.5 py-1">
            Filtered to one source
            <button
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.delete("source_id");
                setSearchParams(next);
              }}
              className="ml-1.5 text-slate-400 hover:text-slate-700"
            >
              ×
            </button>
          </span>
        )}

        <div className="flex-1" />

        <input
          value={actor}
          onChange={(e) => setActor(e.target.value)}
          placeholder="Your name/email (required to approve/reject)"
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm w-72"
        />
      </div>

      {error && <ErrorBlock message={error} />}

      <Card className="mt-4">
        {loading && !chunks ? (
          <LoadingBlock label="Loading pending chunks…" />
        ) : !chunks || chunks.length === 0 ? (
          <EmptyState title="Nothing pending" description="Every chunk in this view has already been reviewed." />
        ) : (
          <div className="divide-y divide-slate-100">
            {chunks.map((c) => (
              <div key={c.id} className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CategoryBadge category={c.service_category} />
                  <span className="text-xs text-slate-400">chunk #{c.chunk_index} · v{c.version}</span>
                </div>
                <p className="text-sm text-slate-700 mb-3 whitespace-pre-wrap">{c.chunk_text}</p>
                <div className="flex items-center gap-2">
                  <input
                    value={reasonDraft[c.id] ?? ""}
                    onChange={(e) => setReasonDraft((prev) => ({ ...prev, [c.id]: e.target.value }))}
                    placeholder="Reason (optional)"
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                  />
                  <button
                    onClick={() => decide(c.id, "approve")}
                    disabled={busyId === c.id}
                    className="flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg px-3 py-1.5 transition disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Approve
                  </button>
                  <button
                    onClick={() => decide(c.id, "reject")}
                    disabled={busyId === c.id}
                    className="flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg px-3 py-1.5 transition disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <span className="text-slate-400">{rangeLabel}</span>
          <div className="flex gap-2">
            <button
              disabled={!canPrev}
              onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
              className="px-3 py-1.5 rounded-lg border border-slate-300 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              disabled={!canNext}
              onClick={() => setOffset((o) => o + PAGE_SIZE)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
