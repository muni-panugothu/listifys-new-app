import type { FlatListProps } from "react-native";

/** Shared FlatList tuning for marketplace scroll surfaces. */
export const MARKETPLACE_LIST_PROPS = {
  removeClippedSubviews: true,
  maxToRenderPerBatch: 8,
  initialNumToRender: 10,
  windowSize: 7,
  updateCellsBatchingPeriod: 50,
} as const satisfies Partial<FlatListProps<unknown>>;

export const CHAT_LIST_PROPS = {
  removeClippedSubviews: true,
  maxToRenderPerBatch: 10,
  initialNumToRender: 18,
  windowSize: 9,
  updateCellsBatchingPeriod: 40,
} as const satisfies Partial<FlatListProps<unknown>>;

export const INBOX_LIST_PROPS = {
  removeClippedSubviews: true,
  maxToRenderPerBatch: 8,
  initialNumToRender: 12,
  windowSize: 7,
  updateCellsBatchingPeriod: 50,
} as const satisfies Partial<FlatListProps<unknown>>;
