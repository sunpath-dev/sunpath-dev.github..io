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
