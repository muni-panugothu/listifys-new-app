import { useLocalSearchParams } from "@/lib/safe-router";

import { CategoryBrowseScreen } from "@/features/category/screens/category-browse-screen";
import { EventsListingScreen } from "@/features/search/screens/events-listing-screen";
import type { CategorySlug } from "@/constants/categories";

export function CategoryListingTemplateScreen() {
  const params = useLocalSearchParams<{ category?: string; subcategory?: string }>();
  const categorySlug = (params.category ?? "electronics") as CategorySlug;
  const initialSubcategory = Array.isArray(params.subcategory)
    ? params.subcategory[0]
    : params.subcategory;

  if (categorySlug === "events") {
    return <EventsListingScreen />;
  }

  return (
    <CategoryBrowseScreen
      categorySlug={categorySlug}
      initialSubcategory={initialSubcategory}
    />
  );
}
