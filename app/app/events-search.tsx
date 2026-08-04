import { Stack } from "@/lib/safe-router";

import { EventsSearchScreen } from "@/features/search/screens/events-search-screen";

export default function EventsSearchRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <EventsSearchScreen />
    </>
  );
}
