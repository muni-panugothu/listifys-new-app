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
        sceneStyle: { backgroundColor: colors.tabCanvas },
        tabBarStyle: {
          position: "absolute",
          backgroundColor: colors.tabCanvas,
          borderTopWidth: 0,
          elevation: 0,
          shadowOpacity: 0,
        },
        // Freeze inactive tabs to avoid background re-renders during tab switches.
        freezeOnBlur: true,
      }}
    >
      <Tabs.Screen name="home-feed-root" />
      <Tabs.Screen name="search-home" />
      <Tabs.Screen name="sell-entry" />
      <Tabs.Screen name="dashboard-home" />
    </Tabs>
  );
}
