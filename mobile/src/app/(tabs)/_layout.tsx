import { Tabs } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "../../components/ui";
const tabs = [
  ["index", "Today", "today-outline"],
  ["train", "Train", "barbell-outline"],
  ["food", "Food", "restaurant-outline"],
  ["health", "Health", "heart-outline"],
  ["connections", "Connect", "link-outline"],
] as const;
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarHideOnKeyboard: true,
      }}
    >
      {tabs.map(([name, title, icon]) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name={icon} color={color} size={size} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
