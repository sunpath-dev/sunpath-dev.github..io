import { useNavigate } from "react-router-dom";

interface SubNavItem {
  label: string;
  icon: string;
  to?: string;
  onClick?: () => void;
  disabled?: boolean;
}

interface SubNavProps {
  items: SubNavItem[];
}

export function SubNav({ items }: SubNavProps) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b bg-slate-100 px-3 py-1.5 scrollbar-hide">
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          disabled={item.disabled}
          onClick={() => {
            if (item.onClick) item.onClick();
            else if (item.to) navigate(item.to);
          }}
          className="flex shrink-0 items-center gap-1 rounded-md px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span>{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}
