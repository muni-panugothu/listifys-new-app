import { Tabs } from "expo-router";

import { MainTabBar } from "@/components/main-tab-bar";

export default function MainTabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <MainTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        animation: "fade",
        lazy: true,
        sceneStyle: { backgroundColor: "#F6F7F8" },
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
