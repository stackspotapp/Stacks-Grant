import { NavLink, Outlet } from "react-router-dom";
import { Boxes, LayoutDashboard, Rocket, Settings2 } from "lucide-react";
import { FaStackOverflow } from "react-icons/fa";
import { useApp } from "../context/AppContext";
import { ConnectWallet } from "./ConnectWallet";
import { TxLog } from "./TxLog";

const nav = [
  { to: "/", label: "Pots", icon: LayoutDashboard },
  { to: "/deploy", label: "Deploy pot", icon: Rocket },
  { to: "/core", label: "Core contracts", icon: Settings2 },
  { to: "/call", label: "Contract call", icon: Boxes },
];

export function Layout() {
  const { apiOnline, chainInfo } = useApp();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-panel)]">
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-4">
          <FaStackOverflow className="text-2xl text-[var(--color-accent)]" />
          <div>
            <p className="text-sm font-semibold text-white">Stackspot</p>
            <p className="text-xs text-[var(--color-muted)]">Test UI · Devnet</p>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 p-3">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-[var(--color-accent)] text-white"
                    : "text-[var(--color-muted)] hover:bg-white/5 hover:text-white"
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-[var(--color-border)] p-3">
          <ConnectWallet />
          <div className="mt-3 rounded-lg bg-black/20 px-2 py-2 text-xs">
            <span
              className={`inline-block h-2 w-2 rounded-full ${apiOnline ? "bg-[var(--color-success)]" : "bg-[var(--color-error)]"}`}
            />
            <span className="ml-2 text-[var(--color-muted)]">
              {apiOnline ? "API online" : "API offline"}
            </span>
            {chainInfo && (
              <p className="mt-1 text-[var(--color-muted)]">
                burn {chainInfo.burn_block_height} · stacks{" "}
                {chainInfo.stacks_tip_height}
              </p>
            )}
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-[var(--color-border)] px-6 py-4">
          <h1 className="text-lg font-semibold text-white">Stackspot contract tester</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Connect a wallet, browse registered pots, execute any public function.
          </p>
        </header>
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6">
            <Outlet />
          </div>
          <TxLog />
        </div>
      </main>
    </div>
  );
}
