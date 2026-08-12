/**
 * ProductThreadSection — renders the header banner for a product thread.
 * Shows the product image, title, price, status, and offer badge.
 * Appears as a sticky section header inside the chat FlatList.
 */
import { MaterialIcons } from "@expo/vector-icons";
import { Image } from "@/lib/nativewind-interop";
import { resolveAbsoluteMediaUrl } from "@/features/auth/services/auth-api";
import type { ProductThread, ChatParticipant } from "@/features/messaging/services/chat-api";
import { ListifyFonts } from "@/constants/typography";
import { useTheme } from "@/providers/theme-provider";
import { Text, View, Pressable } from "react-native";

const BRAND  = "#27BB97";
const SOLD   = "#EF4444";
const ACTIVE = "#10B981";

type Props = {
  thread:      ProductThread;
  /** Current user id — used to label the listing as "Posted by me" vs.
   *  "Posted by <seller>". Pass undefined if not signed in. */
  currentUserId?: string;
  isExpanded?: boolean;
  onToggle?:    () => void;
  /** Navigate to listing detail when the banner is tapped. */
  onPress?:     () => void;
};

function participantIdOf(p: ChatParticipant | string | null | undefined): string {
  if (!p) return "";
  if (typeof p === "string") return p;
  return String(p.id ?? p._id ?? "");
}

function sellerNameOf(seller: ChatParticipant | string | null | undefined): string {
  if (!seller || typeof seller === "string") return "the seller";
  return seller.name || "the seller";
}

export function ProductThreadSection({ thread, currentUserId, onPress }: Props) {
  const { colors, resolvedMode } = useTheme();
  const isDark = resolvedMode === "dark";
  const product    = thread.product;
  const isSold     = thread.status === "sold" || thread.status === "closed";
  const statusColor = isSold ? SOLD : ACTIVE;
  const statusLabel = isSold
    ? (thread.closedReason === "sold" ? "SOLD" : "CLOSED")
    : "ACTIVE";

  const sellerId = participantIdOf(thread.seller);
  const postedByMe = !!currentUserId && sellerId === currentUserId;
  const postedByLabel = postedByMe
    ? "Posted by me"
    : `Posted by ${sellerNameOf(thread.seller)}`;

  const imageUrl = product.image
    ? resolveAbsoluteMediaUrl(product.image) ?? undefined
    : undefined;

  const bannerBg = isDark ? colors.surfaceElevated : colors.surfaceMuted;
  const bannerPressed = isDark ? colors.surfaceMuted : "#F0FDF9";
  const borderColor = isSold
    ? (isDark ? "rgba(239,68,68,0.35)" : "#FECACA")
    : (isDark ? "rgba(16,185,129,0.35)" : "#D1FAE5");

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection:    "row",
        alignItems:       "center",
        backgroundColor:  pressed ? bannerPressed : bannerBg,
        borderRadius:     12,
        marginHorizontal: 12,
        marginVertical:   6,
        padding:          10,
        borderWidth:      1,
        borderColor,
        gap:              10,
      })}
    >
      <View
        style={{
          width:        52,
          height:       52,
          borderRadius: 8,
          overflow:     "hidden",
          backgroundColor: colors.skeleton,
        }}
      >
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={{ width: 52, height: 52 }}
            contentFit="cover"
          />
        ) : (
          <View
            style={{
              width: 52, height: 52,
              alignItems: "center", justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 22 }}>📦</Text>
          </View>
        )}
      </View>

      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <Text
            style={{ fontFamily: ListifyFonts.semiBold, fontSize: 14, color: colors.textPrimary, flexShrink: 1 }}
            numberOfLines={1}
          >
            {product.title || "Product"}
          </Text>
          <View
            style={{
              backgroundColor: statusColor + "20",
              borderRadius:    4,
              paddingHorizontal: 6,
              paddingVertical:   1,
            }}
          >
            <Text
              style={{ fontFamily: ListifyFonts.bold, fontSize: 10, color: statusColor, letterSpacing: 0.5 }}
            >
              {statusLabel}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2, gap: 8, flexWrap: "wrap" }}>
          {product.price != null && (
            <Text style={{ fontFamily: ListifyFonts.semiBold, fontSize: 13, color: colors.textPrimary }}>
              {product.currency}{product.price.toLocaleString("en-IN")}
            </Text>
          )}
          <Text
            style={{
              fontFamily: ListifyFonts.regular,
              fontSize: 11,
              color: postedByMe ? BRAND : colors.textSecondary,
            }}
            numberOfLines={1}
          >
            {postedByLabel}
          </Text>
        </View>
      </View>

      <MaterialIcons name="chevron-right" size={20} color={colors.iconMuted} />
    </Pressable>
  );
}
