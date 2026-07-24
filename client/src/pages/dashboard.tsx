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
import { api, type BotConfig } from "@/lib/api";

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

        <TabsContent value="settings">
          <SettingsPanel />
        </TabsContent>
      </Tabs>

      <p className="text-center text-xs text-gray-600 mt-8">
        {s?.feedSource === "synthetic"
          ? "Running on synthetic market data (demo). Add Alpaca API keys for real market data."
          : "Live market data via Alpaca."}
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
