import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { parseBillText, redactBillText, type BillFields } from "@sunpath/shared";
import { db } from "@/lib/db.js";
import { kickSync } from "@/lib/sync.js";
import { useAuth } from "@/lib/auth.js";

type Tab = "photo" | "file" | "manual";
type OcrState = "idle" | "running" | "done" | "error";
type SaveState = "idle" | "saving" | "saved" | "error";

interface ManualForm {
  utility_name: string;
  total_kwh: string;
  rate_kwh_usd: string;
  total_amount_usd: string;
  billing_period_start: string;
  billing_period_end: string;
}

const EMPTY_MANUAL: ManualForm = {
  utility_name: "",
  total_kwh: "",
  rate_kwh_usd: "",
  total_amount_usd: "",
  billing_period_start: "",
  billing_period_end: "",
};

function manualToFields(form: ManualForm): BillFields {
  const kwh = form.total_kwh !== "" ? Number(form.total_kwh) : null;
  const total = form.total_amount_usd !== "" ? Number(form.total_amount_usd) : null;
  const rateRaw = form.rate_kwh_usd !== "" ? Number(form.rate_kwh_usd) : null;
  const rate =
    rateRaw !== null
      ? rateRaw
      : kwh !== null && kwh > 0 && total !== null
        ? Math.round((total / kwh) * 10000) / 10000
        : null;
  return {
    utility_name: form.utility_name.trim() || null,
    total_kwh: kwh !== null && Number.isFinite(kwh) && kwh > 0 ? kwh : null,
    rate_kwh_usd: rate !== null && Number.isFinite(rate) && rate > 0 ? rate : null,
    total_amount_usd:
      total !== null && Number.isFinite(total) && total > 0 ? total : null,
    billing_period_start: form.billing_period_start || null,
    billing_period_end: form.billing_period_end || null,
    raw_excerpt: "",
  };
}

