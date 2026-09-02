import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { login as loginRequest, ApiError } from "../api/client";
import { LockKeyhole, ShieldAlert } from "lucide-react";

/**
 * A real login: POST /auth/login exchanges username/password for a
 * short-lived signed JWT (kb_admin/core/auth.py), and only that token is
 * kept afterward — the password itself is never held past the login
 * request. The token is cached in sessionStorage so a page refresh (or
 * opening a second tab via "duplicate tab") doesn't force signing in
 * again; it's cleared on tab close and on explicit sign-out, and the
 * backend rejects it on its own after settings.jwt_expiry_hours regardless
 * of whether anyone signs out.
 */

const STORAGE_KEY = "kb_admin_token";

type AuthContextValue = {
  credentials: string; // the JWT, kept as `credentials` for minimal call-site churn
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthGate>");
  return ctx;
}

function readStoredToken(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // private browsing / storage disabled — fall back to logging in each time
  }
}

function storeToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(STORAGE_KEY, token);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable — token still works for this tab via React state
  }
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => readStoredToken());
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  function logout() {
    setToken(null);
    storeToken(null);
  }

  if (token) {
    return (
      <AuthContext.Provider value={{ credentials: token, logout }}>
        {children}
      </AuthContext.Provider>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setChecking(true);
    try {
      const newToken = await loginRequest(username, password);
      storeToken(newToken);
      setToken(newToken);
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 401
          ? "Invalid username or password."
          : "Couldn't reach the kb_admin server. Is it running?",
      );
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div
            className="h-12 w-12 rounded-2xl flex items-center justify-center mb-3"
            style={{ backgroundColor: "var(--brand-blue-light)" }}
          >
            <LockKeyhole className="h-6 w-6" style={{ color: "var(--brand-blue)" }} />
          </div>
          <h1 className="text-lg font-semibold text-slate-900">KB Admin</h1>
          <p className="text-sm text-slate-500">Consulate RAG Chatbot — staff access only</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
            <input
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)] focus:border-transparent"
              placeholder="admin"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)] focus:border-transparent"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={checking}
            className="w-full rounded-lg py-2 text-sm font-medium text-white transition disabled:opacity-60"
            style={{ backgroundColor: "var(--brand-blue)" }}
          >
            {checking ? "Checking…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
