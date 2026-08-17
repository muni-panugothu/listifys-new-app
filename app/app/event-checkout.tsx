import { Stack } from "@/lib/safe-router";
import { EventCheckoutScreen } from "@/features/events/screens/event-checkout-screen";

export default function EventCheckoutRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false, presentation: "modal" }} />
      <EventCheckoutScreen />
    </>
  );
}
