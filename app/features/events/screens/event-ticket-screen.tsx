import { MaterialIcons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "@/lib/safe-router";
import * as Linking from "expo-linking";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { TicketQrCode } from "@/components/ticket-qr-code";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  cancelEventTicket,
  fetchTicketDetail,
  verifyEventPayment,
  verifyInAppPayuOrder,
  type CheckoutOrderResponse,
  type TicketDetail,
} from "@/features/events/services/event-ticketing-api";
import {
  buildTicketDetailFromCheckout,
  buildTicketDetailFromPreview,
  getPendingTicketPreview,
  type PendingTicketPreview,
} from "@/features/events/utils/pending-ticket-preview";
import { shareEventTicket } from "@/features/events/utils/ticket-share";
import { ListifyFonts } from "@/constants/typography";
import { resolveAbsoluteMediaUrl } from "@/features/auth/services/auth-api";
import { formatPrice } from "@/lib/currency";
import { Image } from "@/lib/nativewind-interop";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { useTheme } from "@/providers/theme-provider";

function TicketNotch({ side, color }: { side: "left" | "right"; color: string }) {
  return (
    <View
      style={[
        {
          position: "absolute",
          top: "50%",
          width: 20,
          height: 20,
          borderRadius: 10,
          backgroundColor: color,
          marginTop: -10,
          zIndex: 2,
        },
        side === "left" ? { left: -10 } : { right: -10 },
      ]}
    />
  );
}

