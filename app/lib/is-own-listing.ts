import type { ListingItem } from "@/features/listing/services/listing-api";

type ListingOwnerFields = {
  seller?: ListingItem["seller"];
  userId?: string | { _id?: string; id?: string };
  sellerId?: string;
};

const OBJECT_ID_RE = /^[a-f\d]{24}$/i;

function coerceMongoId(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return OBJECT_ID_RE.test(trimmed) ? trimmed : null;
  }
  if (typeof value === "object") {
    const rec = value as { _id?: unknown; id?: unknown; toString?: () => string };
    const fromField = coerceMongoId(rec._id) ?? coerceMongoId(rec.id);
    if (fromField) return fromField;
    if (typeof rec.toString === "function") {
      const asString = String(value);
      if (OBJECT_ID_RE.test(asString)) return asString;
    }
  }
  return null;
}

/** Resolve listing owner id from API shapes (ObjectId string, populated seller, or populated userId). */
export function getListingSellerId(listing: ListingOwnerFields): string | null {
  const explicit = coerceMongoId(listing.sellerId);
  if (explicit) return explicit;

  const fromSeller = coerceMongoId(listing.seller);
  if (fromSeller) return fromSeller;

  const fromUser = coerceMongoId(listing.userId);
  if (fromUser) return fromUser;

  return null;
}

export function isOwnListing(
  listing: ListingOwnerFields | null | undefined,
  userId?: string | null,
): boolean {
  if (!userId || !listing) return false;
  const sellerId = getListingSellerId(listing);
  return sellerId != null && sellerId === String(userId);
}

export function filterOutOwnListings<T extends ListingOwnerFields>(
  listings: T[],
  userId?: string | null,
): T[] {
  if (!userId) return listings;
  return listings.filter((item) => !isOwnListing(item, userId));
}
