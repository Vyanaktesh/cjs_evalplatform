import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, ExternalLink, GitCompare } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { getDocument, getSourceDiff, type DocumentDetail, type SourceDiff } from "../api/client";
import { PageHeader } from "../components/Nav";
import { Card, LoadingBlock, ErrorBlock } from "../components/Common";
import { StatusBadge, CategoryBadge } from "../components/StatusBadge";

export function DocumentDetailPage() {
  const { sourceId = "" } = useParams();
  const { credentials } = useAuth();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [diff, setDiff] = useState<SourceDiff | null>(null);
  const [showDiff, setShowDiff] = useState(false);

  useEffect(() => {
    getDocument(credentials, sourceId)
      .then(setDetail)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId]);

  async function loadDiff() {
    setShowDiff(true);
    try {
      const d = await getSourceDiff(credentials, sourceId);
      setDiff(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (error) return <ErrorBlock message={error} />;
  if (!detail) return <LoadingBlock label="Loading document…" />;

  const { source, versions, latest_version_chunks } = detail;

  return (
    <div>
      <PageHeader
        title={source.title ?? "(untitled)"}
        description={source.url}
        action={
          <button
            onClick={() => navigate("/documents")}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
        }
      />

      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <CategoryBadge category={source.service_category} />
        {source.canonical && (
          <span className="text-xs font-medium text-[var(--brand-blue-dark)] bg-[var(--brand-blue-light)] rounded-full px-2.5 py-0.5">
            Canonical
          </span>
        )}
        <a
          href={source.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
        >
          <ExternalLink className="h-3 w-3" />
          Open original
        </a>
        {versions.length > 1 && (
          <button
            onClick={loadDiff}
            className="flex items-center gap-1 text-xs font-medium text-slate-600 border border-slate-300 rounded-full px-2.5 py-0.5 hover:bg-slate-50"
          >
            <GitCompare className="h-3 w-3" />
            Diff latest vs previous
          </button>
        )}
      </div>

      {source.notes && (
        <Card className="p-4 mb-6 text-sm text-slate-600">
          <span className="font-medium text-slate-700">Notes: </span>
          {source.notes}
        </Card>
      )}

      {showDiff && (
        <Card className="p-5 mb-6">
          {!diff ? (
            <LoadingBlock label="Loading diff…" />
          ) : (
            <div>
              <h3 className="text-sm font-semibold text-slate-800 mb-2">
                v{diff.previous_version} → v{diff.latest_version}
              </h3>
              <div className="flex gap-4 text-xs text-slate-500 mb-3">
                <span>{diff.unchanged_chunk_count} unchanged</span>
                <span className="text-emerald-600">+{diff.added_chunk_indices.length} added</span>
                <span className="text-red-500">-{diff.removed_chunk_indices.length} removed</span>
              </div>
              <pre className="thin-scroll text-xs bg-slate-900 text-slate-100 rounded-lg p-4 overflow-x-auto max-h-96">
                {diff.unified_diff || "(no textual diff)"}
              </pre>
            </div>
          )}
        </Card>
      )}

      <h2 className="text-sm font-semibold text-slate-700 mb-2">Versions</h2>
      <Card className="mb-6 divide-y divide-slate-100">
        {versions
          .slice()
          .reverse()
          .map((v) => (
            <div key={v.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span className="font-medium text-slate-700">v{v.version}</span>
              <span className="text-slate-400 text-xs">{new Date(v.retrieval_date).toLocaleString()}</span>
              <span className="text-slate-400 text-xs">{v.fetch_status}</span>
            </div>
          ))}
      </Card>

      <h2 className="text-sm font-semibold text-slate-700 mb-2">
        Latest version chunks ({latest_version_chunks.length})
      </h2>
      <Card className="divide-y divide-slate-100">
        {latest_version_chunks.map((c) => (
          <div key={c.id} className="px-4 py-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-slate-400">#{c.chunk_index}</span>
              <StatusBadge status={c.review_status} />
            </div>
            <p className="text-sm text-slate-700 line-clamp-3">{c.chunk_text}</p>
          </div>
        ))}
      </Card>

      <div className="mt-4">
        <Link to={`/review?source_id=${sourceId}`} className="text-sm font-medium text-[var(--brand-blue)] hover:underline">
          Review this source's pending chunks →
        </Link>
      </div>
    </div>
  );
}
