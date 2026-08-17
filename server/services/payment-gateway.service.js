const payu = require("./payu.service");
const razorpay = require("./razorpay.service");

/** PayU is preferred when both are configured (matches Listifys production setup). */
function getActivePaymentProvider() {
  if (payu.isPayuConfigured()) return "payu";
  if (razorpay.isRazorpayConfigured()) return "razorpay";
  return null;
}

function isPaymentConfigured() {
  return getActivePaymentProvider() !== null;
}

function getPaymentConfigForClient() {
  const provider = getActivePaymentProvider();
  if (provider === "payu") {
    return {
      configured: true,
      provider: "payu",
      keyId: payu.getMerchantKey(),
      testMode: payu.isPayuTestMode(),
      testGuide: payu.getTestPaymentGuide(),
    };
  }
  if (provider === "razorpay") {
    return {
      configured: true,
      provider: "razorpay",
      keyId: razorpay.getPublicKeyId(),
    };
  }
  return { configured: false, provider: null, keyId: null };
}

module.exports = {
  getActivePaymentProvider,
  isPaymentConfigured,
  getPaymentConfigForClient,
  payu,
  razorpay,
};
