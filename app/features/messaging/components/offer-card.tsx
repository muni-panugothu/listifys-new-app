/**
 * OfferCard — rendered inside a product thread when messageType === "offer".
 *
 * Looks like a regular message bubble (matching WhatsApp's "structured" message
 * style) — the body is the server's pre-formatted multi-line text:
 *
 *   📋 Offer for: Bracelet
 *
 *   💰 Listed Price: ₹600
 *   🏷️ My Offer: ₹500
 *
 *   Hi, I'm interested in this item and would like to offer ₹500. Please …
 *
 * The seller sees Accept / Decline buttons appended below when the offer is
 * still pending and the thread is active.
 */
import { Text, View, Pressable } from "react-native";
import type { ChatMessage, ProductThread } from "@/features/messaging/services/chat-api";
import { ListifyFonts } from "@/constants/typography";

const BRAND   = "#27BB97";
const SOLD    = "#EF4444";
const PENDING = "#F59E0B";
const ACCENT  = "#3B82F6";
const TEXT_DARK = "#1A1A1A";

type Props = {
  message: ChatMessage;
  thread:  ProductThread;
  isSeller: boolean;
  fromMe: boolean;
  onAccept?: () => void;
  onDecline?: () => void;
};

const STATUS_COLORS: Record<string, string> = {
  pending:  PENDING,
  accepted: BRAND,
  declined: SOLD,
  countered: ACCENT,
};

// Legacy server messages (pre-format-update) only have a one-liner like
// "Buyer offered ₹500". We upgrade those on the fly so the UI is consistent
// regardless of when the message was sent.
function buildBody(message: ChatMessage, thread: ProductThread): string {
  const raw = (message.content || "").trim();
  if (raw.includes("📋 Offer for")) return raw;

  const currency = message.offerData?.currency || thread.product?.currency || "₹";
  const amount = Number(message.offerData?.amount || 0);
  const listedPrice = Number(thread.product?.price || 0);
  const productTitle = thread.product?.title || "this item";

  const amountLabel = amount > 0
    ? `${currency}${Math.round(amount).toLocaleString("en-IN")}`
    : `${currency}—`;
  const listedLabel = listedPrice > 0
    ? `${currency}${Math.round(listedPrice).toLocaleString("en-IN")}`
    : null;

  if (message.offerData?.status === "accepted") {
    return `✅ Offer accepted\n\n${productTitle} — ${amountLabel}`;
  }
  if (message.offerData?.status === "declined") {
    return `❌ Offer declined\n\n${productTitle} — ${amountLabel}`;
  }

  return [
    `📋 Offer for: ${productTitle}`,
    "",
    ...(listedLabel ? [`💰 Listed Price: ${listedLabel}`] : []),
    `🏷️ My Offer: ${amountLabel}`,
    "",
    `Hi, I'm interested in this item and would like to offer ${amountLabel}. Please let me know if this works for you!`,
  ].join("\n");
}

export function OfferCard({ message, thread, isSeller, fromMe, onAccept, onDecline }: Props) {
  const status      = message.offerData?.status ?? "pending";
  const accentColor = STATUS_COLORS[status] ?? PENDING;
  const threadOfferPending = thread.offerStatus === "pending";
  const showActions = isSeller && status === "pending" && threadOfferPending && thread.status === "active";

  const body = buildBody(message, thread);

  return (
    <View
      style={{
        backgroundColor: "#FFFBEB",
        borderRadius: 16,
        borderBottomRightRadius: fromMe ? 4 : 16,
        borderBottomLeftRadius:  fromMe ? 16 : 4,
        borderWidth: 1,
        borderColor: accentColor + "55",
        paddingHorizontal: 14,
        paddingVertical: 12,
        maxWidth: 300,
      }}
    >
      <Text
        style={{
          fontFamily: ListifyFonts.regular,
          fontSize: 14,
          color: TEXT_DARK,
          lineHeight: 20,
        }}
      >
        {body}
      </Text>

      {showActions && (
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          <Pressable
            onPress={onDecline}
            style={({ pressed }) => ({
              flex: 1,
              alignItems: "center",
              paddingVertical: 9,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: SOLD,
              backgroundColor: pressed ? "#FEE2E2" : "#FFF5F5",
            })}
          >
            <Text style={{ fontFamily: ListifyFonts.semiBold, fontSize: 13, color: SOLD }}>
              Decline
            </Text>
          </Pressable>
          <Pressable
            onPress={onAccept}
            style={({ pressed }) => ({
              flex: 1,
              alignItems: "center",
              paddingVertical: 9,
              borderRadius: 10,
              backgroundColor: pressed ? "#059669" : BRAND,
            })}
          >
            <Text style={{ fontFamily: ListifyFonts.semiBold, fontSize: 13, color: "#FFF" }}>
              Accept
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
