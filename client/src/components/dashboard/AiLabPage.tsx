import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { api, type ImprovementProposal } from "@/lib/api";
import { timeAgo, pct, fmtNum } from "@/lib/format";
import { Empty } from "./shared";

export function AiLabPage() {
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
    <div className="space-y-5">
      <MlModelCard />

      <Card>
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">Self-improvement engine</span>
              <Badge variant={data?.aiAvailable ? "default" : "secondary"}>
                {data?.aiAvailable ? "AI analyst on" : "optimizer only"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {data?.aiAvailable
                ? "Claude reviews the code and trades; the optimizer tunes parameters (walk-forward validated)."
                : "Deterministic optimizer active. Set ANTHROPIC_API_KEY to enable the Claude code/trade analyst."}
              {data?.lastImproveAt ? ` · Last run ${timeAgo(data.lastImproveAt)}` : " · Not run yet"}
            </p>
          </div>
          <Button onClick={() => run.mutate()} disabled={run.isPending}>
            {run.isPending ? "Analyzing…" : "Run analysis now"}
          </Button>
        </CardContent>
      </Card>

      {data?.lastDiagnosis && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">AI diagnosis</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground whitespace-pre-wrap">{data.lastDiagnosis}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Proposals ({pending.length} pending)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {pending.length === 0 && <Empty text="No pending proposals. Run an analysis to look for improvements." />}
          {pending.map((p) => (
            <ProposalCard
              key={p.id}
              p={p}
              onApply={() => apply.mutate(p.id)}
              onReject={() => reject.mutate(p.id)}
              busy={apply.isPending || reject.isPending}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Live strategy parameters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {params.data?.map((s) => (
            <div key={s.strategyId} className="border-t pt-3 first:border-0 first:pt-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{s.name}</span>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => reset.mutate(s.strategyId)} disabled={reset.isPending}>
                  Reset to default
                </Button>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {s.params.map((spec) => {
                  const cur = s.current[spec.key];
                  const def = s.defaults[spec.key];
                  const changed = Math.abs((cur ?? 0) - (def ?? 0)) > 1e-9;
                  return (
                    <span key={spec.key}>
                      {spec.label}:{" "}
                      <span className={changed ? "text-primary font-medium" : "text-foreground"}>
                        {Number.isInteger(cur) ? cur : cur?.toFixed(2)}
                      </span>
                      {changed && <span> (was {Number.isInteger(def) ? def : def?.toFixed(2)})</span>}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">History</CardTitle>
          </CardHeader>
          <CardContent className="p-0 max-h-64 overflow-y-auto">
            <ul className="divide-y">
              {history.map((p) => (
                <li key={p.id} className="px-4 py-2 flex items-center gap-3 text-sm">
                  <ProposalStatusBadge status={p.status} />
                  <span className="flex-1 text-foreground">{p.title}</span>
                  <span className="text-xs text-muted-foreground">{new Date(p.createdAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      <p className="text-xs text-muted-foreground">
        Parameter tweaks are validated out-of-sample before they're trusted, and auto-apply only per your autonomy
        setting (Settings). Code-level suggestions are always review-only — the AI proposes, you decide.
      </p>
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
  const edge = s ? (s.validationAccuracy - s.baselineRate) * 100 : 0;
  const maxWeight = s?.featureImportances.reduce((m, f) => Math.max(m, Math.abs(f.weight)), 0) || 1;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          ML Signal Model
          {s?.trained ? (
            <Badge variant={s.tradable ? "default" : "secondary"} className={s.tradable ? "bg-gain hover:bg-gain/90" : ""}>
              {s.tradable ? "tradable" : "below chance — won't trade"}
            </Badge>
          ) : (
            <Badge variant="secondary">not trained</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          A logistic-regression model that learns from market features to predict the probability of a price rise. It
          generates the buy/sell signals directly. To use it, pick <span className="text-foreground">ML Signal Model</span> as
          your strategy (or leave AI auto-select on).
        </p>

        {s?.dataInfo && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant={s.dataInfo.source === "real" ? "default" : "secondary"} className={s.dataInfo.source === "real" ? "bg-gain hover:bg-gain/90" : ""}>
              {s.dataInfo.source === "real" ? "trained on real market data" : `trained on ${s.dataInfo.source} data`}
            </Badge>
            <span className="text-muted-foreground">
              {s.dataInfo.bars.toLocaleString()} {s.dataInfo.interval} candles
              {s.dataInfo.from && s.dataInfo.to
                ? ` · ${new Date(s.dataInfo.from).toLocaleDateString()} → ${new Date(s.dataInfo.to).toLocaleDateString()}`
                : ""}
              {" · "}
              {s.labeling} labels · {s.validationMethod}
            </span>
          </div>
        )}
        {s?.dataInfo?.source !== "real" && (
          <p className="text-xs text-amber-700">
            Currently trained on the runtime feed. Run <code className="bg-muted px-1 rounded">npm run train</code> to
            train on years of real market history and save a mature model.
          </p>
        )}

        {s?.trained ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MlStat label="Validation accuracy" value={`${valAcc.toFixed(1)}%`} positive={s.tradable} sub="purged walk-forward" />
              <MlStat
                label="Edge vs baseline"
                value={`${edge >= 0 ? "+" : ""}${edge.toFixed(1)}%`}
                positive={s.tradable}
                sub={`baseline ${(s.baselineRate * 100).toFixed(0)}%`}
              />
              <MlStat label="Training accuracy" value={`${(s.trainAccuracy * 100).toFixed(1)}%`} sub="in-sample (optimistic)" />
              <MlStat
                label="Current signal"
                value={s.lastProbability !== null ? `${(s.lastProbability * 100).toFixed(0)}% up` : "—"}
                sub={`${s.samples} samples`}
              />
            </div>

            {s.meta ? (
              <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                <span className="text-foreground font-medium">Meta-labeling on:</span> a second model predicts whether
                each signal is <em>correct</em> — it vetoes weak signals and sizes the bets that pass. Accuracy{" "}
                {(s.meta.validationAccuracy * 100).toFixed(1)}% on {s.meta.samples} signals · approves{" "}
                {(s.meta.coverage * 100).toFixed(0)}% of signals.
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Meta-labeling: not enough signal history to fit the bet-sizing model yet.</p>
            )}

            <div>
              <p className="text-xs text-muted-foreground mb-2">What the model learned (feature weights)</p>
              <div className="space-y-1.5">
                {s.featureImportances.map((f) => (
                  <div key={f.name} className="flex items-center gap-2 text-xs">
                    <span className="w-28 text-muted-foreground truncate">{f.name}</span>
                    <div className="flex-1 h-2 rounded bg-muted relative overflow-hidden">
                      <div
                        className={`absolute top-0 h-full ${f.weight >= 0 ? "bg-gain left-1/2" : "bg-loss right-1/2"}`}
                        style={{ width: `${(Math.abs(f.weight) / maxWeight) * 50}%` }}
                      />
                      <div className="absolute left-1/2 top-0 h-full w-px bg-border" />
                    </div>
                    <span className={`w-12 text-right ${f.weight >= 0 ? "text-gain" : "text-loss"}`}>{f.weight.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Green = higher value pushes toward "buy"; red = toward "sell".</p>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Not trained yet — press Retrain (needs enough market history).</p>
        )}

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{s?.trainedAt ? `Last trained ${timeAgo(s.trainedAt)}` : ""}</span>
          <Button onClick={() => train.mutate()} disabled={train.isPending}>
            {train.isPending ? "Training…" : "Retrain now"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          The model refuses to trade unless its purged out-of-sample accuracy beats both{" "}
          {((s?.tradableFloor ?? 0.52) * 100).toFixed(0)}% and the majority-class baseline — so it can't be fooled by a
          one-sided market. On real markets, expect the edge to be small; signal prediction is genuinely hard, which is
          why this gate exists.
        </p>
      </CardContent>
    </Card>
  );
}

function MlStat({ label, value, sub, positive }: { label: string; value: string; sub?: string; positive?: boolean }) {
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold ${positive === undefined ? "text-foreground" : positive ? "text-gain" : "text-amber-600"}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function ProposalCard({
  p,
  onApply,
  onReject,
  busy,
}: {
  p: ImprovementProposal;
  onApply: () => void;
  onReject: () => void;
  busy: boolean;
}) {
  return (
    <div className="rounded-lg border bg-muted/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge variant={p.kind === "param" ? "default" : "secondary"} className={p.kind === "param" ? "bg-gain hover:bg-gain/90" : ""}>
            {p.kind === "param" ? "parameters" : "code idea"}
          </Badge>
          <span className="text-sm font-medium">{p.title}</span>
        </div>
        <span className="text-xs text-muted-foreground">{p.source === "ai" ? "Claude" : "optimizer"}</span>
      </div>
      <p className="text-sm text-muted-foreground mt-2">{p.rationale}</p>

      {p.kind === "param" && p.proposedParams && p.currentParams && (
        <div className="mt-2 text-xs flex flex-wrap gap-x-4 gap-y-1">
          {Object.keys(p.proposedParams).map((k) => (
            <span key={k}>
              {k}: <span className="text-muted-foreground">{fmtNum(p.currentParams![k])}</span> →{" "}
              <span className="text-primary font-medium">{fmtNum(p.proposedParams![k])}</span>
            </span>
          ))}
        </div>
      )}
      {p.validation && (
        <p className="mt-2 text-xs text-muted-foreground">
          Out-of-sample: {pct(p.validation.outOfSampleReturn)} vs current {pct(p.validation.baselineOutOfSampleReturn)}
          {" · "}
          <span className="text-gain">+{pct(p.validation.improvement)} edge</span> over {p.validation.outOfSampleTrades} trades
          {p.validation.pbo !== undefined && (
            <>
              {" · "}overfit prob (PBO){" "}
              <span className={p.validation.pbo <= 0.05 ? "text-gain" : "text-loss"}>{(p.validation.pbo * 100).toFixed(1)}%</span>
            </>
          )}
          {p.validation.deflatedSharpe !== undefined && <> · DSR {(p.validation.deflatedSharpe * 100).toFixed(0)}%</>}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        {p.kind === "param" && (
          <Button size="sm" className="h-8 bg-gain hover:bg-gain/90" onClick={onApply} disabled={busy}>
            Apply
          </Button>
        )}
        <Button variant="outline" size="sm" className="h-8" onClick={onReject} disabled={busy}>
          {p.kind === "param" ? "Reject" : "Dismiss"}
        </Button>
      </div>
    </div>
  );
}

function ProposalStatusBadge({ status }: { status: string }) {
  const variant = status === "applied" || status === "auto_applied" ? "default" : status === "pending" ? "secondary" : "outline";
  return (
    <Badge variant={variant} className="text-xs">
      {status.replace("_", " ")}
    </Badge>
  );
}
