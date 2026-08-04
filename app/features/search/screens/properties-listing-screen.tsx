import { CategoryBrowseScreen } from "@/features/category/screens/category-browse-screen";

/** Properties opens the listing browse page directly (search + tabs + nearby cards). */
export function PropertiesListingScreen() {
  return <CategoryBrowseScreen categorySlug="properties" />;
}
