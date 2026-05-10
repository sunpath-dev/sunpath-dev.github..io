import { useEffect, useRef, useState } from "react";

interface Props {
  onSave: (body: string) => void;
  onCancel: () => void;
  initialBody?: string;
}

// Minimal SpeechRecognition type — browser API, not in lib.dom by default.
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function getSpeechCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as Record<string, unknown>;
  return (w["SpeechRecognition"] as SpeechRecognitionCtor | undefined) ??
    (w["webkitSpeechRecognition"] as SpeechRecognitionCtor | undefined) ??
    null;
}

export function NoteEditor({ onSave, onCancel, initialBody = "" }: Props) {
  const [body, setBody] = useState(initialBody);
  const [listening, setListening] = useState(false);
  const [voiceSupported] = useState(() => getSpeechCtor() !== null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const toggleVoice = () => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Ctor = getSpeechCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = Array.from(e.results)
        .slice(-1)
        .map((r) => r[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (transcript) {
        setBody((prev) => (prev ? `${prev} ${transcript}` : transcript));
      }
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  };

  const handleSave = () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    recognitionRef.current?.stop();
    onSave(trimmed);
  };

  return (
    <div className="flex flex-col gap-2">
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        placeholder="Type a note or tap the mic to speak…"
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 resize-none"
        maxLength={4000}
      />
      <div className="flex items-center gap-2">
        {voiceSupported && (
          <button
            type="button"
            onClick={toggleVoice}
            className={[
              "flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors",
              listening
                ? "bg-red-100 text-red-700 hover:bg-red-200 animate-pulse"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200",
            ].join(" ")}
          >
            {listening ? "■ Stop" : "🎤 Speak"}
          </button>
        )}
        <span className="flex-1" />
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!body.trim()}
          className="rounded bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-amber-600 disabled:opacity-40"
        >
          Save note
        </button>
      </div>
    </div>
  );
}
