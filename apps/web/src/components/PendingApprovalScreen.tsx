import { useAuth } from "@/lib/auth.js";

export function PendingApprovalScreen() {
  const { session, signOut } = useAuth();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div>
          <div className="mb-3 flex items-center justify-center">
            <svg className="h-12 w-12 text-amber-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2a1 1 0 011 1v1a1 1 0 01-2 0V3a1 1 0 011-1zm0 17a1 1 0 011 1v1a1 1 0 01-2 0v-1a1 1 0 011-1zM4.22 4.22a1 1 0 011.42 0l.7.71a1 1 0 01-1.41 1.41l-.71-.7a1 1 0 010-1.42zm13.44 13.44a1 1 0 011.41 0l.71.7a1 1 0 01-1.41 1.42l-.71-.71a1 1 0 010-1.41zM2 12a1 1 0 011-1h1a1 1 0 010 2H3a1 1 0 01-1-1zm17 0a1 1 0 011-1h1a1 1 0 010 2h-1a1 1 0 01-1-1zM4.93 18.36a1 1 0 010-1.42l.7-.7a1 1 0 111.42 1.41l-.71.71a1 1 0 01-1.41 0zm12.73-12.73a1 1 0 010-1.41l.71-.71a1 1 0 111.41 1.41l-.7.71a1 1 0 01-1.42 0zM12 7a5 5 0 100 10A5 5 0 0012 7z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Access pending</h1>
          <p className="mt-2 text-sm text-slate-600">
            Your account is waiting for approval.
          </p>
        </div>

        <div className="rounded-xl border bg-white px-5 py-4 text-sm text-slate-700 shadow-sm">
          <p>
            Signed in as <span className="font-medium text-slate-900">{session?.user?.email}</span>
          </p>
          <p className="mt-2 text-slate-500">
            An admin will review your request and enable your access. Check back soon.
          </p>
        </div>

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
