import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Play, ChevronRight, History, LineChart, Sparkles, ShieldAlert, ShieldCheck } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { listEvalRuns, triggerEvalRun, type EvalRunSummary, type MetricSet } from "../api/client";
import { RefreshButton } from "../components/Nav";
import { Card, LoadingBlock, ErrorBlock, EmptyState, Button } from "../components/Common";
import { MetricCard, MetricCardSkeleton } from "../components/MetricCard";
import { TrendChart } from "../components/TrendChart";

function pct(v: number | undefined): string {
  return v === undefined ? "—" : `${(v * 100).toFixed(0)}%`;
}

type TrendMetric = { key: keyof MetricSet; label: string };
const RETRIEVAL_TREND_METRICS: TrendMetric[] = [
  { key: "recall_at_k", label: "Recall@k" },
  { key: "precision_at_k", label: "Precision@k" },
  { key: "hit_rate", label: "Hit rate" },
  { key: "mrr", label: "MRR" },
];

export function EvalPage() {
  const { credentials } = useAuth();
  const navigate = useNavigate();

  const [runs, setRuns] = useState<EvalRunSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [includeGeneration, setIncludeGeneration] = useState(false);
  const [running, setRunning] = useState(false);
  const [trendMetric, setTrendMetric] = useState<TrendMetric>(RETRIEVAL_TREND_METRICS[0]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { runs } = await listEvalRuns(credentials);
      setRuns(runs);
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

  async function runEval() {
    setRunning(true);
    setError(null);
    try {
      const result = await triggerEvalRun(credentials, { include_generation: includeGeneration, k: 8 });
      setShowForm(false);
      navigate(`/eval/${encodeURIComponent(result.run_id)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  const latest = runs && runs.length > 0 ? runs[runs.length - 1] : null;
  const trendPoints = useMemo(
    () =>
      (runs ?? []).map((r) => ({
        label: r.run_id,
        value: (r.retrieval_overall[trendMetric.key] as number | undefined) ?? 0,
      })),
    [runs, trendMetric],
  );

  const reviewedFraction = latest ? latest.sme_reviewed_count / Math.max(1, latest.golden_set_size) : 0;
  const isReviewed = reviewedFraction >= 1;

  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute -top-24 right-0 h-80 w-80 rounded-full blur-3xl opacity-[0.12] -z-10"
        style={{ backgroundColor: "var(--brand-blue)" }}
        aria-hidden="true"
      />

      <div className="flex items-start justify-between gap-4 mb-8">
        <div className="flex items-start gap-4">
          <div
            className="h-12 w-12 shrink-0 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: "var(--brand-blue-light)" }}
          >
            <LineChart className="h-6 w-6" style={{ color: "var(--brand-blue)" }} aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight text-balance">Evaluation</h1>
            <p className="text-sm text-slate-500 mt-1.5 max-w-lg text-pretty">
              Retrieval + generation quality, measured against a golden set built from real citizen queries.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <RefreshButton onClick={load} loading={loading} />
          <Button variant="primary" onClick={() => setShowForm((s) => !s)} aria-expanded={showForm}>
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            Run eval
          </Button>
        </div>
      </div>

      {showForm && (
        <Card flat className="p-5 mb-6 flex items-start gap-4">
          <div
            className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center mt-0.5"
            style={{ backgroundColor: "var(--brand-blue-light)" }}
          >
            <Sparkles className="h-4 w-4" style={{ color: "var(--brand-blue)" }} aria-hidden="true" />
          </div>
          <div className="flex-1">
            <label className="flex items-start gap-2.5 text-sm text-slate-700 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={includeGeneration}
                onChange={(e) => setIncludeGeneration(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-[var(--brand-blue)]"
              />
              <span>
                Include generation quality (faithfulness, relevancy, citation accuracy)
                <br />
                <span className="text-xs text-slate-400">
                  Calls the live chatbot pipeline plus a Gemini judge for every item — free tier, but rate-limited,
                  so this can take several minutes for the full set. Retrieval-only runs in seconds.
                </span>
              </span>
            </label>
            <Button variant="primary" onClick={runEval} disabled={running}>
              {running ? "Running…" : "Start run"}
            </Button>
          </div>
        </Card>
      )}

      {error && <ErrorBlock message={error} />}

      {!error && (
        <>
          {loading && !runs && (
            <div className="space-y-4 mb-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <MetricCardSkeleton key={i} />
                ))}
              </div>
            </div>
          )}

          {latest && (
            <>
              {/* Run metadata + inline confidence indicator, replacing a
                  separate bolted-on alert box — SME-review coverage is
                  metadata about this run, same tier of information as the
                  run id and item count, not a distinct alarm. */}
              <div className="flex items-center flex-wrap gap-x-3 gap-y-1.5 mb-4 text-sm">
                <span className="text-slate-400">Latest run</span>
                <span className="font-mono text-slate-700">{latest.run_id}</span>
                <span className="text-slate-300">·</span>
                <span className="text-slate-400">{latest.golden_set_size} items</span>
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ml-auto"
                  style={
                    isReviewed
                      ? { backgroundColor: "var(--metric-good-bg)", color: "var(--metric-good)" }
                      : { backgroundColor: "var(--metric-warn-bg)", color: "var(--metric-warn)" }
                  }
                  title={
                    isReviewed
                      ? "Every golden-set item has been confirmed correct by a subject-matter expert."
                      : "Scores are computed against a golden set that hasn't been fully verified yet — treat as directional, not final."
                  }
                >
                  {isReviewed ? <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> : <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />}
                  {latest.sme_reviewed_count}/{latest.golden_set_size} SME-reviewed
                </span>
              </div>

              {/* Retrieval cluster — distinct zone via a tinted wrapper,
                  not just a text label sitting above a uniform grid. */}
              <div className="rounded-2xl p-5 mb-4 animate-fade-in-up" style={{ backgroundColor: "#f8fafc" }}>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">Retrieval</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <MetricCard label="Precision@k" value={latest.retrieval_overall.precision_at_k} />
                  <MetricCard label="Recall@k" value={latest.retrieval_overall.recall_at_k} />
                  <MetricCard label="Hit rate" value={latest.retrieval_overall.hit_rate} />
                  <MetricCard label="MRR" value={latest.retrieval_overall.mrr} />
                </div>
              </div>

              {/* Generation cluster — same pattern, brand-tinted instead of
                  neutral so it reads as a second, distinct zone rather
                  than a continuation of the first. */}
              {latest.generation_overall && (
                <div className="rounded-2xl p-5 mb-6 animate-fade-in-up" style={{ backgroundColor: "var(--brand-blue-light)" }}>
                  <div className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--brand-blue-dark)", opacity: 0.7 }}>
                    Generation
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <MetricCard label="Faithfulness" value={latest.generation_overall.faithfulness} />
                    <MetricCard label="Relevancy" value={latest.generation_overall.answer_relevancy} />
                    <MetricCard label="Context recall" value={latest.generation_overall.context_recall} />
                    <MetricCard label="Citation acc." value={latest.generation_overall.citation_accuracy} />
                  </div>
                </div>
              )}
            </>
          )}

          {runs && runs.length > 1 && (
            <Card flat className="p-6 mb-6">
              <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">Trend</h3>
                  <p className="text-xs text-slate-400">Across {runs.length} runs, oldest to newest</p>
                </div>
                <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                  {RETRIEVAL_TREND_METRICS.map((m) => (
                    <button
                      key={m.key}
                      onClick={() => setTrendMetric(m)}
                      className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors duration-150 ${
                        trendMetric.key === m.key ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-3">
                <TrendChart points={trendPoints} target={0.7} height={220} />
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-1">
                <span className="inline-block h-px w-3 border-t border-dashed" style={{ borderColor: "var(--metric-warn)" }} />
                70% target reference
              </div>
            </Card>
          )}

          <div className="flex items-center gap-2 mb-3">
            <History className="h-4 w-4 text-slate-400" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-slate-700">Run history</h3>
          </div>
          <Card flat>
            {loading && !runs ? (
              <LoadingBlock label="Loading eval runs…" />
            ) : !runs || runs.length === 0 ? (
              <EmptyState title="No eval runs yet" description="Click “Run eval” to score the golden set for the first time." />
            ) : (
              <div className="divide-y divide-slate-100">
                {runs
                  .slice()
                  .reverse()
                  .map((r) => (
                    <Link
                      key={r.run_id}
                      to={`/eval/${encodeURIComponent(r.run_id)}`}
                      className="flex items-center justify-between px-4 py-3.5 hover:bg-[var(--brand-blue-light)]/50 transition-colors duration-150 first:rounded-t-2xl last:rounded-b-2xl"
                    >
                      <div>
                        <div className="text-sm font-medium text-slate-800 font-mono">{r.run_id}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{r.golden_set_size} items · {r.sme_reviewed_count} reviewed</div>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-500 font-mono tabular-nums">
                        <span>recall {pct(r.retrieval_overall.recall_at_k)}</span>
                        {r.generation_overall && <span>faithfulness {pct(r.generation_overall.faithfulness)}</span>}
                        <ChevronRight className="h-4 w-4 text-slate-300 font-sans" aria-hidden="true" />
                      </div>
                    </Link>
                  ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
