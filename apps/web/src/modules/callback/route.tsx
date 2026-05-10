// Public callback landing page reached via the doorcard short URL
// (`#/d/<slug>`). The slug is the first 8 hex chars of a parcel UUID
// (see packages/shared/src/doorcard.ts). The form submits via the
// `callback-submit` Edge Function, which runs with the service role
// to insert into the `lead` table.
import { useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase.js";

export function CallbackRoute() {
  const { slug } = useParams<{ slug: string }>();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "ok" | "error">(
    "idle",
  );
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone && !email) {
      setErrMsg("Please leave a phone or email so we can reach you.");
      setState("error");
      return;
    }
    setState("sending");
    setErrMsg(null);
    try {
      const { error } = await supabase.functions.invoke("callback-submit", {
        body: {
          slug: slug ?? null,
          contact_name: name || null,
          phone: phone || null,
          email: email || null,
          notes: notes || null,
          // crude UA fingerprint to dedupe clear bot floods later
          ua: navigator.userAgent.slice(0, 200),
        },
      });
      if (error) {
        setState("error");
        setErrMsg(error.message);
        return;
      }
      setState("ok");
    } catch (err) {
      setState("error");
      setErrMsg(String(err));
    }
  };

  return (
    <div className="min-h-dvh bg-amber-50 px-4 py-8">
      <div className="mx-auto max-w-md rounded-2xl bg-white p-6 shadow">
        <h1 className="text-2xl font-bold text-amber-700">Sunpath</h1>
        <p className="mt-1 text-sm text-slate-600">
          Thanks for taking a look at the doorcard. Leave your info below
          and we'll come back to your house with a real number.
        </p>

        {state === "ok" ? (
          <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            Got it — we'll be in touch within a couple days.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-3">
            <Field
              label="Name"
              value={name}
              onChange={setName}
              autoComplete="name"
            />
            <Field
              label="Phone"
              value={phone}
              onChange={setPhone}
              type="tel"
              autoComplete="tel"
            />
            <Field
              label="Email"
              value={email}
              onChange={setEmail}
              type="email"
              autoComplete="email"
            />
            <label className="block">
              <span className="text-xs font-medium text-slate-700">
                Anything specific?
              </span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded border bg-white p-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </label>
            {errMsg ? (
              <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                {errMsg}
              </div>
            ) : null}
            <button
              type="submit"
              disabled={state === "sending"}
              className="w-full rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-amber-600 disabled:opacity-50"
            >
              {state === "sending" ? "Sending…" : "Send"}
            </button>
            <p className="text-[11px] text-slate-400">
              No spam. Used only to schedule the visit.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        className="mt-1 w-full rounded border bg-white p-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
      />
    </label>
  );
}
