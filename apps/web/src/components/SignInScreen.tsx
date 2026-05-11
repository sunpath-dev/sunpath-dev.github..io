import { useAuth } from "@/lib/auth.js";

export function SignInScreen() {
  const { signInWithProvider } = useAuth();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm space-y-8 text-center">
        {/* Logo + tagline */}
        <div>
          <div className="mb-3 flex items-center justify-center">
            <svg
              className="h-12 w-12 text-amber-500"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 2a1 1 0 011 1v1a1 1 0 01-2 0V3a1 1 0 011-1zm0 17a1 1 0 011 1v1a1 1 0 01-2 0v-1a1 1 0 011-1zM4.22 4.22a1 1 0 011.42 0l.7.71a1 1 0 01-1.41 1.41l-.71-.7a1 1 0 010-1.42zm13.44 13.44a1 1 0 011.41 0l.71.7a1 1 0 01-1.41 1.42l-.71-.71a1 1 0 010-1.41zM2 12a1 1 0 011-1h1a1 1 0 010 2H3a1 1 0 01-1-1zm17 0a1 1 0 011-1h1a1 1 0 010 2h-1a1 1 0 01-1-1zM4.93 18.36a1 1 0 010-1.42l.7-.7a1 1 0 111.42 1.41l-.71.71a1 1 0 01-1.41 0zm12.73-12.73a1 1 0 010-1.41l.71-.71a1 1 0 111.41 1.41l-.7.71a1 1 0 01-1.42 0zM12 7a5 5 0 100 10A5 5 0 0012 7z" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">
            Sunpath
          </h1>
          <p className="mt-2 text-slate-500">
            Field intelligence for solar reps.
          </p>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => void signInWithProvider("google")}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 active:bg-slate-100"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          <button
            type="button"
            onClick={() => void signInWithProvider("azure")}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 active:bg-slate-100"
          >
            <svg className="h-5 w-5" viewBox="0 0 21 21" aria-hidden="true">
              <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
              <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
              <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
              <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
            </svg>
            Continue with Microsoft
          </button>

          {/* Apple — deferred to v0.2 */}
          <button
            type="button"
            disabled
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-semibold text-slate-400 shadow-sm cursor-not-allowed"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg>
            Continue with Apple
            <span className="ml-1 text-xs text-slate-400">(coming soon)</span>
          </button>

          <p className="pt-1 text-xs text-slate-400">
            Don&apos;t have access?{" "}
            <a href="#/request-access" className="text-amber-600 hover:underline">
              Request it →
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
