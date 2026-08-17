import { MaterialIcons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  buildPayuLaunchHtml,
  buildPayuTestOtpAutoSubmitScript,
  isPayu3dsChallengeUrl,
  isPayuFailureBridgeUrl,
  isPayuHostedUrl,
  isPayuReturnInProgress,
  PAYU_WEBVIEW_OTP_CHALLENGE_MESSAGE,
  parsePayuReturnUrl,
  parsePayuWebViewReturnMessage,
  shouldBlockWebViewNavigation,
  type PayuCheckoutReturn,
  type PayuPaymentSession,
} from "@/features/events/utils/payu-checkout-html";
import { ListifyFonts } from "@/constants/typography";
import { getLazyWebViewModule, isWebViewNativeAvailable } from "@/lib/webview-native";

export type PayuCheckoutModalProps = {
  visible: boolean;
  session: PayuPaymentSession | null;
  orderId: string | null;
  onSuccess: (result: PayuCheckoutReturn) => void;
  onInAppVerified: (orderId: string) => void;
  onCancel: (message?: string) => void;
};

export function PayuCheckoutModal({
  visible,
  session,
  orderId: _orderId,
  onSuccess,
  onInAppVerified,
  onCancel,
}: PayuCheckoutModalProps) {
  const insets = useSafeAreaInsets();
  const [connecting, setConnecting] = useState(true);
  const [connectingText, setConnectingText] = useState("Loading PayU checkout…");
  const handledRef = useRef(false);
  const paymentStartedRef = useRef(false);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webViewRef = useRef<{ injectJavaScript: (script: string) => void } | null>(null);
  const [hideChallengeUi, setHideChallengeUi] = useState(false);
  const [overrideUri, setOverrideUri] = useState<string | null>(null);
  const hasNativeWebView = isWebViewNativeAvailable();
  const WebViewComponent = useMemo(
    () => (visible && hasNativeWebView ? getLazyWebViewModule()?.WebView ?? null : null),
    [visible, hasNativeWebView],
  );

  const html = useMemo(
    () => (session ? buildPayuLaunchHtml(session) : null),
    [session],
  );

  const webSource = useMemo(() => {
    if (overrideUri) return { uri: overrideUri };
    if (html && session) return { html, baseUrl: session.actionUrl };
    return null;
  }, [overrideUri, html, session]);

  const resolvedOrderId = _orderId || session?.fields?.udf1 || null;

  useEffect(() => {
    if (!visible) {
      handledRef.current = false;
      paymentStartedRef.current = false;
      setConnecting(true);
      setConnectingText("Loading PayU checkout…");
      setHideChallengeUi(false);
      setOverrideUri(null);
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return undefined;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onCancel();
      return true;
    });
    return () => sub.remove();
  }, [visible, onCancel]);

  useEffect(
    () => () => {
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    },
    [],
  );

  const finish = useCallback(
    (result: PayuCheckoutReturn | "cancelled", message?: string) => {
      if (handledRef.current) return;
      handledRef.current = true;
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
      if (result === "cancelled") {
        onCancel(message);
        return;
      }
      onSuccess(result);
    },
    [onCancel, onSuccess],
  );

  const scheduleServerVerifyFallback = useCallback(
    (targetOrderId: string) => {
      if (handledRef.current || fallbackTimerRef.current) return;
      fallbackTimerRef.current = setTimeout(() => {
        fallbackTimerRef.current = null;
        if (handledRef.current || !targetOrderId) return;
        handledRef.current = true;
        setConnecting(true);
        setConnectingText("Confirming payment…");
        onInAppVerified(targetOrderId);
      }, 8_000);
    },
    [onInAppVerified],
  );

  const inspectUrl = useCallback(
    (url: string) => {
      if (isPayuFailureBridgeUrl(url)) {
        if (fallbackTimerRef.current) {
          clearTimeout(fallbackTimerRef.current);
          fallbackTimerRef.current = null;
        }
        finish(
          "cancelled",
          session?.testMode
            ? "Payment failed. In test mode use login payu / payu and OTP 123456."
            : "Payment failed or was cancelled",
        );
        return;
      }

      const parsed = parsePayuReturnUrl(url);
      if (parsed === "cancelled") {
        finish("cancelled");
        return;
      }
      if (parsed) {
        finish(parsed);
      }
    },
    [finish, session?.testMode],
  );

  const maybeAutoCompleteTestOtp = useCallback(
    (url: string) => {
      if (!session?.testAutoOtp) return;
      if (isPayu3dsChallengeUrl(url)) {
        setHideChallengeUi(true);
        setConnecting(true);
        setConnectingText("Completing payment…");
        webViewRef.current?.injectJavaScript(buildPayuTestOtpAutoSubmitScript());
      } else if (isPayuHostedUrl(url) && !isPayuReturnInProgress(url, paymentStartedRef.current)) {
        setHideChallengeUi(false);
      }
    },
    [session?.testAutoOtp],
  );

  const notePayuActivity = useCallback(
    (url: string) => {
      if (isPayuHostedUrl(url)) {
        paymentStartedRef.current = true;
        setConnecting(false);
      }
      maybeAutoCompleteTestOtp(url);
      if (isPayuReturnInProgress(url, paymentStartedRef.current)) {
        setHideChallengeUi(true);
        setConnecting(true);
        setConnectingText("Confirming payment…");
        if (resolvedOrderId) {
          scheduleServerVerifyFallback(resolvedOrderId);
        }
      }
      inspectUrl(url);
    },
    [inspectUrl, maybeAutoCompleteTestOtp, resolvedOrderId, scheduleServerVerifyFallback],
  );

  const handleWebViewMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      const data = event.nativeEvent.data;

      if (session?.testAutoOtp && data === PAYU_WEBVIEW_OTP_CHALLENGE_MESSAGE) {
        setHideChallengeUi(true);
        setConnecting(true);
        setConnectingText("Completing payment…");
        return;
      }

      const parsed = parsePayuWebViewReturnMessage(data);
      if (parsed === "cancelled") {
        finish("cancelled");
        return;
      }
      if (parsed) {
        finish(parsed);
      }
    },
    [finish, session?.testAutoOtp],
  );

  const handleOpenWindow = useCallback(
    (event: { nativeEvent: { targetUrl?: string } }) => {
      const targetUrl = event.nativeEvent?.targetUrl;
      if (!targetUrl) return;
      setOverrideUri(targetUrl);
      maybeAutoCompleteTestOtp(targetUrl);
    },
    [maybeAutoCompleteTestOtp],
  );

  const handleRenderProcessGone = useCallback(() => {
    if (handledRef.current || !resolvedOrderId) return;
    handledRef.current = true;
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    setConnecting(true);
    setConnectingText("Confirming payment…");
    onInAppVerified(resolvedOrderId);
  }, [onInAppVerified, resolvedOrderId]);

  if (!visible || !session) return null;

  if (!hasNativeWebView || !WebViewComponent || !webSource) {
    return (
      <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={() => onCancel()}>
        <View style={[styles.container, { paddingTop: insets.top, paddingHorizontal: 24 }]}>
          <View style={styles.header}>
            <Pressable onPress={() => onCancel()} hitSlop={12} style={styles.closeBtn}>
              <MaterialIcons name="close" size={22} color="#1A1A1A" />
            </Pressable>
            <Text style={styles.headerTitle}>Secure Payment</Text>
            <View style={styles.closeBtn} />
          </View>
          <View style={styles.setupBody}>
            <MaterialIcons name="phone-android" size={48} color="#27BB97" />
            <Text style={styles.setupTitle}>In-app checkout needs one rebuild</Text>
            <Text style={styles.setupText}>
              BookMyShow-style payment stays inside Listifys using a secure in-app WebView. Run this once on your PC, then reopen the app:
            </Text>
            <Text style={styles.setupCode}>cd app{"\n"}npm run android</Text>
            <Text style={styles.setupHint}>Install the new build on your phone, then tap Pay securely again.</Text>
          </View>
        </View>
      </Modal>
    );
  }

  const WebView = WebViewComponent;
  const showProcessingOverlay = connecting || hideChallengeUi;

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => finish("cancelled")}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable
            onPress={() => finish("cancelled")}
            hitSlop={12}
            style={styles.closeBtn}
            accessibilityLabel="Close payment"
          >
            <MaterialIcons name="close" size={22} color="#1A1A1A" />
          </Pressable>
          <View style={styles.headerCenter}>
            <MaterialIcons name="lock" size={16} color="#27BB97" />
            <Text style={styles.headerTitle}>Secure Payment</Text>
          </View>
          <View style={styles.closeBtn} />
        </View>

        {session.testMode && session.testGuide ? (
          <View style={styles.testBanner}>
            <Text style={styles.testBannerTitle}>{session.testGuide.title}</Text>
            {session.testGuide.steps.map((step) => (
              <Text key={step} style={styles.testBannerStep}>
                • {step}
              </Text>
            ))}
          </View>
        ) : null}

        {showProcessingOverlay ? (
          <View style={styles.connecting}>
            <ActivityIndicator size="large" color="#27BB97" />
            <Text style={styles.connectingText}>{connectingText}</Text>
          </View>
        ) : null}

        <WebView
          ref={webViewRef}
          source={webSource}
          originWhitelist={["https://*", "http://*", "listifyapp://*"]}
          onMessage={handleWebViewMessage}
          onShouldStartLoadWithRequest={(request: { url: string }) => {
            notePayuActivity(request.url);
            return !shouldBlockWebViewNavigation(request.url);
          }}
          onNavigationStateChange={(nav: { url: string }) => {
            notePayuActivity(nav.url);
          }}
          onLoadEnd={(event: { nativeEvent: { url: string } }) => {
            const url = event.nativeEvent.url;
            notePayuActivity(url);
            if (session.testAutoOtp && isPayu3dsChallengeUrl(url)) {
              webViewRef.current?.injectJavaScript(buildPayuTestOtpAutoSubmitScript());
            }
          }}
          onOpenWindow={Platform.OS === "android" ? handleOpenWindow : undefined}
          onRenderProcessGone={
            Platform.OS === "android" ? handleRenderProcessGone : undefined
          }
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          setSupportMultipleWindows={Platform.OS === "android"}
          allowsBackForwardNavigationGestures={false}
          startInLoadingState={false}
          style={[styles.webview, hideChallengeUi && styles.webviewHidden]}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  headerCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: ListifyFonts.semiBold,
    fontSize: 16,
    color: "#1A1A1A",
  },
  connecting: {
    ...StyleSheet.absoluteFillObject,
    top: 56,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    zIndex: 2,
    gap: 12,
  },
  connectingText: {
    fontFamily: ListifyFonts.medium,
    fontSize: 14,
    color: "#6B7280",
  },
  testBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#ECFDF5",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#A7F3D0",
    gap: 4,
  },
  testBannerTitle: {
    fontFamily: ListifyFonts.semiBold,
    fontSize: 13,
    color: "#065F46",
  },
  testBannerStep: {
    fontFamily: ListifyFonts.regular,
    fontSize: 12,
    color: "#047857",
    lineHeight: 18,
  },
  webview: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  webviewHidden: {
    opacity: 0,
    pointerEvents: "none",
  },
  setupBody: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingBottom: 48,
  },
  setupTitle: {
    fontFamily: ListifyFonts.bold,
    fontSize: 18,
    color: "#111",
    textAlign: "center",
  },
  setupText: {
    fontFamily: ListifyFonts.regular,
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 21,
  },
  setupCode: {
    fontFamily: ListifyFonts.medium,
    fontSize: 13,
    color: "#111",
    backgroundColor: "#F3F4F6",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    overflow: "hidden",
    textAlign: "center",
  },
  setupHint: {
    fontFamily: ListifyFonts.regular,
    fontSize: 13,
    color: "#888",
    textAlign: "center",
  },
});
