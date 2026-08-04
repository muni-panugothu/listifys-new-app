import type { ImageSourcePropType } from "react-native";

import type { CategorySlug } from "@/constants/categories";

/**
 * Mealime-style flat pastel illustrations for search category cards.
 * Solid pastel background + simplified product shapes (no Material icons).
 */
export const CATEGORY_IMAGES: Record<CategorySlug, ImageSourcePropType> = {
  electronics: require("../assets/categories/electronics-v3.jpg"),
  vehicles: require("../assets/categories/vehicles-v3.jpg"),
  mobiles: require("../assets/categories/mobiles-v3.jpg"),
  furniture: require("../assets/categories/furniture-v3.jpg"),
  fashion: require("../assets/categories/fashion-v3.jpg"),
  jobs: require("../assets/categories/jobs-v3.jpg"),
  takecare: require("../assets/categories/takecare-v3.jpg"),
  events: require("../assets/categories/events-v3.jpg"),
  services: require("../assets/categories/services-v3.jpg"),
  properties: require("../assets/categories/properties-v3.jpg"),
  forsale: require("../assets/categories/others-v3.jpg"),
  sports: require("../assets/categories/sports-v3.jpg"),
  collectibles: require("../assets/categories/collectibles-v3.jpg"),
  "pets supplies": require("../assets/categories/pets-v3.jpg"),
  books: require("../assets/categories/books-v3.jpg"),
  beauty: require("../assets/categories/beauty-v3.jpg"),
  others: require("../assets/categories/others-v3.jpg"),
  toys: require("../assets/categories/toys-v3.jpg"),
};
