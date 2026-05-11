import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { getRoute, type RouteEntry } from "@/lib/route.js";
import { DashboardCard } from "@/components/DashboardCard.js";
import { DashboardCardList } from "@/components/DashboardCardList.js";
import { useDashboardLayout } from "@/hooks/useDashboardLayout.js";
import { SubNav } from "@/components/SubNav.js";
import { AddressSearch } from "@/components/AddressSearch.js";
import type React from "react";

const STORAGE_KEY = "dashboard:properties";
const DEFAULT_ORDER = ["search", "walk-plan", "recent"];
const RECENT_KEY = "properties:recent";

interface RecentProperty {
  id: string;
  address: string;
  viewedAt: number;
}

function loadRecent(): RecentProperty[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as RecentProperty[]) : [];
  } catch {
    return [];
  }
}

function timeAgo(ts: number): string {
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

function ScoreDot({ score }: { score: number }) {
  const color =
    score >= 80 ? "bg-red-500" :
    score >= 60 ? "bg-orange-400" :
    score >= 40 ? "bg-yellow-400" : "bg-amber-200";
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${color}`} />;
}

export function PropertiesRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const { order, collapsed, reorder, toggleCollapsed, resetLayout } =
    useDashboardLayout(STORAGE_KEY, DEFAULT_ORDER);

  const [route, setRoute] = useState<RouteEntry[]>(() => getRoute());
  const [recent, setRecent] = useState<RecentProperty[]>(loadRecent);

  // Refresh on every navigation (e.g. returning from a property detail page).
  useEffect(() => {
    setRoute(getRoute());
    setRecent(loadRecent());
  }, [location.pathname]);

  useEffect(() => {
    const refresh = () => {
      setRoute(getRoute());
      setRecent(loadRecent());
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  const cardMap: Record<string, React.ReactNode> = {
    "search": (
      <DashboardCard
        key="search"
        id="search"
        title="Search Properties"
        collapsed={!!collapsed["search"]}
        onToggleCollapse={() => toggleCollapsed("search")}
      >
        <div className="px-4 py-3">
          <AddressSearch placeholder="Type an address or owner…" />
          <p className="mt-2 text-xs text-slate-400">Search geocodes the address and opens it on the map.</p>
        </div>
      </DashboardCard>
    ),

    "walk-plan": (
      <DashboardCard
        key="walk-plan"
        id="walk-plan"
        title="Today's Walk Plan"
        badge={route.length > 0 ? route.length : undefined}
        collapsed={!!collapsed["walk-plan"]}
        onToggleCollapse={() => toggleCollapsed("walk-plan")}
      >
        {route.length === 0 ? (
          <div className="px-4 py-5 text-center">
            <p className="text-sm text-slate-500">No route planned yet.</p>
            <p className="mt-0.5 text-xs text-slate-400">Open the map and tap any property to add it to today's route.</p>
            <button
              type="button"
              onClick={() => navigate("/territory")}
              className="mt-3 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-amber-600"
            >
              Open map →
            </button>
          </div>
        ) : (
          <div>
            <div className="divide-y">
              {route.slice(0, 8).map((r, i) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => navigate(`/properties/${r.id}`)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-amber-50 active:bg-amber-100"
                >
                  <span className="w-4 shrink-0 text-center text-xs font-semibold text-slate-600">{i + 1}</span>
                  <ScoreDot score={r.score} />
                  <span className="flex-1 truncate text-sm font-medium text-slate-900">{r.address}</span>
                  <span className="shrink-0 text-xs font-semibold text-amber-600">{r.score}</span>
                  <span className="shrink-0 text-xs text-slate-400">→</span>
                </button>
              ))}
              {route.length > 8 && (
                <div className="px-4 py-2 text-xs text-slate-400">+{route.length - 8} more stops</div>
              )}
            </div>
            <div className="border-t px-4 py-3 flex gap-2">
              <button
                type="button"
                onClick={() => navigate("/properties/walk")}
                className="flex-1 rounded-lg bg-amber-500 py-2.5 text-sm font-semibold text-white shadow hover:bg-amber-600"
              >
                ▶ Start Walk
              </button>
              <button
                type="button"
                onClick={() => navigate("/territory")}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                + Add
              </button>
            </div>
          </div>
        )}
      </DashboardCard>
    ),

    "recent": (
      <DashboardCard
        key="recent"
        id="recent"
        title="Recently Viewed"
        badge={recent.length > 0 ? recent.length : undefined}
        collapsed={!!collapsed["recent"]}
        onToggleCollapse={() => toggleCollapsed("recent")}
      >
        {recent.length === 0 ? (
          <div className="px-4 py-4 text-sm text-slate-500">
            <p>No properties viewed yet.</p>
            <p className="mt-1 text-xs text-slate-400">Properties you open will appear here for quick access.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {recent.slice(0, 10).map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-800">{p.address}</div>
                  <div className="text-xs text-slate-400">{timeAgo(p.viewedAt)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(`/properties/${p.id}`)}
                  className="shrink-0 rounded border border-amber-400 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50"
                >
                  Open
                </button>
              </li>
            ))}
          </ul>
        )}
      </DashboardCard>
    ),
  };

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <div className="border-b bg-white px-4 py-3">
        <h1 className="text-lg font-bold text-slate-900">Properties</h1>
      </div>

      <SubNav
        items={[
          { icon: "🔍", label: "Search" },
          { icon: "🗺", label: "Map", to: "/territory" },
          { icon: "🚶", label: "Walk", to: "/properties/walk" },
          { icon: "📝", label: "Notes", disabled: true },
          { icon: "📊", label: "Stats", disabled: true },
        ]}
      />

      <div className="flex-1 overflow-y-auto bg-slate-50 p-4">
        <DashboardCardList order={order} onReorder={reorder}>
          {order.map((id) => cardMap[id]).filter(Boolean)}
        </DashboardCardList>

        <button
          type="button"
          onClick={resetLayout}
          className="mt-4 w-full rounded-lg border border-slate-200 py-2 text-xs font-medium text-slate-400 hover:bg-slate-50"
        >
          ↺ Reset layout
        </button>
      </div>
    </div>
  );
}
