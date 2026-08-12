import type { FlatListProps } from "react-native";

/** Tuning for nested horizontal carousels (events cards, hero, etc.). */
export const HORIZONTAL_CAROUSEL_PROPS = {
  removeClippedSubviews: true,
  initialNumToRender: 2,
  maxToRenderPerBatch: 3,
  windowSize: 3,
  updateCellsBatchingPeriod: 50,
} as const satisfies Partial<FlatListProps<unknown>>;
