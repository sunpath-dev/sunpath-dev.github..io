// Walk module — local repository wrapping Dexie + sync engine.
// All writes go through `recordDoorEvent` which queues the event in the
// outbox and kicks the sync engine. The route reads via `useRecentEvents`
// (live query) so the UI updates immediately, online or offline.
import { useLiveQuery } from "dexie-react-hooks";
import { db, type DbDoorEvent } from "@/lib/db.js";
import { kickSync } from "@/lib/sync.js";

export interface RecordEventInput {
  parcel_id: string;
  rep_id: string;
  outcome: DbDoorEvent["outcome"];
  notes?: string;
  geo?: { lat: number; lon: number };
}

export async function recordDoorEvent(input: RecordEventInput): Promise<DbDoorEvent> {
  const now = new Date().toISOString();
  const row: DbDoorEvent = {
    client_event_id: crypto.randomUUID(),
    parcel_id: input.parcel_id,
    rep_id: input.rep_id,
    occurred_at: now,
    outcome: input.outcome,
    notes: input.notes,
    geo_lat: input.geo?.lat,
    geo_lon: input.geo?.lon,
    synced: 0,
    attempts: 0,
  };
  await db.doorEvents.put(row);
  kickSync();
  return row;
}

export function useRecentEvents(limit = 25): DbDoorEvent[] | undefined {
  return useLiveQuery(
    () =>
      db.doorEvents
        .orderBy("occurred_at")
        .reverse()
        .limit(limit)
        .toArray(),
    [limit],
  );
}

export function useUnsyncedCount(): number | undefined {
  return useLiveQuery(() => db.doorEvents.where("synced").equals(0).count());
}
