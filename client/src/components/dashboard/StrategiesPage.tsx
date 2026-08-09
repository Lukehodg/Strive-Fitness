import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { pct } from "@/lib/format";
import { Empty } from "./shared";

export function StrategiesPage() {
  const status = useQuery({ queryKey: ["/api/status"], queryFn: api.status });
  const backtest = useQuery({ queryKey: ["/api/backtest"], queryFn: api.backtest, refetchInterval: 30000 });
  const s = status.data;

  return (
    <Card>
      <CardContent className="p-0">
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
                {backtest.data.results.map((r) => (
                  <tr key={r.strategyId} className="border-t">
                    <td className="px-4 py-2.5">
                      {r.strategyName}
                      {r.strategyId === s?.activeStrategyId && (
                        <Badge className="ml-2 text-[10px]">active</Badge>
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
                ))}
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
