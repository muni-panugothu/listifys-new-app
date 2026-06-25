import { MaterialIcons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { ListifyFonts } from "@/constants/typography";
import type { DateStripItem } from "@/lib/event-dates";
import { formatStripDay, formatStripMonth } from "@/lib/event-dates";

type EventsDateStripProps = {
  items: DateStripItem[];
  selectedKey: string;
  onSelect: (key: string) => void;
  onOpenCalendar: () => void;
};

export function EventsDateStrip({
  items,
  selectedKey,
  onSelect,
  onOpenCalendar,
}: EventsDateStripProps) {
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const idx = items.findIndex((d) => d.key === selectedKey);
    if (idx < 0 || !scrollRef.current) return;
    const offset = Math.max(0, idx * 64 - 80);
    scrollRef.current.scrollTo({ x: offset, animated: true });
  }, [items, selectedKey]);

  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingVertical: 12, paddingRight: 4 }}
        style={{ flex: 1 }}
      >
        {items.map((item) => {
          const isActive = item.key === selectedKey;
          return (
            <Pressable
              key={item.key}
              onPress={() => onSelect(item.key)}
              className="items-center justify-center rounded-xl"
              style={{
                width: 56,
                minHeight: 72,
                paddingVertical: 4,
                backgroundColor: isActive ? "#27BB97" : "#FFFFFF",
                borderWidth: 1,
                borderColor: isActive ? "#27BB97" : "#D1D5DB",
                shadowColor: "#27BB97",
                shadowOffset: { width: 0, height: isActive ? 4 : 0 },
                shadowOpacity: isActive ? 0.3 : 0,
                shadowRadius: isActive ? 8 : 0,
                elevation: isActive ? 4 : 0,
              }}
            >
              <Text
                className="text-[11px]"
                style={{
                  fontFamily: ListifyFonts.medium,
                  color: isActive ? "rgba(255,255,255,0.85)" : "#6C7A74",
                  letterSpacing: 0.5,
                }}
              >
                {formatStripMonth(item.date)}
              </Text>
              <Text
                className="text-[22px]"
                style={{
                  fontFamily: ListifyFonts.bold,
                  color: isActive ? "#FFFFFF" : "#161D1A",
                }}
              >
                {formatStripDay(item.date)}
              </Text>
              {item.count > 0 ? (
                <Text
                  className="text-[9px]"
                  style={{
                    fontFamily: ListifyFonts.medium,
                    color: isActive ? "rgba(255,255,255,0.9)" : "#27BB97",
                    marginTop: 2,
                  }}
                  numberOfLines={1}
                >
                  {item.count}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable
        onPress={onOpenCalendar}
        style={{ width: 48, alignItems: "center", justifyContent: "center" }}
        hitSlop={8}
      >
        <MaterialIcons name="calendar-month" size={24} color="#27BB97" />
      </Pressable>
    </View>
  );
}
