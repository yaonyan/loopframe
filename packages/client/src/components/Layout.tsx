import { Outlet, NavLink } from "react-router-dom";
import { Zap, RefreshCw, Grid2X2, Settings, Sun, Moon, Layers } from "lucide-react";
import { useTheme } from "../hooks/useTheme";

const NAV = [
  { to: "/forge",    label: "Forge",    Icon: Zap       },
  { to: "/evolve",   label: "Evolve",   Icon: RefreshCw },
  { to: "/hub",      label: "Hub",      Icon: Grid2X2   },
  { to: "/settings", label: "Settings", Icon: Settings  },
] as const;

export function Layout() {
  const { theme, toggle } = useTheme();

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: "var(--bg-base)" }}>
      {/* ── Sidebar ── */}
      <aside
        className="flex-shrink-0 flex flex-col"
        style={{
          width: "var(--sidebar-width)",
          backgroundColor: "var(--bg-surface)",
          borderRight: "1px solid var(--bg-border)",
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-2.5 px-4 flex-shrink-0"
          style={{
            height: "var(--header-height)",
            borderBottom: "1px solid var(--bg-border)",
          }}
        >
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: "var(--lf-primary)" }}
          >
            <Layers size={14} color="#ffffff" strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-none tracking-tight font-mono"
               style={{ color: "var(--text-primary)" }}>
              Loopframe
            </p>
            <p className="text-[10px] leading-none mt-0.5" style={{ color: "var(--text-muted)" }}>
              Harness Regulation Studio
            </p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {NAV.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => isActive ? "nav-link nav-link-active" : "nav-link"}
            >
              <Icon size={15} strokeWidth={2} className="flex-shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div
          className="px-2 py-3 flex items-center justify-between"
          style={{ borderTop: "1px solid var(--bg-border)" }}
        >
          <span className="text-[11px] font-mono px-1" style={{ color: "var(--text-muted)" }}>
            v0.1.0
          </span>
          <button
            onClick={toggle}
            className="btn-icon"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? (
              <Sun size={15} strokeWidth={2} />
            ) : (
              <Moon size={15} strokeWidth={2} />
            )}
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 min-w-0 overflow-y-hidden overflow-x-hidden" style={{ contain: "layout" }}>
        <Outlet />
      </main>
    </div>
  );
}
