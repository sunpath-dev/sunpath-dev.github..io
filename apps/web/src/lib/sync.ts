// Sync engine — drains the local outbox to Supabase whenever online.
// Strategy:
//   1. On mount: try to drain immediately.
//   2. Listen to `online` event; drain on each transition.
//   3. After every local write, call `kickSync()` to drain.
// Conflicts: door events use `client_event_id` as a unique key, so the server
// upsert is idempotent. Leads use a last-write-wins on `updated_at`.
import { db } from "./db.js";
import { supabase } from "./supabase.js";

const MAX_ATTEMPTS = 8;
let draining = false;
let scheduled = false;

async function drainDoorEvents(): Promise<void> {
  const pending = await db.doorEvents
    .where("synced")
    .equals(0)
    .and((e) => e.attempts < MAX_ATTEMPTS)
    .limit(50)
    .toArray();

  if (pending.length === 0) return;

  const payload = pending.map((e) => ({
    client_event_id: e.client_event_id,
    parcel_id: e.parcel_id,
    rep_id: e.rep_id,
    occurred_at: e.occurred_at,
    outcome: e.outcome,
    notes: e.notes ?? null,
    geo_lat: e.geo_lat ?? null,
    geo_lon: e.geo_lon ?? null,
  }));

  const { error } = await supabase
    .from("door_event")
    .upsert(payload, { onConflict: "client_event_id" });

  if (error) {
    await Promise.all(
      pending.map((e) =>
        db.doorEvents.update(e.client_event_id, {
          attempts: e.attempts + 1,
          last_error: error.message,
        }),
      ),
    );
    return;
  }

  await Promise.all(
    pending.map((e) =>
      db.doorEvents.update(e.client_event_id, { synced: 1, last_error: undefined }),
    ),
  );
}

async function drainLeads(): Promise<void> {
  const pending = await db.leads
    .where("synced")
    .equals(0)
    .and((l) => l.attempts < MAX_ATTEMPTS)
    .limit(50)
    .toArray();
  if (pending.length === 0) return;

  const payload = pending.map((l) => ({
    id: l.id,
    parcel_id: l.parcel_id,
    rep_id: l.rep_id,
    stage: l.stage,
    contact_name: l.contact_name ?? null,
    phone: l.phone ?? null,
    email: l.email ?? null,
    next_action_at: l.next_action_at ?? null,
    notes: l.notes ?? null,
    updated_at: l.updated_at,
  }));

  const { error } = await supabase
    .from("lead")
    .upsert(payload, { onConflict: "id" });

  if (error) {
    await Promise.all(
      pending.map((l) =>
        db.leads.update(l.id, { attempts: l.attempts + 1 }),
      ),
    );
    return;
  }

  await Promise.all(
    pending.map((l) => db.leads.update(l.id, { synced: 1 })),
  );
}

export async function drain(): Promise<void> {
  if (draining) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  draining = true;
  try {
    await drainDoorEvents();
    await drainLeads();
  } finally {
    draining = false;
  }
}

/** Schedule a drain on the next tick — coalesces bursts of writes. */
export function kickSync(): void {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    void drain();
  });
}

export function startSyncEngine(): () => void {
  void drain();
  const handler = () => kickSync();
  window.addEventListener("online", handler);
  const interval = window.setInterval(handler, 60_000);
  return () => {
    window.removeEventListener("online", handler);
    window.clearInterval(interval);
  };
}
