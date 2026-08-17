import { Stack } from "@/lib/safe-router";
import { MyTicketsScreen } from "@/features/events/screens/my-tickets-screen";

export default function MyTicketsRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <MyTicketsScreen />
    </>
  );
}
