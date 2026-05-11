import { useNavigate } from "react-router-dom";

export function ReportsRoute() {
  const navigate = useNavigate();
  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-white px-4 py-3">
        <h1 className="text-lg font-bold text-slate-900">Reports</h1>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 py-12 text-center">
        <div className="text-5xl">📊</div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">Reports</h2>
          <p className="mt-2 text-sm font-semibold uppercase tracking-wide text-amber-600">Coming Soon</p>
        </div>
        <p className="max-w-sm text-sm text-slate-600 leading-relaxed">
          Daily and weekly summaries. Conversion funnel. Best-time-of-day analysis. Note search and PDF / text export.
        </p>

        <ul className="space-y-2 text-left">
          {[
            "Daily and weekly door summaries",
            "Conversion funnel by trigger reason",
            "Objection analysis from notes",
            "Best-time-of-day pattern",
            "Note search across properties",
            "PDF / text export",
          ].map((item) => (
            <li key={item} className="flex items-center gap-2 text-sm text-slate-600">
              <span className="text-amber-400">·</span>
              {item}
            </li>
          ))}
        </ul>

        <div className="flex gap-3">
          <button
            type="button"
            disabled
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-400 cursor-not-allowed"
          >
            Generate today's summary
          </button>
          <button
            type="button"
            disabled
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-400 cursor-not-allowed"
          >
            Export this week
          </button>
        </div>

        <button
          type="button"
          onClick={() => navigate("/home")}
          className="text-sm text-amber-600 hover:underline"
        >
          ← Go to Home
        </button>
      </div>
    </div>
  );
}
