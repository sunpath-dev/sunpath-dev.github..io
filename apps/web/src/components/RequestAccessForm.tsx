import { useState } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;

type FormState = "idle" | "busy" | "done" | "error";

export function RequestAccessForm() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<FormState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!SUPABASE_URL) {
      setErrorMsg("Configuration error — try again later.");
      setState("error");
      return;
    }
    setState("busy");
    setErrorMsg(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/request-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          display_name: name.trim() || undefined,
          note: note.trim() || undefined,
        }),
      });
      if (res.status === 429) throw new Error("Too many requests — try again in an hour.");
      if (!res.ok && res.status !== 204) throw new Error(`Request failed (${res.status})`);
      setState("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
      setState("error");
    }
  };

  if (state === "done") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-sm rounded-xl border bg-white px-6 py-8 text-center shadow-sm space-y-3">
          <div className="text-3xl">✓</div>
          <h2 className="text-lg font-bold text-slate-900">Request sent</h2>
          <p className="text-sm text-slate-600">
            We&apos;ll review your request and email you at{" "}
            <span className="font-medium text-slate-800">{email}</span>.
          </p>
          <a
            href="/"
            className="block mt-2 text-sm text-amber-600 hover:underline"
          >
            ← Back to sign-in
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900">Request access</h1>
          <p className="mt-1 text-sm text-slate-500">
            Fill out the form below and we&apos;ll get back to you.
          </p>
        </div>

        <form onSubmit={(e) => void onSubmit(e)} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700" htmlFor="ra-email">
              Email address *
            </label>
            <input
              id="ra-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700" htmlFor="ra-name">
              Your name
            </label>
            <input
              id="ra-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="First Last"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700" htmlFor="ra-note">
              Note (optional)
            </label>
            <textarea
              id="ra-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. I'm a rep at Acme Solar"
              rows={3}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          {state === "error" && errorMsg ? (
            <p className="text-xs text-red-700">{errorMsg}</p>
          ) : null}

          <button
            type="submit"
            disabled={state === "busy" || !email.trim()}
            className="w-full rounded-xl bg-amber-500 px-6 py-3.5 text-sm font-semibold text-white shadow hover:bg-amber-600 disabled:opacity-50"
          >
            {state === "busy" ? "Sending…" : "Request access"}
          </button>
        </form>

        <div className="text-center">
          <a href="/" className="text-sm text-slate-500 hover:text-slate-700">
            ← Back to sign-in
          </a>
        </div>
      </div>
    </div>
  );
}
