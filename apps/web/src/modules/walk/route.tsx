import { Button } from "@sunpath/ui";

/**
 * Walk view — the active door-knock surface. Rep taps an outcome per door.
 * Door events are written via the sync engine (offline-first; replayed when online).
 */
export function WalkRoute() {
  return (
    <div className="flex h-full flex-col p-4">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">Walk</h1>
        <p className="text-sm text-slate-600">
          Active route. Tap an outcome at each door.
        </p>
      </header>
      <div className="flex-1 rounded-lg border bg-white p-4 shadow-sm">
        <p className="text-slate-500">No active walk yet.</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="primary" size="lg">
          No answer
        </Button>
        <Button variant="secondary" size="lg">
          Not interested
        </Button>
        <Button variant="primary" size="lg">
          Callback
        </Button>
        <Button variant="primary" size="lg">
          Appointment
        </Button>
      </div>
    </div>
  );
}
