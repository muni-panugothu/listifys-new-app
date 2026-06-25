import { useLocalSearchParams } from "@/lib/safe-router";

import { CategoryBrowseScreen } from "@/features/category/screens/category-browse-screen";
import { EventsListingScreen } from "@/features/search/screens/events-listing-screen";
import type { CategorySlug } from "@/constants/categories";

export function CategoryListingTemplateScreen() {
  const params = useLocalSearchParams<{ category?: string }>();
  const categorySlug = (params.category ?? "electronics") as CategorySlug;

  if (categorySlug === "events") {
    return <EventsListingScreen />;
  }

  return <CategoryBrowseScreen categorySlug={categorySlug} />;
}
