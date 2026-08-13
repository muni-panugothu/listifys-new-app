import type { CategorySlug } from "@/constants/categories";
import type { Href } from "@/lib/safe-router";

/** Every category uses the unified browse UI with its own subcategory chips.
 * Exceptions: services hub, events dedicated screen with date filtering. */
export function getCategoryHref(catId: CategorySlug): Href {
  if (catId === "jobs") {
    return "/jobs-listing" as Href;
  }
  if (catId === "services") {
    return "/services-category-hub" as Href;
  }
  if (catId === "events") {
    return "/events-listing" as Href;
  }
  if (catId === "properties") {
    return "/properties-listing" as Href;
  }
  return `/category-listing-template?category=${catId}` as Href;
}
