import { AlertTriangle, Loader2, Inbox } from "lucide-react";
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

// Shared text-input styling so every form field across the app (upload,
// review, filters) looks and behaves the same, instead of each page
// re-typing the same Tailwind string with tiny drifts between them.
export const INPUT_CLASS =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 shadow-[inset_0_1px_2px_rgba(15,23,42,0.03)] transition-all duration-150 focus:outline-none focus:border-[var(--brand-blue)] focus:ring-4 focus:ring-[var(--brand-blue)]/10";

// One button system for the whole app. Every page was hand-rolling its own
// button classes (Upload's submit button, Documents' "Upload document"
// link, Eval's "Run eval") with slightly different padding, so buttons
// felt randomly sized next to each other -- this is the single source of
// truth for size + variant, usable on <button> via <Button> or on
// non-button elements (<Link>, <a>) via buttonClass() directly.
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-xl text-sm font-medium transition-all duration-150 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100";

const BUTTON_SIZE: Record<ButtonVariant, string> = {
  primary: "px-4 py-2.5",
  secondary: "px-4 py-2.5",
  ghost: "px-3 py-2",
  danger: "px-4 py-2.5",
};

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: "text-white hover:brightness-110",
  secondary: "text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-400",
  ghost: "text-slate-500 hover:text-slate-800 hover:bg-slate-100",
  danger: "text-red-700 bg-red-50 hover:bg-red-100",
};

export function buttonClass(variant: ButtonVariant = "secondary", className = ""): string {
  return `${BUTTON_BASE} ${BUTTON_SIZE[variant]} ${BUTTON_VARIANT[variant]} ${className}`;
}

export function Button({
  variant = "secondary",
  className = "",
  style,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={buttonClass(variant, className)}
      style={variant === "primary" ? { backgroundColor: "var(--brand-blue)", boxShadow: "var(--shadow-pop)", ...style } : style}
      {...props}
    />
  );
}

export function Card({
  children,
  className = "",
  interactive = false,
  flat = false,
  style,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  /** Hairline border, no shadow — for screens where every surface should
   * use one consistent treatment instead of shadow+border competing (see
   * EvalPage). Default keeps the soft tinted-shadow look used elsewhere. */
  flat?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`bg-white rounded-2xl transition-shadow duration-200 ${
        flat ? "border border-slate-200" : "border border-slate-200/70"
      } ${interactive && !flat ? "hover:shadow-[var(--shadow-card-hover)] cursor-pointer" : ""} ${
        interactive && flat ? "hover:border-slate-300 cursor-pointer" : ""
      } ${className}`}
      style={flat ? style : { boxShadow: "var(--shadow-card)", ...style }}
    >
      {children}
    </div>
  );
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
      <Loader2 className="h-6 w-6 animate-spin mb-2" style={{ color: "var(--brand-blue)" }} />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2.5 text-sm text-red-700 bg-red-50/80 border border-red-200/80 rounded-xl px-4 py-3">
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div
        className="h-12 w-12 rounded-full flex items-center justify-center mb-3"
        style={{ backgroundColor: "var(--brand-blue-light)" }}
      >
        <Inbox className="h-5 w-5" style={{ color: "var(--brand-blue)" }} />
      </div>
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {description && <p className="text-xs mt-1 max-w-sm text-slate-400">{description}</p>}
    </div>
  );
}

export function StatPill({ label, value, tone = "default" }: { label: string; value: string | number; tone?: "default" | "good" | "bad" | "warn" }) {
  const toneClasses: Record<string, string> = {
    default: "bg-slate-50 text-slate-700 border-slate-200/70",
    good: "bg-emerald-50/70 text-emerald-700 border-emerald-200/60",
    bad: "bg-red-50/70 text-red-700 border-red-200/60",
    warn: "bg-amber-50/70 text-amber-700 border-amber-200/60",
  };
  return (
    <div className={`rounded-xl border px-3.5 py-2.5 ${toneClasses[tone]}`}>
      <div className="text-[11px] uppercase tracking-wider opacity-65 font-medium">{label}</div>
      <div className="text-xl font-semibold leading-tight tabular-nums mt-0.5">{value}</div>
    </div>
  );
}
