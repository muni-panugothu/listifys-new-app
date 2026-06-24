import { Stack } from "@/lib/safe-router";

import { AboutListifyScreen } from "../features/profile/screens/about-listify-screen";

export default function AboutListifyRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AboutListifyScreen />
    </>
  );
}
