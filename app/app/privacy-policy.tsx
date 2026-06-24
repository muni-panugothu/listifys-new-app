import { Stack } from "@/lib/safe-router";

import { PrivacyPolicyScreen } from "../features/profile/screens/privacy-policy-screen";

export default function PrivacyPolicyRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <PrivacyPolicyScreen />
    </>
  );
}
