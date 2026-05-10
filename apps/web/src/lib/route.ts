// Today's route — persisted in localStorage, keyed by calendar date.
// Route entries are added from the detail sheet and consumed by the walk tab.

export interface RouteEntry {
  id: string;
  address: string;
  lat: number;
  lon: number;
  score: number;
  existing: boolean;
  addedAt: string; // ISO timestamp
}

function todayKey(): string {
  return `sunpath:route:${new Date().toISOString().slice(0, 10)}`;
}

export function getRoute(): RouteEntry[] {
  try {
    const raw = localStorage.getItem(todayKey());
    return raw ? (JSON.parse(raw) as RouteEntry[]) : [];
  } catch {
    return [];
  }
}

export function addToRoute(entry: Omit<RouteEntry, "addedAt">): boolean {
  const route = getRoute();
  if (route.some((r) => r.id === entry.id)) return false; // already added
  route.push({ ...entry, addedAt: new Date().toISOString() });
  localStorage.setItem(todayKey(), JSON.stringify(route));
  return true;
}

export function removeFromRoute(id: string): void {
  const route = getRoute().filter((r) => r.id !== id);
  localStorage.setItem(todayKey(), JSON.stringify(route));
}

export function clearRoute(): void {
  localStorage.removeItem(todayKey());
}

export function isInRoute(id: string): boolean {
  return getRoute().some((r) => r.id === id);
}
