// Walk module — local repository wrapping Dexie + sync engine.
// All writes go through `recordDoorEvent` which queues the event in the
// outbox and kicks the sync engine. The route reads via `useRecentEvents`
// (live query) so the UI updates immediately, online or offline.
import { useLiveQuery } from "dexie-react-hooks";
import { db, type DbDoorEvent } from "@/lib/db.js";
export { recordDoorEvent, type RecordEventInput } from "@/lib/door-events.js";

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
