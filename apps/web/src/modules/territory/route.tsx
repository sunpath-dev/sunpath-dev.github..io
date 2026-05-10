import { useEffect, useRef, useState } from "react";
import maplibregl, { Map as MlMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { fetchParcelsInBbox, pinsToGeoJSON } from "./repo.js";

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

export function TerritoryRoute() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [parcelCount, setParcelCount] = useState<number>(0);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
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
      },
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
      setParcelCount(pins.length);
    };

    map.on("idle", refresh);
    map.on("moveend", refresh);
    mapRef.current = map;
    return () => {
      cancelled = true;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b bg-white p-4">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold">Territory</h1>
          <span className="text-xs text-slate-500">
            {parcelCount} parcels in view
          </span>
        </div>
        <p className="text-sm text-slate-600">
          Gate City, VA — Scott County. Pan/zoom to load parcels.
        </p>
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
    </div>
  );
}
