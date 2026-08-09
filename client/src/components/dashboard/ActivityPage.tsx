import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import { KindBadge, Empty } from "./shared";

export function ActivityPage() {
  const decisions = useQuery({ queryKey: ["/api/decisions"], queryFn: api.decisions, refetchInterval: 4000 });

  return (
    <Card>
      <CardContent className="p-0">
        {decisions.data?.length ? (
          <ul className="divide-y">
            {decisions.data.map((d) => (
              <li key={d.id} className="px-4 py-3 flex items-start gap-3 text-sm">
                <KindBadge kind={d.kind} />
                <span className="flex-1 text-foreground">{d.message}</span>
                <span className="text-xs text-muted-foreground whitespace-nowrap tabular">
                  {new Date(d.time).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty text="No activity yet." />
        )}
      </CardContent>
    </Card>
  );
}
