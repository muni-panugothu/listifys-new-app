import { MaterialIcons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  buildPayuLaunchHtml,
  isPayuHostedUrl,
  isPayuReturnBridgeUrl,
  parsePayuReturnUrl,
  type PayuCheckoutReturn,
  type PayuPaymentSession,
} from "@/features/events/utils/payu-checkout-html";
import { ListifyFonts } from "@/constants/typography";
import { getLazyWebViewModule } from "@/lib/webview-native";

export type PayuCheckoutModalProps = {
  visible: boolean;
  session: PayuPaymentSession | null;
  onSuccess: (result: PayuCheckoutReturn) => void;
  onCancel: (message?: string) => void;
};

export function PayuCheckoutModal({
  visible,
  session,
  onSuccess,
  onCancel,
}: PayuCheckoutModalProps) {
  const insets = useSafeAreaInsets();
  const [connecting, setConnecting] = useState(true);
  const [webViewReady, setWebViewReady] = useState(false);
  const handledRef = useRef(false);
  const WebViewComponent = useMemo(
    () => (visible ? getLazyWebViewModule()?.WebView ?? null : null),
    [visible],
  );

  const html = useMemo(
    () => (session ? buildPayuLaunchHtml(session) : null),
    [session],
  );

  useEffect(() => {
    if (!visible) {
      handledRef.current = false;
      setConnecting(true);
      setWebViewReady(false);
      return;
    }
    setWebViewReady(Boolean(WebViewComponent));
  }, [visible, WebViewComponent]);

  useEffect(() => {
    if (!visible) return undefined;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onCancel();
      return true;
    });
    return () => sub.remove();
  }, [visible, onCancel]);

  const finish = useCallback(
    (result: PayuCheckoutReturn | "cancelled", message?: string) => {
      if (handledRef.current) return;
      handledRef.current = true;
      if (result === "cancelled") {
        onCancel(message);
        return;
      }
      onSuccess(result);
    },
    [onCancel, onSuccess],
  );

  const inspectUrl = useCallback(
    (url: string) => {
      const parsed = parsePayuReturnUrl(url);
      if (parsed === "cancelled") {
        finish("cancelled");
        return true;
      }
      if (parsed) {
        finish(parsed);
        return true;
      }
      if (isPayuReturnBridgeUrl(url)) {
        return true;
      }
      return false;
    },
    [finish],
  );

  if (!visible || !html || !session || !webViewReady || !WebViewComponent) return null;

  const WebView = WebViewComponent;

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
          <Text style={styles.headerTitle}>Secure Payment</Text>
          <View style={styles.closeBtn} />
        </View>

        {connecting ? (
          <View style={styles.connecting}>
            <ActivityIndicator size="large" color="#27BB97" />
            <Text style={styles.connectingText}>Opening PayU checkout…</Text>
          </View>
        ) : null}

        <WebView
          source={{
            html,
            baseUrl: session.actionUrl,
          }}
          originWhitelist={["https://*", "http://*", "listifyapp://*"]}
          onShouldStartLoadWithRequest={(request: { url: string }) => {
            if (inspectUrl(request.url)) return false;
            return true;
          }}
          onNavigationStateChange={(nav: { url: string }) => {
            if (isPayuHostedUrl(nav.url)) {
              setConnecting(false);
            }
            inspectUrl(nav.url);
          }}
          onLoadEnd={(event: { nativeEvent: { url: string } }) => {
            if (isPayuHostedUrl(event.nativeEvent.url)) {
              setConnecting(false);
            }
          }}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          setSupportMultipleWindows={false}
          startInLoadingState={false}
          style={styles.webview}
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
  webview: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
});
