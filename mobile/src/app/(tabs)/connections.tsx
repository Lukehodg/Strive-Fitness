import { useState } from "react";
import { router } from "expo-router";
import { Alert, RefreshControl } from "react-native";
import * as WebBrowser from "expo-web-browser";
import {
  Screen,
  Heading,
  Card,
  Copy,
  Feedback,
  Action,
  colors,
} from "../../components/ui";
import { useResource } from "../../lib/use-resource";
import { useSession } from "../../lib/session";
import { request } from "../../lib/api";
type Provider = "whoop" | "oura";
type Connection = {
  configured: boolean;
  canDisconnect: boolean;
  connected: boolean;
  status: string;
  last_sync: string | null;
  latestDay: string | null;
  lastError: string | null;
  syncing: boolean;
  queued: boolean;
};
const labels = { whoop: "WHOOP", oura: "Oura" };
export default function Connections() {
  const { token } = useSession();
  const { data, error, loading, reload } =
    useResource<Record<Provider, Connection>>("/api/connections");
  const [busy, setBusy] = useState<Provider | null>(null);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  async function perform(
    provider: Provider,
    operation: "connect" | "sync" | "disconnect",
  ) {
    setBusy(provider);
    setMessage("");
    setFailed(false);
    try {
      if (operation === "connect") {
        const attempt = await request<{
          authorizationUrl: string;
          attemptId: string;
          claimToken: string;
        }>(`/api/connections/${provider}/authorize`, token, "POST");
        const result = await WebBrowser.openAuthSessionAsync(
          attempt.authorizationUrl,
          "strivefitness://connections",
        );
        if (result.type !== "success") {
          setMessage("Sign-in cancelled. No new account was connected.");
          return;
        }
        const callback = new URL(result.url);
        if (
          callback.protocol !== "strivefitness:" ||
          callback.hostname !== "connections" ||
          callback.searchParams.get("attempt") !== attempt.attemptId
        )
          throw new Error(
            "The sign-in response did not match. Please connect again.",
          );
        if (callback.searchParams.get("status") !== "ready") {
          setMessage(
            "Access was not granted. You can try connecting again whenever you're ready.",
          );
          return;
        }
        await request(`/api/connections/${provider}/complete`, token, "POST", {
          attemptId: attempt.attemptId,
          claimToken: attempt.claimToken,
        });
        setMessage(
          `${labels[provider]} connected. The first sync is queued; pull down shortly to see the result.`,
        );
      } else {
        const result = await request<{ message?: string }>(
          `/api/connections/${provider}${operation === "sync" ? "/sync" : ""}`,
          token,
          operation === "sync" ? "POST" : "DELETE",
        );
        setMessage(
          result.message || "Sync queued. Pull down shortly to check progress.",
        );
      }
    } catch (err) {
      setFailed(true);
      setMessage(
        err instanceof Error
          ? err.message
          : "Could not update this connection.",
      );
    } finally {
      setBusy(null);
      await reload();
    }
  }
  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={() => {
            void reload();
          }}
          tintColor={colors.accent}
        />
      }
    >
      <Heading
        eyebrow="YOUR CONNECTED HEALTH"
        title="Connect what matters."
        subtitle="Your recovery and sleep, together. You control the connection."
      />
      <Feedback message={error} error />
      <Feedback message={message} error={failed} />
      {(["whoop", "oura"] as const).map((provider) => {
        const connection = data?.[provider];
        return (
          <Card key={provider}>
            <Copy strong>{labels[provider]}</Copy>
            <Copy>
              {provider === "whoop"
                ? "Recovery score, sleep and HRV."
                : "Readiness score, sleep and HRV."}
            </Copy>
            {!connection ? (
              <Copy>
                {loading ? "Checking connection…" : "Pull down to retry."}
              </Copy>
            ) : (
              <>
                <Copy>
                  {connection.status === "not_configured"
                    ? "Setup pending"
                    : connection.status === "reconnect_required"
                      ? "Reconnect required"
                      : connection.connected
                        ? "Connected"
                        : "Not connected"}
                </Copy>
                {connection.last_sync && (
                  <Copy>
                    Last synced{" "}
                    {new Date(connection.last_sync).toLocaleString()}
                  </Copy>
                )}
                {connection.latestDay && (
                  <Copy>Latest reading: {connection.latestDay}</Copy>
                )}
                {connection.syncing || connection.queued ? (
                  <Copy>
                    Sync {connection.syncing ? "in progress" : "queued"} · pull
                    down to refresh
                  </Copy>
                ) : null}
                {connection.lastError && (
                  <Copy>
                    {connection.status === "reconnect_required"
                      ? "Access expired or was revoked. Reconnect to resume importing."
                      : "The last sync could not finish. Your previous readings are kept and a retry is scheduled."}
                  </Copy>
                )}
                {!connection.configured ? (
                  <Copy>
                    Strive provider setup must be completed before sign-in is
                    available.
                  </Copy>
                ) : (
                  <Action
                    label={
                      busy === provider
                        ? "Working…"
                        : connection.connected
                          ? "Sync now"
                          : connection.status === "reconnect_required"
                            ? "Reconnect"
                            : `Connect ${labels[provider]}`
                    }
                    disabled={
                      busy !== null || connection.syncing || connection.queued
                    }
                    onPress={() => {
                      void perform(
                        provider,
                        connection.connected ? "sync" : "connect",
                      );
                    }}
                  />
                )}
                {connection.canDisconnect && (
                  <Action
                    secondary
                    label="Disconnect & remove readings"
                    disabled={busy !== null || connection.syncing}
                    onPress={() =>
                      Alert.alert(
                        `Disconnect ${labels[provider]}?`,
                        "This stops syncing and removes imported readings from Strive. Your workouts and check-ins are kept.",
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Disconnect",
                            style: "destructive",
                            onPress: () => {
                              void perform(provider, "disconnect");
                            },
                          },
                        ],
                      )
                    }
                  />
                )}
              </>
            )}
          </Card>
        );
      })}
      <Copy>
        Connecting imports up to 30 days of recovery and sleep. Strive checks
        for updates every six hours while the server runs. Disconnect at any
        time.
      </Copy>
      <Card>
        <Copy strong>Gmail & Outlook</Copy>
        <Copy>Connect your mailbox, import selected messages for review and compose emails with an explicit send confirmation.</Copy>
        <Action label="Open email" onPress={() => router.push("/mail")} />
      </Card>
    </Screen>
  );
}
