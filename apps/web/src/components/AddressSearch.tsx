import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

interface GeoResult {
  lat: number;
  lon: number;
  displayName: string;
}

async function geocodeAddress(query: string): Promise<GeoResult | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=us`;
  const res = await fetch(url, {
    headers: { "Accept-Language": "en", "User-Agent": "Sunpath-POC/1.0" },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as Array<{
    lat: string;
    lon: string;
    display_name: string;
  }>;
  const first = data[0];
  if (!first) return null;
  return {
    lat: parseFloat(first.lat),
    lon: parseFloat(first.lon),
    displayName: first.display_name,
  };
}

interface Props {
  placeholder?: string;
  className?: string;
}

export function AddressSearch({ placeholder = "Search an address…", className = "" }: Props) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      const result = await geocodeAddress(q);
      if (!result) {
        setError("Address not found. Try a more specific address.");
        return;
      }
      navigate(`/territory?lat=${result.lat}&lon=${result.lon}&q=${encodeURIComponent(result.displayName)}`);
    } catch {
      setError("Search failed. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSearch(e)} className={`flex flex-col gap-1 ${className}`}>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setError(null); }}
          placeholder={placeholder}
          className="flex-1 rounded-xl border bg-white px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white shadow hover:bg-amber-600 disabled:opacity-40"
        >
          {loading ? "…" : "Go"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}
