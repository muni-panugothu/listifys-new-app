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
  Share,
  Text,
  View,
} from "react-native";
import { TicketQrCode } from "@/components/ticket-qr-code";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  cancelEventTicket,
  fetchTicketDetail,
  type TicketDetail,
} from "@/features/events/services/event-ticketing-api";
import { ListifyFonts } from "@/constants/typography";
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
  const { ticketId } = useLocalSearchParams<{ ticketId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const pageBg = isDark ? "#2A2A2A" : "#D8D8DC";
  const ticketSurface = isDark ? colors.surfaceElevated : "#FFFFFF";
  const divider = isDark ? "rgba(255,255,255,0.08)" : "#ECECEC";

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

  useEffect(() => {
    void load();
  }, [load]);

  const handleShare = useCallback(async () => {
    if (!detail) return;
    const event = detail.event;
    const message = [
      "🎟️ My Listifys Event Ticket",
      "",
      `Event: ${event?.title ?? "Event"}`,
      event?.eventDate ? `Date: ${event.eventDate}${event.eventTime ? ` • ${event.eventTime}` : ""}` : "",
      event?.venue || event?.location ? `Venue: ${[event.venue, event.location].filter(Boolean).join(", ")}` : "",
      `Ticket: ${detail.ticket.ticketTypeName} × ${detail.ticket.quantity}`,
      `Booking ID: ${detail.ticket.bookingId}`,
    ]
      .filter(Boolean)
      .join("\n");

    await Share.share({ message, title: "Share ticket" });
  }, [detail]);

  const handleWhatsApp = useCallback(async () => {
    if (!detail) return;
    const event = detail.event;
    const text = encodeURIComponent(
      [
        "🎟️ My Listifys Event Ticket",
        "",
        `Event: ${event?.title ?? "Event"}`,
        event?.eventDate ? `Date: ${event.eventDate}${event.eventTime ? ` • ${event.eventTime}` : ""}` : "",
        event?.venue ? `Venue: ${event.venue}` : "",
        `Ticket: ${detail.ticket.ticketTypeName} × ${detail.ticket.quantity}`,
        `Booking ID: ${detail.ticket.bookingId}`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
    const url = `whatsapp://send?text=${text}`;
    const can = await Linking.canOpenURL(url);
    if (can) {
      await Linking.openURL(url);
    } else {
      await handleShare();
    }
  }, [detail, handleShare]);

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
  const isInvalid = ["CANCELLED", "REFUNDED", "EXPIRED"].includes(ticket.status);
  const isCheckedIn = ticket.status === "CHECKED_IN";
  const statusLabel = isCheckedIn ? "CHECKED IN" : isInvalid ? ticket.status : "CONFIRMED";

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
                {event?.image ? (
                  <Image source={event.image} contentFit="cover" style={{ width: "100%", height: "100%" }} />
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
                  padding: 10,
                  backgroundColor: "#FFFFFF",
                  borderRadius: 8,
                  opacity: isInvalid ? 0.35 : 1,
                }}
              >
                <TicketQrCode value={ticket.qrPayload} size={120} />
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
                {detail.cancellationPolicy?.allowed
                  ? `Cancellation allowed · ${detail.cancellationPolicy.refundPercentage}% refund`
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

            {detail.cancellationPolicy?.allowed && ticket.status === "ACTIVE" ? (
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
