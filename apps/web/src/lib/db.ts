// Local IndexedDB schema (Dexie) — offline-first store for the rep app.
//
// Pattern: "outbox" — every write is queued locally with a `client_event_id`,
// then drained by the sync engine when online. Reads come from local first.
//
// v0: door events + leads. Other entities will be added as modules light up.
import Dexie, { type Table } from "dexie";

export interface DbDoorEvent {
  client_event_id: string; // primary key (UUID generated on device)
  parcel_id: string;
  rep_id: string;
  occurred_at: string; // ISO
  outcome: string;
  notes?: string;
  geo_lat?: number;
  geo_lon?: number;
  // sync metadata
  synced: 0 | 1; // boolean as 0/1 so it can be indexed
  attempts: number;
  last_error?: string;
}

export interface DbLead {
  id: string; // server UUID once synced; client-generated otherwise
  parcel_id: string;
  rep_id: string;
  stage: string;
  contact_name?: string;
  phone?: string;
  email?: string;
  next_action_at?: string;
  notes?: string;
  updated_at: string;
  synced: 0 | 1;
  attempts: number;
}

class SunpathDb extends Dexie {
  doorEvents!: Table<DbDoorEvent, string>;
  leads!: Table<DbLead, string>;

  constructor() {
    super("sunpath");
    this.version(1).stores({
      // & = primary key. Indexed fields after the comma.
      doorEvents: "&client_event_id, synced, occurred_at, parcel_id, rep_id",
      leads: "&id, synced, stage, parcel_id, rep_id, next_action_at",
    });
  }
}

export const db = new SunpathDb();
