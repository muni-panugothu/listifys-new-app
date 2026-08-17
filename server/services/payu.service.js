const crypto = require("crypto");

function isPayuConfigured() {
  return Boolean(
    (process.env.PAYU_MERCHANT_KEY || "").trim() &&
      (process.env.PAYU_MERCHANT_SALT || "").trim(),
  );
}

function isPayuTestMode() {
  return (process.env.PAYU_ENV || "test").trim().toLowerCase() !== "production";
}

function getMerchantKey() {
  return (process.env.PAYU_MERCHANT_KEY || "").trim();
}

function getMerchantSalt() {
  return (process.env.PAYU_MERCHANT_SALT || "").trim();
}

function getPayuPaymentUrl() {
  return isPayuTestMode()
    ? "https://test.payu.in/_payment"
    : "https://secure.payu.in/_payment";
}

/** PayU expects amount in rupees with 2 decimal places. */
function paiseToPayuAmount(paise) {
  return (Math.round(paise) / 100).toFixed(2);
}

function getCallbackBaseUrl() {
  const payuCallback = (process.env.PAYU_CALLBACK_BASE_URL || "").trim();
  if (payuCallback) return payuCallback.replace(/\/$/, "");
  const explicit = (process.env.PUBLIC_API_BASE_URL || "").trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const port = process.env.PORT || 5000;
  return `http://localhost:${port}`;
}

function getPublicApiBaseUrl() {
  return getCallbackBaseUrl();
}

function buildPaymentSession({
  orderId,
  txnid,
  amountPaise,
  productinfo,
  firstname,
  email,
  phone,
}) {
  const key = getMerchantKey();
  const amount = paiseToPayuAmount(amountPaise);
  const udf1 = String(orderId);
  const hash = generateRequestHash({
    key,
    txnid,
    amount,
    productinfo,
    firstname,
    email,
    udf1,
  });

  const apiBase = getCallbackBaseUrl();
  return {
    provider: "payu",
    actionUrl: getPayuPaymentUrl(),
    fields: {
      key,
      txnid,
      amount,
      productinfo,
      firstname,
      email,
      phone,
      surl: `${apiBase}/api/event-tickets/payu/return/success`,
      furl: `${apiBase}/api/event-tickets/payu/return/failure`,
      udf1,
      hash,
    },
  };
}

async function verifyTransactionWithPayu(txnid) {
  const key = getMerchantKey();
  const salt = getMerchantSalt();
  if (!key || !salt || !txnid) {
    return { verified: false, reason: "not_configured" };
  }

  const command = "verify_payment";
  const var1 = String(txnid);
  const hash = crypto
    .createHash("sha512")
    .update(`${key}|${command}|${var1}|${salt}`)
    .digest("hex");

  const endpoint = isPayuTestMode()
    ? "https://test.payu.in/merchant/postservice?form=2"
    : "https://info.payu.in/merchant/postservice?form=2";

  const body = new URLSearchParams({ key, command, var1, hash });

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const text = await res.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { verified: false, reason: "invalid_response" };
    }

    if (parsed.status !== 1) {
      return { verified: false, reason: parsed.msg || "verify_failed" };
    }

    const details = parsed.transaction_details?.[var1];
    if (!details) {
      return { verified: false, reason: "transaction_not_found" };
    }

    const status = String(details.status || "").toLowerCase();
    const amountRupees = parseFloat(details.amt || details.transaction_amount || "0");
    return {
      verified: status === "success",
      status,
      amountPaise: Math.round(amountRupees * 100),
      paymentId: details.mihpayid || details.bank_ref_num || null,
      reason: status !== "success" ? status : undefined,
    };
  } catch (err) {
    return { verified: false, reason: err.message || "network_error" };
  }
}

function generateRequestHash({
  key,
  txnid,
  amount,
  productinfo,
  firstname,
  email,
  udf1 = "",
  udf2 = "",
  udf3 = "",
  udf4 = "",
  udf5 = "",
}) {
  const salt = getMerchantSalt();
  const hashString = `${key}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|${udf1}|${udf2}|${udf3}|${udf4}|${udf5}||||||${salt}`;
  return crypto.createHash("sha512").update(hashString).digest("hex");
}

function verifyResponseHash(params) {
  const salt = getMerchantSalt();
  const key = getMerchantKey();
  const {
    status,
    udf5 = "",
    udf4 = "",
    udf3 = "",
    udf2 = "",
    udf1 = "",
    email = "",
    firstname = "",
    productinfo = "",
    amount = "",
    txnid = "",
    hash: receivedHash = "",
  } = params;

  if (!receivedHash) return false;

  const hashString = `${salt}|${status}||||||${udf5}|${udf4}|${udf3}|${udf2}|${udf1}|${email}|${firstname}|${productinfo}|${amount}|${txnid}|${key}`;
  const expected = crypto.createHash("sha512").update(hashString).digest("hex");
  return expected === receivedHash;
}

function verifyPaymentForOrder(order, user, params) {
  const txnid = params.txnid || params.razorpayOrderId;
  const paymentId = params.mihpayid || params.razorpayPaymentId;
  const hash = params.hash || params.razorpaySignature;

  if (!txnid || !paymentId || !hash) return false;
  if (txnid !== order.bookingId && txnid !== order.razorpayOrderId) return false;

  const productinfo = `${order.ticketTypeName} x ${order.quantity}`.slice(0, 100);
  return verifyResponseHash({
    status: "success",
    txnid,
    amount: paiseToPayuAmount(order.totalAmountPaise),
    productinfo,
    firstname: (user?.name || "Listifys User").slice(0, 60),
    email: (user?.email || "guest@listifys.app").slice(0, 60),
    udf1: String(order._id),
    hash,
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHostedCheckoutHtml(params) {
  const session = buildPaymentSession(params);
  const inputs = Object.entries(session.fields)
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PayU Checkout</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #f6f7f8; margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { background: #fff; border-radius: 16px; padding: 28px 24px; max-width: 360px; width: 90%; text-align: center; box-shadow: 0 8px 30px rgba(0,0,0,.08); }
    h1 { font-size: 18px; margin: 0 0 8px; color: #111; }
    p { font-size: 14px; color: #666; margin: 0 0 20px; line-height: 1.5; }
    button { width: 100%; background: #27BB97; color: #fff; border: 0; border-radius: 999px; padding: 14px 16px; font-size: 16px; font-weight: 600; cursor: pointer; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Continue to PayU</h1>
    <p>Secure payment for your Listifys ticket booking.</p>
    <form id="payuForm" method="post" action="${escapeHtml(session.actionUrl)}">
      ${inputs}
      <button type="submit">Pay with PayU</button>
    </form>
  </div>
  <script>
    setTimeout(function () {
      var form = document.getElementById("payuForm");
      if (form) form.submit();
    }, 400);
  <\/script>
</body>
</html>`;
}

module.exports = {
  isPayuConfigured,
  isPayuTestMode,
  getMerchantKey,
  getPayuPaymentUrl,
  paiseToPayuAmount,
  getPublicApiBaseUrl,
  generateRequestHash,
  verifyResponseHash,
  verifyPaymentForOrder,
  buildHostedCheckoutHtml,
  buildPaymentSession,
  verifyTransactionWithPayu,
  getCallbackBaseUrl,
};
