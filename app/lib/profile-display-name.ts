import { DUMMY_PROFILE_NAME } from "@/constants/dummy-profile";
import type { AuthUser } from "@/features/auth/services/auth-api";

/** Readable phone for the signed-in user's profile, e.g. +91 9347870616 */
export function formatPhoneReadable(phone: string): string {
  const trimmed = phone.trim();
  const match = trimmed.match(/^(\+\d{1,3})(\d{4,14})$/);
  if (match) return `${match[1]} ${match[2]}`;
  return trimmed;
}

/** Masked phone label, e.g. +91 •••• 4321 */
export function formatPhoneDisplayLabel(phone: string): string {
  const trimmed = phone.trim();
  if (!trimmed) return "";

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length <= 4) return trimmed;

  const countryMatch = trimmed.match(/^(\+\d{1,3})/);
  const country = countryMatch?.[1] ?? "";
  const last4 = digits.slice(-4);

  return country ? `${country} •••• ${last4}` : `•••• ${last4}`;
}

export function getProfileDisplayName(
  user: AuthUser | null | undefined,
  isAuthenticated: boolean,
): string {
  if (!isAuthenticated) {
    return DUMMY_PROFILE_NAME;
  }

  const name = user?.name?.trim();
  if (name) return name;

  const phone = user?.phone?.trim();
  if (phone) return formatPhoneDisplayLabel(phone);

  const email = user?.email?.trim();
  if (email) return email.split("@")[0] ?? email;

  return "Listify User";
}

export function getProfileDisplaySubtitle(user: AuthUser | null | undefined): string {
  return user?.email?.trim() || "";
}
