import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { pct } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { Empty } from "./shared";
import { cn } from "@/lib/utils";

export function StrategiesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const status = useQuery({ queryKey: ["/api/status"], queryFn: api.status });
  const config = useQuery({ queryKey: ["/api/config"], queryFn: api.config });
  const strategies = useQuery({ queryKey: ["/api/strategies"], queryFn: api.strategies });
  const backtest = useQuery({ queryKey: ["/api/backtest"], queryFn: api.backtest, refetchInterval: 30000 });
  const s = status.data;
  const manualSelect = config.data?.autoSelectStrategy === false;

  const descriptions = new Map((strategies.data ?? []).map((m) => [m.id, m.description]));

  const setActive = useMutation({
    mutationFn: (strategyId: string) => api.updateConfig({ activeStrategyId: strategyId }),
    onSuccess: async (res, strategyId) => {
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast({ title: "Couldn't switch strategy", description: body?.message, variant: "destructive" });
        return;
      }
      qc.invalidateQueries({ queryKey: ["/api/status"] });
      qc.invalidateQueries({ queryKey: ["/api/config"] });
      const meta = (strategies.data ?? []).find((m) => m.id === strategyId);
      toast({ title: `${meta?.name ?? strategyId} is now active` });
    },
  });

  const turnOffAutoSelect = useMutation({
    mutationFn: () => api.updateConfig({ autoSelectStrategy: false }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/config"] });
      toast({ title: "Auto-select turned off — click a strategy below to pick one" });
    },
  });

  return (
    <Card>
      <CardContent className="p-0">
        <div className="px-4 py-3 border-b bg-muted/30 text-xs text-muted-foreground flex items-center justify-between gap-3 flex-wrap">
          {manualSelect ? (
            <span>Click a strategy to make it active. "Let AI pick the strategy" is off, so it stays until you change it.</span>
          ) : (
            <span>"Let AI pick the strategy" is on — it chooses automatically, so rows aren't clickable here.</span>
          )}
          {!manualSelect && (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={() => turnOffAutoSelect.mutate()}
              disabled={turnOffAutoSelect.isPending}
            >
              Turn off auto-select
            </Button>
          )}
        </div>
        {backtest.data?.results?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2.5 font-medium text-left">Strategy</th>
                  <th className="px-4 py-2.5 font-medium text-right">Return</th>
                  <th className="px-4 py-2.5 font-medium text-right">Win rate</th>
                  <th className="px-4 py-2.5 font-medium text-right">Max DD</th>
                  <th className="px-4 py-2.5 font-medium text-right">Sharpe</th>
                  <th
                    className="px-4 py-2.5 font-medium text-right"
                    title="Deflated Sharpe: probability the edge is real after correcting for trying multiple strategies. ~50% = luck."
                  >
                    DSR
                  </th>
                  <th
                    className="px-4 py-2.5 font-medium text-right"
                    title="Minimum Track Record: bars of live evidence needed to statistically confirm this Sharpe. — means Sharpe ≤ 0."
                  >
                    MinTRL
                  </th>
                  <th className="px-4 py-2.5 font-medium text-right">Trades</th>
                </tr>
              </thead>
              <tbody>
                {backtest.data.results.map((r) => {
                  const isActive = r.strategyId === s?.activeStrategyId;
                  return (
                    <tr
                      key={r.strategyId}
                      className={cn(
                        "border-t",
                        manualSelect && !isActive && "cursor-pointer hover:bg-muted/40",
                        setActive.isPending && "opacity-50",
                      )}
                      onClick={() => {
                        if (manualSelect && !isActive && !setActive.isPending) setActive.mutate(r.strategyId);
                      }}
                      title={descriptions.get(r.strategyId)}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span>{r.strategyName}</span>
                          {isActive && <Badge className="text-[10px]">active</Badge>}
                        </div>
                        {descriptions.get(r.strategyId) && (
                          <p className="text-xs text-muted-foreground mt-0.5 max-w-md line-clamp-1">
                            {descriptions.get(r.strategyId)}
                          </p>
                        )}
                      </td>
                      <td className={`px-4 py-2.5 text-right tabular ${r.returnPct >= 0 ? "text-gain" : "text-loss"}`}>
                        {pct(r.returnPct)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular text-muted-foreground">{pct(r.stats.winRate)}</td>
                      <td className="px-4 py-2.5 text-right tabular text-muted-foreground">{pct(r.stats.maxDrawdown)}</td>
                      <td className="px-4 py-2.5 text-right tabular text-muted-foreground">{r.sharpe.toFixed(3)}</td>
                      <td
                        className={`px-4 py-2.5 text-right tabular ${(r.deflatedSharpe ?? 0.5) > 0.7 ? "text-gain" : "text-muted-foreground"}`}
                      >
                        {r.deflatedSharpe !== undefined ? `${(r.deflatedSharpe * 100).toFixed(0)}%` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular text-muted-foreground">
                        {r.minTrackRecordBars != null ? `${r.minTrackRecordBars.toLocaleString()} bars` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular text-muted-foreground">{r.stats.totalTrades}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="Backtest running…" />
        )}
        <p className="px-4 py-3 text-xs text-muted-foreground border-t">
          Backtested on the latest {backtest.data?.candleCount ?? 0} candles of {backtest.data?.symbol}. Past
          performance never guarantees future results.
        </p>
      </CardContent>
    </Card>
  );
}
