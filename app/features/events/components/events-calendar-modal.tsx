import { MaterialIcons } from "@expo/vector-icons";
import { useCallback, useMemo, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ListifyFonts } from "@/constants/typography";
import {
  buildCalendarGrid,
  buildWeekStrip,
  dateKey,
  formatStripDay,
  formatStripMonth,
  isSameDay,
} from "@/lib/event-dates";

type CalendarViewMode = "month" | "week";

type EventsCalendarModalProps = {
  visible: boolean;
  onClose: () => void;
  selectedDate: Date;
  counts: Record<string, number>;
  onSelectDate: (date: Date) => void;
};

export function EventsCalendarModal({
  visible,
  onClose,
  selectedDate,
  counts,
  onSelectDate,
}: EventsCalendarModalProps) {
  const insets = useSafeAreaInsets();
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(selectedDate));

  const calendarGrid = useMemo(() => buildCalendarGrid(calendarMonth), [calendarMonth]);
  const weekStrip = useMemo(() => buildWeekStrip(selectedDate), [selectedDate]);

  const navigateMonth = useCallback((dir: number) => {
    setCalendarMonth((prev) => {
      const next = new Date(prev);
      next.setMonth(next.getMonth() + dir);
      return next;
    });
  }, []);

  const handlePick = useCallback(
    (date: Date) => {
      onSelectDate(date);
      onClose();
    },
    [onClose, onSelectDate],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }}
        onPress={onClose}
      />
      <View
        style={{
          backgroundColor: "#FFFFFF",
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: Math.max(insets.bottom, 20),
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          maxHeight: "80%",
        }}
      >
        <View style={{ alignItems: "center", marginBottom: 16 }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#D1D5DB" }} />
        </View>

        <View style={{ flexDirection: "row", marginBottom: 16, gap: 8 }}>
          {(["month", "week"] as const).map((mode) => {
            const active = viewMode === mode;
            return (
              <Pressable
                key={mode}
                onPress={() => setViewMode(mode)}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: 8,
                  backgroundColor: active ? "rgba(39,187,151,0.12)" : "#F3F4F6",
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontFamily: ListifyFonts.semiBold,
                    fontSize: 13,
                    color: active ? "#27BB97" : "#6C7A74",
                    textTransform: "capitalize",
                  }}
                >
                  {mode}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {viewMode === "month" ? (
          <>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16,
              }}
            >
              <Pressable onPress={() => navigateMonth(-1)} hitSlop={12} style={{ padding: 4 }}>
                <MaterialIcons name="chevron-left" size={28} color="#161D1A" />
              </Pressable>
              <Text style={{ fontFamily: ListifyFonts.bold, fontSize: 18, color: "#161D1A" }}>
                {calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
              </Text>
              <Pressable onPress={() => navigateMonth(1)} hitSlop={12} style={{ padding: 4 }}>
                <MaterialIcons name="chevron-right" size={28} color="#161D1A" />
              </Pressable>
            </View>

            <View style={{ flexDirection: "row", marginBottom: 8 }}>
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                <View key={i} style={{ flex: 1, alignItems: "center" }}>
                  <Text style={{ fontFamily: ListifyFonts.medium, fontSize: 12, color: "#6C7A74" }}>
                    {d}
                  </Text>
                </View>
              ))}
            </View>

            {calendarGrid.map((week, wi) => (
              <View key={wi} style={{ flexDirection: "row", marginBottom: 4 }}>
                {week.map((day, di) => {
                  if (!day) {
                    return <View key={di} style={{ flex: 1 }} />;
                  }
                  const key = dateKey(day);
                  const count = counts[key] ?? 0;
                  const isToday = isSameDay(day, new Date());
                  const isPicked = isSameDay(day, selectedDate);
                  const isPast = day < new Date(new Date().setHours(0, 0, 0, 0));

                  return (
                    <Pressable
                      key={di}
                      onPress={() => !isPast && handlePick(day)}
                      style={{ flex: 1, alignItems: "center", paddingVertical: 4 }}
                      disabled={isPast}
                    >
                      <View
                        style={{
                          width: 36,
                          minHeight: 40,
                          borderRadius: 18,
                          backgroundColor: isPicked
                            ? "#27BB97"
                            : isToday
                              ? "rgba(39,187,151,0.12)"
                              : "transparent",
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: isPast ? 0.35 : 1,
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: ListifyFonts.medium,
                            fontSize: 14,
                            color: isPicked ? "#FFFFFF" : isToday ? "#27BB97" : "#161D1A",
                          }}
                        >
                          {day.getDate()}
                        </Text>
                        {count > 0 ? (
                          <View
                            style={{
                              width: 5,
                              height: 5,
                              borderRadius: 3,
                              backgroundColor: isPicked ? "#FFFFFF" : "#27BB97",
                              marginTop: 2,
                            }}
                          />
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </>
        ) : (
          <>
            <Text
              style={{
                fontFamily: ListifyFonts.bold,
                fontSize: 16,
                color: "#161D1A",
                marginBottom: 12,
                textAlign: "center",
              }}
            >
              {selectedDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </Text>
            <View style={{ flexDirection: "row", gap: 6, marginBottom: 8 }}>
              {weekStrip.map((day) => {
                const key = dateKey(day);
                const count = counts[key] ?? 0;
                const isPicked = isSameDay(day, selectedDate);
                const isToday = isSameDay(day, new Date());
                return (
                  <Pressable
                    key={key}
                    onPress={() => handlePick(day)}
                    style={{
                      flex: 1,
                      alignItems: "center",
                      paddingVertical: 10,
                      borderRadius: 12,
                      backgroundColor: isPicked ? "#27BB97" : "#F9FAFB",
                      borderWidth: 1,
                      borderColor: isToday && !isPicked ? "#27BB97" : "#E5E7EB",
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: ListifyFonts.medium,
                        fontSize: 10,
                        color: isPicked ? "rgba(255,255,255,0.85)" : "#6C7A74",
                      }}
                    >
                      {formatStripMonth(day)}
                    </Text>
                    <Text
                      style={{
                        fontFamily: ListifyFonts.bold,
                        fontSize: 18,
                        color: isPicked ? "#FFFFFF" : "#161D1A",
                      }}
                    >
                      {formatStripDay(day)}
                    </Text>
                    {count > 0 ? (
                      <Text
                        style={{
                          fontFamily: ListifyFonts.medium,
                          fontSize: 9,
                          color: isPicked ? "#FFFFFF" : "#27BB97",
                          marginTop: 2,
                        }}
                      >
                        {count}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        <Pressable
          onPress={() => handlePick(new Date())}
          style={{
            marginTop: 16,
            paddingVertical: 12,
            borderRadius: 10,
            backgroundColor: "rgba(39,187,151,0.1)",
            alignItems: "center",
          }}
        >
          <Text style={{ fontFamily: ListifyFonts.semiBold, fontSize: 14, color: "#27BB97" }}>
            Jump to Today
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}
