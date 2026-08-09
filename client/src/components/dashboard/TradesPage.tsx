import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import { money, pct } from "@/lib/format";
import { Empty } from "./shared";

export function TradesPage() {
  const trades = useQuery({ queryKey: ["/api/trades"], queryFn: api.trades, refetchInterval: 4000 });

  return (
    <Card>
      <CardContent className="p-0">
        {trades.data?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground uppercase tracking-wide sticky top-0 bg-card">
                <tr>
                  <th className="px-4 py-2.5 font-medium text-left">Time</th>
                  <th className="px-4 py-2.5 font-medium text-left">Strategy</th>
                  <th className="px-4 py-2.5 font-medium text-right">Entry</th>
                  <th className="px-4 py-2.5 font-medium text-right">Exit</th>
                  <th className="px-4 py-2.5 font-medium text-right">P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {trades.data.map((t) => (
                  <tr key={t.id} className="border-t">
                    <td className="px-4 py-2.5 text-muted-foreground tabular">{new Date(t.exitTime).toLocaleTimeString()}</td>
                    <td className="px-4 py-2.5">{t.strategy}</td>
                    <td className="px-4 py-2.5 text-right tabular">{money(t.entryPrice)}</td>
                    <td className="px-4 py-2.5 text-right tabular">{money(t.exitPrice)}</td>
                    <td className={`px-4 py-2.5 text-right font-medium tabular ${t.pnl >= 0 ? "text-gain" : "text-loss"}`}>
                      {t.pnl >= 0 ? "+" : ""}
                      {money(t.pnl)} ({pct(t.returnPct)})
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="No completed trades yet." />
        )}
      </CardContent>
    </Card>
  );
}
