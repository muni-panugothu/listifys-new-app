import { resolveCategoryConfig } from "@/features/events/data/events-category-config";
import {
  EVENTS_WEEK_CATEGORIES,
  type EventsWeekCategory,
} from "@/features/events/data/events-discovery";

export function resolveWeekStoryExploreId(weekId: string): string {
  if (weekId === "workshops") return "workshops";
  if (weekId === "family") return "festivals";
  return weekId;
}

export function resolveWeekStoryConfig(cat: EventsWeekCategory) {
  return resolveCategoryConfig(resolveWeekStoryExploreId(cat.id), cat.label);
}

export function getWeekCategoryByIndex(index: number): EventsWeekCategory | null {
  return EVENTS_WEEK_CATEGORIES[index] ?? null;
}

export function findWeekCategoryIndex(categoryId: string): number {
  return EVENTS_WEEK_CATEGORIES.findIndex((c) => c.id === categoryId);
}
