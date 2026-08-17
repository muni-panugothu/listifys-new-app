export type PayuPaymentSession = {
  provider: "payu";
  actionUrl: string;
  fields: Record<string, string>;
  testMode?: boolean;
  /** PayU test sandbox: auto-submit 3DS OTP (123456) so user never sees simulator. */
  testAutoOtp?: boolean;
  testGuide?: {
    mode: "netbanking" | "card";
    title: string;
    steps: string[];
  };
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

export function isPayuFailureBridgeUrl(url: string) {
  return url.includes("/api/event-tickets/payu/return/failure");
}

export function isPayuSuccessBridgeUrl(url: string) {
  return url.includes("/api/event-tickets/payu/return/success");
}

/** Only block app deep-link returns — PayU surl/furl must load so PayU marks payment success. */
export function shouldBlockWebViewNavigation(url: string) {
  return Boolean(parsePayuReturnUrl(url));
}

export function isPayuReturnInProgress(url: string, paymentStarted: boolean) {
  if (!paymentStarted) return false;
  return isPayuSuccessBridgeUrl(url) || url.startsWith(PAYU_CHECKOUT_RETURN_SCHEME);
}

/** PayU test card 3DS2 / OTP challenge pages (hide + auto-complete in test mode). */
export function isPayu3dsChallengeUrl(url: string) {
  const u = url.toLowerCase();
  if (!u.includes("payu") && !u.includes("cyber") && !u.includes("acs")) {
    if (!u.includes("3ds") && !u.includes("securecode")) return false;
  }
  return (
    u.includes("3ds") ||
    u.includes("cyber") ||
    u.includes("acs") ||
    u.includes("securecode") ||
    u.includes("simulator") ||
    u.includes("otpauth")
  );
}

/** Injected into PayU WebView — fills test OTP 123456 and taps Pay on 3DS simulator. */
export function buildPayuTestOtpAutoSubmitScript() {
  return `(function(){var OTP="123456";function looksLikeOtp(){try{var t=(document.title||"").toUpperCase();var b=(document.body&&document.body.innerText||"").toUpperCase();return t.indexOf("3DS")>=0||b.indexOf("3DS2")>=0||b.indexOf("CYBER")>=0||b.indexOf("ENTER THE OTP")>=0||b.indexOf("PLEASE ENTER THE OTP")>=0;}catch(e){return false;}}function notify(){try{if(looksLikeOtp()&&window.ReactNativeWebView){window.ReactNativeWebView.postMessage("payu-otp-challenge");}}catch(e){}}function run(){notify();if(!looksLikeOtp())return;var inputs=document.querySelectorAll("input");for(var i=0;i<inputs.length;i++){var el=inputs[i];var type=(el.type||"text").toLowerCase();if(type==="hidden"||type==="submit"||type==="button")continue;el.value=OTP;el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));}var nodes=document.querySelectorAll("button,input[type=submit],a");for(var j=0;j<nodes.length;j++){var btn=nodes[j];var label=(btn.innerText||btn.value||"").trim().toUpperCase();if(label==="PAY"||label.indexOf("SUBMIT")>=0){btn.click();break;}}}run();setInterval(run,450);})();true;`;
}

export const PAYU_WEBVIEW_OTP_CHALLENGE_MESSAGE = "payu-otp-challenge";
