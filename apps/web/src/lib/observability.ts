// Lightweight observability shim — Sentry + PostHog without the SDK
// dependencies (yet). Both products accept anonymous events at well-
// known REST endpoints; we use them in a fire-and-forget manner so the
// app keeps working even if the keys are absent.
//
// Hardening rules (per plan.md security section):
//  - Never capture form values, bill content, or contact PII.
//  - Don't include user IDs that map to a real person — use the auth
//    user UUID only, which is already pseudonymous.
//  - Drop everything if VITE_OBSERVABILITY_DISABLED is set (e.g. in
//    review apps or local dev).
//
// When we move past POC and the dust settles on RBAC, swap this for the
// real Sentry browser SDK (better stack traces, sourcemap support).

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const POSTHOG_HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? "https://us.i.posthog.com";
const DISABLED = import.meta.env.VITE_OBSERVABILITY_DISABLED === "1";

let initialized = false;

function parseDsn(dsn: string): { url: string; key: string } | null {
  // Sentry DSN: https://<key>@<host>/<project_id>
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\//, "");
    if (!projectId) return null;
    const key = u.username;
    if (!key) return null;
    const ingest = `${u.protocol}//${u.host}/api/${projectId}/store/`;
    return { url: ingest, key };
  } catch {
    return null;
  }
}

function pseudonymousUserId(): string | null {
  // Persist a random per-install ID; never tied to email/phone.
  if (typeof window === "undefined") return null;
  const KEY = "sunpath.installId";
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    try {
      window.localStorage.setItem(KEY, id);
    } catch {
      // private mode / storage full — fall back to non-persisted id
    }
  }
  return id;
}

export function initObservability(): void {
  if (initialized || DISABLED) return;
  initialized = true;
  // Only wire if at least one provider is configured.
  if (!SENTRY_DSN && !POSTHOG_KEY) return;

  // Global error handlers -> Sentry. Best-effort, keep the user experience
  // intact if anything fails.
  window.addEventListener("error", (ev) => {
    void captureException(ev.error ?? ev.message);
  });
  window.addEventListener("unhandledrejection", (ev) => {
    void captureException(ev.reason);
  });
}

export async function captureException(err: unknown): Promise<void> {
  if (DISABLED || !SENTRY_DSN) return;
  const parsed = parseDsn(SENTRY_DSN);
  if (!parsed) return;

  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;

  const payload = {
    event_id: crypto.randomUUID().replace(/-/g, ""),
    timestamp: new Date().toISOString(),
    platform: "javascript",
    level: "error",
    // Strip query/fragments — bill route may have OCR'd content in state,
    // but URLs themselves are safe (HashRouter, no PII in path segments).
    request: { url: window.location.href.split("?")[0] },
    exception: {
      values: [
        {
          type: err instanceof Error ? err.name : "Error",
          value: message,
          stacktrace: stack ? { frames: [{ filename: stack.split("\n")[0] }] } : undefined,
        },
      ],
    },
  };

  try {
    await fetch(parsed.url, {
      method: "POST",
      mode: "cors",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${parsed.key}, sentry_client=sunpath/0.0.0`,
      },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // Swallow — observability must never break the app.
  }
}

export async function trackEvent(
  event: string,
  props?: Record<string, string | number | boolean | null | undefined>,
): Promise<void> {
  if (DISABLED || !POSTHOG_KEY) return;
  // Allow-list of property keys we ever ship — guards against accidental
  // leakage of bill content or contact info.
  const SAFE_KEYS = new Set([
    "module",
    "stage",
    "result",
    "ms",
    "count",
    "kind",
    "online",
  ]);
  const sanitized: Record<string, unknown> = {};
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (SAFE_KEYS.has(k) && v !== undefined) sanitized[k] = v;
    }
  }
  const distinctId = pseudonymousUserId() ?? "anonymous";
  const body = {
    api_key: POSTHOG_KEY,
    event,
    distinct_id: distinctId,
    properties: sanitized,
    timestamp: new Date().toISOString(),
  };
  try {
    await fetch(`${POSTHOG_HOST}/i/v0/e/`, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    });
  } catch {
    // Swallow.
  }
}
