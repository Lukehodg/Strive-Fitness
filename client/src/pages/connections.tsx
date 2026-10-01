import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Circle,
  Mail,
  ShieldCheck,
  ArrowUpRight,
} from "lucide-react";
import { Link } from "wouter";
type Connection = {
  connected: boolean;
  last_sync: string | null;
  status: string;
};
export default function Connections() {
  const { data, isPending, isError, refetch } = useQuery<
    Record<string, Connection>
  >({ queryKey: ["/api/connections"] });
  return (
    <div className="page-stack">
      <header className="page-heading">
        <p className="eyebrow">YOUR DATA, YOUR CONTROL</p>
        <h1>Better together.</h1>
        <p>
          One place for your devices and email. Every connection will show what
          is shared and when it last synced.
        </p>
      </header>
      {isError && (
        <div role="alert" className="surface">
          Could not load connection status.{" "}
          <button onClick={() => refetch()}>Retry</button>
        </div>
      )}
      <div className="connection-grid">
        {[
          {
            id: "whoop",
            name: "WHOOP",
            icon: Activity,
            description: "Recovery, sleep, strain and workout history.",
            tag: "WEARABLE",
          },
          {
            id: "oura",
            name: "Oura",
            icon: Circle,
            description: "Readiness, sleep and activity in your daily picture.",
            tag: "WEARABLE",
          },
          {
            id: "gmail",
            name: "Gmail",
            icon: Mail,
            description: "Turn selected fitness emails into reviewable drafts.",
            tag: "EMAIL",
          },
          {
            id: "outlook",
            name: "Outlook",
            icon: Mail,
            description: "Bring selected plans and updates into Strive.",
            tag: "EMAIL",
          },
        ].map(({ id, name, icon: Icon, description, tag }) => (
          <article className="surface connection-card" key={id}>
            <div className="connection-top">
              <span className="connection-icon">
                <Icon size={24} />
              </span>
              <span className="eyebrow">{tag}</span>
            </div>
            <h2>{name}</h2>
            <p className="muted">{description}</p>
            <div className="connection-state">
              <span className="status-dot" />
              {isPending
                ? "Checking status…"
                : data?.[id]
                  ? "Not connected"
                  : "Status unavailable"}
            </div>
            <button className="secondary-action" disabled>
              {isPending ? "Loading…" : "Connection setup coming next"}
            </button>
          </article>
        ))}
      </div>
      <section className="surface connection-privacy">
        <ShieldCheck size={24} />
        <div>
          <h2>Permission before connection.</h2>
          <p className="muted">
            No wearable or mailbox has been connected. Manual tracking is
            available now. WHOOP and Oura OAuth setup is the next implementation
            milestone.
          </p>
          <Link href="/workouts" className="inline-link">
            Build your first workout <ArrowUpRight size={16} />
          </Link>
        </div>
      </section>
    </div>
  );
}
