import { STAGES, moveLeadStage, useLeadsByStage, type Stage } from "./repo.js";

/**
 * Pipeline view — kanban of leads by stage. Reads live from Dexie.
 * Each card has compact ◄ ► chevrons to nudge a lead between stages
 * without dragging — works equally well with a thumb on the truck dash.
 */
export function PipelineRoute() {
  const grouped = useLeadsByStage();

  const shift = (id: string, currentStage: Stage, dir: -1 | 1) => {
    const i = STAGES.indexOf(currentStage);
    const next = STAGES[i + dir];
    if (!next) return;
    void moveLeadStage(id, next);
  };

  return (
    <div className="flex h-full flex-col p-4">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">Pipeline</h1>
        <p className="text-sm text-slate-600">Leads by stage.</p>
      </header>
      <div className="flex-1 overflow-x-auto">
        <div className="flex h-full gap-3">
          {STAGES.map((stage, stageIdx) => {
            const leads = grouped?.[stage] ?? [];
            return (
              <div
                key={stage}
                className="flex w-64 shrink-0 flex-col rounded-lg bg-slate-100 p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    {stage.replace(/_/g, " ")}
                  </span>
                  <span className="rounded bg-white px-1.5 text-xs text-slate-700">
                    {leads.length}
                  </span>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto">
                  {leads.length === 0 ? (
                    <div className="text-xs text-slate-400">No leads.</div>
                  ) : (
                    leads.map((l) => (
                      <div
                        key={l.id}
                        className="rounded border bg-white p-2 text-xs shadow-sm"
                      >
                        <div className="font-medium">
                          {l.contact_name ?? "(no name)"}
                        </div>
                        <div className="text-slate-500">
                          {l.phone ?? l.email ?? l.parcel_id.slice(0, 8)}
                        </div>
                        <div className="mt-1 flex items-center justify-between">
                          <button
                            type="button"
                            disabled={stageIdx === 0}
                            onClick={() => shift(l.id, stage, -1)}
                            className="rounded px-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                            aria-label="Move left"
                          >
                            ◄
                          </button>
                          <button
                            type="button"
                            disabled={stageIdx === STAGES.length - 1}
                            onClick={() => shift(l.id, stage, 1)}
                            className="rounded px-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                            aria-label="Move right"
                          >
                            ►
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
