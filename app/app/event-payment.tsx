import { ActivityIndicator, Text, View } from "react-native";
import { type Href, useLocalSearchParams, useRouter } from "@/lib/safe-router";
import { useEffect, useRef } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { verifyEventPayment } from "@/features/events/services/event-ticketing-api";
import { ListifyFonts } from "@/constants/typography";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { useTheme } from "@/providers/theme-provider";

/** Deep-link landing when PayU returns while the app was backgrounded or cold-started. */
export default function EventPaymentScreen() {
  const params = useLocalSearchParams<{
    orderId?: string;
    razorpay_payment_id?: string;
    razorpay_order_id?: string;
    razorpay_signature?: string;
    cancelled?: string;
    message?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    async function run() {
      if (params.cancelled === "1") {
        if (params.message) {
          showErrorToast("Payment cancelled", params.message);
        }
        router.replace("/(tabs)/dashboard-home" as Href);
        return;
      }

      const orderId = params.orderId;
      const paymentId = params.razorpay_payment_id;
      const txnId = params.razorpay_order_id;
      const signature = params.razorpay_signature;

      if (!orderId || !paymentId || !txnId || !signature) {
        showErrorToast("Payment incomplete", "Could not verify payment.");
        router.replace("/(tabs)/dashboard-home" as Href);
        return;
      }

      try {
        const confirmed = await verifyEventPayment({
          orderId,
          razorpayPaymentId: paymentId,
          razorpayOrderId: txnId,
          razorpaySignature: signature,
        });
        showSuccessToast("Payment successful", "Your ticket is ready");
        const ticketId = confirmed.ticket?.id;
        if (ticketId) {
          router.replace(`/event-ticket?ticketId=${ticketId}` as Href);
          return;
        }
        router.replace("/(tabs)/dashboard-home" as Href);
      } catch (e) {
        showErrorToast(
          "Verification failed",
          e instanceof Error ? e.message : "Please contact support",
        );
        router.replace("/(tabs)/dashboard-home" as Href);
      }
    }

    void run();
  }, [params, router]);

  return (
    <View
      style={{
        flex: 1,
        paddingTop: insets.top,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.background,
        gap: 12,
      }}
    >
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={{ fontFamily: ListifyFonts.medium, color: colors.textSecondary }}>
        Confirming your payment…
      </Text>
    </View>
  );
}
