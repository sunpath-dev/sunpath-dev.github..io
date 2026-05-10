// Bill capture — file-drop / paste interface for utility bills.
//
// Phase 1 ships text-paste only (rep snaps a photo, a separate OCR pass
// converts to text — the parser side here is pure). A later phase wires
// Tesseract.js for in-browser OCR; the parser contract is identical.
import { useMemo, useState } from "react";
import { parseBillText, type BillFields } from "@sunpath/shared";
import { db } from "@/lib/db.js";
import { kickSync } from "@/lib/sync.js";
import { useAuth } from "@/lib/auth.js";

export function BillCaptureRoute() {
  const { session } = useAuth();
  const [text, setText] = useState<string>("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const fields: BillFields = useMemo(() => parseBillText(text), [text]);

  const canSave =
    !!session?.user.id &&
    (fields.total_kwh !== null || fields.total_amount_usd !== null);

  const onSave = async () => {
    if (!session?.user.id) return;
    setSaveState("saving");
    setSaveError(null);
    try {
      await db.billCaptures.put({
        id: crypto.randomUUID(),
        rep_id: session.user.id,
        lead_id: null,
        utility_name: fields.utility_name,
        total_kwh: fields.total_kwh,
        rate_kwh_usd: fields.rate_kwh_usd,
        total_amount_usd: fields.total_amount_usd,
        billing_period_start: fields.billing_period_start,
        billing_period_end: fields.billing_period_end,
        parsed_fields: { ...fields, raw_text_length: text.length },
        created_at: new Date().toISOString(),
        synced: 0,
        attempts: 0,
      });
      kickSync();
      setSaveState("saved");
      setText("");
    } catch (err) {
      setSaveState("error");
      setSaveError(String(err));
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="border-b bg-white p-4">
        <h1 className="text-2xl font-bold">Bill capture</h1>
        <p className="text-sm text-slate-600">
          Paste bill text below. Fields extract automatically.
        </p>
      </header>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder="Paste OCR'd or copy-pasted bill text here…"
          className="w-full rounded-lg border bg-white p-3 font-mono text-xs shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
        <section className="rounded-lg border bg-white p-3 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">
            Parsed fields
          </h2>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <Row label="Utility" value={fields.utility_name} />
            <Row label="Total kWh" value={fmtNum(fields.total_kwh)} />
            <Row label="Rate ($/kWh)" value={fmtRate(fields.rate_kwh_usd)} />
            <Row label="Total ($)" value={fmtMoney(fields.total_amount_usd)} />
            <Row label="Period start" value={fields.billing_period_start} />
            <Row label="Period end" value={fields.billing_period_end} />
          </dl>
          {fields.total_kwh && fields.total_kwh > 0 ? (
            <p className="mt-3 text-xs text-slate-500">
              Annualized usage estimate (×12 of single bill):{" "}
              <span className="font-medium text-slate-700">
                {(fields.total_kwh * 12).toLocaleString()} kWh/yr
              </span>
              . Use the parcel detail sheet on the territory map for a
              system-size estimate.
            </p>
          ) : null}
        </section>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onSave}
            disabled={!canSave || saveState === "saving"}
            className="rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-amber-600 disabled:opacity-40"
          >
            {saveState === "saving" ? "Saving…" : "Save capture"}
          </button>
          {saveState === "saved" ? (
            <span className="text-xs text-green-700">
              Saved — will sync when online.
            </span>
          ) : null}
          {saveState === "error" ? (
            <span className="text-xs text-red-700">{saveError}</span>
          ) : null}
        </div>
        <p className="text-xs text-slate-400">
          PII heads-up: nothing leaves this device until sync. Saved captures
          live in IndexedDB until they reach Supabase, then drain locally.
        </p>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: string | number | null;
}) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800">
        {value === null || value === undefined || value === "" ? (
          <span className="text-slate-400">—</span>
        ) : (
          value
        )}
      </dd>
    </>
  );
}

function fmtNum(n: number | null): string | null {
  return n === null ? null : n.toLocaleString();
}
function fmtRate(n: number | null): string | null {
  return n === null ? null : `$${n.toFixed(4)}`;
}
function fmtMoney(n: number | null): string | null {
  return n === null ? null : `$${n.toFixed(2)}`;
}
