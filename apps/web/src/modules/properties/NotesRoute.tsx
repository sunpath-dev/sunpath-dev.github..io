import { useNavigate } from "react-router-dom";

export function NotesRoute() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* Sub-nav */}
      <div className="flex items-center gap-1 overflow-x-auto border-b bg-slate-100 px-3 py-1.5">
        {[
          { icon: "🔍", label: "Search", to: "/properties" },
          { icon: "🗺", label: "Map", to: "/territory" },
          { icon: "🚶", label: "Walk", to: "/properties/walk" },
          { icon: "📝", label: "Notes", to: "/properties/notes", active: true },
        ].map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => navigate(item.to)}
            className={[
              "flex shrink-0 items-center gap-1 rounded-md px-3 py-1 text-xs font-medium",
              item.active
                ? "bg-amber-500 text-white"
                : "text-slate-600 hover:bg-slate-200",
            ].join(" ")}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
        <button
          type="button"
          disabled
          className="flex shrink-0 items-center gap-1 rounded-md px-3 py-1 text-xs font-medium text-slate-400 cursor-not-allowed"
        >
          <span>📊</span>
          <span>Stats</span>
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-5xl">📝</div>
        <h1 className="text-xl font-bold text-slate-900">Property Notes</h1>
        <p className="max-w-xs text-sm text-slate-600">
          Cross-property note search, voice notes, daily summaries, and PDF export — coming in Phase 6-I.
        </p>
        <ul className="mt-2 space-y-1 text-left text-sm text-slate-500">
          <li>• Search all notes across properties</li>
          <li>• Daily and weekly note summaries</li>
          <li>• Smart follow-up trigger detection</li>
          <li>• Export as PDF or text</li>
        </ul>
        <p className="mt-2 text-xs text-slate-400">
          Notes are already available on each property's detail page.
        </p>
        <button
          type="button"
          onClick={() => navigate("/properties")}
          className="mt-2 rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-600"
        >
          ← Back to Properties
        </button>
      </div>
    </div>
  );
}
