import type { CheckoutOrderResponse, TicketDetail } from "@/features/events/services/event-ticketing-api";

export type PendingTicketPayment = {
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
};

export type PendingTicketPreview = {
  orderId: string;
  bookingId: string;
  quantity: number;
  ticketTypeName: string;
  totalAmount: number;
  currency: string;
  event?: TicketDetail["event"];
  cancellationPolicy?: TicketDetail["cancellationPolicy"];
  payment?: PendingTicketPayment;
};

let preview: PendingTicketPreview | null = null;

export function setPendingTicketPreview(next: PendingTicketPreview) {
  preview = next;
}

export function patchPendingTicketPayment(orderId: string, payment: PendingTicketPayment) {
  if (!preview || preview.orderId !== orderId) return;
  preview = { ...preview, payment: { ...preview.payment, ...payment } };
}

export function getPendingTicketPreview(orderId: string): PendingTicketPreview | null {
  if (!preview || preview.orderId !== orderId) return null;
  return preview;
}

export function consumePendingTicketPreview(orderId: string): PendingTicketPreview | null {
  const current = getPendingTicketPreview(orderId);
  if (current) preview = null;
  return current;
}

export function buildTicketDetailFromPreview(source: PendingTicketPreview): TicketDetail {
  return {
    ticket: {
      id: "",
      bookingId: source.bookingId,
      secureToken: "",
      qrPayload: "",
      status: "ACTIVE",
      quantity: source.quantity,
      ticketTypeName: source.ticketTypeName,
      createdAt: new Date().toISOString(),
    },
    order: {
      id: source.orderId,
      status: "PAYMENT_PROCESSING",
      totalAmount: source.totalAmount,
      currency: source.currency,
    },
    event: source.event,
    cancellationPolicy: source.cancellationPolicy,
  };
}

export function buildTicketDetailFromCheckout(
  confirmed: CheckoutOrderResponse,
  preview?: PendingTicketPreview | null,
): TicketDetail | null {
  const ticket = confirmed.ticket;
  const order = confirmed.order;
  if (!ticket?.id) return null;

  const qrPayload =
    ticket.qrPayload ??
    (ticket.secureToken ? `LISTIFYS:TICKET:${ticket.secureToken}` : "");

  if (!qrPayload) return null;

  return {
    ticket: {
      id: ticket.id,
      bookingId: order.bookingId,
      secureToken: ticket.secureToken ?? "",
      qrPayload,
      status: ticket.status ?? "ACTIVE",
      quantity: ticket.quantity ?? order.quantity,
      ticketTypeName: order.ticketTypeName,
      createdAt: order.createdAt,
    },
    order: {
      id: order.id,
      status: order.status,
      totalAmount: order.totalAmount,
      currency: order.currency,
    },
    event: order.eventSnapshot ?? preview?.event,
    cancellationPolicy: preview?.cancellationPolicy,
  };
}
