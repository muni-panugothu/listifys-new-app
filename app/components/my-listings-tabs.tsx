import { Pressable, ScrollView, Text, View } from "react-native";

import { ListifyFonts } from "@/constants/typography";

export const MY_LISTING_FILTERS = [
  "All",
  "Listings",
  "Services",
  "Take Care",
  "Jobs",
  "Events",
  "Properties",
  "Sold",
] as const;

export type MyListingsFilter = (typeof MY_LISTING_FILTERS)[number];

// Categories that belong to each filter group.
// "Listings" is the catch-all for buy-and-sell categories.
export const FILTER_CATEGORY_MAP: Record<
  Exclude<MyListingsFilter, "Sold">,
  string[] | "all"
> = {
  All: "all",
  Listings: [
    "electronics",
    "vehicles",
    "mobiles",
    "furniture",
    "fashion",
    "sports",
    "collectibles",
    "pets supplies",
    "toys",
    "books",
    "beauty",
    "others",
    "forsale",
  ],
  Services: ["services"],
  "Take Care": ["takecare"],
  Jobs: ["jobs"],
  Events: ["events"],
  Properties: ["properties"],
};

type MyListingsTabsProps = {
  activeFilter: MyListingsFilter;
  onFilterPress: (filter: MyListingsFilter) => void;
  counts: Record<MyListingsFilter, number>;
};

export function MyListingsTabs({
  activeFilter,
  onFilterPress,
  counts,
}: MyListingsTabsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 2, paddingVertical: 4 }}
      className="mb-4"
    >
      <View className="flex-row gap-2">
        {MY_LISTING_FILTERS.map((filter) => {
          const isActive = filter === activeFilter;
          const count = counts[filter] ?? 0;
          return (
            <Pressable
              key={filter}
              onPress={() => onFilterPress(filter)}
              className="flex-row items-center gap-1.5 rounded-full px-4 py-2"
              style={{
                backgroundColor: isActive ? "#27BB97" : "#FFFFFF",
                borderWidth: 1,
                borderColor: isActive ? "#27BB97" : "#E5E7EB",
              }}
            >
              <Text
                className="text-[13px]"
                style={{
                  fontFamily: isActive
                    ? ListifyFonts.semiBold
                    : ListifyFonts.medium,
                  color: isActive ? "#FFFFFF" : "#374151",
                }}
              >
                {filter}
              </Text>
              <View
                className="rounded-full px-2 py-0.5"
                style={{
                  backgroundColor: isActive
                    ? "rgba(255,255,255,0.2)"
                    : "#F3F4F6",
                  minWidth: 22,
                  alignItems: "center",
                }}
              >
                <Text
                  className="text-[11px]"
                  style={{
                    fontFamily: ListifyFonts.semiBold,
                    color: isActive ? "#FFFFFF" : "#6B7280",
                  }}
                >
                  {count}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
