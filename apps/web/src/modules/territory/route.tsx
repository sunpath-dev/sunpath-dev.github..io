import { useEffect, useRef } from "react";
import maplibregl, { Map as MlMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

/**
 * Territory map view.
 * v0: MapLibre with OSM raster tiles + geolocate control. Phase 2 will add a
 * parcel vector layer + score-tinted markers from `@sunpath/shared/scoring`.
 *
 * Defaults to Gate City, VA (Scott County) per the launch plan.
 */
const DEFAULT_CENTER: [number, number] = [-82.5915, 36.6376];
const DEFAULT_ZOOM = 13;

export function TerritoryRoute() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);

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
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b bg-white p-4">
        <h1 className="text-2xl font-bold">Territory</h1>
        <p className="text-sm text-slate-600">
          Gate City, VA — Scott County. Parcel layer arrives in Phase 2.
        </p>
      </header>
      <div ref={containerRef} className="flex-1" />
    </div>
  );
}
