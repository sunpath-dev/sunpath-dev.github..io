// Root component for the Sunpath PWA. Module: core.
import { lazy, Suspense, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "@/components/AppShell.js";
import { SignInScreen } from "@/components/SignInScreen.js";
import { useAuth } from "@/lib/auth.js";
import { startSyncEngine } from "@/lib/sync.js";

// Lazy-load module routes so MapLibre and friends don't bloat the entry chunk.
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

function RouteFallback() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-slate-500">
      Loading…
    </div>
  );
}

export default function App() {
  const { session, loading } = useAuth();

  useEffect(() => {
    if (!session) return;
    return startSyncEngine();
  }, [session]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-slate-500">
        Loading…
      </div>
    );
  }
  if (!session) {
    return <SignInScreen />;
  }

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/territory" replace />} />
          <Route path="/territory" element={<TerritoryRoute />} />
          <Route path="/walk" element={<WalkRoute />} />
          <Route path="/pipeline" element={<PipelineRoute />} />
          <Route path="/settings" element={<SettingsRoute />} />
          <Route path="*" element={<Navigate to="/territory" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

