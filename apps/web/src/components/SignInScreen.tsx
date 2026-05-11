import { useAuth } from "@/lib/auth.js";

const OAUTH_BUTTONS = [
  { label: "Continue with Google", icon: "G" },
  { label: "Continue with Microsoft", icon: "M" },
  { label: "Continue with Apple", icon: "" },
];

export function SignInScreen() {
  const { enter } = useAuth();

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
          {/* OAuth buttons — disabled until Phase 8 */}
          {OAUTH_BUTTONS.map((btn) => (
            <button
              key={btn.label}
              type="button"
              disabled
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-semibold text-slate-400 shadow-sm cursor-not-allowed"
            >
              <span className="flex h-5 w-5 items-center justify-center text-xs font-bold">
                {btn.icon}
              </span>
              {btn.label}
            </button>
          ))}

          {/* Divider */}
          <div className="relative flex items-center gap-3 py-1">
            <div className="flex-1 border-t border-slate-200" />
            <span className="text-xs font-medium text-slate-400">or</span>
            <div className="flex-1 border-t border-slate-200" />
          </div>

          {/* POC entry — active */}
          <button
            type="button"
            onClick={enter}
            className="w-full rounded-xl bg-amber-500 px-6 py-4 text-base font-semibold text-white shadow hover:bg-amber-600 active:bg-amber-700"
          >
            ▶ Enter as guest (POC)
          </button>

          <p className="text-xs text-slate-400">
            Google / Microsoft / Apple sign-in coming soon.
            POC access is for demo purposes only.
          </p>
        </div>
      </div>
    </div>
  );
}
