import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  UploadCloud,
  FileText,
  X,
  CheckCircle2,
  ArrowLeft,
  Link2,
  Tag,
  Type,
  FolderKanban,
  Globe,
  Users,
  StickyNote,
  UserCircle,
  Sparkles,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { uploadDocument, ApiError, type UploadResult } from "../api/client";
import { Card, ErrorBlock, INPUT_CLASS, Button } from "../components/Common";
import { KNOWN_CATEGORIES } from "../constants";

const LABEL_CLASS = "flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-1.5";

function StepHeading({ n, label, hint }: { n: number; label: string; hint?: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <div
        className="h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold text-white"
        style={{ backgroundColor: "var(--brand-blue)", boxShadow: "var(--shadow-pop)" }}
      >
        {n}
      </div>
      <div>
        <h2 className="text-sm font-semibold text-slate-800">{label}</h2>
        {hint && <p className="text-xs text-slate-400">{hint}</p>}
      </div>
    </div>
  );
}

export function UploadPage() {
  const { credentials } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [url, setUrl] = useState("");
  const [serviceCategory, setServiceCategory] = useState("");
  const [canonical, setCanonical] = useState(false);
  const [title, setTitle] = useState("");
  const [sourceGroup, setSourceGroup] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [applicantVariant, setApplicantVariant] = useState("");
  const [notes, setNotes] = useState("");
  const [actor, setActor] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);

  const canSubmit = !!file && !!url.trim() && !!serviceCategory.trim() && !!actor.trim() && !submitting;

  function pickFile(f: File | null) {
    setFile(f);
    setError(null);
    // A sensible default so "url" (the stable identifier the pipeline
    // versions against) isn't a blank field staff have to think hard
    // about for content that has no real public URL of its own.
    if (f && !url.trim()) {
      setUrl(`manual://${f.name}`);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) pickFile(dropped);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setSubmitting(true);
    setError(null);
    setResult(null);

    const form = new FormData();
    form.append("file", file);
    form.append("url", url.trim());
    form.append("service_category", serviceCategory.trim());
    form.append("canonical", String(canonical));
    if (title.trim()) form.append("title", title.trim());
    if (sourceGroup.trim()) form.append("source_group", sourceGroup.trim());
    if (jurisdiction.trim()) form.append("jurisdiction", jurisdiction.trim());
    if (applicantVariant.trim()) form.append("applicant_variant", applicantVariant.trim());
    if (notes.trim()) form.append("notes", notes.trim());
    form.append("actor", actor.trim());

    try {
      const res = await uploadDocument(credentials, form);
      setResult(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="max-w-2xl">
        <Card className="p-8 text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
            <CheckCircle2 className="h-6 w-6 text-emerald-600" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mb-1">
            {result.unchanged ? "No changes — already up to date" : `Uploaded as version ${result.version}`}
          </h2>
          <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto text-pretty">
            {result.unchanged
              ? result.message
              : `${result.chunks_created ?? 0} chunk(s) created, landed as pending_review — nothing is answerable by the chatbot until reviewed.`}
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button variant="primary" onClick={() => navigate(`/documents/${result.source_id}`)}>
              View document
            </Button>
            <Button variant="secondary" onClick={() => navigate("/review")}>
              Go to review queue
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative max-w-6xl">
      {/* Ambient brand-tinted glow behind the page — a flat white page has
          no depth; this gives the layout a light source without resorting
          to a heavy background image on what's otherwise a plain form. */}
      <div
        className="pointer-events-none absolute -top-24 -left-16 h-80 w-80 rounded-full blur-3xl opacity-[0.14] -z-10"
        style={{ backgroundColor: "var(--brand-blue)" }}
        aria-hidden="true"
      />

      <button
        onClick={() => navigate("/documents")}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-[var(--brand-blue)] transition-colors duration-150 mb-4 -ml-1 px-1 py-1 rounded-md"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Back to documents
      </button>

      <div className="flex items-start gap-4 mb-8">
        <div
          className="h-12 w-12 shrink-0 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: "var(--brand-blue-light)" }}
        >
          <UploadCloud className="h-6 w-6" style={{ color: "var(--brand-blue)" }} aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight text-balance">Upload document</h1>
          <p className="text-sm text-slate-500 mt-1.5 max-w-xl text-pretty">
            Add a PDF or HTML document through the same extract → chunk → embed → index pipeline the bulk fetcher
            uses. New chunks land as pending review — nothing here skips staff approval.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
          <div>
            <StepHeading n={1} label="Choose a file" hint="PDF or HTML, detected automatically" />
            <Card className="p-5">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 cursor-pointer transition-all duration-200 ${
                  dragActive
                    ? "border-[var(--brand-blue)] bg-[var(--brand-blue-light)] scale-[1.01]"
                    : "border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                {file ? (
                  <div
                    className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 px-4 py-2.5"
                    style={{ boxShadow: "var(--shadow-card)" }}
                  >
                    <FileText className="h-5 w-5 text-slate-400" aria-hidden="true" />
                    <div className="text-left">
                      <div className="text-sm font-medium text-slate-800">{file.name}</div>
                      <div className="text-xs text-slate-400 tabular-nums">{(file.size / 1024).toFixed(0)} KB</div>
                    </div>
                    <button
                      type="button"
                      aria-label="Remove file"
                      onClick={(e) => {
                        e.stopPropagation();
                        pickFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="text-slate-400 hover:text-slate-700 transition-colors duration-150 rounded-full p-1.5 hover:bg-slate-100"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div
                      className="h-11 w-11 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: "var(--brand-blue-light)" }}
                    >
                      <UploadCloud className="h-5 w-5" style={{ color: "var(--brand-blue)" }} aria-hidden="true" />
                    </div>
                    <p className="text-sm text-slate-500 mt-1">
                      <span className="font-medium text-[var(--brand-blue)]">Click to browse</span> or drag a
                      PDF/HTML file here
                    </p>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.html,.htm"
                  className="hidden"
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                />
              </div>
            </Card>
          </div>

          <div>
            <StepHeading n={2} label="Identify the source" hint="How the pipeline tracks and versions this content" />
            <Card className="p-5 space-y-4">
              <div>
                <label className={LABEL_CLASS}>
                  <Link2 className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                  Canonical identifier (URL) <span className="text-red-500">*</span>
                </label>
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://... or manual://a-short-name"
                  className={INPUT_CLASS}
                />
                <p className="text-xs text-slate-400 mt-1">
                  Re-uploading the same identifier with changed content creates a new version and supersedes the old
                  one, exactly like a re-fetch. Use a real URL if this content has one, otherwise a made-up{" "}
                  <code className="bg-slate-100 px-1 rounded">manual://</code> name works fine.
                </p>
              </div>

              <div>
                <label className={LABEL_CLASS}>
                  <Tag className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                  Service category <span className="text-red-500">*</span>
                </label>
                <input
                  list="known-categories"
                  value={serviceCategory}
                  onChange={(e) => setServiceCategory(e.target.value)}
                  placeholder="e.g. oci"
                  className={INPUT_CLASS}
                />
                <datalist id="known-categories">
                  {KNOWN_CATEGORIES.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer mt-2.5">
                  <input
                    type="checkbox"
                    checked={canonical}
                    onChange={(e) => setCanonical(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 accent-[var(--brand-blue)]"
                  />
                  This is the canonical (authoritative) source for its topic
                </label>
              </div>
            </Card>
          </div>

          <div>
            <StepHeading n={3} label="Add details" hint="Optional — helps staff browse and filter later" />
            <Card className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL_CLASS}>
                    <Type className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                    Title
                  </label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Shown in the documents list"
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label className={LABEL_CLASS}>
                    <FolderKanban className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                    Source group
                  </label>
                  <input
                    value={sourceGroup}
                    onChange={(e) => setSourceGroup(e.target.value)}
                    placeholder="Defaults to “Manual uploads”"
                    className={INPUT_CLASS}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL_CLASS}>
                    <Globe className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                    Jurisdiction
                  </label>
                  <input
                    value={jurisdiction}
                    onChange={(e) => setJurisdiction(e.target.value)}
                    placeholder="Defaults to “all”"
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label className={LABEL_CLASS}>
                    <Users className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                    Applicant variant
                  </label>
                  <input
                    value={applicantVariant}
                    onChange={(e) => setApplicantVariant(e.target.value)}
                    placeholder="Comma-separated, optional"
                    className={INPUT_CLASS}
                  />
                </div>
              </div>

              <div>
                <label className={LABEL_CLASS}>
                  <StickyNote className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Optional internal note about this source"
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label className={LABEL_CLASS}>
                  <UserCircle className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                  Your name/email <span className="text-red-500">*</span>
                </label>
                <input
                  value={actor}
                  onChange={(e) => setActor(e.target.value)}
                  placeholder="for the audit log"
                  className={INPUT_CLASS}
                />
              </div>
            </Card>
          </div>

          {error && <ErrorBlock message={error} />}

          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" disabled={!canSubmit}>
              {submitting ? "Uploading…" : "Upload document"}
            </Button>
            {!canSubmit && !submitting && (
              <span className="text-xs text-slate-400">File, canonical identifier, category, and your name are required.</span>
            )}
          </div>
        </div>

        {/* Live summary — turns a static form into something that reflects
            back what's about to happen, instead of a wall of blank inputs
            with no feedback until submit. */}
        <div className="lg:col-span-1 lg:sticky lg:top-20 space-y-4">
          <Card className="p-5">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Summary
            </div>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs text-slate-400">File</dt>
                <dd className={file ? "text-slate-800 font-medium truncate" : "text-slate-300 italic"}>
                  {file ? file.name : "Not chosen yet"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Category</dt>
                <dd className={serviceCategory ? "text-slate-800 font-medium" : "text-slate-300 italic"}>
                  {serviceCategory || "Not set"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Identifier</dt>
                <dd className={url ? "text-slate-800 font-medium break-all" : "text-slate-300 italic"}>
                  {url || "Not set"}
                </dd>
              </div>
              {canonical && (
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium" style={{ backgroundColor: "var(--brand-blue-light)", color: "var(--brand-blue-dark)" }}>
                  Canonical source
                </span>
              )}
            </dl>
          </Card>

          <Card className="p-5" style={{ backgroundColor: "var(--brand-blue-light)", borderColor: "transparent" }}>
            <p className="text-xs leading-relaxed" style={{ color: "var(--brand-blue-dark)" }}>
              New chunks always land as <strong>pending review</strong> — nothing becomes answerable by the live
              chatbot until a staff member approves it on the Review page. Uploading is safe to experiment with.
            </p>
          </Card>
        </div>
      </form>
    </div>
  );
}
