import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { api, type StatusResponse } from "@/lib/api";
import { NAV, type DashboardPage } from "./Sidebar";
import { cn } from "@/lib/utils";

export function TopBar({
  status,
  page,
  onNavigate,
}: {
  status?: StatusResponse;
  page: DashboardPage;
  onNavigate: (p: DashboardPage) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [confirmCashOut, setConfirmCashOut] = useState(false);

  const invalidateAll = () =>
    ["/api/status", "/api/equity", "/api/position", "/api/positions", "/api/decisions", "/api/config"].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k] }),
    );

  const startM = useMutation({ mutationFn: api.start, onSuccess: invalidateAll });
  const stopM = useMutation({ mutationFn: api.stop, onSuccess: invalidateAll });
  const liquidateM = useMutation({
    mutationFn: api.liquidate,
    onSuccess: async (res) => {
      invalidateAll();
      setConfirmCashOut(false);
      const body = await (res as Response).json().catch(() => null);
      if (!body) return;
      const failed = body.failed?.length ?? 0;
      toast({
        title: failed ? "Liquidation INCOMPLETE" : "Liquidated to cash",
        description: failed
          ? `Sold ${body.sold?.length ?? 0}, failed on ${failed}: ${body.failed.map((f: { symbol: string }) => f.symbol).join(", ")}. You are still holding those.`
          : `Sold ${body.sold?.length ?? 0} position(s). Engine stopped.`,
        variant: failed ? "destructive" : undefined,
      });
    },
    onError: (e: Error) => toast({ title: "Liquidation failed", description: e.message, variant: "destructive" }),
  });

  return (
    <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 md:px-6 py-2 min-h-14">
        <div className="flex items-center gap-2 min-w-0">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon" className="shrink-0">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 bg-sidebar text-sidebar-foreground p-0 border-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="px-5 py-5">
                <p className="text-sm font-bold tracking-tight text-white">Auto&#8209;Trader</p>
              </div>
              <nav className="px-2 space-y-0.5">
                {NAV.map((item) => {
                  const active = page === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        onNavigate(item.id);
                        setMobileOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                          : "text-sidebar-foreground/75 hover:bg-sidebar-accent/50",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </button>
                  );
                })}
              </nav>
            </SheetContent>
          </Sheet>
          <span className="text-sm font-semibold md:hidden">Auto&#8209;Trader</span>
          <ModeBadges status={status} />
        </div>

        <div className="flex items-center gap-2">
          {status?.running ? (
            <Button variant="destructive" size="sm" onClick={() => stopM.mutate()} disabled={stopM.isPending}>
              Stop
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => startM.mutate()}
              disabled={startM.isPending}
              className="bg-gain hover:bg-gain/90 text-white"
            >
              Start
            </Button>
          )}
          {confirmCashOut ? (
            <>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => liquidateM.mutate()}
                disabled={liquidateM.isPending}
                title="Sell every open position at market and stop the engine"
              >
                {liquidateM.isPending ? "Selling…" : "Confirm — sell everything"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmCashOut(false)} disabled={liquidateM.isPending}>
                Cancel
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmCashOut(true)}
              title="Sell every open position at market and stop the engine"
            >
              Cash out
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

function ModeBadges({ status }: { status?: StatusResponse }) {
  if (!status) return null;
  return (
    <div className="flex items-center gap-1.5">
      <Badge variant={status.mode === "live" ? "destructive" : "secondary"}>{status.mode === "live" ? "LIVE" : "PAPER"}</Badge>
      <Badge
        variant="outline"
        className={cn("gap-1", status.running ? "text-gain border-gain/30" : "text-muted-foreground")}
      >
        <span className={cn("h-1.5 w-1.5 rounded-full", status.running ? "bg-gain" : "bg-muted-foreground")} />
        {status.running ? "running" : "stopped"}
      </Badge>
    </div>
  );
}
