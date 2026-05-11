import { useNavigate } from "react-router-dom";

export function BuildRoute() {
  const navigate = useNavigate();
  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-white px-4 py-3">
        <h1 className="text-lg font-bold text-slate-900">Build My Solar</h1>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 py-12 text-center">
        <div className="text-5xl">☀</div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">Build My Solar</h2>
          <p className="mt-2 text-sm font-semibold uppercase tracking-wide text-amber-600">Coming Soon</p>
        </div>
        <p className="max-w-sm text-sm text-slate-600 leading-relaxed">
          Aerial roof imagery with panel layout, exact system size, and per-panel production. Your selling tool on the porch — show the homeowner what their roof will look like.
        </p>

        <ul className="space-y-2 text-left">
          {[
            "Google Solar API roof segments",
            "3D rotate · compare configurations",
            "Per-panel production estimate",
            "Lock in system size and panel count",
          ].map((item) => (
            <li key={item} className="flex items-center gap-2 text-sm text-slate-600">
              <span className="text-amber-400">·</span>
              {item}
            </li>
          ))}
        </ul>

        <button
          type="button"
          disabled
          className="w-full max-w-xs rounded-lg border border-slate-200 py-3 text-sm font-semibold text-slate-400 cursor-not-allowed"
        >
          Open builder for selected property
        </button>

        <button
          type="button"
          onClick={() => navigate("/properties")}
          className="text-sm text-amber-600 hover:underline"
        >
          ← Go to Properties
        </button>
      </div>
    </div>
  );
}
