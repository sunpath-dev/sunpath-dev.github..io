/**
 * Pipeline view — kanban of leads by stage.
 */
export function PipelineRoute() {
  const stages = [
    "new",
    "contacted",
    "appointment_set",
    "appointment_held",
    "quote_sent",
    "signed",
    "installed",
  ];
  return (
    <div className="flex h-full flex-col p-4">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">Pipeline</h1>
        <p className="text-sm text-slate-600">Leads by stage.</p>
      </header>
      <div className="flex-1 overflow-x-auto">
        <div className="flex h-full gap-3">
          {stages.map((s) => (
            <div
              key={s}
              className="flex w-64 shrink-0 flex-col rounded-lg bg-slate-100 p-3"
            >
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                {s.replace(/_/g, " ")}
              </div>
              <div className="flex-1 text-xs text-slate-400">
                No leads yet.
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
