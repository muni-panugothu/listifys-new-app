import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

import { getPayuLaunchBaseUrl } from "@/constants/payment";
import type { PayuCheckoutReturn } from "@/features/events/utils/payu-checkout-html";

export type PayuCheckoutOutcome =
  | { status: "success"; result: PayuCheckoutReturn }
  | { status: "cancelled"; message?: string }
  | { status: "error"; message: string };

/**
 * Fallback when react-native-webview is not in the dev client binary.
 * Opens PayU via HTTPS Render launch page (not LAN / backend IP).
 */
export async function openPayuCheckoutBrowser(
  orderId: string,
  checkoutToken: string,
): Promise<PayuCheckoutOutcome> {
  const launchBase = getPayuLaunchBaseUrl();
  const checkoutUrl = `${launchBase}/api/event-tickets/checkout/${orderId}/page?token=${encodeURIComponent(checkoutToken)}`;
  const redirectUrl = Linking.createURL("event-payment");

  const session = await WebBrowser.openAuthSessionAsync(checkoutUrl, redirectUrl, {
    showInRecents: false,
    preferEphemeralSession: true,
  });

  if (session.type === "cancel" || session.type === "dismiss") {
    return { status: "cancelled" };
  }

  if (session.type !== "success" || !session.url) {
    return { status: "error", message: "Payment session did not complete" };
  }

  const { queryParams } = Linking.parse(session.url);
  if (queryParams?.cancelled === "1") {
    return {
      status: "cancelled",
      message: typeof queryParams.message === "string" ? queryParams.message : undefined,
    };
  }

  const paymentId = queryParams?.razorpay_payment_id;
  const txnId = queryParams?.razorpay_order_id;
  const signature = queryParams?.razorpay_signature;
  const resolvedOrderId = queryParams?.orderId || orderId;

  if (
    typeof paymentId === "string" &&
    typeof txnId === "string" &&
    typeof signature === "string" &&
    typeof resolvedOrderId === "string"
  ) {
    return {
      status: "success",
      result: {
        orderId: resolvedOrderId,
        razorpay_payment_id: paymentId,
        razorpay_order_id: txnId,
        razorpay_signature: signature,
      },
    };
  }

  return { status: "error", message: "Invalid payment response" };
}
