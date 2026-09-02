import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Card } from "./Common";

export type MetricBand = "good" | "warn" | "bad" | "neutral";

/** Threshold bands shared by every metric card in the app (Evaluation's
 * score tiles, Documents' stat/status cells) — a single vocabulary so a
 * viewer scanning quickly can tell "fine" from "needs attention" without
 * reading every label. Deliberately uniform rather than per-metric-tuned:
 * the point is a fast visual signal, not a statistically precise verdict
 * (e.g. Precision@K is structurally capped low regardless of quality —
 * it's still useful for it to visibly stand out, that's the golden set's
 * whole job: surfacing where to look closer, not passing judgment). */
export function bandFor(value: number | undefined): MetricBand {
  if (value === undefined) return "neutral";
  if (value >= 0.7) return "good";
  if (value >= 0.4) return "warn";
  return "bad";
}

export const BAND_STYLE: Record<MetricBand, { border: string; text: string; dot: string; bg: string }> = {
  good: { border: "var(--metric-good-border)", text: "var(--metric-good)", dot: "var(--metric-good)", bg: "var(--metric-good-bg)" },
  warn: { border: "var(--metric-warn-border)", text: "var(--metric-warn)", dot: "var(--metric-warn)", bg: "var(--metric-warn-bg)" },
  bad: { border: "var(--metric-bad-border)", text: "var(--metric-bad)", dot: "var(--metric-bad)", bg: "var(--metric-bad-bg)" },
  neutral: { border: "transparent", text: "#0f172a", dot: "#94a3b8", bg: "transparent" },
};

/** Animates a displayed number toward `target` over ~500ms — a static
 * number that just appears reads as inert; a number that counts up to its
 * value reads as live data, without being gimmicky about it. Works for
 * both 0–1 fractions (Evaluation's percentages) and raw counts
 * (Documents' source/chunk totals) — the caller decides how to format it. */
function useCountUp(target: number | undefined, durationMs = 500): number | undefined {
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);

  useEffect(() => {
    if (target === undefined) {
      setDisplay(undefined);
      return;
    }
    const from = fromRef.current ?? target;
    fromRef.current = target;
    if (from === target) {
      setDisplay(target);
      return;
    }
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplay(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return display;
}

export function MetricCard({
  label,
  value,
  format = "percent",
  band: bandOverride,
  icon,
  size = "md",
}: {
  label: string;
  value: number | undefined;
  /** "percent" formats a 0–1 fraction as "57%" and auto-derives the
   * semantic band from thresholds; "count" formats a raw integer as-is
   * (e.g. "48") and never auto-derives a band — pass `band` explicitly,
   * since a count has no inherent "good/bad" direction on its own
   * (Sources=48 isn't good or bad, it's just a fact). */
  format?: "percent" | "count";
  band?: MetricBand;
  icon?: ReactNode;
  size?: "md" | "lg";
}) {
  const band = bandOverride ?? (format === "percent" ? bandFor(value) : "neutral");
  const style = BAND_STYLE[band];
  const animated = useCountUp(value);
  const display = animated === undefined ? "—" : format === "percent" ? `${(animated * 100).toFixed(0)}%` : Math.round(animated).toLocaleString();

  return (
    <Card flat className="p-4 border-l-[3px]" style={{ borderLeftColor: style.border }}>
      <div className="flex items-center gap-1.5 mb-1.5">
        {icon ? (
          <span className="shrink-0" style={{ color: style.dot }} aria-hidden="true">
            {icon}
          </span>
        ) : (
          band !== "neutral" && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: style.dot }} aria-hidden="true" />
        )}
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 truncate">{label}</div>
      </div>
      <div
        className={`font-mono font-semibold tabular-nums tracking-tight ${size === "lg" ? "text-4xl" : "text-2xl"}`}
        style={{ color: band === "neutral" ? undefined : style.text }}
      >
        {display}
      </div>
    </Card>
  );
}

export function MetricCardSkeleton({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <Card flat className="p-4 border-l-[3px]" style={{ borderLeftColor: "#e2e8f0" }}>
      <div className="h-2.5 w-16 rounded bg-slate-200 mb-2.5 animate-skeleton" />
      <div className={`rounded bg-slate-200 animate-skeleton ${size === "lg" ? "h-9 w-24" : "h-6 w-14"}`} />
    </Card>
  );
}

/** Small inline count chip for table cells — Documents' Pending/Rejected
 * columns. Same band vocabulary/colors as MetricCard, scaled down for a
 * dense row instead of a standalone card. Renders plain muted text at 0
 * (nothing to flag) and a tinted chip once there's a non-zero count worth
 * noticing, so a fully-resolved row stays visually quiet. */
export function CountChip({ value, band }: { value: number; band: MetricBand }) {
  if (value === 0) {
    return <span className="text-slate-300 tabular-nums font-mono">0</span>;
  }
  const style = BAND_STYLE[band];
  return (
    <span
      className="inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold font-mono tabular-nums"
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {value.toLocaleString()}
    </span>
  );
}
