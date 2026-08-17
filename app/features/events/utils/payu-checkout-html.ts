export type PayuPaymentSession = {
  provider: "payu";
  actionUrl: string;
  fields: Record<string, string>;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** In-app bootstrap — posts directly to PayU (no Listifys backend URL visible). */
export function buildPayuLaunchHtml(session: PayuPaymentSession) {
  const inputs = Object.entries(session.fields)
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`,
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
</head>
<body style="margin:0;background:#ffffff">
  <form id="payu" method="post" action="${escapeHtml(session.actionUrl)}">
    ${inputs}
  </form>
  <script>document.getElementById("payu").submit();<\/script>
</body>
</html>`;
}

export const PAYU_CHECKOUT_RETURN_SCHEME = "listifyapp://event-payment";

export type PayuCheckoutReturn = {
  orderId: string;
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

export function parsePayuReturnUrl(url: string): PayuCheckoutReturn | "cancelled" | null {
  if (!url.startsWith(PAYU_CHECKOUT_RETURN_SCHEME)) return null;

  try {
    const query = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
    const params = new URLSearchParams(query);
    if (params.get("cancelled") === "1") return "cancelled";

    const orderId = params.get("orderId");
    const paymentId = params.get("razorpay_payment_id");
    const txnId = params.get("razorpay_order_id");
    const signature = params.get("razorpay_signature");

    if (orderId && paymentId && txnId && signature) {
      return {
        orderId,
        razorpay_payment_id: paymentId,
        razorpay_order_id: txnId,
        razorpay_signature: signature,
      };
    }
  } catch {
    return null;
  }

  return null;
}

export function isPayuHostedUrl(url: string) {
  return url.includes("payu.in");
}

export function isPayuReturnBridgeUrl(url: string) {
  return url.includes("/api/event-tickets/payu/return/");
}

/** Block backend callback / Render host after PayU — verify in-app instead of loading the page. */
export function shouldInterceptPostPaymentUrl(url: string, paymentStarted: boolean) {
  if (parsePayuReturnUrl(url)) return true;
  if (isPayuReturnBridgeUrl(url)) return true;
  if (!paymentStarted) return false;
  try {
    const { hostname } = new URL(url);
    if (hostname.includes("onrender.com")) return true;
  } catch {
    return false;
  }
  return false;
}
