import { useState, useEffect } from "react";
import { useAuth, enterAsPoc } from "@/lib/auth.js";
import { supabase } from "@/lib/supabase.js";

async function gravatarUrl(email: string | undefined): Promise<string> {
  if (!email) return "";
  const normalized = email.trim().toLowerCase();
  const msgBuffer = new TextEncoder().encode(normalized);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `https://www.gravatar.com/avatar/${hex}?s=80&d=identicon`;
}

function greeting(name: string | null): string {
  const h = new Date().getHours();
  const period = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  const first = name ? name.split(" ")[0] : null;
  return first ? `Good ${period}, ${first}` : `Good ${period}`;
}

export function ProfileRoute() {
  const { session, rep, signOut } = useAuth();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [showPwForm, setShowPwForm] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pocTaps, setPocTaps] = useState(0);

  const isPoc = rep?.id === "poc-guest";
  const isEmailUser = session?.user?.app_metadata?.provider === "email";

  useEffect(() => {
    if (!rep?.id || isPoc) return;
    void supabase.from("rep").select("display_name").eq("id", rep.id).maybeSingle()
      .then(({ data }) => { setDisplayName((data as { display_name?: string | null } | null)?.display_name ?? null); });
  }, [rep, isPoc]);

  useEffect(() => {
    void gravatarUrl(session?.user?.email).then(setAvatarUrl);
  }, [session]);

  const startEdit = () => { setNameInput(displayName ?? ""); setEditingName(true); };

  const saveName = async () => {
    if (!rep?.id || isPoc) return;
    setSavingName(true);
    const trimmed = nameInput.trim();
    await supabase.from("rep").update({ display_name: trimmed }).eq("id", rep.id);
    setDisplayName(trimmed);
    setEditingName(false);
    setSavingName(false);
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw !== confirmPw) { setPwError("Passwords don't match."); return; }
    if (newPw.length < 6) { setPwError("Minimum 6 characters."); return; }
    setPwBusy(true);
    setPwError(null);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    if (error) { setPwError(error.message); }
    else { setPwSuccess(true); setNewPw(""); setConfirmPw(""); setShowPwForm(false); }
    setPwBusy(false);
  };

  const handleVersionTap = () => {
    const n = pocTaps + 1;
    setPocTaps(n);
    if (n >= 5) enterAsPoc();
  };

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-y-auto bg-slate-50">
      <header className="border-b bg-white px-4 py-4">
        <div className="flex items-center gap-4">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt="Profile"
              className="h-14 w-14 rounded-full border-2 border-amber-200 object-cover shrink-0"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <div className="h-14 w-14 rounded-full bg-amber-100 shrink-0 flex items-center justify-center text-2xl text-amber-600 font-bold">
              {(displayName ?? session?.user?.email ?? "?")[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-lg font-bold text-amber-600">{greeting(displayName)}</p>
            <h1 className="text-xl font-bold text-slate-900">{isPoc ? "POC Guest" : (displayName || "My Profile")}</h1>
            <p className="text-sm text-slate-500">{session?.user?.email ?? (isPoc ? "POC session" : "")}</p>
          </div>
        </div>
      </header>

      <div className="flex-1 space-y-4 p-4">

        {/* Profile info */}
        <section className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-slate-50">
            <h2 className="text-sm font-semibold text-slate-800">Account info</h2>
          </div>

          <div className="divide-y">

            {/* Name */}
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="text-sm text-slate-500 w-24 shrink-0">Name</span>
              {editingName ? (
                <div className="flex flex-1 items-center gap-2">
                  <input
                    type="text"
                    autoFocus
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void saveName(); if (e.key === "Escape") setEditingName(false); }}
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <button type="button" disabled={savingName} onClick={() => void saveName()} className="text-sm font-semibold text-amber-600 hover:text-amber-700 disabled:opacity-50">
                    {savingName ? "Saving…" : "Save"}
                  </button>
                  <button type="button" onClick={() => setEditingName(false)} className="text-sm text-slate-400">Cancel</button>
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-between">
                  <span className="text-sm font-medium text-slate-900">{isPoc ? "POC Guest" : (displayName || "—")}</span>
                  {!isPoc && <button type="button" onClick={startEdit} className="text-sm text-amber-600 hover:text-amber-700">Edit</button>}
                </div>
              )}
            </div>

            {/* Email */}
            <div className="flex items-center gap-4 px-4 py-3">
              <span className="text-sm text-slate-500 w-24 shrink-0">Email</span>
              <span className="text-sm font-medium text-slate-900">{session?.user?.email ?? "—"}</span>
            </div>

            {/* Role */}
            <div className="flex items-center gap-4 px-4 py-3">
              <span className="text-sm text-slate-500 w-24 shrink-0">Role</span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${rep?.role === "admin" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}>
                {rep?.role ?? "rep"}
              </span>
            </div>

            {/* Sign-in method */}
            {session?.user?.identities && session.user.identities.length > 0 && (
              <div className="flex items-center gap-4 px-4 py-3">
                <span className="text-sm text-slate-500 w-24 shrink-0">Sign-in</span>
                <span className="text-sm text-slate-700 capitalize">
                  {session.user.identities.map((i) => i.provider === "email" ? "Email / password" : i.provider === "azure" ? "Microsoft" : i.provider).join(", ")}
                </span>
              </div>
            )}

          </div>
        </section>

        {/* Change password */}
        {isEmailUser && !isPoc && (
          <section className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-slate-50">
              <h2 className="text-sm font-semibold text-slate-800">Password</h2>
            </div>
            <div className="px-4 py-4">
              {pwSuccess && <p className="mb-3 text-sm font-medium text-emerald-700">Password updated successfully.</p>}
              {!showPwForm ? (
                <button type="button" onClick={() => { setShowPwForm(true); setPwSuccess(false); }} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">
                  Change password
                </button>
              ) : (
                <form onSubmit={(e) => void changePassword(e)} className="space-y-3 max-w-sm">
                  <input type="password" required minLength={6} placeholder="New password" autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                  <input type="password" required placeholder="Confirm new password" autoComplete="new-password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                  {pwError && <p className="text-sm text-red-700">{pwError}</p>}
                  <div className="flex gap-3">
                    <button type="submit" disabled={pwBusy} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50">
                      {pwBusy ? "Saving…" : "Update password"}
                    </button>
                    <button type="button" onClick={() => { setShowPwForm(false); setPwError(null); }} className="text-sm text-slate-500 hover:text-slate-700">Cancel</button>
                  </div>
                </form>
              )}
            </div>
          </section>
        )}

        {/* Sign out */}
        <section className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <button type="button" onClick={() => void signOut()} className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-50">
            Sign out
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </section>

        {/* Version / hidden backdoor */}
        <div className="text-center pt-2 pb-4">
          <button type="button" onClick={handleVersionTap} className="text-xs font-mono text-slate-400 select-none">
            v{__APP_VERSION__} · {__GIT_HASH__}
          </button>
        </div>

      </div>
    </div>
  );
}
