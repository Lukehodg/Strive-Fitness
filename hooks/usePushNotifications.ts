import { useEffect } from "react";
import { Platform } from "react-native";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    // shouldShowAlert is the legacy field; banner/list are the SDK 52 split.
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Registers for push and stores the Expo token in `push_tokens` for the
 * signed-in user. Reminders and chat nudges are sent from the
 * `send-notifications` Edge Function (Sprint 6). Call once from a screen mounted
 * behind auth (e.g. the tabs layout) when you wire notifications on.
 */
export function usePushNotifications() {
  const { user } = useAuth();
  const router = useRouter();

  // Deep-link when a notification is tapped. `data` is set by the
  // send-notifications Edge Function (type: invite | game | chat).
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as {
        type?: string;
        activityId?: string;
      };
      if (data?.type === "invite") {
        router.push("/invites");
      } else if (data?.type === "discover") {
        // Weekly digest / streak guard land on the Discover tab.
        router.push("/(tabs)");
      } else if (data?.activityId) {
        router.push({ pathname: "/game/[id]", params: { id: data.activityId } });
      }
    });
    return () => sub.remove();
  }, [router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      const { status: existing } = await Notifications.getPermissionsAsync();
      let status = existing;
      if (status !== "granted") {
        status = (await Notifications.requestPermissionsAsync()).status;
      }
      if (status !== "granted") return;

      const tokenResponse = await Notifications.getExpoPushTokenAsync();
      const token = tokenResponse.data;
      if (cancelled || !token) return;

      await supabase.from("push_tokens").upsert({
        user_id: user.id,
        token,
        platform: Platform.OS === "ios" ? "ios" : "android",
      });
    })().catch((e) => console.warn("[push] registration failed", e));

    return () => {
      cancelled = true;
    };
  }, [user]);
}
