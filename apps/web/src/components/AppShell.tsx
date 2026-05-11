import { NavLink, Outlet, Link } from "react-router-dom";
import { useAuth } from "@/lib/auth.js";

const tabs = [
  {
    to: "/home",
    label: "Home",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
      </svg>
    ),
  },
  {
    to: "/properties",
    label: "Properties",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h7.5V10.75M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3l-1.5.545m0 6.205l3 1m1.5.5l-1.5-.5M6.75 7.364V3h-3v18m3-13.636l10.5-3.819" />
      </svg>
    ),
  },
  {
    to: "/territory",
    label: "Map",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
      </svg>
    ),
  },
  {
    to: "/build",
    label: "Build",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
      </svg>
    ),
  },
  {
    to: "/reports",
    label: "Reports",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
  {
    to: "/about",
    label: "About",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
      </svg>
    ),
  },
];

function TabItem({ to, label, icon }: typeof tabs[number]) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          "flex w-full flex-col items-center justify-center gap-0.5 min-w-0 font-medium",
          isActive ? "text-amber-600" : "text-slate-400 hover:text-slate-700",
        ].join(" ")
      }
    >
      {icon}
      <span className="w-full truncate text-center text-[10px] leading-none">{label}</span>
    </NavLink>
  );
}

const AdminIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.955 11.955 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
  </svg>
);

const UserIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
  </svg>
);

export function AppShell() {
  const { rep } = useAuth();
  const isAdmin = rep?.role === "admin";

  const railLinkClass = ({ isActive }: { isActive: boolean }) =>
    [
      "flex w-full flex-col items-center gap-1 rounded-lg px-2 py-3 text-xs font-medium transition-colors",
      isActive
        ? "bg-amber-50 text-amber-600"
        : "text-slate-400 hover:bg-slate-50 hover:text-slate-700",
    ].join(" ");

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Desktop left rail — visible at lg+ */}
      <nav className="hidden lg:flex lg:w-20 lg:flex-col lg:items-center lg:gap-1 lg:border-r lg:bg-white lg:py-4">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} className={railLinkClass}>
            {t.icon}
            <span>{t.label}</span>
          </NavLink>
        ))}

        {/* Spacer pushes profile/admin to bottom */}
        <div className="flex-1" />

        {isAdmin && (
          <NavLink to="/admin" className={railLinkClass}>
            <AdminIcon />
            <span>Admin</span>
          </NavLink>
        )}
        <NavLink to="/profile" className={railLinkClass}>
          <UserIcon />
          <span>Profile</span>
        </NavLink>
      </nav>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">

        {/* Mobile top header — hidden at lg+ */}
        <header className="flex h-11 shrink-0 items-center justify-between border-b bg-white px-4 lg:hidden">
          <span className="text-sm font-bold tracking-tight text-slate-900">Sunpath</span>
          <div className="flex items-center gap-1">
            {isAdmin && (
              <Link
                to="/admin"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-amber-50 hover:text-amber-600"
                aria-label="Admin portal"
              >
                <AdminIcon />
              </Link>
            )}
            <Link
              to="/profile"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700 hover:bg-amber-200"
              aria-label="My profile"
            >
              <UserIcon />
            </Link>
          </div>
        </header>

        <main className="flex flex-1 flex-col min-h-0 overflow-hidden">
          <Outlet />
        </main>

        {/* Mobile bottom nav — hidden at lg+ */}
        <nav className="grid grid-cols-6 border-t bg-white safe-area-bottom lg:hidden">
          {tabs.map((t) => (
            <div key={t.to} className="flex h-14 items-center justify-center">
              <TabItem {...t} />
            </div>
          ))}
        </nav>
      </div>
    </div>
  );
}
