import { MaterialIcons } from "@expo/vector-icons";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  Dimensions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ListifyFonts } from "@/constants/typography";
import { dateKey, isSameDay } from "@/lib/event-dates";
import { useTheme } from "@/providers/theme-provider";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const ANIM_MS = 520;

type EventsCustomDatesSheetProps = {
  visible: boolean;
  onClose: () => void;
  initialStart?: Date | null;
  initialEnd?: Date | null;
  onApply: (range: { start: Date; end: Date }) => void;
};

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

/** Monday-first calendar grid for a month. */
function buildMondayGrid(month: Date): (Date | null)[][] {
  const year = month.getFullYear();
  const m = month.getMonth();
  const first = new Date(year, m, 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const cells: (Date | null)[] = Array(mondayOffset).fill(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(new Date(year, m, day));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function isBetween(day: Date, start: Date | null, end: Date | null) {
  if (!start || !end) return false;
  const t = day.getTime();
  const a = Math.min(start.getTime(), end.getTime());
  const b = Math.max(start.getTime(), end.getTime());
  return t > a && t < b;
}

function EventsCustomDatesSheetImpl({
  visible,
  onClose,
  initialStart,
  initialEnd,
  onApply,
}: EventsCustomDatesSheetProps) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const [mounted, setMounted] = useState(visible);
  const [rangeStart, setRangeStart] = useState<Date | null>(initialStart ?? null);
  const [rangeEnd, setRangeEnd] = useState<Date | null>(initialEnd ?? null);

  const translateY = useSharedValue(SCREEN_HEIGHT);
  const backdrop = useSharedValue(0);

  const months = useMemo(() => {
    const base = startOfMonth(new Date());
    return [0, 1, 2, 3].map((i) => addMonths(base, i));
  }, []);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      setRangeStart(initialStart ?? null);
      setRangeEnd(initialEnd ?? null);
      translateY.value = SCREEN_HEIGHT;
      backdrop.value = 0;
      translateY.value = withTiming(0, {
        duration: ANIM_MS,
        easing: Easing.out(Easing.cubic),
      });
      backdrop.value = withTiming(1, {
        duration: ANIM_MS,
        easing: Easing.out(Easing.cubic),
      });
    } else if (mounted) {
      translateY.value = withTiming(
        SCREEN_HEIGHT,
        { duration: ANIM_MS, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(setMounted)(false);
        },
      );
      backdrop.value = withTiming(0, {
        duration: ANIM_MS,
        easing: Easing.in(Easing.cubic),
      });
    }
  }, [visible, mounted, initialStart, initialEnd, translateY, backdrop]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdrop.value * 0.55,
  }));

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const handlePick = useCallback((day: Date) => {
    setRangeStart((prevStart) => {
      if (!prevStart || (prevStart && rangeEnd)) {
        setRangeEnd(null);
        return day;
      }
      if (day.getTime() < prevStart.getTime()) {
        setRangeEnd(prevStart);
        return day;
      }
      setRangeEnd(day);
      return prevStart;
    });
  }, [rangeEnd]);

  const handleClear = useCallback(() => {
    setRangeStart(null);
    setRangeEnd(null);
  }, []);

  const handleApply = useCallback(() => {
    if (!rangeStart) return;
    const end = rangeEnd ?? rangeStart;
    onApply({ start: rangeStart, end });
    onClose();
  }, [onApply, onClose, rangeEnd, rangeStart]);

  if (!mounted) return null;

  const sheetBg = isDark ? "#141416" : colors.surface;
  const mutedDay = isDark ? "rgba(255,255,255,0.28)" : colors.textTertiary;

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Animated.View
          style={[
            {
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "#000",
            },
            backdropStyle,
          ]}
        >
          <Pressable style={{ flex: 1 }} onPress={handleClose} />
        </Animated.View>

        <Animated.View
          style={[
            {
              backgroundColor: sheetBg,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              maxHeight: SCREEN_HEIGHT * 0.88,
              paddingTop: 22,
              paddingBottom: Math.max(insets.bottom, 16) + 8,
            },
            sheetStyle,
          ]}
        >
          <View
            style={{
              paddingHorizontal: 22,
              flexDirection: "row",
              alignItems: "flex-start",
              justifyContent: "space-between",
              marginBottom: 18,
            }}
          >
            <View style={{ flex: 1, paddingRight: 16 }}>
              <Text
                style={{
                  fontFamily: ListifyFonts.bold,
                  fontSize: 28,
                  color: colors.textPrimary,
                  ...(Platform.OS === "android"
                    ? { includeFontPadding: false }
                    : {}),
                }}
              >
                Custom dates
              </Text>
              <Text
                style={{
                  marginTop: 6,
                  fontFamily: ListifyFonts.regular,
                  fontSize: 15,
                  color: colors.textSecondary,
                  ...(Platform.OS === "android"
                    ? { includeFontPadding: false }
                    : {}),
                }}
              >
                Select dates for the events you want to see
              </Text>
            </View>
            <Pressable
              onPress={handleClose}
              hitSlop={12}
              style={{
                width: 36,
                height: 36,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MaterialIcons name="close" size={26} color={colors.icon} />
            </Pressable>
          </View>

          <View
            style={{
              flexDirection: "row",
              paddingHorizontal: 18,
              marginBottom: 8,
            }}
          >
            {WEEKDAYS.map((d) => (
              <Text
                key={d}
                style={{
                  flex: 1,
                  textAlign: "center",
                  fontFamily: ListifyFonts.medium,
                  fontSize: 13,
                  color: colors.textSecondary,
                  ...(Platform.OS === "android"
                    ? { includeFontPadding: false }
                    : {}),
                }}
              >
                {d}
              </Text>
            ))}
          </View>
          <View
            style={{
              height: 1,
              backgroundColor: isDark ? "rgba(255,255,255,0.08)" : colors.border,
              marginHorizontal: 18,
              marginBottom: 8,
            }}
          />

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 16 }}
          >
            {months.map((month) => {
              const grid = buildMondayGrid(month);
              const label = month.toLocaleString("en-GB", {
                month: "long",
                year: "numeric",
              });
              return (
                <View key={label} style={{ marginBottom: 22 }}>
                  <Text
                    style={{
                      fontFamily: ListifyFonts.bold,
                      fontSize: 18,
                      color: colors.textPrimary,
                      paddingHorizontal: 10,
                      marginBottom: 12,
                      marginTop: 8,
                      ...(Platform.OS === "android"
                        ? { includeFontPadding: false }
                        : {}),
                    }}
                  >
                    {label}
                  </Text>
                  {grid.map((week, wi) => (
                    <View
                      key={`${label}-w${wi}`}
                      style={{ flexDirection: "row", marginBottom: 4 }}
                    >
                      {week.map((day, di) => {
                        if (!day) {
                          return <View key={`e-${di}`} style={{ flex: 1, height: 44 }} />;
                        }
                        const selected =
                          (!!rangeStart && isSameDay(day, rangeStart)) ||
                          (!!rangeEnd && isSameDay(day, rangeEnd));
                        const inRange = isBetween(day, rangeStart, rangeEnd);
                        const isPast =
                          day.getTime() <
                          new Date(
                            new Date().getFullYear(),
                            new Date().getMonth(),
                            new Date().getDate(),
                          ).getTime();

                        return (
                          <Pressable
                            key={dateKey(day)}
                            onPress={() => handlePick(day)}
                            style={{
                              flex: 1,
                              height: 44,
                              alignItems: "center",
                              justifyContent: "center",
                              borderRadius: 22,
                              backgroundColor: selected
                                ? "#FFFFFF"
                                : inRange
                                  ? isDark
                                    ? "rgba(255,255,255,0.12)"
                                    : colors.primarySoft
                                  : "transparent",
                            }}
                          >
                            <Text
                              style={{
                                fontFamily: ListifyFonts.medium,
                                fontSize: 16,
                                color: selected
                                  ? "#000000"
                                  : isPast
                                    ? mutedDay
                                    : colors.textPrimary,
                                ...(Platform.OS === "android"
                                  ? { includeFontPadding: false }
                                  : {}),
                              }}
                            >
                              {day.getDate()}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                </View>
              );
            })}
          </ScrollView>

          <View
            style={{
              flexDirection: "row",
              gap: 12,
              paddingHorizontal: 18,
              paddingTop: 8,
            }}
          >
            <Pressable
              onPress={handleClear}
              style={({ pressed }) => ({
                flex: 1,
                height: 52,
                borderRadius: 999,
                borderWidth: 1.5,
                borderColor: isDark ? "rgba(255,255,255,0.55)" : colors.borderStrong,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.8 : 1,
                backgroundColor: isDark ? "#000" : colors.surface,
              })}
            >
              <Text
                style={{
                  fontFamily: ListifyFonts.semiBold,
                  fontSize: 17,
                  color: colors.textPrimary,
                }}
              >
                Clear
              </Text>
            </Pressable>

            <Pressable
              onPress={handleApply}
              disabled={!rangeStart}
              style={({ pressed }) => ({
                flex: 1,
                height: 52,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 4,
                backgroundColor: rangeStart
                  ? "#FFFFFF"
                  : isDark
                    ? "rgba(255,255,255,0.25)"
                    : colors.surfaceMuted,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text
                style={{
                  fontFamily: ListifyFonts.bold,
                  fontSize: 17,
                  color: rangeStart ? "#000000" : colors.textTertiary,
                }}
              >
                Apply
              </Text>
              <MaterialIcons
                name="chevron-right"
                size={22}
                color={rangeStart ? "#000000" : colors.textTertiary}
              />
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

export const EventsCustomDatesSheet = memo(EventsCustomDatesSheetImpl);
