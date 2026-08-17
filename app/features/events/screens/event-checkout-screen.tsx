import { MaterialIcons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "@/lib/safe-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PayuCheckoutModal } from "@/features/events/components/payu-checkout-modal";

import {
  createCheckoutOrder,
  createTicketHold,
  fetchEventAvailability,
  verifyEventPayment,
  verifyInAppPayuOrder,
  type EventAvailability,
  type TicketHoldResponse,
} from "@/features/events/services/event-ticketing-api";
import type {
  PayuCheckoutReturn,
  PayuPaymentSession,
} from "@/features/events/utils/payu-checkout-html";
import { ListifyFonts } from "@/constants/typography";
import { formatPrice } from "@/lib/currency";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { useTheme } from "@/providers/theme-provider";

type PaymentPhase = "idle" | "initializing" | "checkout" | "verifying";

export function EventCheckoutScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const [loading, setLoading] = useState(true);
  const [availability, setAvailability] = useState<EventAvailability | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [hold, setHold] = useState<TicketHoldResponse | null>(null);
  const [holdSecondsLeft, setHoldSecondsLeft] = useState(0);
  const [paymentPhase, setPaymentPhase] = useState<PaymentPhase>("idle");
  const [payuSession, setPayuSession] = useState<PayuPaymentSession | null>(null);

  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const payLockRef = useRef(false);
  const activeOrderIdRef = useRef<string | null>(null);

  const selectedType = useMemo(
    () => availability?.ticketTypes.find((t) => t.id === selectedTypeId) ?? null,
    [availability, selectedTypeId],
  );

  const paying = paymentPhase !== "idle";

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      const data = await fetchEventAvailability(eventId);
      setAvailability(data);
      if (data.ticketTypes.length > 0) {
        setSelectedTypeId(data.ticketTypes[0].id);
      }
    } catch (e) {
      showErrorToast("Unavailable", e instanceof Error ? e.message : "Could not load tickets");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (holdTimerRef.current) clearInterval(holdTimerRef.current);
    if (!hold) {
      setHoldSecondsLeft(0);
      return;
    }
    const tick = () => {
      const left = Math.max(
        0,
        Math.floor((new Date(hold.expiresAt).getTime() - Date.now()) / 1000),
      );
      setHoldSecondsLeft(left);
      if (left <= 0 && holdTimerRef.current) {
        clearInterval(holdTimerRef.current);
        setHold(null);
        showErrorToast("Hold expired", "Please select tickets again.");
      }
    };
    tick();
    holdTimerRef.current = setInterval(tick, 1000);
    return () => {
      if (holdTimerRef.current) clearInterval(holdTimerRef.current);
    };
  }, [hold]);

  const startHold = useCallback(async () => {
    if (!eventId || !selectedTypeId) return null;
    try {
      const holdRes = await createTicketHold(eventId, selectedTypeId, quantity);
      setHold(holdRes);
      return holdRes;
    } catch (e) {
      showErrorToast("Not available", e instanceof Error ? e.message : "Could not reserve tickets");
      return null;
    }
  }, [eventId, quantity, selectedTypeId]);

  const finalizeInAppPayment = useCallback(
    async (orderId: string) => {
      setPayuSession(null);
      setPaymentPhase("verifying");
      try {
        let confirmed = null;
        let lastError: Error | null = null;
        for (let attempt = 0; attempt < 4; attempt += 1) {
          try {
            confirmed = await verifyInAppPayuOrder(orderId);
            break;
          } catch (e) {
            lastError = e instanceof Error ? e : new Error("Verification failed");
            if (attempt < 3) {
              await new Promise((resolve) => setTimeout(resolve, 2500));
            }
          }
        }
        if (!confirmed) {
          throw lastError ?? new Error("Verification failed");
        }
        showSuccessToast("Payment successful", "Your ticket is ready");
        const ticketId = confirmed.ticket?.id;
        if (ticketId) {
          router.replace(`/event-ticket?ticketId=${ticketId}` as Href);
        }
      } catch (e) {
        showErrorToast(
          "Verification failed",
          e instanceof Error ? e.message : "Please contact support",
        );
      } finally {
        activeOrderIdRef.current = null;
        setPaymentPhase("idle");
        payLockRef.current = false;
      }
    },
    [router],
  );

  const finalizePayment = useCallback(
    async (orderId: string, result: PayuCheckoutReturn) => {
      setPaymentPhase("verifying");
      try {
        const confirmed = await verifyEventPayment({
          orderId,
          razorpayOrderId: result.razorpay_order_id,
          razorpayPaymentId: result.razorpay_payment_id,
          razorpaySignature: result.razorpay_signature,
        });
        showSuccessToast("Payment successful", "Your ticket is ready");
        const ticketId = confirmed.ticket?.id;
        if (ticketId) {
          router.replace(`/event-ticket?ticketId=${ticketId}` as Href);
        }
      } catch (e) {
        showErrorToast(
          "Verification failed",
          e instanceof Error ? e.message : "Please contact support",
        );
      } finally {
        setPayuSession(null);
        activeOrderIdRef.current = null;
        setPaymentPhase("idle");
        payLockRef.current = false;
      }
    },
    [router],
  );

  const handlePay = useCallback(async () => {
    if (payLockRef.current) return;
    payLockRef.current = true;
    setPaymentPhase("initializing");

    try {
      const activeHold = hold ?? (await startHold());
      if (!activeHold) {
        setPaymentPhase("idle");
        payLockRef.current = false;
        return;
      }

      const checkout = await createCheckoutOrder(activeHold.holdId);
      const order = checkout.order;

      if (order.status === "CONFIRMED" && checkout.ticket?.id) {
        showSuccessToast("Confirmed", "Your ticket is ready");
        router.replace(`/event-ticket?ticketId=${checkout.ticket.id}` as Href);
        setPaymentPhase("idle");
        payLockRef.current = false;
        return;
      }

      const session = checkout.payment?.session;
      if (!session || checkout.payment?.provider !== "payu") {
        showErrorToast("Payment unavailable", "Payment gateway is not configured.");
        setPaymentPhase("idle");
        payLockRef.current = false;
        return;
      }

      activeOrderIdRef.current = order.id;
      setPayuSession(session);
      setPaymentPhase("checkout");
      return;
    } catch (e) {
      showErrorToast("Checkout failed", e instanceof Error ? e.message : "Try again");
    }

    setPaymentPhase("idle");
    payLockRef.current = false;
  }, [hold, router, startHold]);

  const onPayuSuccess = useCallback(
    (result: PayuCheckoutReturn) => {
      const orderId = activeOrderIdRef.current || result.orderId;
      setPayuSession(null);
      setPaymentPhase("verifying");
      setTimeout(() => {
        void finalizePayment(orderId, result);
      }, 400);
    },
    [finalizePayment],
  );

  const onPayuCancel = useCallback((message?: string) => {
    setPayuSession(null);
    activeOrderIdRef.current = null;
    setPaymentPhase("idle");
    payLockRef.current = false;
    if (message) {
      showErrorToast("Payment cancelled", message);
    }
  }, []);

  const maxQty = selectedType?.maxPerOrder ?? 10;
  const available = selectedType?.available ?? 0;

  const payLabel = useMemo(() => {
    if (paymentPhase === "initializing") return "Starting payment…";
    if (paymentPhase === "verifying") return "Confirming…";
    if (selectedType && selectedType.price <= 0) return "Confirm booking";
    return "Pay securely";
  }, [paymentPhase, selectedType]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: 16 }}>
        <Pressable onPress={() => router.back()} hitSlop={12} disabled={paying}>
          <MaterialIcons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={{ marginLeft: 12, fontFamily: ListifyFonts.bold, fontSize: 18, color: colors.textPrimary }}>
          Book tickets
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 120 }}>
        <Text style={{ fontFamily: ListifyFonts.bold, fontSize: 20, color: colors.textPrimary }}>
          {availability?.event.title}
        </Text>
        {availability?.event.venue ? (
          <Text style={{ marginTop: 4, fontFamily: ListifyFonts.regular, color: colors.textSecondary }}>
            {availability.event.venue}
          </Text>
        ) : null}

        <Text style={{ marginTop: 20, marginBottom: 10, fontFamily: ListifyFonts.semiBold, color: colors.textPrimary }}>
          Ticket type
        </Text>
        {availability?.ticketTypes.map((type) => {
          const active = type.id === selectedTypeId;
          return (
            <Pressable
              key={type.id}
              onPress={() => !paying && setSelectedTypeId(type.id)}
              disabled={paying}
              style={{
                borderWidth: 1.5,
                borderColor: active ? colors.primary : colors.border,
                backgroundColor: active ? colors.primarySoft : colors.surface,
                borderRadius: 14,
                padding: 14,
                marginBottom: 10,
                opacity: paying ? 0.7 : 1,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontFamily: ListifyFonts.semiBold, color: colors.textPrimary }}>{type.name}</Text>
                <Text style={{ fontFamily: ListifyFonts.bold, color: colors.textPrimary }}>
                  {type.price > 0 ? formatPrice(type.price, "₹") : "Free"}
                </Text>
              </View>
              <Text style={{ marginTop: 4, fontFamily: ListifyFonts.regular, fontSize: 13, color: colors.textSecondary }}>
                {type.available} left
              </Text>
            </Pressable>
          );
        })}

        <Text style={{ marginTop: 12, marginBottom: 10, fontFamily: ListifyFonts.semiBold, color: colors.textPrimary }}>
          Quantity
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <Pressable
            onPress={() => setQuantity((q) => Math.max(1, q - 1))}
            disabled={paying}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", opacity: paying ? 0.6 : 1 }}
          >
            <MaterialIcons name="remove" size={20} color={colors.textPrimary} />
          </Pressable>
          <Text style={{ fontFamily: ListifyFonts.bold, fontSize: 18, color: colors.textPrimary }}>{quantity}</Text>
          <Pressable
            onPress={() => setQuantity((q) => Math.min(maxQty, available, q + 1))}
            disabled={paying}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", opacity: paying ? 0.6 : 1 }}
          >
            <MaterialIcons name="add" size={20} color={colors.textPrimary} />
          </Pressable>
        </View>

        {selectedType && !selectedType.cancellationAllowed ? (
          <View style={{ marginTop: 16, padding: 12, borderRadius: 12, backgroundColor: colors.surfaceMuted }}>
            <Text style={{ fontFamily: ListifyFonts.medium, color: colors.textSecondary }}>
              Cancellation not available for this event.
            </Text>
          </View>
        ) : selectedType?.cancellationAllowed ? (
          <View style={{ marginTop: 16, padding: 12, borderRadius: 12, backgroundColor: colors.surfaceMuted }}>
            <Text style={{ fontFamily: ListifyFonts.medium, color: colors.textSecondary }}>
              Cancel up to {selectedType.cancellationCutoffHours}h before event · {selectedType.refundPercentage}% refund
            </Text>
          </View>
        ) : null}

        {hold ? (
          <Text style={{ marginTop: 16, fontFamily: ListifyFonts.semiBold, color: colors.primary }}>
            Tickets held · {Math.floor(holdSecondsLeft / 60)}:{String(holdSecondsLeft % 60).padStart(2, "0")} left
          </Text>
        ) : null}
      </ScrollView>

      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 16,
          paddingBottom: Math.max(insets.bottom, 12),
          paddingTop: 12,
          backgroundColor: colors.surfaceElevated,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        <Text style={{ fontFamily: ListifyFonts.bold, fontSize: 18, color: colors.textPrimary, marginBottom: 8 }}>
          {selectedType
            ? selectedType.price > 0
              ? formatPrice(selectedType.price * quantity, "₹")
              : "Free"
            : "—"}
        </Text>
        <Pressable
          onPress={() => void handlePay()}
          disabled={paying || !selectedType || available < 1}
          style={{
            backgroundColor: colors.primary,
            borderRadius: 999,
            paddingVertical: 14,
            alignItems: "center",
            opacity: paying || !selectedType || available < 1 ? 0.6 : 1,
          }}
        >
          {paying ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ fontFamily: ListifyFonts.bold, fontSize: 16, color: colors.textOnPrimary }}>
              {payLabel}
            </Text>
          )}
        </Pressable>
      </View>

      <PayuCheckoutModal
        visible={paymentPhase === "checkout" && Boolean(payuSession)}
        session={payuSession}
        orderId={activeOrderIdRef.current}
        onSuccess={onPayuSuccess}
        onInAppVerified={(orderId) => void finalizeInAppPayment(orderId)}
        onCancel={onPayuCancel}
      />

      {paymentPhase === "verifying" ? (
        <View
          pointerEvents="none"
          style={{
            ...StyleSheet.absoluteFillObject,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.15)",
          }}
        >
          <View style={{ backgroundColor: colors.surface, padding: 20, borderRadius: 16, alignItems: "center", gap: 8 }}>
            <ActivityIndicator color={colors.primary} />
            <Text style={{ fontFamily: ListifyFonts.medium, color: colors.textPrimary }}>
              Verifying payment…
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
