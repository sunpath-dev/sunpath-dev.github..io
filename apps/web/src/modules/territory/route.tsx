import { Button } from "@sunpath/ui";

/**
 * Territory map view.
 * v0: placeholder. Phase 1 will wire MapLibre + parcel layer + score-tinted
 * markers. Cross-module imports are forbidden (see eslint config).
 */
export function TerritoryRoute() {
  return (
    <div className="flex h-full flex-col p-4">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">Territory</h1>
        <p className="text-sm text-slate-600">
          Map + score-ranked walk lists. (Wiring in Phase 1.)
        </p>
      </header>
      <div className="flex-1 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">
        MapLibre placeholder
      </div>
      <div className="mt-4 flex gap-2">
        <Button variant="primary">Start walk</Button>
        <Button variant="secondary">Refresh data</Button>
      </div>
    </div>
  );
}
