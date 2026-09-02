import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { getEvalRun, type EvalRunDetail, type GenerationItem } from "../api/client";
import { PageHeader } from "../components/Nav";
import { Card, LoadingBlock, ErrorBlock, StatPill } from "../components/Common";
import { CategoryBadge } from "../components/StatusBadge";

function pct(v: number | undefined): string {
  return v === undefined ? "—" : `${(v * 100).toFixed(0)}%`;
}

// A should-decline item that scored a high faithfulness/relevancy from the
// judge, but whose answer doesn't read like a decline, is exactly the
// failure mode a same-family judge can miss (see kb_admin/eval/judge.py's
// docstring on self-preference bias) -- surfaced here rather than left to
// blend into an average.
const DECLINE_PHRASES = ["don't have approved", "do not have approved", "contact the consulate", "hasn't been reviewed", "not have approved information"];

function looksLikeDecline(answer: string): boolean {
  const lower = answer.toLowerCase();
  return DECLINE_PHRASES.some((p) => lower.includes(p));
}

function suspiciousDecline(item: GenerationItem): boolean {
  return item.expect_decline && (item.faithfulness ?? 0) >= 0.7 && !looksLikeDecline(item.answer);
}

export function EvalRunDetailPage() {
  const { runId = "" } = useParams();
  const { credentials } = useAuth();
  const navigate = useNavigate();

  const [run, setRun] = useState<EvalRunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    getEvalRun(credentials, runId)
      .then(setRun)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  if (error) return <ErrorBlock message={error} />;
  if (!run) return <LoadingBlock label="Loading run…" />;

  const suspiciousItems = run.generation?.per_item.filter(suspiciousDecline) ?? [];

  return (
    <div>
      <PageHeader
        title={run.run_id}
        description={`${run.golden_set_size} golden-set items · ${run.sme_reviewed_count} SME-reviewed`}
        action={
          <button onClick={() => navigate("/eval")} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to runs
          </button>
        }
      />

      {suspiciousItems.length > 0 && (
        <Card className="p-4 mb-6 border-amber-300 bg-amber-50">
          <div className="flex items-start gap-2 text-sm text-amber-800">
            <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <strong>{suspiciousItems.length} should-decline item(s)</strong> scored a high faithfulness/relevancy
              from the judge, but the answer doesn't read like a decline — worth a manual look, since the judge is
              the same model family generating the answers (see the run's generation table below).
            </div>
          </div>
        </Card>
      )}

      <h2 className="text-sm font-semibold text-slate-700 mb-3">Retrieval — k={run.retrieval.k}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <StatPill label="Precision" value={pct(run.retrieval.overall.precision_at_k)} />
        <StatPill label="Recall" value={pct(run.retrieval.overall.recall_at_k)} />
        <StatPill label="Hit rate" value={pct(run.retrieval.overall.hit_rate)} tone="good" />
        <StatPill label="MRR" value={pct(run.retrieval.overall.mrr)} />
        <StatPill label="NDCG" value={pct(run.retrieval.overall.ndcg_at_k)} />
      </div>

      <Card className="mb-8 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
              <th className="px-4 py-2.5 font-medium">Category</th>
              <th className="px-4 py-2.5 font-medium text-right">n</th>
              <th className="px-4 py-2.5 font-medium text-right">Precision</th>
              <th className="px-4 py-2.5 font-medium text-right">Recall</th>
              <th className="px-4 py-2.5 font-medium text-right">Hit rate</th>
              <th className="px-4 py-2.5 font-medium text-right">MRR</th>
              <th className="px-4 py-2.5 font-medium text-right">NDCG</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(run.retrieval.by_category)
              .sort((a, b) => b[1].n - a[1].n)
              .map(([cat, m]) => (
                <tr key={cat} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2"><CategoryBadge category={cat} /></td>
                  <td className="px-4 py-2 text-right text-slate-500">{m.n}</td>
                  <td className="px-4 py-2 text-right">{pct(m.precision_at_k)}</td>
                  <td className="px-4 py-2 text-right">{pct(m.recall_at_k)}</td>
                  <td className="px-4 py-2 text-right">{pct(m.hit_rate)}</td>
                  <td className="px-4 py-2 text-right">{pct(m.mrr)}</td>
                  <td className="px-4 py-2 text-right">{pct(m.ndcg_at_k)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </Card>

      {run.generation && (
        <>
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Generation quality</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <StatPill label="Faithfulness" value={pct(run.generation.overall.faithfulness)} />
            <StatPill label="Relevancy" value={pct(run.generation.overall.answer_relevancy)} />
            <StatPill label="Context recall" value={pct(run.generation.overall.context_recall)} />
            <StatPill label="Citation acc." value={pct(run.generation.overall.citation_accuracy)} />
          </div>

          <Card className="divide-y divide-slate-100">
            {run.generation.per_item.map((item) => {
              const suspicious = suspiciousDecline(item);
              const expanded = expandedId === item.id;
              return (
                <div key={item.id} className={`p-4 ${suspicious ? "bg-amber-50/60" : ""}`}>
                  <button
                    onClick={() => setExpandedId(expanded ? null : item.id)}
                    className="w-full flex items-center justify-between gap-3 text-left"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {suspicious && <TriangleAlert className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                      <CategoryBadge category={item.category} />
                      <span className="text-sm text-slate-700 truncate">{item.query}</span>
                      {item.expect_decline && (
                        <span className="text-[11px] text-slate-400 shrink-0">(should decline)</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 shrink-0">
                      <span>F {pct(item.faithfulness)}</span>
                      <span>R {pct(item.answer_relevancy)}</span>
                    </div>
                  </button>
                  {expanded && (
                    <div className="mt-3 text-sm text-slate-600 bg-slate-50 rounded-lg p-3 whitespace-pre-wrap">
                      {item.answer}
                    </div>
                  )}
                </div>
              );
            })}
          </Card>
        </>
      )}
    </div>
  );
}