export function BillCaptureRoute() {
  const { session } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("photo");

  const [ocrText, setOcrText] = useState<string>("");
  const [ocrState, setOcrState] = useState<OcrState>("idle");
  const [ocrProgress, setOcrProgress] = useState<number>(0);
  const [ocrError, setOcrError] = useState<string | null>(null);

  const [fileOcrText, setFileOcrText] = useState<string>("");
  const [fileOcrState, setFileOcrState] = useState<OcrState>("idle");
  const [fileOcrProgress, setFileOcrProgress] = useState<number>(0);
  const [fileOcrError, setFileOcrError] = useState<string | null>(null);
  const [filePdfMode, setFilePdfMode] = useState<boolean>(false);

  const [manualForm, setManualForm] = useState<ManualForm>(EMPTY_MANUAL);

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const activeFields: BillFields = useMemo(() => {
    if (activeTab === "manual") return manualToFields(manualForm);
    const src = activeTab === "photo" ? ocrText : fileOcrText;
    return parseBillText(src);
  }, [activeTab, ocrText, fileOcrText, manualForm]);

  const canSave =
    !!session?.user.id &&
    (activeFields.total_kwh !== null || activeFields.total_amount_usd !== null);

  const runOcr = async (
    file: File,
    getText: () => string,
    setText: Dispatch<SetStateAction<string>>,
    setState: Dispatch<SetStateAction<OcrState>>,
    setProgress: Dispatch<SetStateAction<number>>,
    setError: Dispatch<SetStateAction<string | null>>,
  ) => {
    setState("running");
    setProgress(0);
    setError(null);
    try {
      const mod = await import("tesseract.js");
      const result = await mod.recognize(file, "eng", {
        logger: (m: { status: string; progress?: number }) => {
          if (typeof m.progress === "number") setProgress(m.progress);
        },
      });
      const t = redactBillText(result.data.text ?? "");
      const prev = getText();
      setText(prev ? prev + "\n\n" + t : t);
      setState("done");
    } catch (err) {
      setState("error");
      setError(String(err));
    }
  };

  const onPhotoFile = (file: File) =>
    runOcr(file, () => ocrText, setOcrText, setOcrState, setOcrProgress, setOcrError);

  const onImportFile = (file: File) => {
    if (file.type === "application/pdf") {
      setFilePdfMode(true);
      return;
    }
    setFilePdfMode(false);
    runOcr(
      file,
      () => fileOcrText,
      setFileOcrText,
      setFileOcrState,
      setFileOcrProgress,
      setFileOcrError,
    );
  };

  const onSave = async () => {
    if (!session?.user.id) return;
    setSaveState("saving");
    setSaveError(null);
    const textLen =
      activeTab === "photo"
        ? ocrText.length
        : activeTab === "file"
          ? fileOcrText.length
          : 0;
    try {
      await db.billCaptures.put({
        id: crypto.randomUUID(),
        rep_id: session.user.id,
        lead_id: null,
        utility_name: activeFields.utility_name,
        total_kwh: activeFields.total_kwh,
        rate_kwh_usd: activeFields.rate_kwh_usd,
        total_amount_usd: activeFields.total_amount_usd,
        billing_period_start: activeFields.billing_period_start,
        billing_period_end: activeFields.billing_period_end,
        parsed_fields: { ...activeFields, raw_text_length: textLen },
        created_at: new Date().toISOString(),
        synced: 0,
        attempts: 0,
      });
      kickSync();
      setSaveState("saved");
      setOcrText("");
      setOcrState("idle");
      setFileOcrText("");
      setFileOcrState("idle");
      setFilePdfMode(false);
      setManualForm(EMPTY_MANUAL);
    } catch (err) {
      setSaveState("error");
      setSaveError(String(err));
    }
  };

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <div className="flex flex-1 flex-col">
        <header className="border-b bg-white p-4">
          <h1 className="text-2xl font-bold">Bill capture</h1>
          <p className="text-sm text-slate-600">
            Enter the customer's utility bill. Fields extract automatically.
          </p>
        </header>

        <div className="border-b bg-white">
          <div className="flex" role="tablist">
            <TabButton
              label="📷 Photo"
              active={activeTab === "photo"}
              onClick={() => setActiveTab("photo")}
            />
            <TabButton
              label="📁 File"
              active={activeTab === "file"}
              onClick={() => setActiveTab("file")}
            />
            <TabButton
              label="✎ Manual"
              active={activeTab === "manual"}
              onClick={() => setActiveTab("manual")}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeTab === "photo" && (
            <PhotoTab
              ocrState={ocrState}
              ocrProgress={ocrProgress}
              ocrError={ocrError}
              text={ocrText}
              onText={(t) => setOcrText(t)}
              onFile={onPhotoFile}
            />
          )}
          {activeTab === "file" && (
            <FileTab
              ocrState={fileOcrState}
              ocrProgress={fileOcrProgress}
              ocrError={fileOcrError}
              text={fileOcrText}
              onText={(t) => setFileOcrText(t)}
              onFile={onImportFile}
              pdfMode={filePdfMode}
            />
          )}
          {activeTab === "manual" && (
            <ManualTab form={manualForm} onChange={setManualForm} />
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={!canSave || saveState === "saving"}
              className="rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-amber-600 disabled:opacity-40"
            >
              {saveState === "saving" ? "Saving…" : "Save capture"}
            </button>
            {saveState === "saved" && (
              <span className="text-xs text-green-700">
                Saved — will sync when online.
              </span>
            )}
            {saveState === "error" && (
              <span className="text-xs text-red-700">{saveError}</span>
            )}
          </div>
        </div>
      </div>

      <aside className="border-t bg-slate-50 p-4 lg:w-80 lg:border-l lg:border-t-0 lg:overflow-y-auto">
        <FieldsPanel fields={activeFields} />
      </aside>
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
        active
          ? "border-b-2 border-amber-500 text-amber-600"
          : "text-slate-500 hover:text-slate-700"
      }`}
    >
      {label}
    </button>
  );
}

function OcrStatus({
  state,
  progress,
  error,
}: {
  state: OcrState;
  progress: number;
  error: string | null;
}) {
  if (state === "running")
    return (
      <div className="mt-2 space-y-1">
        <p className="text-xs text-slate-600">
          OCR running… {Math.round(progress * 100)}%
        </p>
        <div className="h-1.5 rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-amber-400 transition-all"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      </div>
    );
  if (state === "done")
    return <p className="mt-2 text-xs text-green-700">OCR finished — review text below.</p>;
  if (state === "error")
    return <p className="mt-2 text-xs text-red-700">OCR failed: {error}</p>;
  return null;
}

function PhotoTab({
  ocrState,
  ocrProgress,
  ocrError,
  text,
  onText,
  onFile,
}: {
  ocrState: OcrState;
  ocrProgress: number;
  ocrError: string | null;
  text: string;
  onText: (t: string) => void;
  onFile: (f: File) => void;
}) {
  return (
    <>
      <div className="rounded-lg border bg-white p-3 shadow-sm">
        <label className="block text-sm font-medium text-slate-700">
          Photo of bill
        </label>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
          className="mt-1 block w-full text-xs text-slate-700 file:mr-3 file:rounded file:border-0 file:bg-amber-500 file:px-3 file:py-1.5 file:text-white file:hover:bg-amber-600"
        />
        <OcrStatus state={ocrState} progress={ocrProgress} error={ocrError} />
      </div>
      <textarea
        value={text}
        onChange={(e) => onText(e.target.value)}
        onBlur={(e) => onText(redactBillText(e.target.value))}
        rows={8}
        placeholder="OCR text appears here. You can also paste bill text directly."
        className="w-full rounded-lg border bg-white p-3 font-mono text-xs shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
      />
    </>
  );
}

function FileTab({
  ocrState,
  ocrProgress,
  ocrError,
  text,
  onText,
  onFile,
  pdfMode,
}: {
  ocrState: OcrState;
  ocrProgress: number;
  ocrError: string | null;
  text: string;
  onText: (t: string) => void;
  onFile: (f: File) => void;
  pdfMode: boolean;
}) {
  return (
    <>
      <div className="rounded-lg border bg-white p-3 shadow-sm">
        <label className="block text-sm font-medium text-slate-700">
          Import bill file
        </label>
        <p className="mt-0.5 text-xs text-slate-500">
          Accepts images (JPEG, PNG, HEIC, WebP). PDF guidance below.
        </p>
        <input
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
          className="mt-2 block w-full text-xs text-slate-700 file:mr-3 file:rounded file:border-0 file:bg-amber-500 file:px-3 file:py-1.5 file:text-white file:hover:bg-amber-600"
        />
        {pdfMode && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <span className="font-semibold">PDF import:</span> Use the Share
            button on your phone's PDF viewer to open the bill image, then
            switch to the <strong>Photo</strong> tab and take a screenshot or
            re-share as an image.
          </div>
        )}
        <OcrStatus state={ocrState} progress={ocrProgress} error={ocrError} />
      </div>
      {!pdfMode && (
        <textarea
          value={text}
          onChange={(e) => onText(e.target.value)}
          onBlur={(e) => onText(redactBillText(e.target.value))}
          rows={8}
          placeholder="Extracted text appears here after import."
          className="w-full rounded-lg border bg-white p-3 font-mono text-xs shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
      )}
    </>
  );
}

function ManualTab({
  form,
  onChange,
}: {
  form: ManualForm;
  onChange: (f: ManualForm) => void;
}) {
  const set = (key: keyof ManualForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...form, [key]: e.target.value });

  const computeRate = () => {
    const kwh = Number(form.total_kwh);
    const total = Number(form.total_amount_usd);
    if (kwh > 0 && total > 0) {
      onChange({
        ...form,
        rate_kwh_usd: (Math.round((total / kwh) * 10000) / 10000).toString(),
      });
    }
  };

  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm space-y-4">
      <ManualField label="Utility name" type="text" value={form.utility_name} onChange={set("utility_name")} placeholder="e.g. Appalachian Power" />
      <div className="grid grid-cols-2 gap-3">
        <ManualField label="Total kWh" type="number" value={form.total_kwh} onChange={set("total_kwh")} placeholder="e.g. 1200" />
        <ManualField label="Total $" type="number" value={form.total_amount_usd} onChange={set("total_amount_usd")} placeholder="e.g. 148.50" />
      </div>
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <ManualField
            label="Rate $/kWh"
            type="number"
            value={form.rate_kwh_usd}
            onChange={set("rate_kwh_usd")}
            placeholder="e.g. 0.1238"
          />
        </div>
        <button
          type="button"
          onClick={computeRate}
          disabled={!form.total_kwh || !form.total_amount_usd}
          className="mb-px rounded border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
        >
          Compute rate
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <ManualField label="Period start" type="date" value={form.billing_period_start} onChange={set("billing_period_start")} />
        <ManualField label="Period end" type="date" value={form.billing_period_end} onChange={set("billing_period_end")} />
      </div>
    </div>
  );
}

function ManualField({
  label,
  type,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  type: "text" | "number" | "date";
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
}) {
  return (
    <label className="block text-xs font-medium text-slate-700">
      {label}
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        step={type === "number" ? "any" : undefined}
        className="mt-1 block w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm text-slate-800 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
      />
    </label>
  );
}

function FieldsPanel({ fields }: { fields: BillFields }) {
  const annualKwh = fields.total_kwh !== null ? fields.total_kwh * 12 : null;
  const crossCheck =
    annualKwh !== null && fields.rate_kwh_usd !== null
      ? annualKwh * fields.rate_kwh_usd
      : null;

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
        <span className="font-semibold">ⓘ</span> No personal info stored. Data
        linked to this address only.
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">
          Parsed fields
        </h2>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
          <Row label="Utility" value={fields.utility_name} />
          <Row label="Total kWh" value={fmtNum(fields.total_kwh)} />
          <Row label="Rate ($/kWh)" value={fmtRate(fields.rate_kwh_usd)} />
          <Row label="Total ($)" value={fmtMoney(fields.total_amount_usd)} />
          <Row label="Period start" value={fields.billing_period_start} />
          <Row label="Period end" value={fields.billing_period_end} />
        </dl>
      </div>

      {annualKwh !== null && annualKwh > 0 && (
        <div className="rounded-md border bg-white p-3 space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-500">Annualized usage</span>
            <span className="font-semibold text-slate-800">
              {annualKwh.toLocaleString()} kWh/yr
            </span>
          </div>
          {crossCheck !== null && (
            <div className="flex justify-between">
              <span className="text-slate-500">
                Est. annual spend
              </span>
              <span className="font-semibold text-slate-800">
                {fmtMoney(crossCheck)}
              </span>
            </div>
          )}
          {crossCheck !== null && (
            <p className="pt-1 text-slate-400 leading-snug">
              If NREL shows {annualKwh.toLocaleString()} kWh/yr savings ≈{" "}
              {fmtMoney(crossCheck)}
            </p>
          )}
        </div>
      )}
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
