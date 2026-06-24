import { useRouter } from "@/lib/safe-router";

import { LegalDocumentView } from "@/components/legal-document-view";
import { TERMS_OF_SERVICE } from "@/constants/legal-content";

export function TermsOfServiceScreen() {
  const router = useRouter();

  return (
    <LegalDocumentView
      document={TERMS_OF_SERVICE}
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
