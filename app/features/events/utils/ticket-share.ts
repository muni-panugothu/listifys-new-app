import * as FileSystem from "expo-file-system";
import { Share } from "react-native";

import type { TicketDetail } from "@/features/events/services/event-ticketing-api";

export function buildTicketQrImageUrl(qrPayload: string, size = 512): string {
  const dim = Math.max(128, Math.round(size));
  return `https://api.qrserver.com/v1/create-qr-code/?size=${dim}x${dim}&data=${encodeURIComponent(qrPayload)}&margin=0`;
}

export function buildTicketShareMessage(detail: TicketDetail): string {
  const event = detail.event;
  const lines = [
    "🎟️ My Listifys Event Ticket",
    "",
    `Event: ${event?.title ?? "Event"}`,
    event?.eventDate
      ? `📅 Date: ${event.eventDate}${event.eventTime ? `\n⏰ Time: ${event.eventTime}` : ""}`
      : "",
    event?.venue || event?.location
      ? `📍 Venue: ${[event?.venue, event?.location].filter(Boolean).join(", ")}`
      : "",
    `🎫 Ticket: ${detail.ticket.ticketTypeName} × ${detail.ticket.quantity}`,
    `🔖 Booking ID: ${detail.ticket.bookingId}`,
  ].filter(Boolean);

  return lines.join("\n");
}

async function downloadTicketQrImage(qrPayload: string, bookingId: string): Promise<string | null> {
  try {
    const cacheDir = FileSystem.cacheDirectory;
    if (!cacheDir) return null;
    const safeId = bookingId.replace(/[^\w-]/g, "_");
    const localPath = `${cacheDir}listifys-ticket-${safeId}.png`;
    const qrUrl = buildTicketQrImageUrl(qrPayload, 512);
    const result = await FileSystem.downloadAsync(qrUrl, localPath);
    return result.status === 200 ? result.uri : null;
  } catch {
    return null;
  }
}

export async function shareEventTicket(detail: TicketDetail): Promise<void> {
  const qrLink = detail.ticket.qrPayload
    ? buildTicketQrImageUrl(detail.ticket.qrPayload, 512)
    : null;
  const message = [
    buildTicketShareMessage(detail),
    qrLink ? `\n🧾 Ticket QR: ${qrLink}` : "",
  ]
    .filter(Boolean)
    .join("");

  const qrUri = detail.ticket.qrPayload
    ? await downloadTicketQrImage(detail.ticket.qrPayload, detail.ticket.bookingId)
    : null;

  if (qrUri) {
    try {
      await Share.share({ message, url: qrUri, title: "Share ticket" });
      return;
    } catch {
      /* fall through to text-only share */
    }
  }

  await Share.share({ message, title: "Share ticket" });
}
