import { requestJson } from "@/features/auth/services/auth-api";

export type TicketTypeAvailability = {
  id: string;
  name: string;
  description?: string;
  pricePaise: number;
  price: number;
  currency: string;
  available: number;
  totalQuantity: number;
  maxPerOrder: number;
  cancellationAllowed: boolean;
  cancellationCutoffHours: number;
  refundPercentage: number;
  status: string;
};

export type EventAvailability = {
  event: {
    id: string;
    title: string;
    status: string;
    venue?: string;
    location?: string;
    eventDate?: string;
    eventTime?: string;
    image?: string | null;
  };
  ticketTypes: TicketTypeAvailability[];
};

export type TicketHoldResponse = {
  holdId: string;
  expiresAt: string;
  expiresInSeconds: number;
  quantity: number;
  ticketType: { id: string; name: string; pricePaise: number; price: number };
  amounts: {
    unitPricePaise: number;
    subtotalPaise: number;
    feesPaise: number;
    taxPaise: number;
    totalAmountPaise: number;
    totalAmount: number;
    subtotal: number;
  };
  cancellationPolicy: {
    allowed: boolean;
    cutoffHours: number;
    refundPercentage: number;
  };
};

export type CheckoutOrderResponse = {
  order: {
    id: string;
    bookingId: string;
    status: string;
    quantity: number;
    ticketTypeName: string;
    totalAmountPaise: number;
    totalAmount: number;
    currency: string;
    eventSnapshot?: {
      title: string;
      venue?: string;
      location?: string;
      eventDate?: string;
      eventTime?: string;
      image?: string;
      subcategory?: string;
    };
    razorpayOrderId?: string;
    createdAt: string;
  };
  ticket?: {
    id: string;
    secureToken?: string;
    qrPayload?: string;
    status: string;
    quantity: number;
  } | null;
  payment?: {
    provider?: string;
    razorpayKeyId?: string;
    razorpayOrderId?: string;
    amountPaise?: number;
    checkoutToken?: string;
    session?: {
      provider: "payu";
      actionUrl: string;
      fields: Record<string, string>;
    } | null;
  } | null;
};

export type TicketDetail = {
  ticket: {
    id: string;
    bookingId: string;
    secureToken: string;
    qrPayload: string;
    status: string;
    quantity: number;
    ticketTypeName: string;
    checkedInAt?: string;
    createdAt: string;
  };
  order?: {
    id: string;
    status: string;
    totalAmount: number;
    currency: string;
  };
  event?: {
    title: string;
    venue?: string;
    location?: string;
    eventDate?: string;
    eventTime?: string;
    image?: string;
    subcategory?: string;
  };
  cancellationPolicy?: {
    allowed: boolean;
    cutoffHours: number;
    refundPercentage: number;
  };
};

export type MyTicketItem = {
  id: string;
  bookingId: string;
  status: string;
  quantity: number;
  ticketTypeName: string;
  event: TicketDetail["event"] | null;
  totalAmount: number;
  createdAt: string;
};

function idempotencyKey(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function fetchEventAvailability(eventId: string) {
  const res = await requestJson<{ success: boolean; data: EventAvailability }>(
    `/api/event-tickets/events/${eventId}/availability`,
  );
  return res.data;
}

export async function createTicketHold(
  eventId: string,
  ticketTypeId: string,
  quantity: number,
) {
  const res = await requestJson<{ success: boolean; data: TicketHoldResponse }>(
    `/api/event-tickets/events/${eventId}/holds`,
    {
      method: "POST",
      body: JSON.stringify({
        ticketTypeId,
        quantity,
        idempotencyKey: idempotencyKey("hold"),
      }),
    },
  );
  return res.data;
}

export async function createCheckoutOrder(holdId: string) {
  const res = await requestJson<{ success: boolean; data: CheckoutOrderResponse }>(
    "/api/event-tickets/orders",
    {
      method: "POST",
      body: JSON.stringify({
        holdId,
        idempotencyKey: idempotencyKey("order"),
      }),
    },
  );
  return res.data;
}

export async function verifyEventPayment(payload: {
  orderId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}) {
  const res = await requestJson<{ success: boolean; data: CheckoutOrderResponse }>(
    "/api/event-tickets/payments/verify",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
  return res.data;
}

export async function fetchMyTickets(tab: "upcoming" | "past" | "cancelled" = "upcoming") {
  const res = await requestJson<{ success: boolean; tickets: MyTicketItem[] }>(
    `/api/event-tickets/my-tickets?tab=${tab}`,
  );
  return res.tickets;
}

export async function fetchTicketDetail(ticketId: string) {
  const res = await requestJson<{ success: boolean; data: TicketDetail }>(
    `/api/event-tickets/tickets/${ticketId}`,
  );
  return res.data;
}

export async function cancelEventTicket(ticketId: string) {
  return requestJson<{ success: boolean }>(
    `/api/event-tickets/tickets/${ticketId}/cancel`,
    { method: "POST" },
  );
}

export async function fetchPaymentConfig() {
  return requestJson<{ success: boolean; configured: boolean; keyId: string | null }>(
    "/api/event-tickets/payment/config",
  );
}

export async function validateTicketScan(token: string, eventId?: string) {
  return requestJson<{
    success: boolean;
    valid: boolean;
    code: string;
    message: string;
    ticket?: unknown;
  }>("/api/event-tickets/scan/validate", {
    method: "POST",
    body: JSON.stringify({ token, eventId }),
  });
}

export async function checkInTicket(token: string, eventId?: string) {
  return requestJson<{
    success: boolean;
    valid: boolean;
    code: string;
    message: string;
    ticket?: unknown;
  }>("/api/event-tickets/scan/check-in", {
    method: "POST",
    body: JSON.stringify({ token, eventId }),
  });
}
