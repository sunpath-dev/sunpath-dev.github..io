// Root component for the Sunpath PWA. Module: core.
import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "@/components/AppShell.js";
import { SignInScreen } from "@/components/SignInScreen.js";
import { useAuth } from "@/lib/auth.js";
import { startSyncEngine } from "@/lib/sync.js";
import { TerritoryRoute } from "@/modules/territory/index.js";
import { WalkRoute } from "@/modules/walk/index.js";
import { PipelineRoute } from "@/modules/pipeline/index.js";
import { SettingsRoute } from "@/modules/settings/index.js";

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
  );
}

