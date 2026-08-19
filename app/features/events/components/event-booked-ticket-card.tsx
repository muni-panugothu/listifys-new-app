import { MaterialIcons } from "@expo/vector-icons";
import { memo, useCallback } from "react";
import { Pressable, Text, View } from "react-native";

import { TicketQrCode } from "@/components/ticket-qr-code";
import type { TicketDetail } from "@/features/events/services/event-ticketing-api";
import type { EventDetailTheme } from "@/features/events/utils/event-detail-helpers";
import { shareEventTicket } from "@/features/events/utils/ticket-share";
import { resolveAbsoluteMediaUrl } from "@/features/auth/services/auth-api";
import { formatEventDisplayLabel } from "@/lib/event-dates";
import { ListifyFonts } from "@/constants/typography";
import { Image } from "@/lib/nativewind-interop";

type EventBookedTicketCardProps = {
  detail: TicketDetail;
  theme: EventDetailTheme;
  isDark: boolean;
  onViewTicket: () => void;
};

function EventBookedTicketCardImpl({
  detail,
  theme,
  isDark,
  onViewTicket,
}: EventBookedTicketCardProps) {
  const { ticket, event, order } = detail;
  const coverUrl = resolveAbsoluteMediaUrl(event?.image) ?? event?.image ?? "";
  const isCheckedIn = ticket.status === "CHECKED_IN";
  const statusLabel = isCheckedIn ? "CHECKED IN" : "PAID / CONFIRMED";
  const statusColor = isCheckedIn ? "#2563EB" : "#059669";
  const cardBg = isDark ? "rgba(255,255,255,0.06)" : "#FFFFFF";
  const divider = isDark ? "rgba(255,255,255,0.08)" : "#ECECEC";
  const mutedBg = isDark ? "rgba(255,255,255,0.04)" : "#F3F4F6";

  const handleShare = useCallback(async () => {
    await shareEventTicket(detail);
  }, [detail]);

  const venueLabel = [event?.venue, event?.location].filter(Boolean).join(", ");
  const scheduleLabel = formatEventDisplayLabel({
    eventDate: event?.eventDate,
    eventTime: event?.eventTime,
    startDate: event?.startDate,
    endDate: event?.endDate,
    startTime: event?.startTime,
    endTime: event?.endTime,
  });

  return (
    <View style={{ marginTop: 22 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <Text
          style={{
            fontFamily: ListifyFonts.bold,
            fontSize: 18,
            color: theme.titleText,
          }}
        >
          Your ticket
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            backgroundColor: isDark ? "rgba(5,150,105,0.18)" : "rgba(5,150,105,0.12)",
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
          }}
        >
          <MaterialIcons name="check-circle" size={16} color="#059669" />
          <Text style={{ fontFamily: ListifyFonts.semiBold, fontSize: 12, color: "#059669" }}>
            Ticket booked
          </Text>
        </View>
      </View>

      <View
        style={{
          backgroundColor: cardBg,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: theme.divider,
          overflow: "hidden",
          shadowColor: "#000",
          shadowOpacity: isDark ? 0.28 : 0.08,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
          elevation: 4,
        }}
      >
        <View style={{ flexDirection: "row", padding: 16, gap: 12 }}>
          <View
            style={{
              width: 84,
              height: 108,
              borderRadius: 12,
              overflow: "hidden",
              backgroundColor: theme.rowIconBg,
            }}
          >
            {coverUrl ? (
              <Image
                source={{ uri: coverUrl }}
                contentFit="cover"
                style={{ width: "100%", height: "100%" }}
              />
            ) : (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <MaterialIcons name="event" size={30} color={theme.secondaryText} />
              </View>
            )}
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{
                fontFamily: ListifyFonts.bold,
                fontSize: 16,
                color: theme.titleText,
              }}
              numberOfLines={2}
            >
              {event?.title ?? "Event"}
            </Text>
            {scheduleLabel ? (
              <Text
                style={{
                  marginTop: 6,
                  fontFamily: ListifyFonts.semiBold,
                  fontSize: 13,
                  color: theme.dateAccent,
                }}
              >
                {scheduleLabel}
              </Text>
            ) : null}
            {venueLabel ? (
              <Text
                style={{
                  marginTop: 4,
                  fontFamily: ListifyFonts.regular,
                  fontSize: 13,
                  color: theme.secondaryText,
                }}
                numberOfLines={2}
              >
                {venueLabel}
              </Text>
            ) : null}
            <Text
              style={{
                marginTop: 8,
                fontFamily: ListifyFonts.medium,
                fontSize: 13,
                color: theme.titleText,
              }}
            >
              {ticket.ticketTypeName} × {ticket.quantity}
            </Text>
          </View>
        </View>

        <View style={{ height: 1, backgroundColor: divider, marginHorizontal: 16 }} />

        <View style={{ flexDirection: "row", padding: 16, gap: 14, alignItems: "center" }}>
          <View
            style={{
              width: 120,
              height: 120,
              borderRadius: 12,
              backgroundColor: "#FFFFFF",
              alignItems: "center",
              justifyContent: "center",
              padding: 8,
            }}
          >
            {ticket.qrPayload ? (
              <TicketQrCode value={ticket.qrPayload} size={104} />
            ) : (
              <MaterialIcons name="qr-code-2" size={48} color={theme.secondaryText} />
            )}
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <View
              style={{
                alignSelf: "flex-start",
                backgroundColor: isDark ? "rgba(5,150,105,0.2)" : "rgba(5,150,105,0.12)",
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 6,
                marginBottom: 8,
              }}
            >
              <Text style={{ fontFamily: ListifyFonts.bold, fontSize: 11, color: statusColor }}>
                {statusLabel}
              </Text>
            </View>
            <Text
              style={{
                fontFamily: ListifyFonts.semiBold,
                fontSize: 13,
                color: theme.titleText,
              }}
            >
              Booking ID
            </Text>
            <Text
              style={{
                marginTop: 2,
                fontFamily: ListifyFonts.bold,
                fontSize: 15,
                color: theme.titleText,
                letterSpacing: 0.3,
              }}
            >
              {ticket.bookingId}
            </Text>
            {order?.totalAmount != null ? (
              <Text
                style={{
                  marginTop: 8,
                  fontFamily: ListifyFonts.regular,
                  fontSize: 12,
                  color: theme.secondaryText,
                }}
              >
                Paid {order.currency === "INR" ? "₹" : ""}
                {order.totalAmount}
              </Text>
            ) : null}
          </View>
        </View>

        <View
          style={{
            flexDirection: "row",
            gap: 10,
            paddingHorizontal: 16,
            paddingBottom: 16,
          }}
        >
          <Pressable
            onPress={onViewTicket}
            style={({ pressed }) => ({
              flex: 1,
              borderRadius: 999,
              backgroundColor: theme.ctaBg,
              paddingVertical: 13,
              alignItems: "center",
              opacity: pressed ? 0.88 : 1,
            })}
          >
            <Text
              style={{
                fontFamily: ListifyFonts.bold,
                fontSize: 14,
                color: theme.ctaText,
              }}
            >
              View ticket
            </Text>
          </Pressable>

          <Pressable
            onPress={() => void handleShare()}
            style={({ pressed }) => ({
              flex: 1,
              borderRadius: 999,
              backgroundColor: mutedBg,
              paddingVertical: 13,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              opacity: pressed ? 0.88 : 1,
            })}
          >
            <MaterialIcons name="share" size={18} color={theme.titleText} />
            <Text
              style={{
                fontFamily: ListifyFonts.semiBold,
                fontSize: 14,
                color: theme.titleText,
              }}
            >
              Share ticket
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export const EventBookedTicketCard = memo(EventBookedTicketCardImpl);