export function EventTicketScreen() {
  const { ticketId, orderId, pending } = useLocalSearchParams<{
    ticketId?: string;
    orderId?: string;
    pending?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [pendingPreview, setPendingPreview] = useState<PendingTicketPreview | null>(null);
  const isPending = pending === "1" && Boolean(orderId) && !ticketId;

  const pageBg = isDark ? "#2A2A2A" : "#D8D8DC";
  const ticketSurface = isDark ? colors.surfaceElevated : "#FFFFFF";
  const divider = isDark ? "rgba(255,255,255,0.08)" : "#ECECEC";

  const applyConfirmedTicket = useCallback(
    async (confirmed: CheckoutOrderResponse, preview: PendingTicketPreview | null) => {
      const fromCheckout = buildTicketDetailFromCheckout(confirmed, preview);
      if (fromCheckout) {
        setDetail(fromCheckout);
        setQrLoading(false);
        setPendingPreview(null);
        return;
      }

      const confirmedTicketId = confirmed.ticket?.id;
      if (!confirmedTicketId) return;

      const data = await fetchTicketDetail(confirmedTicketId);
      setDetail(data);
      setQrLoading(false);
      setPendingPreview(null);
    },
    [],
  );

  const isRetryableVerifyError = useCallback((error: unknown, attempt: number) => {
    if (attempt < 10) return true;
    if (!(error instanceof Error)) return true;
    const message = error.message.toLowerCase();
    if (message.includes("still processing")) return true;
    if (message.includes("not confirmed")) return true;
    if (message.includes("wait a moment")) return true;
    if (message.includes("wait a few seconds")) return true;
    if (message.includes("could not confirm")) return true;
    return false;
  }, []);

  const load = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    try {
      const data = await fetchTicketDetail(ticketId);
      setDetail(data);
    } catch (e) {
      showErrorToast("Ticket unavailable", e instanceof Error ? e.message : "Could not load ticket");
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  const confirmPendingOrder = useCallback(async () => {
    if (!orderId) return;

    const preview = getPendingTicketPreview(orderId);
    if (preview) {
      setPendingPreview(preview);
      setDetail(buildTicketDetailFromPreview(preview));
      setLoading(false);
      setQrLoading(true);
    }

    const hasPaymentProof = Boolean(
      preview?.payment?.razorpayPaymentId && preview?.payment?.razorpaySignature,
    );

    if (!hasPaymentProof) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        const livePreview = getPendingTicketPreview(orderId) ?? preview;
        const payment = livePreview?.payment;
        const canVerifyWithHash = Boolean(
          payment?.razorpayPaymentId &&
            payment?.razorpaySignature &&
            payment?.razorpayOrderId,
        );

        const confirmed = canVerifyWithHash
          ? await verifyEventPayment({
              orderId,
              razorpayOrderId: payment!.razorpayOrderId,
              razorpayPaymentId: payment!.razorpayPaymentId!,
              razorpaySignature: payment!.razorpaySignature!,
            })
          : await verifyInAppPayuOrder(orderId);

        if (confirmed.order?.status === "CONFIRMED" || confirmed.ticket?.id) {
          await applyConfirmedTicket(confirmed, livePreview);
          return;
        }
      } catch (e) {
        lastError = e instanceof Error ? e : new Error("Verification failed");
        if (!isRetryableVerifyError(e, attempt)) break;
        if (attempt < 19) {
          await new Promise((resolve) => setTimeout(resolve, 600 + attempt * 300));
        }
      }
    }

    showErrorToast(
      "Ticket not ready",
      lastError?.message?.includes("payment failed")
        ? "Payment was not completed. Enter OTP 123456 on the PayU screen and tap PAY, then try booking again."
        : lastError?.message ?? "Payment is still processing. Check My Tickets shortly.",
    );
    setQrLoading(false);
    router.back();
  }, [applyConfirmedTicket, isRetryableVerifyError, orderId, router]);

  useEffect(() => {
    if (isPending) {
      void confirmPendingOrder();
      return;
    }
    void load();
  }, [confirmPendingOrder, isPending, load]);

  const handleShare = useCallback(async () => {
    if (!detail) return;
    await shareEventTicket(detail);
  }, [detail]);

  const handleWhatsApp = useCallback(async () => {
    if (!detail) return;
    await shareEventTicket(detail);
  }, [detail]);

  const handleCancel = useCallback(() => {
    if (!detail?.ticket.id) return;
    const policy = detail.cancellationPolicy;
    if (!policy?.allowed) {
      showErrorToast("Not allowed", "Cancellation is not available for this ticket.");
      return;
    }

    Alert.alert(
      "Cancel ticket",
      `Refund: ${policy.refundPercentage}% if eligible.\n\nThis will invalidate your QR code.`,
      [
        { text: "Keep ticket", style: "cancel" },
        {
          text: "Confirm cancel",
          style: "destructive",
          onPress: () => {
            setCancelling(true);
            void cancelEventTicket(detail.ticket.id)
              .then(() => {
                showSuccessToast("Cancelled", "Refund will be processed if eligible.");
                void load();
              })
              .catch((e) =>
                showErrorToast("Failed", e instanceof Error ? e.message : "Could not cancel"),
              )
              .finally(() => setCancelling(false));
          },
        },
      ],
    );
  }, [detail, load]);

  const openVenue = useCallback(() => {
    const loc = detail?.event?.location || detail?.event?.venue;
    if (!loc) return;
    const q = encodeURIComponent(loc);
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`);
  }, [detail]);

  if (loading || !detail) {
    return (
      <Modal visible animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: pageBg, paddingTop: insets.top, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Modal>
    );
  }

  const { ticket, event, order } = detail;
  const cancellationPolicy = detail.cancellationPolicy ?? pendingPreview?.cancellationPolicy;
  const coverUrl = resolveAbsoluteMediaUrl(event?.image) ?? event?.image ?? "";
  const isInvalid = ["CANCELLED", "REFUNDED", "EXPIRED"].includes(ticket.status);
  const isCheckedIn = ticket.status === "CHECKED_IN";
  const statusLabel = qrLoading
    ? "CONFIRMING"
    : isCheckedIn
      ? "CHECKED IN"
      : isInvalid
        ? ticket.status
        : "CONFIRMED";
  const showQr = Boolean(ticket.qrPayload) && !qrLoading;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={() => router.back()}>
      <View style={{ flex: 1, backgroundColor: pageBg, paddingTop: insets.top }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 16, paddingVertical: 12 }}>
          <Text style={{ fontFamily: ListifyFonts.bold, fontSize: 17, color: colors.textPrimary }}>
            Your Ticket
          </Text>
          <Pressable onPress={() => void handleShare()} style={{ position: "absolute", right: 52, padding: 8 }}>
            <MaterialIcons name="share" size={22} color={colors.textPrimary} />
          </Pressable>
          <Pressable
            onPress={() => router.back()}
            style={{
              position: "absolute",
              right: 12,
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: "#E53935",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MaterialIcons name="close" size={20} color="#fff" />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: Math.max(insets.bottom, 16) + 80,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Ticket card */}
          <View
            style={{
              backgroundColor: ticketSurface,
              borderRadius: 20,
              overflow: "hidden",
              shadowColor: "#000",
              shadowOpacity: isDark ? 0.35 : 0.12,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 8 },
              elevation: 8,
            }}
          >
            {/* Event hero row */}
            <View style={{ flexDirection: "row", padding: 16, gap: 12 }}>
              <View style={{ width: 88, height: 120, borderRadius: 10, overflow: "hidden", backgroundColor: colors.surfaceMuted }}>
                {coverUrl ? (
                  <Image source={{ uri: coverUrl }} contentFit="cover" style={{ width: "100%", height: "100%" }} />
                ) : (
                  <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                    <MaterialIcons name="event" size={32} color={colors.iconMuted} />
                  </View>
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: ListifyFonts.bold, fontSize: 17, color: colors.textPrimary }} numberOfLines={2}>
                  {event?.title ?? "Event"}
                </Text>
                {event?.subcategory ? (
                  <Text style={{ marginTop: 4, fontFamily: ListifyFonts.medium, fontSize: 13, color: colors.textSecondary }}>
                    {event.subcategory}
                  </Text>
                ) : null}
                {event?.eventDate ? (
                  <Text style={{ marginTop: 8, fontFamily: ListifyFonts.semiBold, fontSize: 14, color: isDark ? "#D4A853" : "#B8860B" }}>
                    {event.eventDate}
                    {event.eventTime ? ` • ${event.eventTime}` : ""}
                  </Text>
                ) : null}
                <Text style={{ marginTop: 4, fontFamily: ListifyFonts.regular, fontSize: 13, color: colors.textSecondary }} numberOfLines={2}>
                  {[event?.venue, event?.location].filter(Boolean).join(", ")}
                </Text>
              </View>
            </View>

            {/* Perforated divider */}
            <View style={{ position: "relative", height: 1, backgroundColor: divider, marginHorizontal: 16 }}>
              <TicketNotch side="left" color={pageBg} />
              <TicketNotch side="right" color={pageBg} />
            </View>

            <Pressable style={{ paddingVertical: 12, paddingHorizontal: 16, backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "#F3F4F6" }}>
              <Text style={{ textAlign: "center", fontFamily: ListifyFonts.medium, fontSize: 13, color: colors.textSecondary }}>
                Tap for support, details & more actions
              </Text>
            </Pressable>

            {/* QR + booking info */}
            <View style={{ flexDirection: "row", padding: 16, gap: 16, alignItems: "center" }}>
              <View
                style={{
                  width: 140,
                  height: 140,
                  padding: 10,
                  backgroundColor: "#FFFFFF",
                  borderRadius: 8,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: isInvalid ? 0.35 : 1,
                }}
              >
                {showQr ? (
                  <TicketQrCode value={ticket.qrPayload} size={120} />
                ) : (
                  <ActivityIndicator size="large" color={colors.primary} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: ListifyFonts.regular, fontSize: 12, color: colors.textSecondary }}>
                  {ticket.quantity} Ticket(s)
                </Text>
                <Text style={{ marginTop: 6, fontFamily: ListifyFonts.bold, fontSize: 18, color: colors.textPrimary }}>
                  {ticket.ticketTypeName.toUpperCase()}
                </Text>
                <Text style={{ marginTop: 4, fontFamily: ListifyFonts.medium, fontSize: 13, color: colors.textSecondary }}>
                  {statusLabel}
                </Text>
                <Text style={{ marginTop: 12, fontFamily: ListifyFonts.bold, fontSize: 12, color: colors.textPrimary, letterSpacing: 0.5 }}>
                  BOOKING ID: {ticket.bookingId}
                </Text>
                {order ? (
                  <Text style={{ marginTop: 4, fontFamily: ListifyFonts.medium, fontSize: 13, color: colors.textSecondary }}>
                    {formatPrice(order.totalAmount, order.currency === "INR" ? "₹" : order.currency)}
                  </Text>
                ) : null}
              </View>
            </View>

            {/* Cancellation banner */}
            <View style={{ paddingVertical: 12, paddingHorizontal: 16, backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "#F3F4F6", borderTopWidth: 1, borderTopColor: divider }}>
              <Text style={{ textAlign: "center", fontFamily: ListifyFonts.medium, fontSize: 13, color: colors.textSecondary }}>
                {cancellationPolicy?.allowed
                  ? `Cancellation allowed · ${cancellationPolicy.refundPercentage}% refund`
                  : "Cancellation not available for this venue."}
              </Text>
            </View>

            {/* Total row */}
            {order ? (
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderTopWidth: 1, borderTopColor: divider }}>
                <Text style={{ fontFamily: ListifyFonts.medium, fontSize: 14, color: colors.textSecondary }}>Total Amount</Text>
                <Text style={{ fontFamily: ListifyFonts.bold, fontSize: 18, color: colors.textPrimary }}>
                  {formatPrice(order.totalAmount, order.currency === "INR" ? "₹" : order.currency)}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Actions */}
          <View style={{ marginTop: 16, gap: 10 }}>
            <Pressable
              onPress={openVenue}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                backgroundColor: ticketSurface,
                borderRadius: 999,
                paddingVertical: 14,
              }}
            >
              <MaterialIcons name="location-on" size={20} color={colors.primary} />
              <Text style={{ fontFamily: ListifyFonts.semiBold, fontSize: 15, color: colors.textPrimary }}>Find Venue</Text>
            </Pressable>

            <Pressable
              onPress={() => void handleWhatsApp()}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                backgroundColor: ticketSurface,
                borderRadius: 999,
                paddingVertical: 14,
              }}
            >
              <MaterialIcons name="chat" size={20} color="#25D366" />
              <Text style={{ fontFamily: ListifyFonts.semiBold, fontSize: 15, color: colors.textPrimary }}>Share on WhatsApp</Text>
            </Pressable>

            {cancellationPolicy?.allowed && ticket.status === "ACTIVE" && !qrLoading ? (
              <Pressable
                onPress={handleCancel}
                disabled={cancelling}
                style={{
                  alignItems: "center",
                  paddingVertical: 14,
                  opacity: cancelling ? 0.6 : 1,
                }}
              >
                <Text style={{ fontFamily: ListifyFonts.semiBold, fontSize: 15, color: "#E53935" }}>
                  Cancellation & Refund
                </Text>
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
