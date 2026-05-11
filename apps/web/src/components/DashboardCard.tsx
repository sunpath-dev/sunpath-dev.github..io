import { type ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface DashboardCardProps {
  id: string;
  title: string;
  badge?: string | number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  children: ReactNode;
}

export function DashboardCard({
  id,
  title,
  badge,
  collapsed,
  onToggleCollapse,
  children,
}: DashboardCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-xl border bg-white shadow-sm"
    >
      <div className="flex items-center gap-2 border-b px-3 py-3">
        {/* Drag handle */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Drag to reorder ${title}`}
          className="shrink-0 cursor-grab touch-none text-slate-300 hover:text-slate-500 active:cursor-grabbing"
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M7 4a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM15 4a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM7 10a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM15 10a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM7 16a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM15 16a1 1 0 1 1-2 0 1 1 0 0 1 2 0z" />
          </svg>
        </button>

        {/* Title */}
        <span className="flex-1 text-sm font-semibold text-slate-800">{title}</span>

        {/* Badge */}
        {badge !== undefined && badge !== null && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
            {badge}
          </span>
        )}

        {/* Collapse chevron */}
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
          className="shrink-0 text-slate-400 hover:text-slate-600"
        >
          <svg
            className={`h-4 w-4 transition-transform ${collapsed ? "-rotate-90" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {!collapsed && <div>{children}</div>}
    </div>
  );
}
