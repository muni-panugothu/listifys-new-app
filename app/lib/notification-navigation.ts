import type { NotificationItem } from "@/features/auth/services/auth-api";
import type { Href } from "@/lib/safe-router";

function metaString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const v = metadata?.[key];
  if (v == null || v === "") return undefined;
  return String(v);
}

/** Build a route to the listing detail screen for a product thread / notification. */
export function getListingDetailHref(
  listingType: string,
  listingId: string,
): Href | null {
  return listingDetailHref(listingType, listingId);
}

function listingDetailHref(
  listingType: string,
  listingId: string,
): Href | null {
  const special: Record<string, "/event-detail" | "/property-detail" | "/job-detail"> = {
    events: "/event-detail",
    properties: "/property-detail",
    jobs: "/job-detail",
  };
  const path = special[listingType];
  if (path) {
    return {
      pathname: path,
      params: { category: listingType, id: listingId },
    } as Href;
  }
  return {
    pathname: "/listing-detail-template",
    params: { category: listingType, id: listingId },
  } as Href;
}

function chatHref(item: NotificationItem): Href | null {
  const metadata = item.metadata ?? item.data;
  const senderId =
    item.sender?.id ?? metaString(metadata, "senderId") ?? metaString(metadata, "sender");
  const senderName = item.sender?.name ?? metaString(metadata, "senderName") ?? "";
  const conversationId = metaString(metadata, "conversationId");

  if (!conversationId && !senderId) return null;

  return {
    pathname: "/chat-conversation",
    params: {
      ...(conversationId ? { conversationId } : {}),
      ...(senderId
        ? {
            recipientId: senderId,
            name: senderName,
          }
        : {}),
      ...(metaString(metadata, "listingId")
        ? { listingId: metaString(metadata, "listingId")! }
        : {}),
      ...(metaString(metadata, "listingType")
        ? { listingType: metaString(metadata, "listingType")! }
        : {}),
      ...(metaString(metadata, "listingTitle")
        ? { listingTitle: metaString(metadata, "listingTitle")! }
        : {}),
      ...(metaString(metadata, "listingImage")
        ? { listingImage: metaString(metadata, "listingImage")! }
        : {}),
      ...(metaString(metadata, "currency")
        ? { currency: metaString(metadata, "currency")! }
        : {}),
    },
  } as Href;
}

/** Resolve where to navigate when the user taps a notification. */
export function getNotificationRoute(item: NotificationItem): Href | null {
  if (item._id.startsWith("dummy-")) return null;

  const metadata = item.metadata ?? item.data;
  const senderId =
    item.sender?.id ?? metaString(metadata, "senderId") ?? metaString(metadata, "sender");
  const senderName = item.sender?.name ?? "";

  const type = item.type?.toLowerCase() ?? "";

  if (type === "message") {
    return chatHref(item);
  }

  if (type === "follow") {
    const followerId =
      metaString(metadata, "followerId") ?? senderId;
    const followerName =
      metaString(metadata, "followerName") ?? senderName;
    if (!followerId) return null;
    return {
      pathname: "/seller-public-profile",
      params: { sellerId: followerId, sellerName: followerName },
    } as Href;
  }

  if (type === "new_listing" || type === "listing_saved" || type === "price_drop") {
    const listingId = metaString(metadata, "listingId");
    const listingType = metaString(metadata, "listingType") ?? "electronics";
    if (!listingId) return null;
    return listingDetailHref(listingType, listingId);
  }

  if (
    type === "offer_received" ||
    type === "offer_accepted" ||
    type === "offer_rejected"
  ) {
    return chatHref(item) ?? (senderId
      ? ({
          pathname: "/seller-public-profile",
          params: { sellerId: senderId, sellerName: senderName },
        } as Href)
      : null);
  }

  if (type === "review" || type === "review_received") {
    if (senderId) {
      return {
        pathname: "/seller-public-profile",
        params: { sellerId: senderId, sellerName: senderName },
      } as Href;
    }
    return null;
  }

  if (type.startsWith("booking")) {
    const bookingId = metaString(metadata, "bookingId");
    if (bookingId && senderId) {
      return chatHref(item);
    }
    if (senderId) {
      return {
        pathname: "/seller-public-profile",
        params: { sellerId: senderId, sellerName: senderName },
      } as Href;
    }
    return null;
  }

  if (senderId) {
    return {
      pathname: "/seller-public-profile",
      params: { sellerId: senderId, sellerName: senderName },
    } as Href;
  }

  return null;
}

export function normalizeNotification(raw: NotificationItem): NotificationItem {
  const metadata = (raw.metadata ?? raw.data ?? {}) as Record<string, unknown>;

  const senderRaw = raw.sender as
    | NotificationItem["sender"]
    | string
    | { _id?: string; id?: string; name?: string; profileImageUrl?: string | null }
    | undefined;

  let sender: NotificationItem["sender"] | undefined;
  if (typeof senderRaw === "string") {
    sender = { id: senderRaw, name: "" };
  } else if (senderRaw && typeof senderRaw === "object") {
    sender = {
      id: senderRaw.id ?? (senderRaw as { _id?: string })._id ?? "",
      name: senderRaw.name ?? "",
      profileImageUrl: senderRaw.profileImageUrl ?? null,
    };
  }

  return {
    ...raw,
    title: raw.title ?? "",
    metadata,
    sender,
  };
}
