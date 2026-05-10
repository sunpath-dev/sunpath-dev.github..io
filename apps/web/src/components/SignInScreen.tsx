import { useAuth } from "@/lib/auth.js";

export function SignInScreen() {
  const { enter } = useAuth();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">
            Sunpath
          </h1>
          <p className="mt-2 text-slate-500">
            Field intelligence for solar reps.
          </p>
        </div>
        <button
          type="button"
          onClick={enter}
          className="w-full rounded-xl bg-amber-500 px-6 py-4 text-lg font-semibold text-white shadow hover:bg-amber-600 active:bg-amber-700"
        >
          Enter the app
        </button>
      </div>
    </div>
  );
}
