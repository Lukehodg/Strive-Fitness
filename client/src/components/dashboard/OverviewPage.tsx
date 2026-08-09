import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  api,
  type StatusResponse,
  type ConfidenceResponse,
  type ExpectancyResponse,
  type EventsResponse,
  type UpcomingEvent,
} from "@/lib/api";
import type { Position } from "@shared/schema";
import { displaySymbol } from "@/lib/utils";
import { money, pct, timeAgo, formatCountdown, equityTick } from "@/lib/format";
import { Stat } from "./shared";

const REFRESH_MS = 4000;

export function OverviewPage() {
  const status = useQuery({ queryKey: ["/api/status"], queryFn: api.status, refetchInterval: REFRESH_MS });
  const equity = useQuery({ queryKey: ["/api/equity"], queryFn: api.equity, refetchInterval: REFRESH_MS });
  const positions = useQuery({ queryKey: ["/api/positions"], queryFn: api.positions, refetchInterval: REFRESH_MS });
  const cfg = useQuery({ queryKey: ["/api/config"], queryFn: api.config, refetchInterval: REFRESH_MS });
  const confidence = useQuery({ queryKey: ["/api/confidence"], queryFn: api.confidence, refetchInterval: REFRESH_MS });
  const events = useQuery({ queryKey: ["/api/events"], queryFn: api.events, refetchInterval: REFRESH_MS });
  const expectancy = useQuery({ queryKey: ["/api/expectancy"], queryFn: api.expectancy, refetchInterval: REFRESH_MS });
  const perf = useQuery({ queryKey: ["/api/performance"], queryFn: api.performance, refetchInterval: REFRESH_MS });
  const recommendation = useQuery({ queryKey: ["/api/recommendation"], queryFn: api.recommendation, refetchInterval: 30000 });

  const qc = useQueryClient();
  const resumeM = useMutation({
    mutationFn: api.resume,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/status"] }),
  });

  const s = status.data;
  const openPositions = positions.data ?? [];
  const watching = 1 + (cfg.data?.extraSymbols?.length ?? 0);
  const unrealPnl = openPositions.reduce((a, p) => a + p.unrealizedPnl, 0);
  const costBasis = openPositions.reduce((a, p) => a + p.avgEntryPrice * p.qty, 0);
  const unrealPct = costBasis > 0 ? unrealPnl / costBasis : 0;

  const equitySpan = (() => {
    const vals = (equity.data ?? []).map((e) => e.equity);
    if (vals.length < 2) return 0;
    return Math.max(...vals) - Math.min(...vals);
  })();
  const equityData = (equity.data ?? []).map((p) => ({
    t: new Date(p.time).toLocaleTimeString(),
    equity: Math.round(p.equity * 100) / 100,
  }));
  const latestEquity = equity.data?.length ? equity.data[equity.data.length - 1].equity : null;

  return (
    <div className="space-y-5">
      {s?.halted && <HaltedBanner status={s} onResume={() => resumeM.mutate()} busy={resumeM.isPending} />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Account equity" value={money(latestEquity)} />
        <Stat
          label="Total P&L"
          value={money(perf.data?.totalPnl ?? 0)}
          tone={(perf.data?.totalPnl ?? 0) >= 0 ? "positive" : "negative"}
        />
        <Stat label="Win rate" value={perf.data ? pct(perf.data.winRate) : "—"} sub={`${perf.data?.totalTrades ?? 0} trades`} />
        <Stat
          label="Open positions"
          value={openPositions.length ? String(openPositions.length) : "Flat"}
          sub={
            openPositions.length
              ? `${pct(unrealPct)} unreal. · ${openPositions.map((p) => displaySymbol(p.symbol)).slice(0, 3).join(", ")}${openPositions.length > 3 ? "…" : ""}`
              : `watching ${watching} symbol${watching === 1 ? "" : "s"}`
          }
        />
      </div>

      {confidence.data?.available && confidence.data.enabled && <ConfidenceCard data={confidence.data} />}
      {expectancy.data?.enabled && expectancy.data.available && <EdgeGateCard data={expectancy.data} />}
      {events.data?.enabled && <EventsCard data={events.data} />}
      {openPositions.length > 0 && <PositionsTable positions={openPositions} unrealPnl={unrealPnl} />}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>Equity curve</span>
            <span className="text-xs font-normal text-muted-foreground">
              {watching > 1 ? `${watching} symbols` : s?.lastPrice ? `${s.symbol} ${money(s.lastPrice)}` : ""}
              {" · updated "}
              {timeAgo(s?.lastEvaluatedAt ?? null)}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            {equityData.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={equityData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="t" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} minTickGap={40} />
                  <YAxis
                    domain={["auto", "auto"]}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                    width={78}
                    tickFormatter={(v) => equityTick(v, equitySpan)}
                  />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                    formatter={(v: number) => money(v)}
                  />
                  {/* Animation off: recharts draws the line behind a growing
                      clip-path and restarts it on every refetch, so at a
                      short refresh interval the curve blanked and redrew
                      continuously. */}
                  <Line
                    type="monotone"
                    dataKey="equity"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                {s?.running ? "Collecting data… equity updates every tick." : "Press Start to begin trading."}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">AI strategy selection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Active:</span>
            <Badge>{s?.activeStrategyName ?? "—"}</Badge>
            <span className="text-muted-foreground">Regime:</span>
            <Badge variant="outline" className="capitalize">{(s?.regime ?? "unknown").replace("_", " ")}</Badge>
          </div>
          {recommendation.data && (
            <p className="text-sm text-muted-foreground">
              <span>Latest read:</span> {recommendation.data.rationale}
              {cfg.data?.autoSelectStrategy === false && <span> (auto-select is off, so this is advisory only)</span>}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function HaltedBanner({
  status,
  onResume,
  busy,
}: {
  status: StatusResponse;
  onResume: () => void;
  busy: boolean;
}) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-loss-soft p-4 flex items-center justify-between gap-4">
      <div>
        <p className="font-semibold text-loss">Trading halted — kill-switch tripped</p>
        <p className="text-sm text-loss/80">{status.haltReason}</p>
      </div>
      <Button variant="outline" onClick={onResume} disabled={busy}>
        Resume trading
      </Button>
    </div>
  );
}

function ConfidenceCard({ data }: { data: ConfidenceResponse }) {
  const score = data.score ?? 0;
  const tone = !data.allowEntries ? "text-loss" : score > 0.7 ? "text-gain" : "text-primary";
  const barColor = !data.allowEntries ? "bg-loss" : score > 0.7 ? "bg-gain" : "bg-primary";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Confidence governor</span>
          <span className={`text-xs ${data.allowEntries ? "text-muted-foreground" : "text-loss font-medium"}`}>
            {data.allowEntries
              ? `sizing at ${((data.sizeMultiplier ?? 1) * 100).toFixed(0)}% of your maximum`
              : "new entries paused — open positions still run"}
          </span>
        </div>
        <div className="flex items-center gap-3 mb-3">
          <span className={`text-2xl font-semibold tabular ${tone}`}>{(score * 100).toFixed(0)}%</span>
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${score * 100}%` }} />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1">
          {(data.factors ?? []).map((f) => (
            <div key={f.name} className="flex items-baseline justify-between text-xs">
              <span className="text-muted-foreground">{f.name}</span>
              <span className="tabular">
                <span className={f.score >= 0.7 ? "text-gain" : f.score >= 0.4 ? "text-primary" : "text-loss"}>
                  {(f.score * 100).toFixed(0)}%
                </span>
                <span className="text-muted-foreground ml-2">{f.detail}</span>
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function EdgeGateCard({ data }: { data: ExpectancyResponse }) {
  return (
    <Card className={data.proven ? undefined : "border-l-2 border-l-amber-500"}>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Proof of edge</span>
          <span className={`text-xs font-medium ${data.proven ? "text-gain" : "text-amber-600"}`}>
            {data.proven ? "cleared for live" : "not proven — live entries blocked"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{data.reason}</p>
        {!data.proven && (
          <p className="text-xs text-muted-foreground mt-2">
            Paper trading is never blocked — the evidence can only come from taking the trades. This gate applies to{" "}
            <span className="font-medium text-foreground">live</span> mode only.
            {data.mode !== "live" && " You are in paper mode, so nothing is being stopped right now."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function EventsCard({ data }: { data: EventsResponse }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Scheduled releases</span>
          {data.blocked.length > 0 && (
            <span className="text-xs text-loss font-medium">
              {data.blocked.length} symbol{data.blocked.length === 1 ? "" : "s"} on hold
            </span>
          )}
        </div>

        {data.calendarStale && (
          <div className="rounded-md bg-amber-50 border border-amber-200 p-3 mb-3">
            <p className="text-xs text-amber-800 font-medium">
              FOMC / CPI / OPEC dates are not loaded — those blackouts are NOT running.
            </p>
            <p className="text-xs text-amber-700 mt-1">
              Payrolls, EIA inventories and triple witching are derived from standing schedules and still apply. To add
              the rest, paste the published dates into{" "}
              <code className="bg-amber-100 px-1 rounded">server/data/eventCalendar.json</code>.
            </p>
          </div>
        )}

        {data.blocked.length > 0 && (
          <div className="mb-3 space-y-1">
            {data.blocked.map((b) => (
              <div key={b.symbol} className="flex items-baseline gap-2 text-xs">
                <span className="text-loss w-20 shrink-0 font-medium">{displaySymbol(b.symbol)}</span>
                <span className="text-muted-foreground">{b.reason}</span>
              </div>
            ))}
          </div>
        )}

        {data.upcoming.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing scheduled in the next 7 days.</p>
        ) : (
          <div className="space-y-1">
            {data.upcoming.slice(0, 6).map((e: UpcomingEvent) => (
              <div key={`${e.kind}-${e.at}`} className="flex items-baseline justify-between gap-3 text-xs">
                <span className="text-muted-foreground truncate">
                  <span className={e.severity === "high" ? "text-amber-600" : "text-muted-foreground"}>●</span> {e.title}
                </span>
                <span className="tabular shrink-0">
                  <span className="text-muted-foreground mr-2">{e.scope}</span>
                  {formatCountdown(e.minutesAway)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PositionsTable({ positions, unrealPnl }: { positions: Position[]; unrealPnl: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>Open positions</span>
          <span className={`text-sm font-normal ${unrealPnl >= 0 ? "text-gain" : "text-loss"}`}>
            {unrealPnl >= 0 ? "+" : ""}
            {money(unrealPnl)} unrealised
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground uppercase tracking-wide">
                <th className="text-left font-medium pb-2">Symbol</th>
                <th className="text-right font-medium pb-2">Quantity</th>
                <th className="text-right font-medium pb-2">Entry</th>
                <th className="text-right font-medium pb-2">Now</th>
                <th className="text-right font-medium pb-2">P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => {
                const basis = p.avgEntryPrice * p.qty;
                const ret = basis > 0 ? p.unrealizedPnl / basis : 0;
                const up = p.unrealizedPnl >= 0;
                return (
                  <tr key={p.symbol} className="border-t">
                    <td className="py-2 font-semibold tabular">{displaySymbol(p.symbol)}</td>
                    <td className="py-2 text-right tabular text-muted-foreground">{p.qty.toFixed(6)}</td>
                    <td className="py-2 text-right tabular text-muted-foreground">{money(p.avgEntryPrice)}</td>
                    <td className="py-2 text-right tabular text-primary">{money(p.markPrice)}</td>
                    <td className={`py-2 text-right tabular ${up ? "text-gain" : "text-loss"}`}>
                      {up ? "+" : ""}
                      {money(p.unrealizedPnl)}
                      <span className="text-xs text-muted-foreground ml-2">{pct(ret)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
