import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import maplibregl, { Map as MlMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
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

export function TerritoryRoute() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [parcelCount, setParcelCount] = useState<number>(0);
  const [selected, setSelected] = useState<ParcelDetail | null>(null);
  const lastPinsRef = useRef<ParcelPin[]>([]);
  const [isSatellite, setIsSatellite] = useState(false);
  const [searchParams] = useSearchParams();
  const geocodeLabel = isFinite(parseFloat(searchParams.get("lat") ?? "")) ? searchParams.get("q") : null;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      "top-right",
    );

    map.on("load", () => {
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
        | { id?: string; address?: string; score?: number; existing?: number }
        | undefined;
      const coords = (f.geometry as GeoJSON.Point).coordinates as [
        number,
        number,
      ];
      setSelected({
        id: props?.id ?? "",
        address: props?.address ?? "(unknown address)",
        // Hardcoded VA for now; expansion to TN/etc. wires this from the row.
        state: "VA",
        lat: coords[1],
        lon: coords[0],
        score: props?.score ?? -1,
        existing: (props?.existing ?? 0) === 1,
      });
    });
    map.on("mouseenter", "parcels-circle", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "parcels-circle", () => {
      map.getCanvas().style.cursor = "";
    });

    mapRef.current = map;
    return () => {
      cancelled = true;
      map.remove();
      mapRef.current = null;
    };
  }, []);

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
      if (!map.getLayer("parcels-circle")) {
        map.addLayer({
          id: "parcels-circle",
          type: "circle",
          source: PARCEL_SOURCE,
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
      const src = map.getSource(PARCEL_SOURCE) as maplibregl.GeoJSONSource | undefined;
      if (lastPinsRef.current.length > 0) {
        src?.setData(pinsToGeoJSON(lastPinsRef.current));
      }
    });
  }, [isSatellite]);

  return (
    <div className="relative flex h-full flex-col">
      <header className="border-b bg-white p-4">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold">Territory</h1>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">
              {parcelCount} parcels in view
            </span>
            <button
              type="button"
              onClick={() => setIsSatellite((v) => !v)}
              className={[
                "rounded border px-2 py-1 text-xs font-semibold",
                isSatellite
                  ? "border-amber-500 bg-amber-500 text-white"
                  : "border-amber-500 text-amber-700 hover:bg-amber-50",
              ].join(" ")}
              title="Toggle satellite imagery"
            >
              🛰 {isSatellite ? "Streets" : "Satellite"}
            </button>
            <button
              type="button"
              onClick={() => downloadWalkListCsv(lastPinsRef.current)}
              disabled={parcelCount === 0}
              className="rounded border border-amber-500 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-40"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => void downloadDoorcards(lastPinsRef.current)}
              disabled={parcelCount === 0}
              className="rounded border border-amber-500 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-40"
              title="Generate quarter-sheet doorcard PDFs for all parcels in view"
            >
              Print doorcards
            </button>
          </div>
        </div>
        <div className="mt-2">
          <AddressSearch placeholder="Search an address…" />
        </div>
        {geocodeLabel && (
          <p className="mt-1 text-xs text-amber-700">📍 {geocodeLabel}</p>
        )}
        <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-200" />
          <span>cold</span>
          <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
          <span className="inline-block h-2 w-2 rounded-full bg-orange-500" />
          <span className="inline-block h-2 w-2 rounded-full bg-red-700" />
          <span>hot</span>
          <span className="ml-3 inline-block h-2 w-2 rounded-full bg-slate-400" />
          <span>existing solar</span>
        </div>
      </header>
      <div ref={containerRef} className="flex-1" />
      <ParcelDetailSheet parcel={selected} onClose={() => setSelected(null)} />
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
