import { useState } from "react";
import { useAuth, enterAsPoc } from "@/lib/auth.js";

type Mode = "signin" | "signup" | "forgot";

const SunLogo = ({ onClick }: { onClick?: () => void }) => (
  <svg
    className="h-12 w-12 text-amber-500 cursor-default select-none"
    fill="currentColor"
    viewBox="0 0 24 24"
    onClick={onClick}
    aria-hidden="true"
  >
    <path d="M12 2a1 1 0 011 1v1a1 1 0 01-2 0V3a1 1 0 011-1zm0 17a1 1 0 011 1v1a1 1 0 01-2 0v-1a1 1 0 011-1zM4.22 4.22a1 1 0 011.42 0l.7.71a1 1 0 01-1.41 1.41l-.71-.7a1 1 0 010-1.42zm13.44 13.44a1 1 0 011.41 0l.71.7a1 1 0 01-1.41 1.42l-.71-.71a1 1 0 010-1.41zM2 12a1 1 0 011-1h1a1 1 0 010 2H3a1 1 0 01-1-1zm17 0a1 1 0 011-1h1a1 1 0 010 2h-1a1 1 0 01-1-1zM4.93 18.36a1 1 0 010-1.42l.7-.7a1 1 0 111.42 1.41l-.71.71a1 1 0 01-1.41 0zm12.73-12.73a1 1 0 010-1.41l.71-.71a1 1 0 111.41 1.41l-.7.71a1 1 0 01-1.42 0zM12 7a5 5 0 100 10A5 5 0 0012 7z" />
  </svg>
);

export function SignInScreen() {
  const { signInWithEmail, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [logoTaps, setLogoTaps] = useState(0);

  const handleLogoTap = () => {
    const n = logoTaps + 1;
    setLogoTaps(n);
    if (n >= 5) enterAsPoc();
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setResetSent(false);
  };

  const onSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await signInWithEmail(email.trim(), password);
    if (err) setError(err);
    setBusy(false);
  };

  const onSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await signUp(email.trim(), password, name.trim() || undefined);
    if (err) {
      setError(err);
    } else {
      setError(null);
      switchMode("signin");
      setError("Account created — an admin will activate it before you can sign in.");
    }
    setBusy(false);
  };

  const onForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await resetPassword(email.trim());
    if (err) setError(err);
    else setResetSent(true);
    setBusy(false);
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm space-y-6">

        {/* Logo */}
        <div className="text-center">
          <div className="mb-3 flex items-center justify-center">
            <SunLogo onClick={handleLogoTap} />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">Sunpath</h1>
          <p className="mt-2 text-slate-500">Field intelligence for solar reps.</p>
        </div>

        {/* Sign in */}
        {mode === "signin" && (
          <form onSubmit={(e) => void onSignIn(e)} className="space-y-3">
            <input
              type="email"
              required
              placeholder="Email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <input
              type="password"
              required
              placeholder="Password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            {error && (
              <p className={`text-xs ${error.startsWith("Account created") ? "text-emerald-700" : "text-red-700"}`}>
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-amber-500 px-6 py-3.5 text-sm font-semibold text-white shadow hover:bg-amber-600 disabled:opacity-50"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
            <div className="flex justify-between text-xs text-slate-500 pt-1">
              <button type="button" onClick={() => switchMode("forgot")} className="hover:text-slate-700">
                Forgot password?
              </button>
              <button type="button" onClick={() => switchMode("signup")} className="hover:text-slate-700">
                Create account →
              </button>
            </div>
          </form>
        )}

        {/* Create account */}
        {mode === "signup" && (
          <form onSubmit={(e) => void onSignUp(e)} className="space-y-3">
            <input
              type="text"
              placeholder="Your name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <input
              type="email"
              required
              placeholder="Email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <input
              type="password"
              required
              placeholder="Password (min 6 characters)"
              autoComplete="new-password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <p className="text-xs text-slate-500">
              After creating your account an admin will activate it before you can sign in.
            </p>
            {error && <p className="text-xs text-red-700">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-amber-500 px-6 py-3.5 text-sm font-semibold text-white shadow hover:bg-amber-600 disabled:opacity-50"
            >
              {busy ? "Creating…" : "Create account"}
            </button>
            <button type="button" onClick={() => switchMode("signin")} className="w-full text-xs text-slate-500 hover:text-slate-700">
              ← Back to sign in
            </button>
          </form>
        )}

        {/* Forgot password */}
        {mode === "forgot" && (
          <form onSubmit={(e) => void onForgot(e)} className="space-y-3">
            {resetSent ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
                Check your email — we sent a password reset link.
              </div>
            ) : (
              <>
                <p className="text-sm text-slate-600">Enter your email and we&apos;ll send a reset link.</p>
                <input
                  type="email"
                  required
                  placeholder="Email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                {error && <p className="text-xs text-red-700">{error}</p>}
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-xl bg-amber-500 px-6 py-3.5 text-sm font-semibold text-white shadow hover:bg-amber-600 disabled:opacity-50"
                >
                  {busy ? "Sending…" : "Send reset link"}
                </button>
              </>
            )}
            <button type="button" onClick={() => switchMode("signin")} className="w-full text-xs text-slate-500 hover:text-slate-700">
              ← Back to sign in
            </button>
          </form>
        )}

        {/* OAuth placeholders — coming soon */}
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <div className="flex-1 border-t border-slate-200" />
            <span>or sign in with</span>
            <div className="flex-1 border-t border-slate-200" />
          </div>
          {[
            { label: "Google", icon: (
              <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            )},
            { label: "Microsoft", icon: (
              <svg className="h-4 w-4" viewBox="0 0 21 21"><rect x="1" y="1" width="9" height="9" fill="#F25022"/><rect x="11" y="1" width="9" height="9" fill="#7FBA00"/><rect x="1" y="11" width="9" height="9" fill="#00A4EF"/><rect x="11" y="11" width="9" height="9" fill="#FFB900"/></svg>
            )},
            { label: "LinkedIn", icon: (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="#0A66C2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
            )},
            { label: "Apple", icon: (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
            )},
          ].map(({ label, icon }) => (
            <button
              key={label}
              type="button"
              disabled
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-medium text-slate-400 shadow-sm cursor-not-allowed"
            >
              {icon}
              {label}
              <span className="ml-auto text-xs text-slate-400">coming soon</span>
            </button>
          ))}
        </div>

        {/* POC bypass */}
        <button
          type="button"
          onClick={enterAsPoc}
          className="w-full rounded-xl border border-dashed border-amber-300 bg-amber-50 px-6 py-3 text-sm font-semibold text-amber-700 hover:bg-amber-100"
        >
          Enter as guest (POC)
        </button>

      </div>
    </div>
  );
}
