import { MaterialIcons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  buildPayuDeepLinkGuardScript,
  buildPayuLaunchHtml,
  isPayuFailureBridgeUrl,
  isPayuHostedUrl,
  isPayuSuccessBridgeUrl,
  parsePayuBridgeReturnUrl,
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
  const [bootLoading, setBootLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [statusText, setStatusText] = useState("Loading PayU checkout…");
  const handledRef = useRef(false);
  const paymentStartedRef = useRef(false);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webViewRef = useRef<{ injectJavaScript: (script: string) => void; stopLoading?: () => void } | null>(null);
  const hasNativeWebView = isWebViewNativeAvailable();
  const WebViewComponent = useMemo(
    () => (visible && hasNativeWebView ? getLazyWebViewModule()?.WebView ?? null : null),
    [visible, hasNativeWebView],
  );

  const html = useMemo(
    () => (session ? buildPayuLaunchHtml(session) : null),
    [session],
  );

  const resolvedOrderId = _orderId || session?.fields?.udf1 || null;
  const deepLinkGuardScript = useMemo(() => buildPayuDeepLinkGuardScript(), []);

  useEffect(() => {
    if (!visible) {
      handledRef.current = false;
      paymentStartedRef.current = false;
      setBootLoading(true);
      setConfirming(false);
      setStatusText("Loading PayU checkout…");
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
        webViewRef.current?.stopLoading?.();
        onCancel(message);
        return;
      }
      setConfirming(true);
      setStatusText("Generating your ticket…");
      onSuccess(result);
    },
    [onCancel, onSuccess],
  );

  const scheduleLateFallback = useCallback(
    (targetOrderId: string) => {
      if (handledRef.current || fallbackTimerRef.current || !targetOrderId) return;
      fallbackTimerRef.current = setTimeout(() => {
        fallbackTimerRef.current = null;
        if (handledRef.current) return;
        handledRef.current = true;
        setConfirming(true);
        setStatusText("Generating your ticket…");
        onInAppVerified(targetOrderId);
      }, 20_000);
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
            ? "Payment failed. Use card 5123456789012346, then enter OTP 123456 on the next screen."
            : "Payment failed or was cancelled",
        );
        return;
      }

      const bridgeParsed = parsePayuBridgeReturnUrl(url);
      if (bridgeParsed === "cancelled") {
        finish("cancelled");
        return;
      }
      if (bridgeParsed) {
        finish(bridgeParsed);
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

  const notePayuActivity = useCallback(
    (url: string) => {
      if (isPayuHostedUrl(url)) {
        paymentStartedRef.current = true;
        setBootLoading(false);
      }

      if (isPayuSuccessBridgeUrl(url) && paymentStartedRef.current) {
        setConfirming(true);
        setStatusText("Confirming payment…");
        if (resolvedOrderId) {
          scheduleLateFallback(resolvedOrderId);
        }
      }

      inspectUrl(url);
    },
    [inspectUrl, resolvedOrderId, scheduleLateFallback],
  );

  const handleWebViewMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      const parsed = parsePayuWebViewReturnMessage(event.nativeEvent.data);
      if (parsed === "cancelled") {
        finish("cancelled");
        return;
      }
      if (parsed) {
        if (fallbackTimerRef.current) {
          clearTimeout(fallbackTimerRef.current);
          fallbackTimerRef.current = null;
        }
        finish(parsed);
      }
    },
    [finish],
  );

  const handleOpenWindow = useCallback((event: { nativeEvent: { targetUrl?: string } }) => {
    const targetUrl = event.nativeEvent?.targetUrl;
    if (!targetUrl) return;
    webViewRef.current?.injectJavaScript(
      `window.location.href=${JSON.stringify(targetUrl)};true;`,
    );
  }, []);

  const handleRenderProcessGone = useCallback(() => {
    if (resolvedOrderId) {
      scheduleLateFallback(resolvedOrderId);
    }
  }, [resolvedOrderId, scheduleLateFallback]);

  if (!visible || !session) return null;

  if (!hasNativeWebView || !WebViewComponent || !html) {
    return (
      <View style={[styles.overlay, { paddingTop: insets.top, paddingHorizontal: 24 }]}>
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
            Run once on your PC, then reopen the app:
          </Text>
          <Text style={styles.setupCode}>cd app{"\n"}npm run android</Text>
        </View>
      </View>
    );
  }

  const WebView = WebViewComponent;
  const showOverlay = bootLoading || confirming;

  return (
    <View style={[styles.overlay, { paddingTop: insets.top }]}>
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

      {showOverlay ? (
        <View style={styles.connecting}>
          <ActivityIndicator size="large" color="#27BB97" />
          <Text style={styles.connectingText}>{statusText}</Text>
        </View>
      ) : null}

      <WebView
        ref={webViewRef}
        source={{ html, baseUrl: session.actionUrl }}
        originWhitelist={["https://*", "http://*"]}
        injectedJavaScriptBeforeContentLoaded={deepLinkGuardScript}
        onMessage={handleWebViewMessage}
        onShouldStartLoadWithRequest={(request: { url: string }) => {
          const url = request.url;
          if (url.startsWith("listifyapp://")) {
            inspectUrl(url);
            return false;
          }
          notePayuActivity(url);
          return !shouldBlockWebViewNavigation(url);
        }}
        onNavigationStateChange={(nav: { url: string }) => {
          notePayuActivity(nav.url);
        }}
        onLoadEnd={(event: { nativeEvent: { url: string } }) => {
          const url = event.nativeEvent.url;
          if (isPayuSuccessBridgeUrl(url)) {
            webViewRef.current?.injectJavaScript(`
              (function(){
                try{
                  var q=window.location.search?window.location.search.slice(1):"";
                  if(q&&window.ReactNativeWebView){
                    window.ReactNativeWebView.postMessage(JSON.stringify({type:"payu-return",query:q}));
                  }
                }catch(e){}
              })();true;
            `);
          }
        }}
        onOpenWindow={Platform.OS === "android" ? handleOpenWindow : undefined}
        onRenderProcessGone={Platform.OS === "android" ? handleRenderProcessGone : undefined}
        onContentProcessDidTerminate={Platform.OS === "ios" ? handleRenderProcessGone : undefined}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        setSupportMultipleWindows={Platform.OS === "android"}
        allowsBackForwardNavigationGestures={false}
        startInLoadingState={false}
        overScrollMode="never"
        setBuiltInZoomControls={false}
        style={styles.webview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10000,
    elevation: 10000,
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
    backgroundColor: "rgba(255,255,255,0.92)",
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
});
