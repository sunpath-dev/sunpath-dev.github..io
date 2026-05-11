import { useCallback, useState } from "react";

interface LayoutState {
  order: string[];
  collapsed: Record<string, boolean>;
}

function readLayout(storageKey: string, defaultOrder: string[]): LayoutState {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { order: defaultOrder, collapsed: {} };
    const parsed = JSON.parse(raw) as Partial<LayoutState>;
    const order = Array.isArray(parsed.order) ? parsed.order : defaultOrder;
    const collapsed = parsed.collapsed && typeof parsed.collapsed === "object"
      ? (parsed.collapsed as Record<string, boolean>)
      : {};
    return { order, collapsed };
  } catch {
    return { order: defaultOrder, collapsed: {} };
  }
}

function writeLayout(storageKey: string, state: LayoutState) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // storage full or private mode — silent fail
  }
}

export function useDashboardLayout(storageKey: string, defaultOrder: string[]) {
  const [layout, setLayout] = useState<LayoutState>(() =>
    readLayout(storageKey, defaultOrder),
  );

  const reorder = useCallback(
    (newOrder: string[]) => {
      setLayout((prev) => {
        const next = { ...prev, order: newOrder };
        writeLayout(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  const toggleCollapsed = useCallback(
    (id: string) => {
      setLayout((prev) => {
        const next = {
          ...prev,
          collapsed: {
            ...prev.collapsed,
            [id]: !prev.collapsed[id],
          },
        };
        writeLayout(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  const resetLayout = useCallback(() => {
    const next: LayoutState = { order: defaultOrder, collapsed: {} };
    writeLayout(storageKey, next);
    setLayout(next);
  }, [storageKey, defaultOrder]);

  // Merge any ids in defaultOrder that are missing from stored order
  const mergedOrder = [
    ...layout.order.filter((id) => defaultOrder.includes(id)),
    ...defaultOrder.filter((id) => !layout.order.includes(id)),
  ];

  return {
    order: mergedOrder,
    collapsed: layout.collapsed,
    reorder,
    toggleCollapsed,
    resetLayout,
  };
}
