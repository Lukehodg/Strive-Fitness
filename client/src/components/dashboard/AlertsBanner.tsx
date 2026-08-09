import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const REFRESH_MS = 4000;

/**
 * Shown at the shell level, above whichever page is active — not scoped to
 * Overview. An unacknowledged CRITICAL alert (e.g. the kill-switch tripping)
 * is exactly the kind of thing that must stay visible no matter which sidebar
 * item you're looking at.
 */
export function AlertsBanner() {
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
      ? "border-destructive/30 bg-loss-soft"
      : worst === "warning"
        ? "border-amber-300 bg-amber-50"
        : "bg-muted/40";

  return (
    <div className={cn("rounded-lg border p-4", styles)}>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <p className="font-semibold text-foreground">
            {unacked.length} alert{unacked.length > 1 ? "s" : ""}
            {!alerts.data?.telegramConfigured && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                (set TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID for phone pushes)
              </span>
            )}
          </p>
          <ul className="text-sm space-y-0.5">
            {unacked.slice(0, 4).map((a) => (
              <li key={a.id} className="text-foreground truncate">
                <span className={a.level === "critical" ? "text-loss" : a.level === "warning" ? "text-amber-700" : "text-muted-foreground"}>
                  [{a.level}]
                </span>{" "}
                <span className="font-medium">{a.title}</span> — {a.message}
              </li>
            ))}
            {unacked.length > 4 && <li className="text-muted-foreground">…and {unacked.length - 4} more</li>}
          </ul>
        </div>
        <Button variant="outline" size="sm" className="shrink-0" onClick={() => ack.mutate()} disabled={ack.isPending}>
          Acknowledge all
        </Button>
      </div>
    </div>
  );
}
