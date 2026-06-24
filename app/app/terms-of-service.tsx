import { Stack } from "@/lib/safe-router";

import { TermsOfServiceScreen } from "../features/profile/screens/terms-of-service-screen";

export default function TermsOfServiceRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <TermsOfServiceScreen />
    </>
  );
}
