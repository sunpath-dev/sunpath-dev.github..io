import { useAuth } from "@/lib/auth.js";
import { Button } from "@sunpath/ui";

export function SettingsRoute() {
  const { session, signOut } = useAuth();
  return (
    <div className="flex h-full flex-col p-4">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">Settings</h1>
      </header>
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-slate-500">Signed in as</dt>
          <dd className="font-medium">{session?.user?.email ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Build</dt>
          <dd className="font-mono text-xs">
            {import.meta.env.MODE} · sunpath
          </dd>
        </div>
      </dl>
      <div className="mt-auto pt-4">
        <Button variant="ghost" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
