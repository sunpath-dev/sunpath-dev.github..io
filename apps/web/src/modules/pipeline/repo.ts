// Pipeline module — live read of leads from Dexie.
import { useLiveQuery } from "dexie-react-hooks";
import { db, type DbLead } from "@/lib/db.js";
import { kickSync } from "@/lib/sync.js";

export const STAGES = [
  "new",
  "contacted",
  "qualified",
  "site_survey",
  "proposal",
  "contract",
  "installed",
  "lost",
] as const;
export type Stage = (typeof STAGES)[number];

export function useLeadsByStage(): Record<Stage, DbLead[]> | undefined {
  return useLiveQuery(async () => {
    const all = await db.leads.toArray();
    const grouped: Record<Stage, DbLead[]> = Object.fromEntries(
      STAGES.map((s) => [s, [] as DbLead[]]),
    ) as Record<Stage, DbLead[]>;
    for (const lead of all) {
      const stage = (STAGES as readonly string[]).includes(lead.stage)
        ? (lead.stage as Stage)
        : "new";
      grouped[stage].push(lead);
    }
    return grouped;
  });
}

export async function moveLeadStage(id: string, stage: Stage): Promise<void> {
  await db.leads.update(id, {
    stage,
    updated_at: new Date().toISOString(),
    synced: 0,
  });
  kickSync();
}
