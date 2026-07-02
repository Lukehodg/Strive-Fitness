import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { colors, fonts } from "@/components/theme";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useUnreadTotal } from "@/hooks/useUnread";

export default function TabsLayout() {
  // Register for push once the user is past the auth gate.
  usePushNotifications();
  const unreadTotal = useUnreadTotal();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ember,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontFamily: fonts.mono,
          fontSize: 10,
          letterSpacing: 0.5,
          textTransform: "uppercase",
        },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Discover",
          tabBarIcon: ({ color, size }) => <Ionicons name="compass" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="nearby"
        options={{
          title: "Nearby",
          tabBarIcon: ({ color, size }) => <Ionicons name="map" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: "Events",
          tabBarIcon: ({ color, size }) => <Ionicons name="trophy" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="my-games"
        options={{
          title: "My Games",
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} />,
          tabBarBadge: unreadTotal > 0 ? unreadTotal : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.primary,
            color: colors.primaryText,
            fontFamily: fonts.monoBold,
            fontSize: 10,
          },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
