import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Activity,
  History,
  LineChart,
  Sparkles,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type DashboardPage = "overview" | "activity" | "trades" | "strategies" | "ailab" | "settings";

export const NAV: Array<{ id: DashboardPage; label: string; icon: LucideIcon }> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "trades", label: "Trades", icon: History },
  { id: "strategies", label: "Strategies", icon: LineChart },
  { id: "ailab", label: "AI Lab", icon: Sparkles },
  { id: "settings", label: "Settings", icon: Settings },
];

export function Sidebar({
  page,
  onNavigate,
  badges,
}: {
  page: DashboardPage;
  onNavigate: (p: DashboardPage) => void;
  /** Small counts shown beside a nav item, e.g. pending AI Lab proposals. */
  badges?: Partial<Record<DashboardPage, number>>;
}) {
  return (
    <aside className="hidden md:flex md:w-56 md:shrink-0 md:flex-col bg-sidebar text-sidebar-foreground">
      <div className="px-5 py-5">
        <p className="text-sm font-bold tracking-tight text-white">Auto&#8209;Trader</p>
        <p className="text-xs text-sidebar-foreground/60 mt-0.5">Personal AI trading</p>
      </div>
      <nav className="flex-1 px-2 space-y-0.5">
        {NAV.map((item) => {
          const active = page === item.id;
          const Icon = item.icon;
          const badge = badges?.[item.id];
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={cn(
                "w-full flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">{item.label}</span>
              {!!badge && (
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
      <div className="px-5 py-4 text-[11px] text-sidebar-foreground/45 leading-relaxed">
        Not financial advice. Trading involves real financial risk.
      </div>
    </aside>
  );
}
