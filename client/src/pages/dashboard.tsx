import { useState, useEffect } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  api,
  type BotConfig,
  type ImprovementProposal,
  type StrategyParamInfo,
} from "@/lib/api";

const REFRESH_MS = 4000;

function money(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}
function pct(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return `${(n * 100).toFixed(2)}%`;
}
function timeAgo(ts: number | null) {
  if (!ts) return "never";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

/** Countdown to a scheduled release. Negative means it has already happened. */
function formatCountdown(minutes: number) {
  if (minutes < 0) return `${Math.abs(minutes)}m ago`;
  if (minutes < 60) return `in ${minutes}m`;
  if (minutes < 1440) return `in ${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `in ${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`;
}

export default function Dashboard() {
  const qc = useQueryClient();

  const status = useQuery({ queryKey: ["/api/status"], queryFn: api.status, refetchInterval: REFRESH_MS });
  const equity = useQuery({ queryKey: ["/api/equity"], queryFn: api.equity, refetchInterval: REFRESH_MS });
  const position = useQuery({ queryKey: ["/api/position"], queryFn: api.position, refetchInterval: REFRESH_MS });
  const positions = useQuery({ queryKey: ["/api/positions"], queryFn: api.positions, refetchInterval: REFRESH_MS });
  const cfg = useQuery({ queryKey: ["/api/config"], queryFn: api.config, refetchInterval: REFRESH_MS });
  const confidence = useQuery({ queryKey: ["/api/confidence"], queryFn: api.confidence, refetchInterval: REFRESH_MS });
  const events = useQuery({ queryKey: ["/api/events"], queryFn: api.events, refetchInterval: REFRESH_MS });
  const perf = useQuery({ queryKey: ["/api/performance"], queryFn: api.performance, refetchInterval: REFRESH_MS });
  const trades = useQuery({ queryKey: ["/api/trades"], queryFn: api.trades, refetchInterval: REFRESH_MS });
  const decisions = useQuery({ queryKey: ["/api/decisions"], queryFn: api.decisions, refetchInterval: REFRESH_MS });
  const recommendation = useQuery({ queryKey: ["/api/recommendation"], queryFn: api.recommendation, refetchInterval: 30000 });
  const backtest = useQuery({ queryKey: ["/api/backtest"], queryFn: api.backtest, refetchInterval: 30000 });

  const openPositions = positions.data ?? [];
  const watching = 1 + (cfg.data?.extraSymbols?.length ?? 0);
  const unrealPnl = openPositions.reduce((a, p) => a + p.unrealizedPnl, 0);
  const costBasis = openPositions.reduce((a, p) => a + p.avgEntryPrice * p.qty, 0);
  const unrealPct = costBasis > 0 ? unrealPnl / costBasis : 0;

  // Vertical span of the plotted equity, used to pick tick precision.
  const equitySpan = (() => {
    const vals = (equity.data ?? []).map((e) => e.equity);
    if (vals.length < 2) return 0;
    return Math.max(...vals) - Math.min(...vals);
  })();

  const invalidateAll = () =>
    ["/api/status", "/api/equity", "/api/position", "/api/positions", "/api/decisions", "/api/config"].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k] }),
    );

  const startM = useMutation({ mutationFn: api.start, onSuccess: invalidateAll });
  const stopM = useMutation({ mutationFn: api.stop, onSuccess: invalidateAll });
  const resumeM = useMutation({ mutationFn: api.resume, onSuccess: invalidateAll });

  const s = status.data;
  const equityData = (equity.data ?? []).map((p) => ({
    t: new Date(p.time).toLocaleTimeString(),
    equity: Math.round(p.equity * 100) / 100,
  }));
  const latestEquity = equity.data?.length ? equity.data[equity.data.length - 1].equity : null;

  return (
    <div className="min-h-screen text-gray-100 p-4 md:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white term-mono tracking-tight">AUTO&#8209;TRADER</h1>
          <p className="term-label">Personal automated trading · AI strategy selection</p>
        </div>
        <div className="flex items-center gap-2">
          <ModeBadges status={s} />
          {s?.running ? (
            <Button variant="destructive" onClick={() => stopM.mutate()} disabled={stopM.isPending}>
              Stop
            </Button>
          ) : (
            <Button onClick={() => startM.mutate()} disabled={startM.isPending} className="bg-emerald-600 hover:bg-emerald-700">
              Start
            </Button>
          )}
        </div>
      </div>

      <AlertsBanner />

      {/* Kill-switch banner */}
      {s?.halted && (
        <div className="mb-6 rounded-lg border border-red-800 bg-red-950/60 p-4 flex items-center justify-between">
          <div>
            <p className="font-semibold text-red-300">Trading halted — kill-switch tripped</p>
            <p className="text-sm term-down/80">{s.haltReason}</p>
          </div>
          <Button variant="outline" onClick={() => resumeM.mutate()} disabled={resumeM.isPending}>
            Resume trading
          </Button>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Stat label="Account equity" value={money(latestEquity)} />
        <Stat
          label="Total P&L"
          value={money(perf.data?.totalPnl ?? 0)}
          positive={(perf.data?.totalPnl ?? 0) >= 0}
        />
        <Stat label="Win rate" value={perf.data ? pct(perf.data.winRate) : "—"} sub={`${perf.data?.totalTrades ?? 0} trades`} />
        {/* Counts EVERY open position. This read the primary symbol only, so it
            showed "Flat" while several positions were open in other symbols. */}
        <Stat
          label="Open positions"
          value={openPositions.length ? String(openPositions.length) : "Flat"}
          sub={
            openPositions.length
              ? `${pct(unrealPct)} unreal. · ${openPositions.map((p) => p.symbol).slice(0, 3).join(", ")}${openPositions.length > 3 ? "…" : ""}`
              : `watching ${1 + (cfg.data?.extraSymbols?.length ?? 0)} symbol${(cfg.data?.extraSymbols?.length ?? 0) ? "s" : ""}`
          }
        />
      </div>

      {/* Confidence governor. A thing that quietly halves your position size
          must say so, and say why — otherwise sizing looks arbitrary. */}
      {confidence.data?.available && confidence.data.enabled && (
        <Card className="term-panel mb-6">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
              <span className="term-label">Confidence governor</span>
              {/* "Entries paused" is the state that changes what the bot does,
                  so it must not be styled like the routine one. */}
              <span className={`term-mono text-xs ${confidence.data.allowEntries ? "term-dim" : "term-down"}`}>
                {confidence.data.allowEntries
                  ? `sizing at ${((confidence.data.sizeMultiplier ?? 1) * 100).toFixed(0)}% of your maximum`
                  : "new entries paused — open positions still run"}
              </span>
            </div>
            <div className="flex items-center gap-3 mb-3">
              <span
                className={`text-2xl font-semibold term-mono ${
                  !confidence.data.allowEntries
                    ? "term-down"
                    : (confidence.data.score ?? 0) > 0.7
                      ? "term-up"
                      : "term-value"
                }`}
              >
                {((confidence.data.score ?? 0) * 100).toFixed(0)}%
              </span>
              <div className="flex-1 h-1.5 term-inset overflow-hidden">
                <div
                  className={`h-full ${
                    !confidence.data.allowEntries
                      ? "bg-[#ff5964]"
                      : (confidence.data.score ?? 0) > 0.7
                        ? "bg-[#21d07a]"
                        : "bg-[#ffb01f]"
                  }`}
                  style={{ width: `${(confidence.data.score ?? 0) * 100}%` }}
                />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1">
              {(confidence.data.factors ?? []).map((f) => (
                <div key={f.name} className="flex items-baseline justify-between text-xs">
                  <span className="term-dim">{f.name}</span>
                  <span className="term-mono">
                    <span className={f.score >= 0.7 ? "term-up" : f.score >= 0.4 ? "term-value" : "term-down"}>
                      {(f.score * 100).toFixed(0)}%
                    </span>
                    <span className="term-dim ml-2">{f.detail}</span>
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scheduled releases. The bot standing down needs a visible reason —
          otherwise "why has it not traded all morning" has no answer. */}
      {events.data?.enabled && (
        <Card className="term-panel mb-6">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
              <span className="term-label">Scheduled releases</span>
              {events.data.blocked.length > 0 && (
                <span className="term-mono text-xs term-down">
                  {events.data.blocked.length} symbol{events.data.blocked.length === 1 ? "" : "s"} on hold
                </span>
              )}
            </div>

            {/* A calendar that has run out looks exactly like a calm market.
                That failure has to be loud, not a silent absence of rows. */}
            {events.data.calendarStale && (
              <div className="term-inset p-3 mb-3 border-l-2 border-[#ffb01f]">
                <p className="text-xs term-value">
                  FOMC / CPI / OPEC dates are not loaded — those blackouts are NOT running.
                </p>
                <p className="text-xs term-dim mt-1">
                  Payrolls, EIA inventories and triple witching are derived from standing
                  schedules and still apply. To add the rest, paste the published dates into{" "}
                  <span className="term-mono">server/data/eventCalendar.json</span>.
                </p>
              </div>
            )}

            {events.data.blocked.length > 0 && (
              <div className="mb-3 space-y-1">
                {events.data.blocked.map((b) => (
                  <div key={b.symbol} className="flex items-baseline gap-2 text-xs">
                    <span className="term-mono term-down w-20 shrink-0">{b.symbol}</span>
                    <span className="term-dim">{b.reason}</span>
                  </div>
                ))}
              </div>
            )}

            {events.data.upcoming.length === 0 ? (
              <p className="text-xs term-dim">Nothing scheduled in the next 7 days.</p>
            ) : (
              <div className="space-y-1">
                {events.data.upcoming.slice(0, 6).map((e) => (
                  <div key={`${e.kind}-${e.at}`} className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="term-dim truncate">
                      <span className={e.severity === "high" ? "term-value" : "term-dim"}>●</span>{" "}
                      {e.title}
                    </span>
                    <span className="term-mono shrink-0">
                      <span className="term-dim mr-2">{e.scope}</span>
                      {formatCountdown(e.minutesAway)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* What we currently hold. With one symbol the stat tile was enough; with
          a universe you need to see which positions are open and how each is
          doing, not just a count. */}
      {openPositions.length > 0 && (
        <Card className="term-panel mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between term-rule">
              <span>Open positions</span>
              <span className={`text-sm font-normal ${unrealPnl >= 0 ? "term-up" : "term-down"}`}>
                {unrealPnl >= 0 ? "+" : ""}{money(unrealPnl)} unrealised
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="term-label">
                    <th className="text-left font-normal pb-2 tracking-wider">Symbol</th>
                    <th className="text-right font-normal pb-2 tracking-wider">Quantity</th>
                    <th className="text-right font-normal pb-2 tracking-wider">Entry</th>
                    <th className="text-right font-normal pb-2 tracking-wider">Now</th>
                    <th className="text-right font-normal pb-2 tracking-wider">P&amp;L</th>
                  </tr>
                </thead>
                <tbody>
                  {openPositions.map((p) => {
                    const basis = p.avgEntryPrice * p.qty;
                    const ret = basis > 0 ? p.unrealizedPnl / basis : 0;
                    const up = p.unrealizedPnl >= 0;
                    return (
                      <tr key={p.symbol} className="border-t border-[#1f262b]">
                        <td className="py-2 term-mono font-semibold text-[#e6edf2]">{p.symbol}</td>
                        <td className="py-2 text-right term-mono text-[#c3ccd2]">{p.qty.toFixed(6)}</td>
                        <td className="py-2 text-right term-mono text-[#c3ccd2]">{money(p.avgEntryPrice)}</td>
                        <td className="py-2 text-right term-mono term-value">{money(p.markPrice)}</td>
                        <td className={`py-2 text-right term-mono ${up ? "term-up" : "term-down"}`}>
                          {up ? "+" : ""}{money(p.unrealizedPnl)}
                          <span className="text-xs term-dim ml-2">{pct(ret)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Equity chart */}
      <Card className="term-panel mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between term-rule">
            <span>Equity curve</span>
            <span className="text-sm font-normal text-[#9aa6ad]">
              {/* Showing one symbol's price while trading a basket implies the
                  chart is about that symbol. Name the basket instead. */}
              {watching > 1
                ? `${watching} symbols`
                : s?.lastPrice
                  ? `${s.symbol} ${money(s.lastPrice)}`
                  : ""}{" "}
              · updated {timeAgo(s?.lastEvaluatedAt ?? null)}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            {equityData.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={equityData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f262b" />
                  <XAxis dataKey="t" tick={{ fill: "#6b777f", fontSize: 10, fontFamily: "ui-monospace, monospace" }} minTickGap={40} />
                  <YAxis
                    domain={["auto", "auto"]}
                    tick={{ fill: "#6b777f", fontSize: 10, fontFamily: "ui-monospace, monospace" }}
                    width={78}
                    tickFormatter={(v) => equityTick(v, equitySpan)}
                  />
                  <Tooltip contentStyle={{ background: "#0d0f11", border: "1px solid #2c363d", borderRadius: 8 }} formatter={(v: number) => money(v)} />
                  {/* Animation off: recharts draws the line behind a growing
                      clip-path and restarts it on every refetch, so at a 5s
                      refresh the curve blanked and redrew continuously. */}
                  <Line
                    type="monotone"
                    dataKey="equity"
                    stroke="#ffb01f"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center term-dim text-sm">
                {s?.running ? "Collecting data… equity updates every tick." : "Press Start to begin trading."}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Active strategy / AI recommendation */}
      <Card className="term-panel mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm term-rule">AI strategy selection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-[#9aa6ad]">Active:</span>
            <Badge className="bg-indigo-600">{s?.activeStrategyName ?? "—"}</Badge>
            <span className="text-[#9aa6ad]">Regime:</span>
            <Badge variant="outline" className="capitalize">{(s?.regime ?? "unknown").replace("_", " ")}</Badge>
          </div>
          {recommendation.data && (
            <p className="text-sm text-[#9aa6ad]">
              <span className="term-dim">Latest read:</span>{" "}
              {recommendation.data.rationale}
              {cfg.data?.autoSelectStrategy === false && (
                <span className="text-[#5a656c]"> (auto-select is off, so this is advisory only)</span>
              )}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="activity">
        <TabsList className="term-panel rounded-none p-0 h-auto">
          <TabsTrigger value="activity" className="rounded-none term-mono uppercase text-xs tracking-wider">Activity</TabsTrigger>
          <TabsTrigger value="trades" className="rounded-none term-mono uppercase text-xs tracking-wider">Trades</TabsTrigger>
          <TabsTrigger value="strategies" className="rounded-none term-mono uppercase text-xs tracking-wider">Strategies</TabsTrigger>
          <TabsTrigger value="ailab" className="rounded-none term-mono uppercase text-xs tracking-wider">AI Lab</TabsTrigger>
          <TabsTrigger value="settings" className="rounded-none term-mono uppercase text-xs tracking-wider">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="activity">
          <Card className="term-panel">
            <CardContent className="p-0 max-h-96 overflow-y-auto">
              {decisions.data?.length ? (
                <ul className="divide-y divide-gray-800">
                  {decisions.data.map((d) => (
                    <li key={d.id} className="px-4 py-2 flex items-start gap-3 text-sm">
                      <KindBadge kind={d.kind} />
                      <span className="flex-1 text-[#c3ccd2]">{d.message}</span>
                      <span className="text-xs term-dim whitespace-nowrap term-mono">{new Date(d.time).toLocaleTimeString()}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty text="No activity yet." />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trades">
          <Card className="term-panel">
            <CardContent className="p-0 max-h-96 overflow-y-auto">
              {trades.data?.length ? (
                <table className="w-full text-sm">
                  <thead className="term-dim text-left sticky top-0 term-panel">
                    <tr>
                      <th className="px-4 py-2 font-medium">Time</th>
                      <th className="px-4 py-2 font-medium">Strategy</th>
                      <th className="px-4 py-2 font-medium text-right">Entry</th>
                      <th className="px-4 py-2 font-medium text-right">Exit</th>
                      <th className="px-4 py-2 font-medium text-right">P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.data.map((t) => (
                      <tr key={t.id} className="border-t border-[#1f262b]">
                        <td className="px-4 py-2 text-[#9aa6ad] term-mono">{new Date(t.exitTime).toLocaleTimeString()}</td>
                        <td className="px-4 py-2 text-[#c3ccd2]">{t.strategy}</td>
                        <td className="px-4 py-2 text-right text-[#c3ccd2]">{money(t.entryPrice)}</td>
                        <td className="px-4 py-2 text-right text-[#c3ccd2]">{money(t.exitPrice)}</td>
                        <td className={`px-4 py-2 text-right font-medium ${t.pnl >= 0 ? "term-up" : "term-down"}`}>
                          {t.pnl >= 0 ? "+" : ""}{money(t.pnl)} ({pct(t.returnPct)})
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <Empty text="No completed trades yet." />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="strategies">
          <Card className="term-panel">
            <CardContent className="p-0">
              {backtest.data?.results?.length ? (
                <table className="w-full text-sm">
                  <thead className="term-dim text-left">
                    <tr>
                      <th className="px-4 py-2 font-medium">Strategy</th>
                      <th className="px-4 py-2 font-medium text-right">Return</th>
                      <th className="px-4 py-2 font-medium text-right">Win rate</th>
                      <th className="px-4 py-2 font-medium text-right">Max DD</th>
                      <th className="px-4 py-2 font-medium text-right">Sharpe</th>
                      <th className="px-4 py-2 font-medium text-right" title="Deflated Sharpe: probability the edge is real after correcting for trying multiple strategies. ~50% = luck.">DSR</th>
                      <th className="px-4 py-2 font-medium text-right" title="Minimum Track Record: bars of live evidence needed to statistically confirm this Sharpe. — means Sharpe ≤ 0.">MinTRL</th>
                      <th className="px-4 py-2 font-medium text-right">Trades</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backtest.data.results.map((r) => (
                      <tr key={r.strategyId} className="border-t border-[#1f262b]">
                        <td className="px-4 py-2 text-gray-200">
                          {r.strategyName}
                          {r.strategyId === s?.activeStrategyId && <Badge className="ml-2 bg-indigo-600">active</Badge>}
                        </td>
                        <td className={`px-4 py-2 text-right ${r.returnPct >= 0 ? "term-up" : "term-down"}`}>{pct(r.returnPct)}</td>
                        <td className="px-4 py-2 text-right text-[#c3ccd2]">{pct(r.stats.winRate)}</td>
                        <td className="px-4 py-2 text-right text-[#c3ccd2]">{pct(r.stats.maxDrawdown)}</td>
                        <td className="px-4 py-2 text-right text-[#c3ccd2]">{r.sharpe.toFixed(3)}</td>
                        <td className={`px-4 py-2 text-right ${(r.deflatedSharpe ?? 0.5) > 0.7 ? "term-up" : "text-[#9aa6ad]"}`}>
                          {r.deflatedSharpe !== undefined ? `${(r.deflatedSharpe * 100).toFixed(0)}%` : "—"}
                        </td>
                        <td className="px-4 py-2 text-right text-[#9aa6ad]">
                          {r.minTrackRecordBars != null ? `${r.minTrackRecordBars.toLocaleString()} bars` : "—"}
                        </td>
                        <td className="px-4 py-2 text-right text-[#c3ccd2]">{r.stats.totalTrades}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <Empty text="Backtest running…" />
              )}
              <p className="px-4 py-3 text-xs term-dim">
                Backtested on the latest {backtest.data?.candleCount ?? 0} candles of {backtest.data?.symbol}. Past performance never guarantees future results.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ailab">
          <AiLab />
        </TabsContent>

        <TabsContent value="settings">
          <SettingsPanel />
        </TabsContent>
      </Tabs>

      <p className="text-center text-xs text-[#5a656c] mt-8">
        {s?.feedSource === "alpaca"
          ? "Live market data via Alpaca."
          : "Running on synthetic market data (demo). Add Alpaca API keys for real market data."}
        {" · "}All trading defaults to paper mode. Not financial advice.
      </p>
    </div>
  );
}

function ModeBadges({ status }: { status?: { mode: string; feedSource: string; liveKeysConfigured: boolean; running: boolean } }) {
  if (!status) return null;
  return (
    <div className="flex items-center gap-2">
      <Badge className={status.mode === "live" ? "bg-red-600" : "bg-blue-600"}>
        {status.mode === "live" ? "LIVE" : "PAPER"}
      </Badge>
      <Badge variant="outline" className={status.running ? "term-up border-emerald-800" : "text-[#9aa6ad]"}>
        {status.running ? "● running" : "○ stopped"}
      </Badge>
    </div>
  );
}

function Stat({ label, value, sub, positive }: { label: string; value: string; sub?: string; positive?: boolean }) {
  return (
    <Card className="term-panel">
      <CardContent className="p-4">
        <p className="term-label mb-1.5">{label}</p>
        <p className={`text-2xl font-semibold term-mono ${positive === undefined ? "term-value" : positive ? "term-up" : "term-down"}`}>{value}</p>
        {sub && <p className="text-xs term-dim mt-1 term-mono">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function KindBadge({ kind }: { kind: string }) {
  const map: Record<string, string> = {
    order: "bg-[#0f3d2a] text-[#21d07a] border border-[#1c6b48]",
    risk_block: "bg-amber-700",
    strategy_switch: "bg-indigo-700",
    halt: "bg-red-700",
    resume: "bg-blue-700",
    signal: "bg-gray-700",
    info: "bg-gray-700",
  };
  return <Badge className={`${map[kind] ?? "bg-gray-700"} text-xs shrink-0`}>{kind.replace("_", " ")}</Badge>;
}

function Empty({ text }: { text: string }) {
  return <div className="p-8 text-center term-dim text-sm">{text}</div>;
}

function AlertsBanner() {
  const qc = useQueryClient();
  const alerts = useQuery({ queryKey: ["/api/alerts"], queryFn: api.alerts, refetchInterval: REFRESH_MS });
  const ack = useMutation({
    mutationFn: api.ackAlerts,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/alerts"] }),
  });
  const unacked = (alerts.data?.alerts ?? []).filter((a) => !a.acknowledged);
  if (unacked.length === 0) return null;
  const worst = unacked.some((a) => a.level === "critical")
    ? "critical"
    : unacked.some((a) => a.level === "warning")
      ? "warning"
      : "info";
  const styles =
    worst === "critical"
      ? "border-red-800 bg-red-950/60"
      : worst === "warning"
        ? "border-amber-800 bg-amber-950/50"
        : "border-[#2c363d] term-panel";
  return (
    <div className={`mb-6 rounded-lg border p-4 ${styles}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <p className="font-semibold text-white">
            {unacked.length} alert{unacked.length > 1 ? "s" : ""}
            {!alerts.data?.telegramConfigured && (
              <span className="ml-2 text-xs font-normal term-dim">
                (set TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID for phone pushes)
              </span>
            )}
          </p>
          <ul className="text-sm space-y-0.5">
            {unacked.slice(0, 4).map((a) => (
              <li key={a.id} className="text-[#c3ccd2] truncate">
                <span className={a.level === "critical" ? "term-down" : a.level === "warning" ? "text-amber-400" : "text-[#9aa6ad]"}>
                  [{a.level}]
                </span>{" "}
                <span className="font-medium">{a.title}</span> — {a.message}
              </li>
            ))}
            {unacked.length > 4 && <li className="term-dim">…and {unacked.length - 4} more</li>}
          </ul>
        </div>
        <Button variant="outline" className="shrink-0" onClick={() => ack.mutate()} disabled={ack.isPending}>
          Acknowledge all
        </Button>
      </div>
    </div>
  );
}

function MlModelCard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const ml = useQuery({ queryKey: ["/api/ml/status"], queryFn: api.mlStatus, refetchInterval: 15000 });
  const train = useMutation({
    mutationFn: api.trainMl,
    onSuccess: () => {
      toast({ title: "Model retrained" });
      qc.invalidateQueries({ queryKey: ["/api/ml/status"] });
    },
  });
  const s = ml.data;
  const valAcc = s ? s.validationAccuracy * 100 : 0;
  // Honest edge = how much it beats the naive majority-class baseline.
  const edge = s ? (s.validationAccuracy - s.baselineRate) * 100 : 0;
  const maxWeight = s?.featureImportances.reduce((m, f) => Math.max(m, Math.abs(f.weight)), 0) || 1;

  return (
    <Card className="term-panel">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          ML Signal Model
          {s?.trained ? (
            <Badge className={s.tradable ? "bg-emerald-700" : "bg-amber-700"}>
              {s.tradable ? "tradable" : "below chance — won't trade"}
            </Badge>
          ) : (
            <Badge className="bg-gray-700">not trained</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-[#9aa6ad]">
          A logistic-regression model that learns from market features to predict the probability of a price rise. It generates the buy/sell signals directly. To use it, pick <span className="text-gray-200">ML Signal Model</span> as your strategy (or leave AI auto-select on).
        </p>

        {s?.dataInfo && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge className={s.dataInfo.source === "real" ? "bg-emerald-700" : "bg-gray-700"}>
              {s.dataInfo.source === "real" ? "trained on real market data" : `trained on ${s.dataInfo.source} data`}
            </Badge>
            <span className="term-dim">
              {s.dataInfo.bars.toLocaleString()} {s.dataInfo.interval} candles
              {s.dataInfo.from && s.dataInfo.to
                ? ` · ${new Date(s.dataInfo.from).toLocaleDateString()} → ${new Date(s.dataInfo.to).toLocaleDateString()}`
                : ""}
              {" · "}{s.labeling} labels · {s.validationMethod}
            </span>
          </div>
        )}
        {s?.dataInfo?.source !== "real" && (
          <p className="text-xs text-amber-500/80">
            Currently trained on the runtime feed. Run <code className="term-inset px-1 rounded">npm run train</code> to train on years of real market history and save a mature model.
          </p>
        )}

        {s?.trained ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MlStat label="Validation accuracy" value={`${valAcc.toFixed(1)}%`} positive={s.tradable} sub="purged walk-forward" />
              <MlStat label="Edge vs baseline" value={`${edge >= 0 ? "+" : ""}${edge.toFixed(1)}%`} positive={s.tradable} sub={`baseline ${(s.baselineRate * 100).toFixed(0)}%`} />
              <MlStat label="Training accuracy" value={`${(s.trainAccuracy * 100).toFixed(1)}%`} sub="in-sample (optimistic)" />
              <MlStat label="Current signal" value={s.lastProbability !== null ? `${(s.lastProbability * 100).toFixed(0)}% up` : "—"} sub={`${s.samples} samples`} />
            </div>

            {s.meta ? (
              <div className="rounded-lg term-inset p-3 text-xs text-[#9aa6ad]">
                <span className="text-gray-200 font-medium">Meta-labeling on:</span>{" "}
                a second model predicts whether each signal is <em>correct</em> — it vetoes weak signals and sizes the bets that pass.
                Accuracy {(s.meta.validationAccuracy * 100).toFixed(1)}% on {s.meta.samples} signals · approves {(s.meta.coverage * 100).toFixed(0)}% of signals.
              </div>
            ) : (
              <p className="text-xs text-[#5a656c]">Meta-labeling: not enough signal history to fit the bet-sizing model yet.</p>
            )}

            <div>
              <p className="text-xs text-[#9aa6ad] mb-2">What the model learned (feature weights)</p>
              <div className="space-y-1.5">
                {s.featureImportances.map((f) => (
                  <div key={f.name} className="flex items-center gap-2 text-xs">
                    <span className="w-28 text-[#9aa6ad] truncate">{f.name}</span>
                    <div className="flex-1 h-2 term-inset rounded relative overflow-hidden">
                      <div
                        className={`absolute top-0 h-full ${f.weight >= 0 ? "bg-emerald-600 left-1/2" : "bg-red-600 right-1/2"}`}
                        style={{ width: `${(Math.abs(f.weight) / maxWeight) * 50}%` }}
                      />
                      <div className="absolute left-1/2 top-0 h-full w-px bg-gray-700" />
                    </div>
                    <span className={`w-12 text-right ${f.weight >= 0 ? "term-up" : "term-down"}`}>{f.weight.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-[#5a656c] mt-1">Green = higher value pushes toward "buy"; red = toward "sell".</p>
            </div>
          </>
        ) : (
          <p className="text-sm term-dim">Not trained yet — press Retrain (needs enough market history).</p>
        )}

        <div className="flex items-center justify-between">
          <span className="text-xs term-dim">
            {s?.trainedAt ? `Last trained ${timeAgo(s.trainedAt)}` : ""}
          </span>
          <Button onClick={() => train.mutate()} disabled={train.isPending} className="bg-indigo-600 hover:bg-indigo-700">
            {train.isPending ? "Training…" : "Retrain now"}
          </Button>
        </div>
        <p className="text-xs text-[#5a656c]">
          The model refuses to trade unless its purged out-of-sample accuracy beats both {((s?.tradableFloor ?? 0.52) * 100).toFixed(0)}% and the majority-class baseline — so it can't be fooled by a one-sided market. On real markets, expect the edge to be small; signal prediction is genuinely hard, which is why this gate exists.
        </p>
      </CardContent>
    </Card>
  );
}

function MlStat({ label, value, sub, positive }: { label: string; value: string; sub?: string; positive?: boolean }) {
  return (
    <div className="rounded-lg term-inset p-3">
      <p className="text-xs text-[#9aa6ad]">{label}</p>
      <p className={`text-lg font-bold ${positive === undefined ? "text-white" : positive ? "term-up" : "text-amber-400"}`}>{value}</p>
      {sub && <p className="text-xs text-[#5a656c] mt-0.5">{sub}</p>}
    </div>
  );
}

function AiLab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const proposals = useQuery({ queryKey: ["/api/improve/proposals"], queryFn: api.proposals, refetchInterval: 15000 });
  const params = useQuery({ queryKey: ["/api/improve/params"], queryFn: api.improveParams, refetchInterval: 15000 });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/improve/proposals"] });
    qc.invalidateQueries({ queryKey: ["/api/improve/params"] });
    qc.invalidateQueries({ queryKey: ["/api/decisions"] });
  };

  const run = useMutation({
    mutationFn: api.runImprove,
    onSuccess: async (res) => {
      const body = await res.json();
      toast({ title: "Analysis complete", description: `${body.created?.length ?? 0} proposal(s) generated.` });
      invalidate();
    },
  });
  const apply = useMutation({ mutationFn: (id: string) => api.applyProposal(id), onSuccess: invalidate });
  const reject = useMutation({ mutationFn: (id: string) => api.rejectProposal(id), onSuccess: invalidate });
  const reset = useMutation({ mutationFn: (id: string) => api.resetParams(id), onSuccess: invalidate });

  const data = proposals.data;
  const pending = (data?.proposals ?? []).filter((p) => p.status === "pending");
  const history = (data?.proposals ?? []).filter((p) => p.status !== "pending");

  return (
    <div className="space-y-4">
      <MlModelCard />

      <Card className="term-panel">
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-white">Self-improvement engine</span>
              <Badge className={data?.aiAvailable ? "bg-emerald-700" : "bg-gray-700"}>
                {data?.aiAvailable ? "AI analyst on" : "optimizer only"}
              </Badge>
            </div>
            <p className="text-sm text-[#9aa6ad]">
              {data?.aiAvailable
                ? "Claude reviews the code and trades; the optimizer tunes parameters (walk-forward validated)."
                : "Deterministic optimizer active. Set ANTHROPIC_API_KEY to enable the Claude code/trade analyst."}
              {data?.lastImproveAt ? ` · Last run ${timeAgo(data.lastImproveAt)}` : " · Not run yet"}
            </p>
          </div>
          <Button onClick={() => run.mutate()} disabled={run.isPending} className="bg-indigo-600 hover:bg-indigo-700">
            {run.isPending ? "Analyzing…" : "Run analysis now"}
          </Button>
        </CardContent>
      </Card>

      {data?.lastDiagnosis && (
        <Card className="term-panel">
          <CardHeader className="pb-2"><CardTitle className="text-sm term-rule">AI diagnosis</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-[#c3ccd2] whitespace-pre-wrap">{data.lastDiagnosis}</p></CardContent>
        </Card>
      )}

      <Card className="term-panel">
        <CardHeader className="pb-2"><CardTitle className="text-sm term-rule">Proposals ({pending.length} pending)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {pending.length === 0 && <Empty text="No pending proposals. Run an analysis to look for improvements." />}
          {pending.map((p) => (
            <ProposalCard key={p.id} p={p} onApply={() => apply.mutate(p.id)} onReject={() => reject.mutate(p.id)} busy={apply.isPending || reject.isPending} />
          ))}
        </CardContent>
      </Card>

      <Card className="term-panel">
        <CardHeader className="pb-2"><CardTitle className="text-sm term-rule">Live strategy parameters</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {params.data?.map((s) => (
            <div key={s.strategyId} className="border-t border-[#1f262b] pt-3 first:border-0 first:pt-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-200">{s.name}</span>
                <Button variant="outline" className="h-7 text-xs" onClick={() => reset.mutate(s.strategyId)} disabled={reset.isPending}>Reset to default</Button>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#9aa6ad]">
                {s.params.map((spec) => {
                  const cur = s.current[spec.key];
                  const def = s.defaults[spec.key];
                  const changed = Math.abs((cur ?? 0) - (def ?? 0)) > 1e-9;
                  return (
                    <span key={spec.key}>
                      {spec.label}: <span className={changed ? "text-indigo-400 font-medium" : "text-[#c3ccd2]"}>{Number.isInteger(cur) ? cur : cur?.toFixed(2)}</span>
                      {changed && <span className="text-[#5a656c]"> (was {Number.isInteger(def) ? def : def?.toFixed(2)})</span>}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card className="term-panel">
          <CardHeader className="pb-2"><CardTitle className="text-sm term-rule">History</CardTitle></CardHeader>
          <CardContent className="p-0 max-h-64 overflow-y-auto">
            <ul className="divide-y divide-gray-800">
              {history.map((p) => (
                <li key={p.id} className="px-4 py-2 flex items-center gap-3 text-sm">
                  <ProposalStatusBadge status={p.status} />
                  <span className="flex-1 text-[#c3ccd2]">{p.title}</span>
                  <span className="text-xs term-dim">{new Date(p.createdAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      <p className="text-xs term-dim">
        Parameter tweaks are validated out-of-sample before they're trusted, and auto-apply only per your autonomy setting (Settings). Code-level suggestions are always review-only — the AI proposes, you decide.
      </p>
    </div>
  );
}

function ProposalCard({ p, onApply, onReject, busy }: { p: ImprovementProposal; onApply: () => void; onReject: () => void; busy: boolean }) {
  return (
    <div className="rounded-lg border border-[#1f262b] term-inset p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge className={p.kind === "param" ? "bg-emerald-700" : "bg-amber-700"}>{p.kind === "param" ? "parameters" : "code idea"}</Badge>
          <span className="text-sm font-medium text-white">{p.title}</span>
        </div>
        <span className="text-xs term-dim">{p.source === "ai" ? "Claude" : "optimizer"}</span>
      </div>
      <p className="text-sm text-[#9aa6ad] mt-2">{p.rationale}</p>

      {p.kind === "param" && p.proposedParams && p.currentParams && (
        <div className="mt-2 text-xs text-[#c3ccd2] flex flex-wrap gap-x-4 gap-y-1">
          {Object.keys(p.proposedParams).map((k) => (
            <span key={k}>{k}: <span className="term-dim">{fmtNum(p.currentParams![k])}</span> → <span className="text-indigo-400 font-medium">{fmtNum(p.proposedParams![k])}</span></span>
          ))}
        </div>
      )}
      {p.validation && (
        <p className="mt-2 text-xs term-dim">
          Out-of-sample: {pct(p.validation.outOfSampleReturn)} vs current {pct(p.validation.baselineOutOfSampleReturn)}
          {" · "}<span className="term-up">+{pct(p.validation.improvement)} edge</span> over {p.validation.outOfSampleTrades} trades
          {p.validation.pbo !== undefined && (
            <>
              {" · "}overfit prob (PBO) <span className={p.validation.pbo <= 0.05 ? "term-up" : "term-down"}>{(p.validation.pbo * 100).toFixed(1)}%</span>
            </>
          )}
          {p.validation.deflatedSharpe !== undefined && (
            <> · DSR {(p.validation.deflatedSharpe * 100).toFixed(0)}%</>
          )}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        {p.kind === "param" && (
          <Button className="h-8 bg-emerald-600 hover:bg-emerald-700" onClick={onApply} disabled={busy}>Apply</Button>
        )}
        <Button variant="outline" className="h-8" onClick={onReject} disabled={busy}>
          {p.kind === "param" ? "Reject" : "Dismiss"}
        </Button>
      </div>
    </div>
  );
}

function ProposalStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    applied: "bg-emerald-700",
    auto_applied: "bg-indigo-700",
    rejected: "bg-gray-700",
    pending: "bg-amber-700",
  };
  return <Badge className={`${map[status] ?? "bg-gray-700"} text-xs`}>{status.replace("_", " ")}</Badge>;
}

/**
 * Axis label with enough precision to actually distinguish the ticks.
 *
 * This was `$${Math.round(v)}`, so an account moving a dollar or two — the
 * normal state early on — rendered six identical "$10000" labels and the
 * chart told you nothing. Precision now follows the plotted range.
 */
function equityTick(v: number, span: number): string {
  const decimals = span >= 500 ? 0 : span >= 50 ? 1 : 2;
  return `$${v.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

function fmtNum(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function SettingsPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const config = useQuery({ queryKey: ["/api/config"], queryFn: api.config });
  const status = useQuery({ queryKey: ["/api/status"], queryFn: api.status });
  const costs = useQuery({ queryKey: ["/api/costs"], queryFn: api.costs });
  const [form, setForm] = useState<BotConfig | null>(null);
  // Whether the user has edited the form since it was last synced.
  const [dirty, setDirty] = useState(false);

  // Re-sync from the server whenever config changes underneath us — but never
  // over the top of unsaved edits.
  //
  // This only ran once (`!form`), so anything that changed config elsewhere —
  // applying a trading profile or a universe — left these fields showing the
  // OLD values. Pressing "Save settings" afterwards then wrote those stale
  // values back, silently undoing the profile you had just applied: stop-loss
  // back to 3%, max position back to 25%, symbol back to BTC/USD.
  useEffect(() => {
    if (config.data && !dirty) setForm(config.data);
  }, [config.data, dirty]);

  const save = useMutation({
    mutationFn: (patch: Partial<BotConfig>) => api.updateConfig(patch),
    onSuccess: async (res) => {
      const body = await res.json();
      if (!res.ok) {
        toast({ title: "Couldn't save", description: body.message, variant: "destructive" });
        return;
      }
      toast({ title: "Settings saved" });
      // Saved state is the server's again, so let it drive the form.
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["/api/config"] });
      qc.invalidateQueries({ queryKey: ["/api/status"] });
    },
  });

  if (!form) return <Card className="term-panel"><Empty text="Loading settings…" /></Card>;

  const upd = (patch: Partial<BotConfig>) => {
    setDirty(true);
    setForm({ ...form, ...patch });
  };
  const liveKeys = status.data?.liveKeysConfigured;

  return (
    <Card className="term-panel">
      <CardContent className="p-6 space-y-6">
        <MarketAndStyle />

        <div className="grid md:grid-cols-2 gap-6">
          <Field label="Primary symbol">
            <Input value={form.symbol} onChange={(e) => upd({ symbol: e.target.value })} className="term-inset" />
            <p className="text-xs text-[#5a656c] mt-1">
              A slash means crypto (BTC/USD, 24/7); a bare ticker means a US stock (AAPL, market hours only).
            </p>
          </Field>
          <Field label="Evaluation interval (seconds)">
            <Input type="number" value={form.intervalSeconds} onChange={(e) => upd({ intervalSeconds: Number(e.target.value) })} className="term-inset" />
          </Field>
          <Field label={`Max position size (${(form.maxPositionPct * 100).toFixed(0)}% of equity)`}>
            <Input type="range" min={0.05} max={1} step={0.05} value={form.maxPositionPct} onChange={(e) => upd({ maxPositionPct: Number(e.target.value) })} />
          </Field>
          <Field label={`Daily loss kill-switch (${(form.dailyLossLimitPct * 100).toFixed(1)}%)`}>
            <Input type="range" min={0.01} max={0.2} step={0.005} value={form.dailyLossLimitPct} onChange={(e) => upd({ dailyLossLimitPct: Number(e.target.value) })} />
          </Field>
          <Field label={`Stop-loss (${(form.stopLossPct * 100).toFixed(1)}%)`}>
            <Input type="range" min={0.005} max={0.2} step={0.005} value={form.stopLossPct} onChange={(e) => upd({ stopLossPct: Number(e.target.value) })} />
          </Field>
          <Field label={`Take-profit (${(form.takeProfitPct * 100).toFixed(1)}%)`}>
            <Input type="range" min={0.01} max={0.5} step={0.01} value={form.takeProfitPct} onChange={(e) => upd({ takeProfitPct: Number(e.target.value) })} />
          </Field>
        </div>

        <div className="border-t border-[#1f262b] pt-4 space-y-4">
          <div>
            <p className="font-medium text-white">Execution &amp; sizing</p>
            <p className="text-sm text-[#9aa6ad]">
              How orders fill and how much to risk per trade — the highest-certainty way to raise net returns, since it doesn't depend on predicting anything.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <Field label={`Maker-first limit offset (${(form.limitOrderOffsetPct * 100).toFixed(2)}%, 0 = market orders)`}>
              <Input type="range" min={0} max={0.002} step={0.0001} value={form.limitOrderOffsetPct} onChange={(e) => upd({ limitOrderOffsetPct: Number(e.target.value) })} />
              <p className="text-xs text-[#5a656c] mt-1">Posts a resting order for a lower fee (0.02% vs 0.10%) and no slippage; falls back to a market fill on exits so nothing is ever stuck. Stop-losses always fill immediately regardless.</p>
            </Field>
            <Field label={`Kelly fraction (${(form.kellyFraction * 100).toFixed(0)}% of full Kelly)`}>
              <Input type="range" min={0.1} max={1} step={0.05} value={form.kellyFraction} onChange={(e) => upd({ kellyFraction: Number(e.target.value) })} disabled={!form.adaptiveSizing} />
              <p className="text-xs text-[#5a656c] mt-1">Lower = more conservative sizing from a strategy's own track record. Only active once a strategy has 10+ trades.</p>
            </Field>
            <Field label={`Volatility target (${(form.volTargetPct * 100).toFixed(2)}% per bar)`}>
              <Input type="range" min={0.0005} max={0.02} step={0.0005} value={form.volTargetPct} onChange={(e) => upd({ volTargetPct: Number(e.target.value) })} disabled={!form.adaptiveSizing} />
              <p className="text-xs text-[#5a656c] mt-1">Size shrinks when the market is choppier than this, and can size up (toward the max above) when it's calmer — keeping risk, not notional exposure, roughly constant.</p>
            </Field>
            {/* Execution costs. Shown, not hidden, because a wrong number here
                silently invalidates every backtest in the app. */}
            <div className="rounded-lg term-inset p-3">
              <p className="text-sm font-medium text-white">Execution costs</p>
              <p className="text-xs term-dim mb-2">
                Set these to what your statements actually show. Defaults are Alpaca's
                entry crypto tier (0.25% taker / 0.15% maker) and commission-free equities.
                Leave blank to use them.
              </p>
              {costs.data && (
                <div className="mb-3 space-y-1">
                  {costs.data.byAsset.map((a) => (
                    <div key={a.symbol} className="flex items-baseline justify-between text-xs term-mono">
                      <span className="term-dim">{a.symbol} round trip</span>
                      <span>
                        <span className="term-value">{(a.takerRoundTrip * 100).toFixed(3)}%</span>
                        <span className="term-dim"> taker / </span>
                        <span className="term-up">{(a.makerRoundTrip * 100).toFixed(3)}%</span>
                        <span className="term-dim"> maker — eats </span>
                        <span className={a.takerShareOfTarget > 0.25 ? "term-down" : "term-dim"}>
                          {(a.takerShareOfTarget * 100).toFixed(0)}%
                        </span>
                        <span className="term-dim"> of your target</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Field label="Crypto taker %">
                  <Input type="number" step={0.01} min={0} max={1}
                    value={form.cryptoTakerFee != null ? form.cryptoTakerFee * 100 : ""}
                    placeholder="0.25"
                    onChange={(e) => upd({ cryptoTakerFee: e.target.value === "" ? null : Number(e.target.value) / 100 })} />
                </Field>
                <Field label="Crypto maker %">
                  <Input type="number" step={0.01} min={0} max={1}
                    value={form.cryptoMakerFee != null ? form.cryptoMakerFee * 100 : ""}
                    placeholder="0.15"
                    onChange={(e) => upd({ cryptoMakerFee: e.target.value === "" ? null : Number(e.target.value) / 100 })} />
                </Field>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg term-inset p-3">
              <div>
                <p className="text-sm font-medium text-white">Maker-only entries</p>
                <p className="text-xs term-dim">Skip an entry that would have to cross the spread rather than paying for it. Exits are never affected. Mainly matters live on equities: an order under one share can't be a limit at Alpaca, so on a small account those entries cross every time.</p>
              </div>
              <Switch checked={form.makerOnlyEntries} onCheckedChange={(v) => upd({ makerOnlyEntries: v })} />
            </div>
            <div className="flex items-center justify-between rounded-lg term-inset p-3">
              <div>
                <p className="text-sm font-medium text-white">Portfolio volatility budget</p>
                <p className="text-xs term-dim">Caps the risk of the BOOK, not just each trade. Three correlated positions each sized to 0.4% vol make a ~1.2% book — this is what notices. Only ever shrinks a position.</p>
              </div>
              <Switch checked={form.portfolioVolTarget} onCheckedChange={(v) => upd({ portfolioVolTarget: v })} />
            </div>
            <Field label={`Portfolio vol budget ${(form.portfolioVolTargetPct * 100).toFixed(3)}% per bar`}>
              <Input type="range" min={0.0001} max={0.003} step={0.0001} value={form.portfolioVolTargetPct}
                onChange={(e) => upd({ portfolioVolTargetPct: Number(e.target.value) })}
                disabled={!form.portfolioVolTarget} />
            </Field>
            <div className="flex items-center justify-between rounded-lg term-inset p-3">
              <div>
                <p className="text-sm font-medium text-white">Event blackout</p>
                <p className="text-xs term-dim">Stops opening positions around scheduled releases — payrolls, EIA inventories, triple witching, plus any FOMC/CPI dates you load. Makes no prediction about the release; it just declines to hold leverage through one. Open positions are left alone.</p>
              </div>
              <Switch checked={form.eventBlackout} onCheckedChange={(v) => upd({ eventBlackout: v })} />
            </div>
            <Field label={`Stand down ${form.eventBlackoutBeforeMinutes}m before / ${form.eventBlackoutAfterMinutes}m after`}>
              <Input type="range" min={0} max={120} step={5} value={form.eventBlackoutBeforeMinutes} onChange={(e) => upd({ eventBlackoutBeforeMinutes: Number(e.target.value) })} disabled={!form.eventBlackout} />
              <Input type="range" min={0} max={120} step={5} value={form.eventBlackoutAfterMinutes} onChange={(e) => upd({ eventBlackoutAfterMinutes: Number(e.target.value) })} disabled={!form.eventBlackout} />
              <p className="text-xs text-[#5a656c] mt-1">Medium-severity events use half these windows. Longer windows mean fewer trades, not safer ones — the point is to skip the minutes where the spread widens.</p>
            </Field>
            <div className="flex items-center justify-between rounded-lg term-inset p-3">
              <div>
                <p className="text-sm font-medium text-white">Confidence governor</p>
                <p className="text-xs term-dim">Scales risk down from your limits when realised results, drawdown or sample size don't justify them, and pauses new entries when they're poor. It never sizes above your limits.</p>
              </div>
              <Switch checked={form.confidenceGovernor} onCheckedChange={(v) => upd({ confidenceGovernor: v })} />
            </div>
            <div className="flex items-center justify-between rounded-lg term-inset p-3">
              <div>
                <p className="text-sm font-medium text-white">Adaptive sizing</p>
                <p className="text-xs term-dim">Volatility targeting + fractional Kelly. Both are bounded — they can only move sizing within your max position size above, never past it.</p>
              </div>
              <Switch checked={form.adaptiveSizing} onCheckedChange={(v) => upd({ adaptiveSizing: v })} />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-[#1f262b] pt-4">
          <div>
            <p className="font-medium text-white">Let AI pick the strategy</p>
            <p className="text-sm text-[#9aa6ad]">Automatically selects the best-fit strategy for current conditions.</p>
          </div>
          <Switch checked={form.autoSelectStrategy} onCheckedChange={(v) => upd({ autoSelectStrategy: v })} />
        </div>

        <div className="flex items-center justify-between border-t border-[#1f262b] pt-4">
          <div>
            <p className="font-medium text-white">Live trading (real money)</p>
            <p className="text-sm text-[#9aa6ad]">
              {liveKeys ? "Alpaca keys detected. Enabling uses your real account." : "Requires ALPACA_KEY_ID / ALPACA_SECRET_KEY. Paper only until then."}
            </p>
          </div>
          <Switch
            checked={form.mode === "live"}
            disabled={!liveKeys}
            onCheckedChange={(v) => upd({ mode: v ? "live" : "paper" })}
          />
        </div>

        <div className="border-t border-[#1f262b] pt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-white">Self-improvement engine</p>
              <p className="text-sm text-[#9aa6ad]">Periodically re-optimizes strategies and reviews the code.</p>
            </div>
            <Switch checked={form.improveEnabled} onCheckedChange={(v) => upd({ improveEnabled: v })} />
          </div>

          <div>
            <Label className="text-[#c3ccd2]">Autonomy — how much it may change on its own</Label>
            <div className="mt-2 grid sm:grid-cols-3 gap-2">
              {([
                { v: "propose_only", label: "Propose only", desc: "Nothing changes without your Apply." },
                { v: "auto_tune_paper", label: "Auto-tune (paper)", desc: "Validated parameter tweaks auto-apply in paper mode." },
                { v: "full_auto", label: "Full auto", desc: "Parameter tweaks auto-apply in any mode." },
              ] as const).map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => upd({ autonomy: o.v })}
                  className={`text-left rounded-lg border p-3 transition-colors ${
                    form.autonomy === o.v ? "border-indigo-500 bg-indigo-950/40" : "border-[#2c363d] term-inset hover:border-gray-600"
                  }`}
                >
                  <p className="text-sm font-medium text-white">{o.label}</p>
                  <p className="text-xs text-[#9aa6ad] mt-1">{o.desc}</p>
                </button>
              ))}
            </div>
            <p className="text-xs term-dim mt-2">Code-level changes are always review-only, whatever this is set to.</p>
          </div>

          <Field label="Improvement cycle interval (minutes)">
            <Input type="number" value={form.improveIntervalMinutes} onChange={(e) => upd({ improveIntervalMinutes: Number(e.target.value) })} className="term-inset max-w-40" />
          </Field>
        </div>

        <Button onClick={() => save.mutate(form)} disabled={save.isPending} className="bg-emerald-600 hover:bg-emerald-700">
          {save.isPending ? "Saving…" : "Save settings"}
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * What to trade, and how aggressively — the two choices that decide everything
 * else. Both were API-only until now, so the dashboard could only ever drive a
 * single crypto symbol.
 */
function MarketAndStyle() {
  const qc = useQueryClient();
  const universes = useQuery({ queryKey: ["/api/universes"], queryFn: api.universes });
  const profiles = useQuery({ queryKey: ["/api/profiles"], queryFn: api.profiles });
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = () =>
    ["/api/universes", "/api/profiles", "/api/config", "/api/status", "/api/positions"].forEach(
      (k) => qc.invalidateQueries({ queryKey: [k] }),
    );

  const applyUniverse = async (id: string) => {
    setBusy(id);
    try {
      await api.applyUniverse(id);
      refresh();
    } finally {
      setBusy(null);
    }
  };
  const applyProfile = async (id: string) => {
    setBusy(id);
    try {
      await api.applyProfile(id);
      refresh();
    } finally {
      setBusy(null);
    }
  };

  const current = universes.data?.current;
  const activeCount = current ? 1 + (current.extraSymbols?.length ?? 0) : 0;
  const activeProfile = profiles.data?.active;

  return (
    <div className="space-y-5">
      <div>
        <p className="font-medium text-white">What to trade</p>
        <p className="text-sm text-[#9aa6ad]">
          Pick a market. The engine scans every symbol in it and holds only the best few —
          a wider list buys more choice, not more risk.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {universes.data?.presets.map((p) => (
          <button
            key={p.id}
            onClick={() => applyUniverse(p.id)}
            disabled={busy !== null}
            className="text-left rounded-lg term-inset border border-[#2c363d] hover:border-gray-500 p-3 disabled:opacity-50"
          >
            <p className="text-sm font-medium text-white">{p.name}</p>
            <p className="text-xs term-dim mt-0.5">{p.count} symbols</p>
            <p className="text-xs text-[#5a656c] mt-1 line-clamp-3">{p.description}</p>
          </button>
        ))}
      </div>
      {current && (
        <p className="text-xs term-dim">
          Trading {activeCount} symbol{activeCount === 1 ? "" : "s"}:{" "}
          <span className="text-[#9aa6ad]">
            {[current.symbol, ...(current.extraSymbols ?? [])].slice(0, 8).join(", ")}
            {activeCount > 8 ? ` +${activeCount - 8} more` : ""}
          </span>
        </p>
      )}

      <div className="border-t border-[#1f262b] pt-4">
        <p className="font-medium text-white">Trading style</p>
        <p className="text-sm text-[#9aa6ad]">
          Sets risk limits and strategy lengths together — applying half of either would
          stop out of trends before they resolve.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {profiles.data?.profiles.map((p) => (
          <button
            key={p.id}
            onClick={() => applyProfile(p.id)}
            disabled={busy !== null}
            className={`text-left rounded-lg p-3 border disabled:opacity-50 ${
              activeProfile === p.id
                ? "bg-[#1E3A5F] border-blue-500"
                : "term-inset hover:border-gray-500"
            }`}
          >
            <p className="text-sm font-medium text-white">
              {p.name}
              {activeProfile === p.id && <span className="text-blue-400 text-xs ml-2">active</span>}
            </p>
            <p className="text-xs text-[#5a656c] mt-1">{p.description}</p>
          </button>
        ))}
      </div>
      {activeProfile === "day" && (
        <p className="text-xs text-amber-500/90 bg-amber-500/10 rounded p-2">
          Day trading US stocks needs $25,000+ in a margin account — under that, the Pattern
          Day Trader rule caps you at 3 day trades per 5 business days and this profile will
          exceed it immediately. Crypto is exempt.
        </p>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-[#c3ccd2]">{label}</Label>
      {children}
    </div>
  );
}
