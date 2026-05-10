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

async function drainBillCaptures(): Promise<void> {
  const pending = await db.billCaptures
    .where("synced")
    .equals(0)
    .and((b) => b.attempts < MAX_ATTEMPTS)
    .limit(50)
    .toArray();
  if (pending.length === 0) return;

  const payload = pending.map((b) => ({
    id: b.id,
    rep_id: b.rep_id,
    parcel_id: b.parcel_id ?? null,
    lead_id: b.lead_id ?? null,
    utility_name: b.utility_name ?? null,
    total_kwh: b.total_kwh ?? null,
    rate_kwh_usd: b.rate_kwh_usd ?? null,
    total_amount_usd: b.total_amount_usd ?? null,
    billing_period_start: b.billing_period_start ?? null,
    billing_period_end: b.billing_period_end ?? null,
    parsed_fields: b.parsed_fields ?? null,
    created_at: b.created_at,
  }));

  const { error } = await supabase
    .from("bill_capture")
    .upsert(payload, { onConflict: "id" });

  if (error) {
    await Promise.all(
      pending.map((b) =>
        db.billCaptures.update(b.id, {
          attempts: b.attempts + 1,
          // sync engine doesn't surface per-row errors yet; bumping attempts is enough
        }),
      ),
    );
    return;
  }
  await Promise.all(
    pending.map((b) => db.billCaptures.update(b.id, { synced: 1 })),
  );
}

async function drainParcelNotes(): Promise<void> {
  const pending = await db.parcelNotes
    .where("synced")
    .equals(0)
    .and((n) => n.attempts < MAX_ATTEMPTS)
    .limit(50)
    .toArray();
  if (pending.length === 0) return;

  const payload = pending.map((n) => ({
    id: n.id,
    rep_id: n.rep_id,
    parcel_id: n.parcel_id,
    body: n.body,
    created_at: n.created_at,
    updated_at: n.updated_at,
  }));

  const { error } = await supabase
    .from("parcel_note")
    .upsert(payload, { onConflict: "id" });

  if (error) {
    await Promise.all(
      pending.map((n) =>
        db.parcelNotes.update(n.id, { attempts: n.attempts + 1 }),
      ),
    );
    return;
  }
  await Promise.all(
    pending.map((n) => db.parcelNotes.update(n.id, { synced: 1 })),
  );
}

export async function drain(): Promise<void> {
  if (draining) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  draining = true;
  try {
    await drainDoorEvents();
    await drainLeads();
    await drainBillCaptures();
    await drainParcelNotes();
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
