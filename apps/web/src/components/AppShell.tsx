import { NavLink, Outlet } from "react-router-dom";

const tabs = [
  { to: "/territory", label: "Map" },
  { to: "/walk", label: "Walk" },
  { to: "/pipeline", label: "Pipeline" },
  { to: "/settings", label: "Settings" },
];

export function AppShell() {
  return (
    <div className="flex h-dvh flex-col">
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
      <nav className="grid grid-cols-4 border-t bg-white">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              [
                "flex h-14 flex-col items-center justify-center text-xs font-medium",
                isActive
                  ? "text-sun-600"
                  : "text-slate-500 hover:text-slate-900",
              ].join(" ")
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
