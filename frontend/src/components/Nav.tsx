import { NavLink } from "react-router-dom";
import { FileStack, ClipboardCheck, LineChart, LogOut, RefreshCw } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { Button } from "./Common";

const links = [
  { to: "/documents", label: "Documents", icon: FileStack },
  { to: "/review", label: "Review", icon: ClipboardCheck },
  { to: "/eval", label: "Evaluation", icon: LineChart },
];

export function Nav() {
  const { logout } = useAuth();
  return (
    <header className="sticky top-0 z-10 bg-white/85 backdrop-blur-md border-b border-slate-200/80">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center h-14 gap-6">
        <div className="flex items-center gap-2 font-semibold text-slate-900">
          <div
            className="h-7 w-7 rounded-lg flex items-center justify-center text-white text-xs font-bold"
            style={{ backgroundColor: "var(--brand-blue)", boxShadow: "var(--shadow-pop)" }}
          >
            KB
          </div>
          <span className="hidden sm:inline">KB Admin</span>
        </div>

        <nav className="flex items-center gap-1 flex-1">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors duration-150 ${
                  isActive
                    ? "bg-[var(--brand-blue-light)] text-[var(--brand-blue-dark)]"
                    : "text-slate-600 hover:bg-slate-100"
                }`
              }
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>

        <Button variant="ghost" onClick={logout}>
          <LogOut className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </div>
    </header>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight text-balance">{title}</h1>
        {description && <p className="text-sm text-slate-500 mt-1.5 max-w-xl text-pretty">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function RefreshButton({ onClick, loading }: { onClick: () => void; loading?: boolean }) {
  return (
    <Button variant="secondary" onClick={onClick} disabled={loading} aria-label="Refresh">
      <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
      Refresh
    </Button>
  );
}
