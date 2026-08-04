import { Stack } from "@/lib/safe-router";

import { EventsCategoryScreen } from "@/features/search/screens/events-category-screen";

export default function EventsCategoryRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <EventsCategoryScreen />
    </>
  );
}
