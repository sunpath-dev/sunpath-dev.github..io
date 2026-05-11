import { useAuth } from "@/lib/auth.js";

export function SuspendedScreen() {
  const { signOut } = useAuth();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Account suspended</h1>
        <p className="text-sm text-slate-600">
          Your account has been suspended. Contact your admin to restore access.
        </p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="w-full rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
