const STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  pending_review: { bg: "var(--status-pending-bg)", fg: "var(--status-pending)", label: "Pending review" },
  approved: { bg: "var(--status-approved-bg)", fg: "var(--status-approved)", label: "Approved" },
  rejected: { bg: "var(--status-rejected-bg)", fg: "var(--status-rejected)", label: "Rejected" },
  superseded: { bg: "var(--status-superseded-bg)", fg: "var(--status-superseded)", label: "Superseded" },
};

export function StatusBadge({ status }: { status: string }) {
  const style = STYLES[status] ?? { bg: "#f1f5f9", fg: "#475569", label: status };
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ backgroundColor: style.bg, color: style.fg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: style.fg }} />
      {style.label}
    </span>
  );
}

export function CategoryBadge({ category }: { category: string }) {
  return (
    <span
      title={category}
      className="inline-flex max-w-full items-center rounded-md bg-slate-100/80 text-slate-600 px-2 py-0.5 text-xs font-medium tracking-wide truncate"
    >
      {category}
    </span>
  );
}
