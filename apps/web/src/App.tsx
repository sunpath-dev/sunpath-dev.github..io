// Root component for the Sunpath PWA. Module: core.
import { lazy, Suspense, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "@/components/AppShell.js";
import { SignInScreen } from "@/components/SignInScreen.js";
import { useAuth } from "@/lib/auth.js";
import { startSyncEngine } from "@/lib/sync.js";

// Lazy-load module routes so MapLibre and friends don't bloat the entry chunk.
const TodayRoute = lazy(() =>
  import("@/modules/today/index.js").then((m) => ({ default: m.TodayRoute })),
);
const TerritoryRoute = lazy(() =>
  import("@/modules/territory/index.js").then((m) => ({ default: m.TerritoryRoute })),
);
const WalkRoute = lazy(() =>
  import("@/modules/walk/index.js").then((m) => ({ default: m.WalkRoute })),
);
const PipelineRoute = lazy(() =>
  import("@/modules/pipeline/index.js").then((m) => ({ default: m.PipelineRoute })),
);
const SettingsRoute = lazy(() =>
  import("@/modules/settings/index.js").then((m) => ({ default: m.SettingsRoute })),
);
const BillCaptureRoute = lazy(() =>
  import("@/modules/bill/index.js").then((m) => ({ default: m.BillCaptureRoute })),
);
const CallbackRoute = lazy(() =>
  import("@/modules/callback/index.js").then((m) => ({ default: m.CallbackRoute })),
);
const AcceptInviteRoute = lazy(() =>
  import("@/modules/invite/index.js").then((m) => ({
    default: m.AcceptInviteRoute,
  })),
);

function RouteFallback() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-slate-500">
      Loading…
    </div>
  );
}

export default function App() {
  const { session } = useAuth();
  const isCallback =
    typeof window !== "undefined" &&
    window.location.hash.startsWith("#/d/");
  const isAcceptInvite =
    typeof window !== "undefined" &&
    window.location.hash.startsWith("#/accept-invite");

  useEffect(() => {
    if (!session) return;
    return startSyncEngine();
  }, [session]);

  // Public callback page works with or without a session — homeowners arrive here.
  if (isCallback) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/d/:slug" element={<CallbackRoute />} />
          <Route path="*" element={<CallbackRoute />} />
        </Routes>
      </Suspense>
    );
  }
  // Accept-invite handles its own auth gating.
  if (isAcceptInvite) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/accept-invite" element={<AcceptInviteRoute />} />
          <Route path="*" element={<AcceptInviteRoute />} />
        </Routes>
      </Suspense>
    );
  }
  if (!session) {
    return <SignInScreen />;
  }

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/today" replace />} />
          <Route path="/today" element={<TodayRoute />} />
          <Route path="/territory" element={<TerritoryRoute />} />
          <Route path="/walk" element={<WalkRoute />} />
          <Route path="/pipeline" element={<PipelineRoute />} />
          <Route path="/bill" element={<BillCaptureRoute />} />
          <Route path="/settings" element={<SettingsRoute />} />
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

