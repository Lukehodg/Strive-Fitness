import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { api, type BotConfig } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Field, SettingsSection, ToggleRow, Empty } from "./shared";

export function SettingsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const config = useQuery({ queryKey: ["/api/config"], queryFn: api.config });
  const status = useQuery({ queryKey: ["/api/status"], queryFn: api.status });
  const costs = useQuery({ queryKey: ["/api/costs"], queryFn: api.costs });
  const [form, setForm] = useState<BotConfig | null>(null);
  const [dirty, setDirty] = useState(false);

  // Re-sync from the server whenever config changes underneath us — but never
  // over the top of unsaved edits.
  //
  // This only ran once (`!form`) in an earlier version, so anything that
  // changed config elsewhere (applying a trading profile or a universe) left
  // these fields showing the OLD values. Pressing "Save settings" afterwards
  // then wrote those stale values back, silently undoing the profile you had
  // just applied.
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
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["/api/config"] });
      qc.invalidateQueries({ queryKey: ["/api/status"] });
    },
  });

  if (!form) return <Empty text="Loading settings…" />;

  const upd = (patch: Partial<BotConfig>) => {
    setDirty(true);
    setForm({ ...form, ...patch });
  };
  const liveKeys = status.data?.liveKeysConfigured;

  return (
    <div className="space-y-5 pb-24">
      <MarketAndStyle />

      <SettingsSection title="Position & risk" description="The core numbers: what to trade, how often, and the limits on any single position.">
        <div className="grid md:grid-cols-2 gap-5">
          <Field
            label="Primary symbol"
            hint="Spot FX only, quoted against USD — so USD/JPY is entered as JPY/USD. Open 24/5, Sunday 17:00 ET to Friday 17:00 ET."
          >
            <Input value={form.symbol} onChange={(e) => upd({ symbol: e.target.value })} />
          </Field>
          <Field label="Evaluation interval (seconds)">
            <Input type="number" value={form.intervalSeconds} onChange={(e) => upd({ intervalSeconds: Number(e.target.value) })} />
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
      </SettingsSection>

      <SettingsSection
        title="Execution & sizing"
        description="How orders fill and how much to risk per trade — the highest-certainty way to raise net returns, since it doesn't depend on predicting anything."
      >
        <div className="grid md:grid-cols-2 gap-5">
          <Field
            label={`Maker-first limit offset (${(form.limitOrderOffsetPct * 100).toFixed(2)}%, 0 = market orders)`}
            hint="Posts a resting order for a lower fee and no slippage; falls back to a market fill on exits so nothing is ever stuck. Stop-losses always fill immediately regardless."
          >
            <Input type="range" min={0} max={0.002} step={0.0001} value={form.limitOrderOffsetPct} onChange={(e) => upd({ limitOrderOffsetPct: Number(e.target.value) })} />
          </Field>
          <Field
            label={`Kelly fraction (${(form.kellyFraction * 100).toFixed(0)}% of full Kelly)`}
            hint="Lower = more conservative sizing from a strategy's own track record. Only active once a strategy has 10+ trades."
          >
            <Input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={form.kellyFraction}
              onChange={(e) => upd({ kellyFraction: Number(e.target.value) })}
              disabled={!form.adaptiveSizing}
            />
          </Field>
          <Field
            label={`Volatility target (${(form.volTargetPct * 100).toFixed(3)}% per bar)`}
            hint="Size shrinks when the market is choppier than this, and can size up (toward the max above) when it's calmer — keeping risk, not notional exposure, roughly constant."
          >
            <Input
              type="range"
              min={0.0002}
              max={0.006}
              step={0.0001}
              value={form.volTargetPct}
              onChange={(e) => upd({ volTargetPct: Number(e.target.value) })}
              disabled={!form.adaptiveSizing}
            />
          </Field>
          <ToggleRow
            title="Adaptive sizing"
            description="Volatility targeting + fractional Kelly. Both are bounded — they can only move sizing within your max position size above, never past it."
            checked={form.adaptiveSizing}
            onCheckedChange={(v) => upd({ adaptiveSizing: v })}
          />
        </div>

        {/* Execution costs. Shown, not hidden, because a wrong number here
            silently invalidates every backtest in the app. */}
        <div className="rounded-lg border bg-muted/40 p-3">
          <p className="text-sm font-medium">Execution costs</p>
          <p className="text-xs text-muted-foreground mb-2">
            Set these to what your statements actually show. The default is a retail spread account — the spread
            itself is the whole cost, per pair, and moves with the rate. Only set a commission if your account
            charges one on top (an ECN/raw-spread account).
          </p>
          {costs.data && (
            <div className="mb-3 space-y-1">
              {costs.data.byAsset.map((a) => (
                <div key={a.symbol} className="flex items-baseline justify-between text-xs tabular">
                  <span className="text-muted-foreground">{a.symbol} round trip</span>
                  <span>
                    <span className="text-primary">{(a.takerRoundTrip * 100).toFixed(3)}%</span>
                    <span className="text-muted-foreground"> taker / </span>
                    <span className="text-gain">{(a.makerRoundTrip * 100).toFixed(3)}%</span>
                    <span className="text-muted-foreground"> maker — eats </span>
                    <span className={a.takerShareOfTarget > 0.25 ? "text-loss" : "text-muted-foreground"}>
                      {(a.takerShareOfTarget * 100).toFixed(0)}%
                    </span>
                    <span className="text-muted-foreground"> of your target</span>
                  </span>
                </div>
              ))}
            </div>
          )}
          <Field
            label="FX commission % per side (blank = retail spread account)"
            hint="Only for raw-spread/ECN accounts that charge per lot on top of a tighter quote. Leave blank on a standard retail account. Per-pair spreads are set in forex.ts and default to the wide end of what a retail account sees — calibrate them against your own statements."
          >
            <Input
              type="number"
              step={0.001}
              min={0}
              max={1}
              value={form.forexCommission != null ? form.forexCommission * 100 : ""}
              placeholder="0 — the spread is the whole cost"
              onChange={(e) => upd({ forexCommission: e.target.value === "" ? null : Number(e.target.value) / 100 })}
            />
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection title="Safety gates" description="Controls that scale risk down or stand the bot down — every one is one-directional, and none can push you past the limits above.">
        <div className="grid md:grid-cols-2 gap-5">
          <ToggleRow
            title="Require proven edge (live only)"
            description="Refuses to open LIVE positions until the active strategy shows a positive mean return per trade over at least 30 trades, significantly above zero. Paper is never blocked. Every measurement in this project says these strategies lose money — this is what stops that reaching your account."
            checked={form.requireProvenEdge}
            onCheckedChange={(v) => upd({ requireProvenEdge: v })}
          />
          <ToggleRow
            title="Maker-only entries"
            description="Skip an entry that would have to cross the spread rather than paying for it. Exits are never affected. On FX every order can rest as a limit at any size, so this is a straight choice between paying the spread and waiting for a better price."
            checked={form.makerOnlyEntries}
            onCheckedChange={(v) => upd({ makerOnlyEntries: v })}
          />
          <ToggleRow
            title="Portfolio volatility budget"
            description="Caps the risk of the BOOK, not just each trade. Three correlated positions each sized to 0.4% vol make a ~1.2% book — this is what notices. Only ever shrinks a position."
            checked={form.portfolioVolTarget}
            onCheckedChange={(v) => upd({ portfolioVolTarget: v })}
          >
            <Field label={`Portfolio vol budget ${(form.portfolioVolTargetPct * 100).toFixed(3)}% per bar`}>
              <Input
                type="range"
                min={0.0001}
                max={0.003}
                step={0.0001}
                value={form.portfolioVolTargetPct}
                onChange={(e) => upd({ portfolioVolTargetPct: Number(e.target.value) })}
                disabled={!form.portfolioVolTarget}
              />
            </Field>
          </ToggleRow>
          <ToggleRow
            title="Scale risk to each market"
            description="Every setting above was calibrated on crypto. An FX major moves about a twelfth as much per bar, so a 4% take-profit there is an eighteen-sigma move that never triggers. This scales the stop, target, volatility target and maker offset to each instrument, keeping the ratios you set. Leave it on unless you are trading one market and tuning for it directly."
            checked={form.scaleRiskByAssetClass}
            onCheckedChange={(v) => upd({ scaleRiskByAssetClass: v })}
          />
          <ToggleRow
            title="Event blackout"
            description="Stops opening positions around scheduled releases — payrolls, EIA inventories, triple witching, plus any FOMC/CPI dates you load. Makes no prediction about the release; it just declines to hold leverage through one. Open positions are left alone."
            checked={form.eventBlackout}
            onCheckedChange={(v) => upd({ eventBlackout: v })}
          >
            <Field
              label={`Stand down ${form.eventBlackoutBeforeMinutes}m before / ${form.eventBlackoutAfterMinutes}m after`}
              hint="Medium-severity events use half these windows. Longer windows mean fewer trades, not safer ones — the point is to skip the minutes where the spread widens."
            >
              <div className="space-y-2">
                <Input
                  type="range"
                  min={0}
                  max={120}
                  step={5}
                  value={form.eventBlackoutBeforeMinutes}
                  onChange={(e) => upd({ eventBlackoutBeforeMinutes: Number(e.target.value) })}
                  disabled={!form.eventBlackout}
                />
                <Input
                  type="range"
                  min={0}
                  max={120}
                  step={5}
                  value={form.eventBlackoutAfterMinutes}
                  onChange={(e) => upd({ eventBlackoutAfterMinutes: Number(e.target.value) })}
                  disabled={!form.eventBlackout}
                />
              </div>
            </Field>
          </ToggleRow>
          <ToggleRow
            title="Confidence governor"
            description="Scales risk down from your limits when realised results, drawdown or sample size don't justify them, and pauses new entries when they're poor. It never sizes above your limits."
            checked={form.confidenceGovernor}
            onCheckedChange={(v) => upd({ confidenceGovernor: v })}
          />
        </div>
      </SettingsSection>

      <SettingsSection title="Strategy & trading mode">
        <div className="space-y-4">
          <ToggleRow
            title="Let AI pick the strategy"
            description="Automatically selects the best-fit strategy for current conditions."
            checked={form.autoSelectStrategy}
            onCheckedChange={(v) => upd({ autoSelectStrategy: v })}
          />
          <ToggleRow
            title="Live trading (real money)"
            description={
              liveKeys
                ? "OANDA credentials detected. Enabling uses your real account."
                : "Requires OANDA_API_TOKEN / OANDA_ACCOUNT_ID. Paper only until then."
            }
            checked={form.mode === "live"}
            onCheckedChange={(v) => upd({ mode: v ? "live" : "paper" })}
          />
          {form.mode === "live" && !liveKeys && (
            <p className="text-xs text-amber-700 -mt-2">
              This toggle will not actually enable live mode until OANDA credentials are configured — see .env.example.
            </p>
          )}
        </div>
      </SettingsSection>

      <SettingsSection title="Automation" description="The self-improvement engine periodically re-optimizes strategies and reviews the code.">
        <div className="space-y-4">
          <ToggleRow
            title="Self-improvement engine"
            description="Periodically re-optimizes strategies and reviews the code."
            checked={form.improveEnabled}
            onCheckedChange={(v) => upd({ improveEnabled: v })}
          />

          <div>
            <Label className="text-sm">Autonomy — how much it may change on its own</Label>
            <div className="mt-2 grid sm:grid-cols-3 gap-2">
              {(
                [
                  { v: "propose_only", label: "Propose only", desc: "Nothing changes without your Apply." },
                  { v: "auto_tune_paper", label: "Auto-tune (paper)", desc: "Validated parameter tweaks auto-apply in paper mode." },
                  { v: "full_auto", label: "Full auto", desc: "Parameter tweaks auto-apply in any mode." },
                ] as const
              ).map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => upd({ autonomy: o.v })}
                  className={cn(
                    "text-left rounded-lg border p-3 transition-colors",
                    form.autonomy === o.v ? "border-primary bg-primary/5" : "bg-muted/40 hover:border-muted-foreground/30",
                  )}
                >
                  <p className="text-sm font-medium">{o.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">{o.desc}</p>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">Code-level changes are always review-only, whatever this is set to.</p>
          </div>

          <Field label="Improvement cycle interval (minutes)">
            <Input
              type="number"
              value={form.improveIntervalMinutes}
              onChange={(e) => upd({ improveIntervalMinutes: Number(e.target.value) })}
              className="max-w-40"
            />
          </Field>
        </div>
      </SettingsSection>

      {/* Fixed save bar so it's always reachable without hunting for it at
          the bottom of a long page — the exact "where did the save button
          go" problem a long settings page tends to create. */}
      <div className="fixed bottom-0 left-0 right-0 md:left-56 border-t bg-background/95 backdrop-blur px-4 md:px-6 py-3 flex items-center justify-end gap-3 z-10">
        {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
        <Button onClick={() => save.mutate(form)} disabled={save.isPending} className="bg-gain hover:bg-gain/90">
          {save.isPending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </div>
  );
}

/**
 * What to trade, and how aggressively — the two choices that decide
 * everything else.
 */
function MarketAndStyle() {
  const qc = useQueryClient();
  const universes = useQuery({ queryKey: ["/api/universes"], queryFn: api.universes });
  const profiles = useQuery({ queryKey: ["/api/profiles"], queryFn: api.profiles });
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = () =>
    ["/api/universes", "/api/profiles", "/api/config", "/api/status", "/api/positions"].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k] }),
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
    <SettingsSection
      title="Market & trading style"
      description="Pick a market. The engine scans every symbol in it and holds only the best few — a wider list buys more choice, not more risk."
    >
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {universes.data?.presets.map((p) => (
          <button
            key={p.id}
            onClick={() => applyUniverse(p.id)}
            disabled={busy !== null}
            className="text-left rounded-lg border bg-muted/40 hover:border-muted-foreground/30 p-3 disabled:opacity-50"
          >
            <p className="text-sm font-medium">{p.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{p.count} symbols</p>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{p.description}</p>
          </button>
        ))}
      </div>
      {current && (
        <p className="text-xs text-muted-foreground">
          Trading {activeCount} symbol{activeCount === 1 ? "" : "s"}:{" "}
          <span className="text-foreground">
            {[current.symbol, ...(current.extraSymbols ?? [])].slice(0, 8).join(", ")}
            {activeCount > 8 ? ` +${activeCount - 8} more` : ""}
          </span>
        </p>
      )}

      <div className="border-t pt-4">
        <p className="text-sm font-semibold">Trading style</p>
        <p className="text-sm text-muted-foreground mt-0.5">
          Sets risk limits and strategy lengths together — applying half of either would stop out of trends before
          they resolve.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {profiles.data?.profiles.map((p) => (
          <button
            key={p.id}
            onClick={() => applyProfile(p.id)}
            disabled={busy !== null}
            className={cn(
              "text-left rounded-lg p-3 border disabled:opacity-50",
              activeProfile === p.id ? "bg-primary/5 border-primary" : "bg-muted/40 hover:border-muted-foreground/30",
            )}
          >
            <p className="text-sm font-medium">
              {p.name}
              {activeProfile === p.id && <span className="text-primary text-xs ml-2">active</span>}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{p.description}</p>
          </button>
        ))}
      </div>
      {activeProfile === "day" && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2">
          Day trading needs $25,000+ in a margin account for non-exempt instruments — under that, the Pattern Day
          Trader rule caps you at 3 day trades per 5 business days and this profile will exceed it immediately. Spot
          FX is exempt.
        </p>
      )}
    </SettingsSection>
  );
}
