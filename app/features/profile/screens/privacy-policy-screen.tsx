import { useRouter } from "@/lib/safe-router";

import { LegalDocumentView } from "@/components/legal-document-view";
import { PRIVACY_POLICY } from "@/constants/legal-content";

export function PrivacyPolicyScreen() {
  const router = useRouter();

  return (
    <LegalDocumentView
      document={PRIVACY_POLICY}
      onBack={() => {
        if (router.canGoBack()) {
          router.back();
          return;
        }
        router.replace("/app-settings");
      }}
    />
  );
}
