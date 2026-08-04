import { Tabs } from "expo-router";

import { MainTabBar } from "@/components/main-tab-bar";
import { useTheme } from "@/providers/theme-provider";

export default function MainTabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      tabBar={(props) => <MainTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        animation: "fade",
        lazy: true,
        sceneStyle: { backgroundColor: colors.background },
        // Disabled so inactive tabs still re-render when the theme context changes.
        freezeOnBlur: false,
      }}
    >
      <Tabs.Screen name="home-feed-root" />
      <Tabs.Screen name="search-home" />
      <Tabs.Screen name="sell-entry" />
      <Tabs.Screen name="dashboard-home" />
    </Tabs>
  );
}
