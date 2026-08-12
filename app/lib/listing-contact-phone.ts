import { Linking, Platform } from "react-native";

import type { ListingItem } from "@/features/listing/services/listing-api";
import { recordCallClick } from "@/features/marketplace/services/marketplace-api";
import { showErrorToast } from "@/lib/toast";

export type ListingContactPhone = {
  /** Human-readable number shown in UI */
  display: string;
  /** E.164 value for tel: links */
  e164: string;
};

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function normalizePhoneCode(code?: string | null): string {
  const trimmed = (code ?? "+91").trim();
  if (!trimmed) return "+91";
  return trimmed.startsWith("+") ? trimmed : `+${trimmed}`;
}

function toE164(raw: string, phoneCode: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) {
    const digits = digitsOnly(trimmed);
    return digits ? `+${digits}` : "";
  }

  const digits = digitsOnly(trimmed);
  if (!digits) return "";

  const codeDigits = digitsOnly(phoneCode);
  if (codeDigits && digits.startsWith(codeDigits) && digits.length > codeDigits.length + 6) {
    return `+${digits}`;
  }

  return `+${codeDigits}${digits}`;
}

function formatDisplay(raw: string, phoneCode: string, e164: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("+")) return trimmed;
  if (trimmed) return `${normalizePhoneCode(phoneCode)} ${trimmed}`.replace(/\s+/g, " ").trim();
  return e164;
}

/**
 * Resolves listing contact phone from phone / phoneCode / contactPhone fields.
 */
export function resolveListingContactPhone(listing: ListingItem): ListingContactPhone | null {
  const phoneCode = normalizePhoneCode((listing as { phoneCode?: string }).phoneCode);
  const contactPhoneRaw = String(
    listing.contactPhone ?? (listing as { contactPhone?: string }).contactPhone ?? "",
  ).trim();
  const phoneRaw = String(listing.phone ?? "").trim();
  const sellerPhone = String(
    (listing.seller as { phone?: string } | undefined)?.phone ??
      (typeof listing.userId === "object"
        ? (listing.userId as { phone?: string }).phone
        : "") ??
      "",
  ).trim();

  const source = contactPhoneRaw || phoneRaw || sellerPhone;
  if (!source) return null;

  const e164 = toE164(source, phoneCode);
  if (!e164) return null;

  return {
    e164,
    display: formatDisplay(phoneRaw || contactPhoneRaw || sellerPhone, phoneCode, e164),
  };
}

export type OpenListingPhoneDialerParams = {
  contact: ListingContactPhone;
  listingId: string;
  sellerId: string;
  listingModel?: string;
};

const CATEGORY_LISTING_MODEL: Record<string, string> = {
  properties: "Property",
  vehicles: "Vehicle",
  jobs: "Job",
  services: "Service",
  events: "Event",
  electronics: "ForSale",
  mobiles: "ForSale",
  furniture: "ForSale",
  fashion: "ForSale",
  forsale: "ForSale",
  sports: "ForSale",
  collectibles: "ForSale",
  "pets supplies": "ForSale",
  books: "ForSale",
  beauty: "ForSale",
  toys: "ForSale",
  others: "ForSale",
  takecare: "ForSale",
};

/** Mongoose model name for marketplace call analytics. */
export function getListingModelForCategory(categorySlug: string): string {
  return CATEGORY_LISTING_MODEL[categorySlug] ?? "ForSale";
}

/** Section heading for seller / broker contact on detail screens. */
export function getListingContactSectionTitle(categorySlug: string): string {
  switch (categorySlug) {
    case "properties":
      return "Listing Broker";
    case "jobs":
      return "Company Contact";
    case "services":
      return "Service Provider";
    case "takecare":
      return "Care Provider";
    default:
      return "Contact Seller";
  }
}

/** Opens the native phone dialer (with analytics when possible). */
export async function openListingPhoneDialer({
  contact,
  listingId,
  sellerId,
  listingModel = "Property",
}: OpenListingPhoneDialerParams): Promise<void> {
  const directTel = `tel:${contact.e164}`;

  try {
    let telUrl = directTel;

    try {
      const res = await recordCallClick({
        listingId,
        listingModel,
        sellerId,
        contactPhone: contact.e164,
        platform: Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web",
        eventType: "call_click",
      });
      telUrl = res.telUrl || directTel;
    } catch {
      // Analytics failure should not block the dialer.
    }

    const canOpen = await Linking.canOpenURL(telUrl);
    if (!canOpen) {
      showErrorToast("Cannot Call", `Please dial manually:\n${contact.display}`);
      return;
    }

    await Linking.openURL(telUrl);
  } catch {
    try {
      await Linking.openURL(directTel);
    } catch {
      showErrorToast("Call Failed", "Could not open the phone dialer.");
    }
  }
}
