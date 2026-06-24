import type { ListingItem } from "@/features/listing/services/listing-api";

function readSpecsExperience(
  specs?: Record<string, unknown> | Map<string, unknown> | null,
): string {
  if (!specs) return "";
  if (specs instanceof Map) {
    return String(specs.get("experience") ?? specs.get("yearsOfExperience") ?? "").trim();
  }
  if (typeof specs === "object") {
    return String(
      (specs as Record<string, unknown>).experience ??
        (specs as Record<string, unknown>).yearsOfExperience ??
        "",
    ).trim();
  }
  return "";
}

/** Pull raw experience text from listing fields (not formatted). */
export function resolveServiceExperienceRaw(item: ListingItem): string | null {
  const direct = (item as { experience?: string }).experience?.trim();
  if (direct) return direct;

  const fromSpecs = readSpecsExperience(
    (item as { specifications?: Record<string, unknown> | Map<string, unknown> }).specifications,
  );
  if (fromSpecs) return fromSpecs;

  const description = item.description?.trim();
  if (description) {
    const match = description.match(
      /\b(\d+\+?\s*(?:years?|yrs?)(?:\s+of)?(?:\s+exp(?:erience)?)?|\d+\+)\b/i,
    );
    if (match?.[1]) return match[1].replace(/\s+/g, " ").trim();
  }

  return null;
}

/** Display label for hub cards / detail, e.g. "8+ Years Exp". */
export function formatServiceExperienceLabel(item: ListingItem): string | null {
  const raw = resolveServiceExperienceRaw(item);
  if (!raw) return null;
  if (/\bexp\b/i.test(raw)) return raw.replace(/\.$/, "");
  if (/year|month|\+/i.test(raw)) return `${raw} Exp`;
  return `${raw} Years Exp`;
}
