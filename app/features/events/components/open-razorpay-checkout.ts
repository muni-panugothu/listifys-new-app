import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

import { AUTH_API_BASE_URL } from "@/features/auth/services/auth-api";

export type RazorpayCheckoutResult = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

export type RazorpayCheckoutOutcome =
  | { status: "success"; result: RazorpayCheckoutResult }
  | { status: "cancelled"; message?: string }
  | { status: "error"; message: string };

export async function openRazorpayCheckout(
  orderId: string,
  checkoutToken: string,
): Promise<RazorpayCheckoutOutcome> {
  const checkoutUrl = `${AUTH_API_BASE_URL}/api/event-tickets/checkout/${orderId}/page?token=${encodeURIComponent(checkoutToken)}`;
  const redirectUrl = Linking.createURL("event-payment");

  const session = await WebBrowser.openAuthSessionAsync(checkoutUrl, redirectUrl);

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
  const razorpayOrderId = queryParams?.razorpay_order_id;
  const signature = queryParams?.razorpay_signature;

  if (
    typeof paymentId === "string" &&
    typeof razorpayOrderId === "string" &&
    typeof signature === "string"
  ) {
    return {
      status: "success",
      result: {
        razorpay_payment_id: paymentId,
        razorpay_order_id: razorpayOrderId,
        razorpay_signature: signature,
      },
    };
  }

  return { status: "error", message: "Invalid payment response" };
}
