import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import maplibregl, { Map as MlMap } from "maplibre-gl";
import { fetchParcelsInBbox, pinsToGeoJSON } from "./repo.js";
import type { ParcelPin } from "./pins.js";
import {
  ParcelDetailSheet,
  type ParcelDetail,
} from "./ParcelDetailSheet.js";
import { AddressSearch } from "@/components/AddressSearch.js";

/**
 * Territory map view.
 * MapLibre with OSM raster tiles + a `parcels` source/layer fed from the
 * Supabase RPC `parcels_in_bbox` whenever the map idles. Score-tinted shading
 * (Phase 3) will replace the flat color once `score-snapshot` is wired.
 *
 * Defaults to Gate City, VA (Scott County) per the launch plan.
 */
const DEFAULT_CENTER: [number, number] = [-82.5915, 36.6376];
const DEFAULT_ZOOM = 13;
const PARCEL_SOURCE = "parcels";
const HEATMAP_LAYER = "parcels-heat";
const CIRCLE_LAYER = "parcels-circle";

const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: [
        "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
      maxzoom: 19,
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

const SAT_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    satellite: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution: "© Esri, Maxar, Earthstar Geographics",
      maxzoom: 18,
    },
  },
  layers: [{ id: "satellite", type: "raster", source: "satellite" }],
};

function buildMapFilter(
  minScore: number,
  maxScore: number,
  hideExisting: boolean,
  ownerOccOnly: boolean,
): unknown[] | null {
  const conditions: unknown[] = ["all"];
  if (hideExisting) conditions.push(["!=", ["get", "existing"], 1]);
  if (minScore > 0 || maxScore < 100) {
    // Score filter exempts existing-solar pins (score=-1) unless hideExisting is on.
    conditions.push([
      "any",
      ...(hideExisting ? [] : [["==", ["get", "existing"], 1]]),
      [
        "all",
        [">=", ["get", "score"], minScore],
        ["<=", ["get", "score"], maxScore],
      ],
    ]);
  }
  if (ownerOccOnly) conditions.push(["==", ["get", "owner_occ"], 1]);
  return conditions.length > 1 ? conditions : null;
}

const RECENT_KEY = "properties:recent";
const MAX_RECENT = 10;

function saveRecent(id: string, address: string) {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const current = raw
      ? (JSON.parse(raw) as { id: string; address: string; viewedAt: number }[])
      : [];
    const filtered = current.filter((r) => r.id !== id);
    localStorage.setItem(
      RECENT_KEY,
      JSON.stringify([{ id, address, viewedAt: Date.now() }, ...filtered].slice(0, MAX_RECENT)),
    );
  } catch (_e) { void _e; }
}

