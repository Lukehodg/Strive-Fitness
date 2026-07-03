import { useEffect } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";

import { Subheading } from "@/components/ui";
import { colors, fonts, radius, spacing } from "@/components/theme";
import { useAuth } from "@/hooks/useAuth";
import {
  useConnectStrava,
  useDisconnectStrava,
  useStravaAccount,
  useStravaActivities,
  useSyncStrava,
} from "@/hooks/useStrava";
import { env, isStravaConfigured } from "@/lib/env";
import {
  STRAVA_DISCOVERY,
  STRAVA_ORANGE,
  STRAVA_SCOPES,
  formatStravaDistance,
  formatStravaDuration,
  formatStravaEffort,
  stravaSportIcon,
  stravaSportLabel,
} from "@/lib/strava";
import type { StravaActivity } from "@/types/database";

// Lets the OAuth browser tab close cleanly on redirect back to the app.
WebBrowser.maybeCompleteAuthSession();

/** "Recent activity" block on the profile. Connect Strava, then show stats. */
export function StravaSection() {
  const { user } = useAuth();
  const account = useStravaAccount();
  const activities = useStravaActivities(user?.id);
  const connected = !!account.data;

  if (account.isLoading) return null;

  return (
    <View style={{ gap: spacing(3) }}>
      <View style={styles.headerRow}>
        <Subheading>Recent activity</Subheading>
        {connected ? <PoweredByStrava /> : null}
      </View>

      {!connected ? (
        <ConnectCta />
      ) : activities.data && activities.data.length > 0 ? (
        <>
          {activities.data.map((a: StravaActivity) => (
            <ActivityRow key={a.id} activity={a} />
          ))}
          <ConnectedFooter />
        </>
      ) : (
        <>
          <Text style={styles.muted}>
            No activities yet. Record one on Strava and pull to refresh.
          </Text>
          <ConnectedFooter />
        </>
      )}
    </View>
  );
}

function ConnectCta() {
  if (!isStravaConfigured) {
    return (
      <Text style={styles.muted}>
        Connect Strava to show your recent runs and rides here. (Add your Strava
        client id to enable — see SETUP.md.)
      </Text>
    );
  }
  return <StravaConnectButton />;
}

/** Isolated so `useAuthRequest` only runs when Strava is configured + unlinked. */
function StravaConnectButton() {
  const connect = useConnectStrava();
  const redirectUri = AuthSession.makeRedirectUri({ scheme: "turnout", path: "strava" });

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: env.stravaClientId,
      scopes: STRAVA_SCOPES,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      extraParams: { approval_prompt: "auto" },
    },
    STRAVA_DISCOVERY,
  );

  useEffect(() => {
    if (response?.type !== "success") return;
    const code = response.params.code;
    if (!code) return;
    connect.mutateAsync(code).catch((e) => {
      Alert.alert("Strava", e instanceof Error ? e.message : "Couldn't connect.");
    });
  }, [response, connect]);

  return (
    <Pressable
      style={({ pressed }) => [styles.connectBtn, { opacity: pressed || connect.isPending ? 0.85 : 1 }]}
      disabled={!request || connect.isPending}
      onPress={() => promptAsync()}
    >
      <Ionicons name="link" size={18} color="#fff" />
      <Text style={styles.connectText}>
        {connect.isPending ? "Connecting…" : "Connect Strava"}
      </Text>
    </Pressable>
  );
}

function ActivityRow({ activity }: { activity: StravaActivity }) {
  const effort = formatStravaEffort(activity);
  const date = activity.start_date
    ? new Date(activity.start_date).toLocaleDateString(undefined, { day: "numeric", month: "short" })
    : "";
  return (
    <View style={styles.row}>
      <View style={styles.iconWrap}>
        <Ionicons name={stravaSportIcon(activity.sport_type)} size={18} color={STRAVA_ORANGE} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>
          {activity.name ?? stravaSportLabel(activity.sport_type)}
        </Text>
        <Text style={styles.stats}>
          {[formatStravaDistance(activity.distance_m), formatStravaDuration(activity.moving_time_s), effort]
            .filter(Boolean)
            .join("  ·  ")}
        </Text>
      </View>
      {date ? <Text style={styles.date}>{date}</Text> : null}
    </View>
  );
}

function ConnectedFooter() {
  const sync = useSyncStrava();
  const disconnect = useDisconnectStrava();

  function onDisconnect() {
    Alert.alert("Disconnect Strava?", "Your activities will be removed from your profile.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disconnect",
        style: "destructive",
        onPress: () =>
          disconnect.mutateAsync().catch((e) =>
            Alert.alert("Strava", e instanceof Error ? e.message : "Couldn't disconnect."),
          ),
      },
    ]);
  }

  return (
    <View style={styles.footerRow}>
      <Pressable onPress={() => sync.mutateAsync().catch(() => {})} disabled={sync.isPending}>
        <Text style={styles.link}>{sync.isPending ? "Refreshing…" : "Refresh"}</Text>
      </Pressable>
      <Text style={styles.dot}>·</Text>
      <Pressable onPress={onDisconnect} disabled={disconnect.isPending}>
        <Text style={styles.link}>Disconnect</Text>
      </Pressable>
    </View>
  );
}

function PoweredByStrava() {
  // Strava brand requirement: attribute the data + link out.
  return (
    <Pressable onPress={() => Linking.openURL("https://www.strava.com")}>
      <Text style={styles.powered}>Powered by Strava</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  muted: { color: colors.textMuted, fontSize: 14, fontFamily: fonts.body },
  connectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing(2),
    height: 48,
    borderRadius: radius.md,
    backgroundColor: STRAVA_ORANGE,
  },
  connectText: { color: "#fff", fontFamily: fonts.display, fontSize: 15, letterSpacing: 0.2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(3),
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { color: colors.text, fontSize: 15, fontFamily: fonts.bodyBold },
  stats: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: fonts.mono,
    letterSpacing: 0.3,
    marginTop: 2,
  },
  date: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: fonts.mono,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  footerRow: { flexDirection: "row", alignItems: "center", gap: spacing(2), paddingTop: spacing(1) },
  link: { color: colors.ember, fontFamily: fonts.monoBold, fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase" },
  dot: { color: colors.textMuted },
  powered: { color: STRAVA_ORANGE, fontFamily: fonts.monoBold, fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase" },
});
