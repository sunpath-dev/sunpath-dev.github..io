import { useState, type FormEvent } from "react";
import { Button } from "@sunpath/ui";
import { useAuth } from "@/lib/auth.js";

export function SignInScreen() {
  const { signInWithMagicLink } = useAuth();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "sending" }
    | { kind: "sent" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus({ kind: "sending" });
    const res = await signInWithMagicLink(email.trim());
    if (res.error) setStatus({ kind: "error", message: res.error });
    else setStatus({ kind: "sent" });
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl bg-white p-6 shadow"
      >
        <div>
          <h1 className="text-2xl font-bold">Sunpath</h1>
          <p className="text-sm text-slate-600">
            Sign in with a magic link. Check your email.
          </p>
        </div>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-sun-500 focus:outline-none focus:ring-2 focus:ring-sun-500"
        />
        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={status.kind === "sending"}
          className="w-full"
        >
          {status.kind === "sending" ? "Sending…" : "Send magic link"}
        </Button>
        {status.kind === "sent" ? (
          <p className="text-sm text-emerald-700">
            Sent. Open the link on this device.
          </p>
        ) : null}
        {status.kind === "error" ? (
          <p className="text-sm text-red-600">{status.message}</p>
        ) : null}
      </form>
    </div>
  );
}
