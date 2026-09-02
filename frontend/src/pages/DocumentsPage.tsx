import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Upload, RotateCw, ExternalLink, CheckCircle2, FileStack, Circle, AlertCircle } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { listDocuments, triggerRecheck, type SourceOverview, type RecheckResult } from "../api/client";
import { PageHeader, RefreshButton } from "../components/Nav";
import { Card, LoadingBlock, ErrorBlock, EmptyState, Button, buttonClass } from "../components/Common";
import { MetricCard, CountChip } from "../components/MetricCard";
import { CategoryBadge } from "../components/StatusBadge";

// A source is "clean" once nothing's waiting on a decision — used for the
// per-row status dot in the table and to decide the Pending Review stat
// card's own color (0 pending reads as a resolved/healthy state, not just
// an empty count, same as "Approved Chunks" already reading as healthy).
function isRowClean(s: SourceOverview): boolean {
  return s.pending_count === 0 && s.rejected_count === 0;
}

export function DocumentsPage() {
  const { credentials } = useAuth();
  const [sources, setSources] = useState<SourceOverview[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [rechecking, setRechecking] = useState(false);
  const [recheckResult, setRecheckResult] = useState<RecheckResult | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { sources } = await listDocuments(credentials);
      setSources(sources);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 14+ flat filter pills is workable today, but won't scale forever —
  // if the category list keeps growing, a searchable combobox or a
  // collapsible "show more" row would keep this from becoming a second
  // line of unreadable chips. Noting it rather than building it now since
  // 14 still reads fine at this width.
  const categories = useMemo(
    () => Array.from(new Set((sources ?? []).map((s) => s.service_category))).sort(),
    [sources],
  );

  const filtered = useMemo(
    () => (sources ?? []).filter((s) => !categoryFilter || s.service_category === categoryFilter),
    [sources, categoryFilter],
  );

  const totals = useMemo(() => {
    const list = sources ?? [];
    return {
      sources: list.length,
      pending: list.reduce((n, s) => n + s.pending_count, 0),
      approved: list.reduce((n, s) => n + s.approved_count, 0),
      chunks: list.reduce((n, s) => n + s.total_chunks, 0),
    };
  }, [sources]);

  async function runRecheck() {
    setRechecking(true);
    setRecheckResult(null);
    try {
      const result = await triggerRecheck(credentials);
      setRecheckResult(result);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRechecking(false);
    }
  }

  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full blur-3xl opacity-[0.10] -z-10"
        style={{ backgroundColor: "var(--brand-blue)" }}
        aria-hidden="true"
      />

      <PageHeader
        title="Documents"
        description="Every registered source and what state its chunks are in — this is where staff see what's pending."
        action={
          <div className="flex items-center gap-2">
            <RefreshButton onClick={load} loading={loading} />
            <Button
              variant="secondary"
              onClick={runRecheck}
              disabled={rechecking}
              title="Re-fetch every active source now instead of waiting for the scheduled check"
            >
              <RotateCw className={`h-3.5 w-3.5 ${rechecking ? "animate-spin" : ""}`} aria-hidden="true" />
              {rechecking ? "Rechecking…" : "Recheck sources"}
            </Button>
            <Link to="/documents/upload" className={buttonClass("primary")} style={{ backgroundColor: "var(--brand-blue)", boxShadow: "var(--shadow-pop)" }}>
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              Upload document
            </Link>
          </div>
        }
      />

      {recheckResult && (
        <Card flat className="p-4 mb-4 flex items-start gap-3 animate-fade-in-up">
          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "var(--metric-good)" }} aria-hidden="true" />
          <div>
            <p className="text-sm text-slate-700">
              Recheck finished: <strong className="font-mono tabular-nums">{recheckResult.changed_count}</strong> changed,{" "}
              <strong className="font-mono tabular-nums">{recheckResult.unchanged_count}</strong> unchanged,{" "}
              <strong className="font-mono tabular-nums">{recheckResult.failed_count}</strong> failed (of{" "}
              <span className="font-mono tabular-nums">{recheckResult.total}</span> sources).
            </p>
            {recheckResult.changed.length > 0 && (
              <ul className="text-xs text-slate-500 mt-2 list-disc list-inside space-y-0.5">
                {recheckResult.changed.map((c) => (
                  <li key={c.source_id}>
                    {c.title ?? c.source_id} → v{c.version} ({c.chunks_created} new chunks, {c.chunks_superseded} superseded)
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      )}

      {error && <ErrorBlock message={error} />}

      {!error && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <MetricCard label="Sources" value={totals.sources} format="count" band="neutral" />
            <MetricCard
              label="Pending review"
              value={totals.pending}
              format="count"
              band={totals.pending > 0 ? "warn" : "good"}
              icon={totals.pending === 0 ? <CheckCircle2 className="h-3 w-3" /> : undefined}
            />
            <MetricCard label="Approved chunks" value={totals.approved} format="count" band={totals.approved > 0 ? "good" : "neutral"} />
            <MetricCard label="Total chunks" value={totals.chunks} format="count" band="neutral" />
          </div>

          {categories.length > 0 && (
            <div className="flex items-center gap-1.5 mb-4 flex-wrap">
              <button
                onClick={() => setCategoryFilter("")}
                className={`text-xs font-medium px-3 py-1.5 rounded-full transition-all duration-150 ${
                  categoryFilter === "" ? "text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200/70"
                }`}
                style={categoryFilter === "" ? { backgroundColor: "var(--brand-blue)" } : undefined}
              >
                All
              </button>
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategoryFilter(c)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-full transition-all duration-150 ${
                    categoryFilter === c ? "text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200/70"
                  }`}
                  style={categoryFilter === c ? { backgroundColor: "var(--brand-blue)" } : undefined}
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          <Card flat className="overflow-hidden">
            {loading && !sources ? (
              <LoadingBlock label="Loading sources…" />
            ) : (sources ?? []).length === 0 ? (
              <EmptyState
                title="No documents yet"
                description="Upload your first PDF or HTML source to start building the knowledge base."
              />
            ) : filtered.length === 0 ? (
              <EmptyState title="No sources in this category" description="Try a different category filter, or choose “All.”" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-sm table-fixed">
                  <thead>
                    <tr className="text-left text-[11px] text-slate-400 uppercase tracking-wider bg-slate-50/70 border-b border-slate-200/70">
                      <th className="px-4 py-3 font-semibold w-72">Source</th>
                      <th className="px-4 py-3 font-semibold w-48">Category</th>
                      <th className="px-4 py-3 font-semibold w-16">Version</th>
                      <th className="px-4 py-3 font-semibold text-right w-24">Pending</th>
                      <th className="px-4 py-3 font-semibold text-right w-24">Approved</th>
                      <th className="px-4 py-3 font-semibold text-right w-24">Rejected</th>
                      <th className="px-4 py-3 font-semibold text-right w-20">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((s) => {
                      const clean = isRowClean(s);
                      return (
                        <tr
                          key={s.source_id}
                          className="border-b border-slate-100 last:border-0 hover:bg-[var(--brand-blue-light)]/40 focus-within:bg-[var(--brand-blue-light)]/40 transition-colors duration-150"
                        >
                          <td className="px-4 py-3 max-w-0 w-full">
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className="shrink-0"
                                title={clean ? "Nothing pending or rejected" : s.pending_count > 0 ? `${s.pending_count} pending review` : "Has rejected chunks"}
                              >
                                {clean ? (
                                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--metric-good)" }} aria-hidden="true" />
                                ) : s.pending_count > 0 ? (
                                  <Circle className="h-3.5 w-3.5 shrink-0 fill-current" style={{ color: "var(--metric-warn)" }} aria-hidden="true" />
                                ) : (
                                  <AlertCircle className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--metric-warn)" }} aria-hidden="true" />
                                )}
                              </span>
                              <Link
                                to={`/documents/${s.source_id}`}
                                title={s.title ?? "(untitled)"}
                                className="flex items-center gap-2 min-w-0 font-medium text-slate-800 hover:text-[var(--brand-blue)] transition-colors duration-150"
                              >
                                <FileStack className="h-3.5 w-3.5 text-slate-300 shrink-0" aria-hidden="true" />
                                <span className="truncate">{s.title ?? "(untitled)"}</span>
                              </Link>
                              <a
                                href={s.url}
                                target="_blank"
                                rel="noreferrer"
                                title={s.url}
                                aria-label="Open source URL in a new tab"
                                onClick={(e) => e.stopPropagation()}
                                className="text-slate-300 hover:text-slate-500 transition-colors duration-150 shrink-0"
                              >
                                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                              </a>
                            </div>
                          </td>
                          <td className="px-4 py-3"><CategoryBadge category={s.service_category} /></td>
                          <td className="px-4 py-3 text-slate-500 font-mono tabular-nums">v{s.latest_chunked_version ?? "—"}</td>
                          <td className="px-4 py-3 text-right"><CountChip value={s.pending_count} band="warn" /></td>
                          <td className="px-4 py-3 text-right text-slate-600 font-mono tabular-nums">{s.approved_count}</td>
                          <td className="px-4 py-3 text-right"><CountChip value={s.rejected_count} band="warn" /></td>
                          <td className="px-4 py-3 text-right text-slate-500 font-medium font-mono tabular-nums">{s.total_chunks}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