export function TerritoryRoute() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [parcelCount, setParcelCount] = useState<number>(0);
  const [selected, setSelected] = useState<ParcelDetail | null>(null);
  const lastPinsRef = useRef<ParcelPin[]>([]);
  const [isSatellite, setIsSatellite] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const showHeatmapRef = useRef(false);
  const [searchParams] = useSearchParams();
  const geocodeLabel = isFinite(parseFloat(searchParams.get("lat") ?? "")) ? searchParams.get("q") : null;

  // Filter panel state
  const [filterOpen, setFilterOpen] = useState(false);
  const [minScore, setMinScore] = useState(0);
  const [maxScore, setMaxScore] = useState(100);
  const [hideExisting, setHideExisting] = useState(false);
  const [ownerOccOnly, setOwnerOccOnly] = useState(false);
  const filterRef = useRef({ minScore: 0, maxScore: 100, hideExisting: false, ownerOccOnly: false });

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: { compact: true },
    });
    // Flex containers may not have final pixel dimensions when useEffect fires.
    // requestAnimationFrame waits for the next paint so MapLibre gets real dimensions.
    requestAnimationFrame(() => { map.resize(); });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "bottom-right");
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      "bottom-right",
    );

    map.on("load", () => {
      map.resize();
      map.addSource(PARCEL_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "parcels-circle",
        type: "circle",
        source: PARCEL_SOURCE,
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            12,
            2,
            16,
            6,
          ],
          "circle-color": [
            "case",
            ["==", ["get", "existing"], 1],
            "#94a3b8", // existing solar — muted slate
            [
              "interpolate",
              ["linear"],
              ["get", "score"],
              0, "#fef3c7",   // amber-100  (cold lead)
              40, "#fcd34d",  // amber-300
              60, "#f59e0b",  // sun-500    (warm)
              80, "#ea580c",  // orange-600 (hot)
              100, "#b91c1c", // red-700    (top tier)
            ],
          ],
          "circle-stroke-color": "#0f172a",
          "circle-stroke-width": 0.5,
          "circle-opacity": 0.85,
        },
      });
      // Heatmap layer — hidden by default; toggled via showHeatmap state
      map.addLayer({
        id: HEATMAP_LAYER,
        type: "heatmap",
        source: PARCEL_SOURCE,
        layout: { visibility: "none" },
        paint: {
          "heatmap-weight": [
            "interpolate", ["linear"], ["get", "score"],
            0, 0,
            100, 1,
          ],
          "heatmap-intensity": [
            "interpolate", ["linear"], ["zoom"],
            10, 1,
            15, 3,
          ],
          "heatmap-color": [
            "interpolate", ["linear"], ["heatmap-density"],
            0, "rgba(254,243,199,0)",
            0.25, "#fcd34d",
            0.5, "#f59e0b",
            0.75, "#ea580c",
            1, "#b91c1c",
          ],
          "heatmap-radius": [
            "interpolate", ["linear"], ["zoom"],
            10, 20,
            15, 40,
          ],
          "heatmap-opacity": 0.85,
        },
      });

      const f = buildMapFilter(
        filterRef.current.minScore,
        filterRef.current.maxScore,
        filterRef.current.hideExisting,
        filterRef.current.ownerOccOnly,
      );
      if (f) map.setFilter(CIRCLE_LAYER, f as maplibregl.FilterSpecification);
    });

    let cancelled = false;
    let inflight = 0;
    const refresh = async () => {
      if (cancelled || !map.isStyleLoaded()) return;
      const z = map.getZoom();
      if (z < 12) {
        const src = map.getSource(PARCEL_SOURCE) as
          | maplibregl.GeoJSONSource
          | undefined;
        src?.setData({ type: "FeatureCollection", features: [] });
        setParcelCount(0);
        return;
      }
      const b = map.getBounds();
      const bbox: [number, number, number, number] = [
        b.getWest(),
        b.getSouth(),
        b.getEast(),
        b.getNorth(),
      ];
      const myCall = ++inflight;
      const pins = await fetchParcelsInBbox(bbox);
      if (cancelled || myCall !== inflight) return;
      const src = map.getSource(PARCEL_SOURCE) as
        | maplibregl.GeoJSONSource
        | undefined;
      src?.setData(pinsToGeoJSON(pins));
      lastPinsRef.current = pins;
      setParcelCount(pins.length);
    };

    map.on("idle", refresh);
    map.on("moveend", refresh);

    // Click a parcel pin → open the detail sheet.
    map.on("click", "parcels-circle", (ev) => {
      const f = ev.features?.[0];
      if (!f) return;
      const props = f.properties as
        | { id?: string; address?: string; city?: string; state?: string; score?: number; existing?: number }
        | undefined;
      const coords = (f.geometry as GeoJSON.Point).coordinates as [
        number,
        number,
      ];
      const street = props?.address ?? "";
      const city = props?.city ?? "";
      const state = props?.state ?? "VA";
      const fullAddress = [street, city, state].filter(Boolean).join(", ");
      const detail = {
        id: props?.id ?? "",
        address: fullAddress || "(unknown address)",
        state,
        lat: coords[1],
        lon: coords[0],
        score: props?.score ?? -1,
        existing: (props?.existing ?? 0) === 1,
      };
      if (detail.id) saveRecent(detail.id, detail.address);
      setSelected(detail);
    });
    map.on("mouseenter", "parcels-circle", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "parcels-circle", () => {
      map.getCanvas().style.cursor = "";
    });

    mapRef.current = map;

    // Keep canvas in sync if the container is resized (orientation change, etc.)
    const ro = new ResizeObserver(() => { map.resize(); });
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      cancelled = true;
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Apply MapLibre filter whenever filter state changes.
  useEffect(() => {
    filterRef.current = { minScore, maxScore, hideExisting, ownerOccOnly };
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (!map.getLayer(CIRCLE_LAYER)) return;
    const f = buildMapFilter(minScore, maxScore, hideExisting, ownerOccOnly);
    map.setFilter(CIRCLE_LAYER, f as maplibregl.FilterSpecification | null);
  }, [minScore, maxScore, hideExisting, ownerOccOnly]);

  // Toggle heatmap / circle layers when showHeatmap changes.
  useEffect(() => {
    showHeatmapRef.current = showHeatmap;
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (!map.getLayer(HEATMAP_LAYER) || !map.getLayer(CIRCLE_LAYER)) return;
    map.setLayoutProperty(HEATMAP_LAYER, "visibility", showHeatmap ? "visible" : "none");
    map.setLayoutProperty(CIRCLE_LAYER, "visibility", showHeatmap ? "none" : "visible");
  }, [showHeatmap]);

  // Fly to geocoded address, then open the nearest parcel detail sheet.
  useEffect(() => {
    const lat = parseFloat(searchParams.get("lat") ?? "");
    const lon = parseFloat(searchParams.get("lon") ?? "");
    if (!isFinite(lat) || !isFinite(lon)) return;

    let cancelled = false;

    const flyAndOpen = async (map: MlMap) => {
      map.flyTo({ center: [lon, lat], zoom: 15, duration: 1200 });
      new maplibregl.Marker({ color: "#f59e0b" })
        .setLngLat([lon, lat])
        .addTo(map);

      // Query parcels within ~500 m and open the nearest, or open a
      // synthetic card from the geocoded point so all lat/lon-based
      // API sections (PVWatts, Census, weather) still render.
      const delta = 0.005;
      const pins = await fetchParcelsInBbox(
        [lon - delta, lat - delta, lon + delta, lat + delta],
        50,
      );
      if (cancelled) return;

      const nearest = pins.length > 0
        ? pins.reduce((a, b) =>
            (a.lat - lat) ** 2 + (a.lon - lon) ** 2 <=
            (b.lat - lat) ** 2 + (b.lon - lon) ** 2
              ? a
              : b,
          )
        : null;

      // Open detail sheet after fly animation completes.
      setTimeout(() => {
        if (!cancelled) {
          setSelected(
            nearest
              ? {
                  id: nearest.id,
                  address: nearest.address_line1,
                  state: nearest.state,
                  lat: nearest.lat,
                  lon: nearest.lon,
                  score: nearest.score ?? -1,
                  existing: nearest.has_existing_solar,
                }
              : {
                  id: `geo:${lat.toFixed(6)},${lon.toFixed(6)}`,
                  address: searchParams.get("q") ?? `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
                  state: "VA",
                  lat,
                  lon,
                  score: -1,
                  existing: false,
                },
          );
        }
      }, 1300);
    };

    const map = mapRef.current;
    if (map) {
      void flyAndOpen(map);
    } else {
      const onLoad = () => {
        if (mapRef.current) void flyAndOpen(mapRef.current);
      };
      window.addEventListener("maplibre-ready", onLoad, { once: true });
      return () => {
        cancelled = true;
        window.removeEventListener("maplibre-ready", onLoad);
      };
    }

    return () => { cancelled = true; };
  }, [searchParams]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const newStyle = isSatellite ? SAT_STYLE : OSM_STYLE;
    map.setStyle(newStyle);
    map.once("style.load", () => {
      if (!map.getSource(PARCEL_SOURCE)) {
        map.addSource(PARCEL_SOURCE, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      if (!map.getLayer(CIRCLE_LAYER)) {
        map.addLayer({
          id: CIRCLE_LAYER,
          type: "circle",
          source: PARCEL_SOURCE,
          layout: { visibility: showHeatmapRef.current ? "none" : "visible" },
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 2, 16, 6],
            "circle-color": [
              "case",
              ["==", ["get", "existing"], 1],
              "#94a3b8",
              [
                "interpolate",
                ["linear"],
                ["get", "score"],
                0, "#fef3c7",
                40, "#fcd34d",
                60, "#f59e0b",
                80, "#ea580c",
                100, "#b91c1c",
              ],
            ],
            "circle-stroke-color": "#0f172a",
            "circle-stroke-width": 0.5,
            "circle-opacity": 0.85,
          },
        });
      }
      if (!map.getLayer(HEATMAP_LAYER)) {
        map.addLayer({
          id: HEATMAP_LAYER,
          type: "heatmap",
          source: PARCEL_SOURCE,
          layout: { visibility: showHeatmapRef.current ? "visible" : "none" },
          paint: {
            "heatmap-weight": ["interpolate", ["linear"], ["get", "score"], 0, 0, 100, 1],
            "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 10, 1, 15, 3],
            "heatmap-color": [
              "interpolate", ["linear"], ["heatmap-density"],
              0, "rgba(254,243,199,0)",
              0.25, "#fcd34d",
              0.5, "#f59e0b",
              0.75, "#ea580c",
              1, "#b91c1c",
            ],
            "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 10, 20, 15, 40],
            "heatmap-opacity": 0.85,
          },
        });
      }
      const src = map.getSource(PARCEL_SOURCE) as maplibregl.GeoJSONSource | undefined;
      if (lastPinsRef.current.length > 0) {
        src?.setData(pinsToGeoJSON(lastPinsRef.current));
      }
      const f = buildMapFilter(
        filterRef.current.minScore,
        filterRef.current.maxScore,
        filterRef.current.hideExisting,
        filterRef.current.ownerOccOnly,
      );
      if (f) map.setFilter(CIRCLE_LAYER, f as maplibregl.FilterSpecification);
    });
  }, [isSatellite]);

  const filtersActive = minScore > 0 || maxScore < 100 || hideExisting || ownerOccOnly;

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* Sub-nav */}
      <div className="flex items-center gap-1 overflow-x-auto border-b bg-slate-100 px-3 py-1.5">
        {[
          { icon: "🏠", label: "Home", to: "/home" },
          { icon: "🏘", label: "Properties", to: "/properties" },
        ].map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => navigate(item.to)}
            className="flex shrink-0 items-center gap-1 rounded-md px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200"
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setIsSatellite((v) => !v)}
          className={[
            "flex shrink-0 items-center gap-1 rounded-md px-3 py-1 text-xs font-medium",
            isSatellite ? "bg-slate-700 text-white" : "text-slate-600 hover:bg-slate-200",
          ].join(" ")}
        >
          <span>🛰</span>
          <span>Satellite</span>
        </button>
        <button
          type="button"
          onClick={() => setFilterOpen((v) => !v)}
          className={[
            "flex shrink-0 items-center gap-1 rounded-md px-3 py-1 text-xs font-medium",
            filtersActive ? "bg-amber-500 text-white" : "text-slate-600 hover:bg-slate-200",
          ].join(" ")}
        >
          <span>⚙</span>
          <span>Filters{filtersActive ? " ●" : ""}</span>
        </button>
        <button
          type="button"
          onClick={() => setShowHeatmap((v) => !v)}
          className={[
            "flex shrink-0 items-center gap-1 rounded-md px-3 py-1 text-xs font-medium",
            showHeatmap ? "bg-amber-500 text-white" : "text-slate-600 hover:bg-slate-200",
          ].join(" ")}
        >
          <span>🌡</span>
          <span>Heat map</span>
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden bg-slate-100">
      {/* Full-screen map */}
      <div ref={containerRef} className="absolute inset-0 bg-slate-100" />

      {/* Floating top panel — search bar + legend/action row + optional panels */}
      <div className="absolute left-2 right-2 top-2 z-10 flex flex-col gap-1.5">
        <AddressSearch placeholder="Search an address…" />

        <div className="flex items-center gap-1.5">
          {/* Colour legend */}
          <div className="flex flex-1 items-center gap-1 rounded-xl bg-white/92 px-2 py-1 text-[11px] text-slate-500 shadow-sm backdrop-blur-sm">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-200" />
            <span>cold</span>
            <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
            <span className="inline-block h-2 w-2 rounded-full bg-orange-500" />
            <span className="inline-block h-2 w-2 rounded-full bg-red-700" />
            <span>hot</span>
            <span className="ml-1 inline-block h-2 w-2 rounded-full bg-slate-400" />
            <span>solar</span>
          </div>

          {/* Satellite toggle */}
          <button
            type="button"
            onClick={() => setIsSatellite((v) => !v)}
            className={[
              "rounded-xl border px-2.5 py-1 text-xs font-semibold shadow-sm backdrop-blur-sm",
              isSatellite
                ? "border-amber-500 bg-amber-500 text-white"
                : "border-transparent bg-white/92 text-slate-700 hover:bg-white",
            ].join(" ")}
          >
            🛰 {isSatellite ? "Streets" : "Sat"}
          </button>

          {/* Filter toggle */}
          <button
            type="button"
            onClick={() => setFilterOpen((v) => !v)}
            className={[
              "rounded-xl border px-2.5 py-1 text-xs font-semibold shadow-sm backdrop-blur-sm",
              filterOpen || filtersActive
                ? "border-amber-500 bg-amber-500 text-white"
                : "border-transparent bg-white/92 text-slate-700 hover:bg-white",
            ].join(" ")}
          >
            Filters{filtersActive ? " ●" : ""}
          </button>
        </div>

        {/* Geocode label */}
        {geocodeLabel && (
          <p className="rounded-xl bg-white/92 px-2.5 py-1 text-xs text-amber-700 shadow-sm backdrop-blur-sm">
            📍 {geocodeLabel}
          </p>
        )}

        {/* Filter panel — expands inline below the action row */}
        {filterOpen && (
          <div className="rounded-xl border bg-white p-3 shadow-lg space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-slate-600">Score ≥</span>
              <input
                type="range" min={0} max={100} step={5} value={minScore}
                onChange={(e) => setMinScore(Math.min(Number(e.target.value), maxScore))}
                className="flex-1 accent-amber-500"
              />
              <span className="w-8 text-right font-mono text-slate-700">{minScore}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-slate-600">Score ≤</span>
              <input
                type="range" min={0} max={100} step={5} value={maxScore}
                onChange={(e) => setMaxScore(Math.max(Number(e.target.value), minScore))}
                className="flex-1 accent-amber-500"
              />
              <span className="w-8 text-right font-mono text-slate-700">{maxScore}</span>
            </div>
            <label className="flex cursor-pointer select-none items-center gap-2">
              <input
                type="checkbox" checked={hideExisting}
                onChange={(e) => setHideExisting(e.target.checked)}
                className="accent-amber-500"
              />
              <span className="text-slate-700">Hide existing solar</span>
            </label>
            <label className="flex cursor-pointer select-none items-center gap-2">
              <input
                type="checkbox" checked={ownerOccOnly}
                onChange={(e) => setOwnerOccOnly(e.target.checked)}
                className="accent-amber-500"
              />
              <span className="text-slate-700">Owner-occupied only</span>
            </label>
            {filtersActive && (
              <button
                type="button"
                onClick={() => { setMinScore(0); setMaxScore(100); setHideExisting(false); setOwnerOccOnly(false); }}
                className="text-[11px] text-amber-700 underline underline-offset-2"
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bottom-left status + export strip (stays left of MapLibre nav controls) */}
      <div className="absolute bottom-3 left-2 z-10 flex items-center gap-1.5">
        <span className="rounded-xl bg-white/92 px-2 py-1 text-[11px] text-slate-500 shadow-sm backdrop-blur-sm">
          {parcelCount} parcels
        </span>
        <button
          type="button"
          onClick={() => downloadWalkListCsv(lastPinsRef.current)}
          disabled={parcelCount === 0}
          className="rounded-xl bg-white/92 px-2 py-1 text-[11px] font-semibold text-amber-700 shadow-sm backdrop-blur-sm hover:bg-white disabled:opacity-40"
        >
          CSV ↓
        </button>
        <button
          type="button"
          onClick={() => void downloadDoorcards(lastPinsRef.current)}
          disabled={parcelCount === 0}
          className="rounded-xl bg-white/92 px-2 py-1 text-[11px] font-semibold text-amber-700 shadow-sm backdrop-blur-sm hover:bg-white disabled:opacity-40"
        >
          Doorcards ↓
        </button>
      </div>

      <ParcelDetailSheet parcel={selected} onClose={() => setSelected(null)} />
      </div>
    </div>
  );
}

function downloadWalkListCsv(pins: ParcelPin[]): void {
  if (pins.length === 0) return;
  const headers = [
    "id",
    "address",
    "lat",
    "lon",
    "score",
    "has_existing_solar",
    "excluded_reason",
  ];
  const rows = pins.map((p) => [
    p.id,
    p.address_line1 ?? "",
    String(p.lat),
    String(p.lon),
    p.score == null ? "" : String(p.score),
    p.has_existing_solar ? "1" : "0",
    p.excluded_reason ?? "",
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `walk-list-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvCell(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const DOORCARD_BATCH_CAP = 200;

async function downloadDoorcards(pins: ParcelPin[]): Promise<void> {
  if (pins.length === 0) return;
  if (!SUPABASE_URL) {
    alert("Supabase URL not configured for this build.");
    return;
  }
  const ids = pins
    .filter((p) => !p.has_existing_solar)
    .map((p) => p.id)
    .slice(0, DOORCARD_BATCH_CAP);
  if (ids.length === 0) return;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/doorcard-pdf`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parcel_ids: ids }),
      },
    );
    if (!res.ok) throw new Error(`doorcard ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `doorcards-${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) {
    alert(`Doorcard print failed: ${err instanceof Error ? err.message : err}`);
  }
}
