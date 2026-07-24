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

export default function Dashboard() {
  const qc = useQueryClient();

  const status = useQuery({ queryKey: ["/api/status"], queryFn: api.status, refetchInterval: REFRESH_MS });
  const equity = useQuery({ queryKey: ["/api/equity"], queryFn: api.equity, refetchInterval: REFRESH_MS });
  const position = useQuery({ queryKey: ["/api/position"], queryFn: api.position, refetchInterval: REFRESH_MS });
  const perf = useQuery({ queryKey: ["/api/performance"], queryFn: api.performance, refetchInterval: REFRESH_MS });
  const trades = useQuery({ queryKey: ["/api/trades"], queryFn: api.trades, refetchInterval: REFRESH_MS });
  const decisions = useQuery({ queryKey: ["/api/decisions"], queryFn: api.decisions, refetchInterval: REFRESH_MS });
  const recommendation = useQuery({ queryKey: ["/api/recommendation"], queryFn: api.recommendation, refetchInterval: 30000 });
  const backtest = useQuery({ queryKey: ["/api/backtest"], queryFn: api.backtest, refetchInterval: 30000 });

  const invalidateAll = () =>
    ["/api/status", "/api/equity", "/api/position", "/api/decisions", "/api/config"].forEach((k) =>
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
          <h1 className="text-2xl md:text-3xl font-bold text-white">Auto-Trader</h1>
          <p className="text-sm text-gray-400">Personal automated trading — AI strategy selection</p>
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
            <p className="text-sm text-red-400/80">{s.haltReason}</p>
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
        <Stat
          label="Open position"
          value={position.data ? `${position.data.qty.toFixed(5)}` : "Flat"}
          sub={position.data ? `${pct(position.data.unrealizedPnl / (position.data.avgEntryPrice * position.data.qty))} unreal.` : s?.symbol}
          positive={position.data ? position.data.unrealizedPnl >= 0 : undefined}
        />
      </div>

      {/* Equity chart */}
      <Card className="bg-[#2A2A2A] border-gray-800 mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Equity curve</span>
            <span className="text-sm font-normal text-gray-400">
              {s?.lastPrice ? `${s.symbol} ${money(s.lastPrice)}` : ""} · updated {timeAgo(s?.lastEvaluatedAt ?? null)}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            {equityData.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={equityData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
                  <XAxis dataKey="t" tick={{ fill: "#888", fontSize: 11 }} minTickGap={40} />
                  <YAxis domain={["auto", "auto"]} tick={{ fill: "#888", fontSize: 11 }} width={70} tickFormatter={(v) => `$${Math.round(v)}`} />
                  <Tooltip contentStyle={{ background: "#1E1E1E", border: "1px solid #444", borderRadius: 8 }} formatter={(v: number) => money(v)} />
                  <Line type="monotone" dataKey="equity" stroke="#10b981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500 text-sm">
                {s?.running ? "Collecting data… equity updates every tick." : "Press Start to begin trading."}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Active strategy / AI recommendation */}
      <Card className="bg-[#2A2A2A] border-gray-800 mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">AI strategy selection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-gray-400">Active:</span>
            <Badge className="bg-indigo-600">{s?.activeStrategyName ?? "—"}</Badge>
            <span className="text-gray-400">Regime:</span>
            <Badge variant="outline" className="capitalize">{(s?.regime ?? "unknown").replace("_", " ")}</Badge>
          </div>
          {recommendation.data && (
            <p className="text-sm text-gray-400">{recommendation.data.rationale}</p>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="activity">
        <TabsList className="bg-[#2A2A2A]">
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="trades">Trades</TabsTrigger>
          <TabsTrigger value="strategies">Strategies</TabsTrigger>
          <TabsTrigger value="ailab">AI Lab</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="activity">
          <Card className="bg-[#2A2A2A] border-gray-800">
            <CardContent className="p-0 max-h-96 overflow-y-auto">
              {decisions.data?.length ? (
                <ul className="divide-y divide-gray-800">
                  {decisions.data.map((d) => (
                    <li key={d.id} className="px-4 py-2 flex items-start gap-3 text-sm">
                      <KindBadge kind={d.kind} />
                      <span className="flex-1 text-gray-300">{d.message}</span>
                      <span className="text-xs text-gray-500 whitespace-nowrap">{new Date(d.time).toLocaleTimeString()}</span>
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
          <Card className="bg-[#2A2A2A] border-gray-800">
            <CardContent className="p-0 max-h-96 overflow-y-auto">
              {trades.data?.length ? (
                <table className="w-full text-sm">
                  <thead className="text-gray-500 text-left sticky top-0 bg-[#2A2A2A]">
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
                      <tr key={t.id} className="border-t border-gray-800">
                        <td className="px-4 py-2 text-gray-400">{new Date(t.exitTime).toLocaleTimeString()}</td>
                        <td className="px-4 py-2 text-gray-300">{t.strategy}</td>
                        <td className="px-4 py-2 text-right text-gray-300">{money(t.entryPrice)}</td>
                        <td className="px-4 py-2 text-right text-gray-300">{money(t.exitPrice)}</td>
                        <td className={`px-4 py-2 text-right font-medium ${t.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
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
          <Card className="bg-[#2A2A2A] border-gray-800">
            <CardContent className="p-0">
              {backtest.data?.results?.length ? (
                <table className="w-full text-sm">
                  <thead className="text-gray-500 text-left">
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
                      <tr key={r.strategyId} className="border-t border-gray-800">
                        <td className="px-4 py-2 text-gray-200">
                          {r.strategyName}
                          {r.strategyId === s?.activeStrategyId && <Badge className="ml-2 bg-indigo-600">active</Badge>}
                        </td>
                        <td className={`px-4 py-2 text-right ${r.returnPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>{pct(r.returnPct)}</td>
                        <td className="px-4 py-2 text-right text-gray-300">{pct(r.stats.winRate)}</td>
                        <td className="px-4 py-2 text-right text-gray-300">{pct(r.stats.maxDrawdown)}</td>
                        <td className="px-4 py-2 text-right text-gray-300">{r.sharpe.toFixed(3)}</td>
                        <td className={`px-4 py-2 text-right ${(r.deflatedSharpe ?? 0.5) > 0.7 ? "text-emerald-400" : "text-gray-400"}`}>
                          {r.deflatedSharpe !== undefined ? `${(r.deflatedSharpe * 100).toFixed(0)}%` : "—"}
                        </td>
                        <td className="px-4 py-2 text-right text-gray-400">
                          {r.minTrackRecordBars != null ? `${r.minTrackRecordBars.toLocaleString()} bars` : "—"}
                        </td>
                        <td className="px-4 py-2 text-right text-gray-300">{r.stats.totalTrades}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <Empty text="Backtest running…" />
              )}
              <p className="px-4 py-3 text-xs text-gray-500">
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

      <p className="text-center text-xs text-gray-600 mt-8">
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
      <Badge variant="outline" className={status.running ? "text-emerald-400 border-emerald-800" : "text-gray-400"}>
        {status.running ? "● running" : "○ stopped"}
      </Badge>
    </div>
  );
}

function Stat({ label, value, sub, positive }: { label: string; value: string; sub?: string; positive?: boolean }) {
  return (
    <Card className="bg-[#2A2A2A] border-gray-800">
      <CardContent className="p-4">
        <p className="text-xs text-gray-400 mb-1">{label}</p>
        <p className={`text-xl font-bold ${positive === undefined ? "text-white" : positive ? "text-emerald-400" : "text-red-400"}`}>{value}</p>
        {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function KindBadge({ kind }: { kind: string }) {
  const map: Record<string, string> = {
    order: "bg-emerald-700",
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
  return <div className="p-8 text-center text-gray-500 text-sm">{text}</div>;
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
        : "border-gray-700 bg-[#2A2A2A]";
  return (
    <div className={`mb-6 rounded-lg border p-4 ${styles}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <p className="font-semibold text-white">
            {unacked.length} alert{unacked.length > 1 ? "s" : ""}
            {!alerts.data?.telegramConfigured && (
              <span className="ml-2 text-xs font-normal text-gray-500">
                (set TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID for phone pushes)
              </span>
            )}
          </p>
          <ul className="text-sm space-y-0.5">
            {unacked.slice(0, 4).map((a) => (
              <li key={a.id} className="text-gray-300 truncate">
                <span className={a.level === "critical" ? "text-red-400" : a.level === "warning" ? "text-amber-400" : "text-gray-400"}>
                  [{a.level}]
                </span>{" "}
                <span className="font-medium">{a.title}</span> — {a.message}
              </li>
            ))}
            {unacked.length > 4 && <li className="text-gray-500">…and {unacked.length - 4} more</li>}
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
    <Card className="bg-[#2A2A2A] border-gray-800">
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
        <p className="text-sm text-gray-400">
          A logistic-regression model that learns from market features to predict the probability of a price rise. It generates the buy/sell signals directly. To use it, pick <span className="text-gray-200">ML Signal Model</span> as your strategy (or leave AI auto-select on).
        </p>

        {s?.dataInfo && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge className={s.dataInfo.source === "real" ? "bg-emerald-700" : "bg-gray-700"}>
              {s.dataInfo.source === "real" ? "trained on real market data" : `trained on ${s.dataInfo.source} data`}
            </Badge>
            <span className="text-gray-500">
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
            Currently trained on the runtime feed. Run <code className="bg-[#1E1E1E] px-1 rounded">npm run train</code> to train on years of real market history and save a mature model.
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
              <div className="rounded-lg bg-[#1E1E1E] p-3 text-xs text-gray-400">
                <span className="text-gray-200 font-medium">Meta-labeling on:</span>{" "}
                a second model predicts whether each signal is <em>correct</em> — it vetoes weak signals and sizes the bets that pass.
                Accuracy {(s.meta.validationAccuracy * 100).toFixed(1)}% on {s.meta.samples} signals · approves {(s.meta.coverage * 100).toFixed(0)}% of signals.
              </div>
            ) : (
              <p className="text-xs text-gray-600">Meta-labeling: not enough signal history to fit the bet-sizing model yet.</p>
            )}

            <div>
              <p className="text-xs text-gray-400 mb-2">What the model learned (feature weights)</p>
              <div className="space-y-1.5">
                {s.featureImportances.map((f) => (
                  <div key={f.name} className="flex items-center gap-2 text-xs">
                    <span className="w-28 text-gray-400 truncate">{f.name}</span>
                    <div className="flex-1 h-2 bg-[#1E1E1E] rounded relative overflow-hidden">
                      <div
                        className={`absolute top-0 h-full ${f.weight >= 0 ? "bg-emerald-600 left-1/2" : "bg-red-600 right-1/2"}`}
                        style={{ width: `${(Math.abs(f.weight) / maxWeight) * 50}%` }}
                      />
                      <div className="absolute left-1/2 top-0 h-full w-px bg-gray-700" />
                    </div>
                    <span className={`w-12 text-right ${f.weight >= 0 ? "text-emerald-400" : "text-red-400"}`}>{f.weight.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-600 mt-1">Green = higher value pushes toward "buy"; red = toward "sell".</p>
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-500">Not trained yet — press Retrain (needs enough market history).</p>
        )}

        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {s?.trainedAt ? `Last trained ${timeAgo(s.trainedAt)}` : ""}
          </span>
          <Button onClick={() => train.mutate()} disabled={train.isPending} className="bg-indigo-600 hover:bg-indigo-700">
            {train.isPending ? "Training…" : "Retrain now"}
          </Button>
        </div>
        <p className="text-xs text-gray-600">
          The model refuses to trade unless its purged out-of-sample accuracy beats both {((s?.tradableFloor ?? 0.52) * 100).toFixed(0)}% and the majority-class baseline — so it can't be fooled by a one-sided market. On real markets, expect the edge to be small; signal prediction is genuinely hard, which is why this gate exists.
        </p>
      </CardContent>
    </Card>
  );
}

function MlStat({ label, value, sub, positive }: { label: string; value: string; sub?: string; positive?: boolean }) {
  return (
    <div className="rounded-lg bg-[#1E1E1E] p-3">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`text-lg font-bold ${positive === undefined ? "text-white" : positive ? "text-emerald-400" : "text-amber-400"}`}>{value}</p>
      {sub && <p className="text-xs text-gray-600 mt-0.5">{sub}</p>}
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

      <Card className="bg-[#2A2A2A] border-gray-800">
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-white">Self-improvement engine</span>
              <Badge className={data?.aiAvailable ? "bg-emerald-700" : "bg-gray-700"}>
                {data?.aiAvailable ? "AI analyst on" : "optimizer only"}
              </Badge>
            </div>
            <p className="text-sm text-gray-400">
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
        <Card className="bg-[#2A2A2A] border-gray-800">
          <CardHeader className="pb-2"><CardTitle className="text-base">AI diagnosis</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-gray-300 whitespace-pre-wrap">{data.lastDiagnosis}</p></CardContent>
        </Card>
      )}

      <Card className="bg-[#2A2A2A] border-gray-800">
        <CardHeader className="pb-2"><CardTitle className="text-base">Proposals ({pending.length} pending)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {pending.length === 0 && <Empty text="No pending proposals. Run an analysis to look for improvements." />}
          {pending.map((p) => (
            <ProposalCard key={p.id} p={p} onApply={() => apply.mutate(p.id)} onReject={() => reject.mutate(p.id)} busy={apply.isPending || reject.isPending} />
          ))}
        </CardContent>
      </Card>

      <Card className="bg-[#2A2A2A] border-gray-800">
        <CardHeader className="pb-2"><CardTitle className="text-base">Live strategy parameters</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {params.data?.map((s) => (
            <div key={s.strategyId} className="border-t border-gray-800 pt-3 first:border-0 first:pt-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-200">{s.name}</span>
                <Button variant="outline" className="h-7 text-xs" onClick={() => reset.mutate(s.strategyId)} disabled={reset.isPending}>Reset to default</Button>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
                {s.params.map((spec) => {
                  const cur = s.current[spec.key];
                  const def = s.defaults[spec.key];
                  const changed = Math.abs((cur ?? 0) - (def ?? 0)) > 1e-9;
                  return (
                    <span key={spec.key}>
                      {spec.label}: <span className={changed ? "text-indigo-400 font-medium" : "text-gray-300"}>{Number.isInteger(cur) ? cur : cur?.toFixed(2)}</span>
                      {changed && <span className="text-gray-600"> (was {Number.isInteger(def) ? def : def?.toFixed(2)})</span>}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card className="bg-[#2A2A2A] border-gray-800">
          <CardHeader className="pb-2"><CardTitle className="text-base">History</CardTitle></CardHeader>
          <CardContent className="p-0 max-h-64 overflow-y-auto">
            <ul className="divide-y divide-gray-800">
              {history.map((p) => (
                <li key={p.id} className="px-4 py-2 flex items-center gap-3 text-sm">
                  <ProposalStatusBadge status={p.status} />
                  <span className="flex-1 text-gray-300">{p.title}</span>
                  <span className="text-xs text-gray-500">{new Date(p.createdAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      <p className="text-xs text-gray-500">
        Parameter tweaks are validated out-of-sample before they're trusted, and auto-apply only per your autonomy setting (Settings). Code-level suggestions are always review-only — the AI proposes, you decide.
      </p>
    </div>
  );
}

function ProposalCard({ p, onApply, onReject, busy }: { p: ImprovementProposal; onApply: () => void; onReject: () => void; busy: boolean }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-[#1E1E1E] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge className={p.kind === "param" ? "bg-emerald-700" : "bg-amber-700"}>{p.kind === "param" ? "parameters" : "code idea"}</Badge>
          <span className="text-sm font-medium text-white">{p.title}</span>
        </div>
        <span className="text-xs text-gray-500">{p.source === "ai" ? "Claude" : "optimizer"}</span>
      </div>
      <p className="text-sm text-gray-400 mt-2">{p.rationale}</p>

      {p.kind === "param" && p.proposedParams && p.currentParams && (
        <div className="mt-2 text-xs text-gray-300 flex flex-wrap gap-x-4 gap-y-1">
          {Object.keys(p.proposedParams).map((k) => (
            <span key={k}>{k}: <span className="text-gray-500">{fmtNum(p.currentParams![k])}</span> → <span className="text-indigo-400 font-medium">{fmtNum(p.proposedParams![k])}</span></span>
          ))}
        </div>
      )}
      {p.validation && (
        <p className="mt-2 text-xs text-gray-500">
          Out-of-sample: {pct(p.validation.outOfSampleReturn)} vs current {pct(p.validation.baselineOutOfSampleReturn)}
          {" · "}<span className="text-emerald-400">+{pct(p.validation.improvement)} edge</span> over {p.validation.outOfSampleTrades} trades
          {p.validation.pbo !== undefined && (
            <>
              {" · "}overfit prob (PBO) <span className={p.validation.pbo <= 0.05 ? "text-emerald-400" : "text-red-400"}>{(p.validation.pbo * 100).toFixed(1)}%</span>
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

function fmtNum(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function SettingsPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const config = useQuery({ queryKey: ["/api/config"], queryFn: api.config });
  const status = useQuery({ queryKey: ["/api/status"], queryFn: api.status });
  const [form, setForm] = useState<BotConfig | null>(null);

  useEffect(() => {
    if (config.data && !form) setForm(config.data);
  }, [config.data, form]);

  const save = useMutation({
    mutationFn: (patch: Partial<BotConfig>) => api.updateConfig(patch),
    onSuccess: async (res) => {
      const body = await res.json();
      if (!res.ok) {
        toast({ title: "Couldn't save", description: body.message, variant: "destructive" });
        return;
      }
      toast({ title: "Settings saved" });
      qc.invalidateQueries({ queryKey: ["/api/config"] });
      qc.invalidateQueries({ queryKey: ["/api/status"] });
    },
  });

  if (!form) return <Card className="bg-[#2A2A2A] border-gray-800"><Empty text="Loading settings…" /></Card>;

  const upd = (patch: Partial<BotConfig>) => setForm({ ...form, ...patch });
  const liveKeys = status.data?.liveKeysConfigured;

  return (
    <Card className="bg-[#2A2A2A] border-gray-800">
      <CardContent className="p-6 space-y-6">
        <div className="grid md:grid-cols-2 gap-6">
          <Field label="Symbol">
            <Input value={form.symbol} onChange={(e) => upd({ symbol: e.target.value })} className="bg-[#1E1E1E] border-gray-700" />
          </Field>
          <Field label="Evaluation interval (seconds)">
            <Input type="number" value={form.intervalSeconds} onChange={(e) => upd({ intervalSeconds: Number(e.target.value) })} className="bg-[#1E1E1E] border-gray-700" />
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

        <div className="flex items-center justify-between border-t border-gray-800 pt-4">
          <div>
            <p className="font-medium text-white">Let AI pick the strategy</p>
            <p className="text-sm text-gray-400">Automatically selects the best-fit strategy for current conditions.</p>
          </div>
          <Switch checked={form.autoSelectStrategy} onCheckedChange={(v) => upd({ autoSelectStrategy: v })} />
        </div>

        <div className="flex items-center justify-between border-t border-gray-800 pt-4">
          <div>
            <p className="font-medium text-white">Live trading (real money)</p>
            <p className="text-sm text-gray-400">
              {liveKeys ? "Alpaca keys detected. Enabling uses your real account." : "Requires ALPACA_KEY_ID / ALPACA_SECRET_KEY. Paper only until then."}
            </p>
          </div>
          <Switch
            checked={form.mode === "live"}
            disabled={!liveKeys}
            onCheckedChange={(v) => upd({ mode: v ? "live" : "paper" })}
          />
        </div>

        <div className="border-t border-gray-800 pt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-white">Self-improvement engine</p>
              <p className="text-sm text-gray-400">Periodically re-optimizes strategies and reviews the code.</p>
            </div>
            <Switch checked={form.improveEnabled} onCheckedChange={(v) => upd({ improveEnabled: v })} />
          </div>

          <div>
            <Label className="text-gray-300">Autonomy — how much it may change on its own</Label>
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
                    form.autonomy === o.v ? "border-indigo-500 bg-indigo-950/40" : "border-gray-700 bg-[#1E1E1E] hover:border-gray-600"
                  }`}
                >
                  <p className="text-sm font-medium text-white">{o.label}</p>
                  <p className="text-xs text-gray-400 mt-1">{o.desc}</p>
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">Code-level changes are always review-only, whatever this is set to.</p>
          </div>

          <Field label="Improvement cycle interval (minutes)">
            <Input type="number" value={form.improveIntervalMinutes} onChange={(e) => upd({ improveIntervalMinutes: Number(e.target.value) })} className="bg-[#1E1E1E] border-gray-700 max-w-40" />
          </Field>
        </div>

        <Button onClick={() => save.mutate(form)} disabled={save.isPending} className="bg-emerald-600 hover:bg-emerald-700">
          {save.isPending ? "Saving…" : "Save settings"}
        </Button>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-gray-300">{label}</Label>
      {children}
    </div>
  );
}
