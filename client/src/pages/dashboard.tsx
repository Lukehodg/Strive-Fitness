import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Sidebar, type DashboardPage } from "@/components/dashboard/Sidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { AlertsBanner } from "@/components/dashboard/AlertsBanner";
import { OverviewPage } from "@/components/dashboard/OverviewPage";
import { ActivityPage } from "@/components/dashboard/ActivityPage";
import { TradesPage } from "@/components/dashboard/TradesPage";
import { StrategiesPage } from "@/components/dashboard/StrategiesPage";
import { AiLabPage } from "@/components/dashboard/AiLabPage";
import { SettingsPage } from "@/components/dashboard/SettingsPage";

const PAGE_TITLE: Record<DashboardPage, string> = {
  overview: "Overview",
  activity: "Activity",
  trades: "Trades",
  strategies: "Strategies",
  ailab: "AI Lab",
  settings: "Settings",
};

export default function Dashboard() {
  const [page, setPage] = useState<DashboardPage>("overview");
  const status = useQuery({ queryKey: ["/api/status"], queryFn: api.status, refetchInterval: 4000 });
  const proposals = useQuery({ queryKey: ["/api/improve/proposals"], queryFn: api.proposals, refetchInterval: 15000 });

  const pendingProposals = (proposals.data?.proposals ?? []).filter((p) => p.status === "pending").length;

  return (
    <div className="min-h-screen flex">
      <Sidebar page={page} onNavigate={setPage} badges={{ ailab: pendingProposals || undefined }} />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar status={status.data} page={page} onNavigate={setPage} />
        <main className="flex-1 p-4 md:p-6 max-w-6xl w-full mx-auto">
          <div className="mb-5">
            <h1 className="text-xl font-semibold tracking-tight">{PAGE_TITLE[page]}</h1>
          </div>
          <div className="space-y-5">
            <AlertsBanner />
            {page === "overview" && <OverviewPage />}
            {page === "activity" && <ActivityPage />}
            {page === "trades" && <TradesPage />}
            {page === "strategies" && <StrategiesPage />}
            {page === "ailab" && <AiLabPage />}
            {page === "settings" && <SettingsPage />}
          </div>
        </main>
        <footer className="text-center text-xs text-muted-foreground py-6 px-4">
          {status.data?.feedSource === "oanda"
            ? "Live FX market data via OANDA."
            : "Running on synthetic market data (demo). Add OANDA keys for real FX prices."}
          {" · "}All trading defaults to paper mode. Not financial advice.
        </footer>
      </div>
    </div>
  );
}
