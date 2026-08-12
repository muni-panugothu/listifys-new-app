import { Stack } from "@/lib/safe-router";

import { EventsCategoryStoryScreen } from "@/features/events/screens/events-category-story-screen";

export default function EventsCategoryStoryRoute() {
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
          presentation: "fullScreenModal",
          animation: "fade",
        }}
      />
      <EventsCategoryStoryScreen />
    </>
  );
}
