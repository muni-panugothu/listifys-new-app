import { MaterialIcons } from "@expo/vector-icons";
import { memo } from "react";
import {
  Modal,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { ListifyFonts } from "@/constants/typography";
import { useTheme } from "@/providers/theme-provider";

export type WeekPeriodId = "today" | "tomorrow" | "weekend" | "custom" | "week";

export type WeekPeriodOption = {
  id: Exclude<WeekPeriodId, "week">;
  title: string;
  subtitle: string;
  badge?: string;
};

type EventsWeekPeriodMenuProps = {
  visible: boolean;
  topOffset: number;
  selectedId: WeekPeriodId;
  options: WeekPeriodOption[];
  onSelect: (id: Exclude<WeekPeriodId, "week">) => void;
  onClose: () => void;
};

function EventsWeekPeriodMenuImpl({
  visible,
  topOffset,
  selectedId,
  options,
  onSelect,
  onClose,
}: EventsWeekPeriodMenuProps) {
  const { colors, isDark } = useTheme();

  const menuBg = isDark ? "#1C1C1E" : colors.surfaceElevated;
  const divider = isDark ? "rgba(255,255,255,0.08)" : colors.border;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={{ flex: 1 }} onPress={onClose}>
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(140)}
          style={{
            position: "absolute",
            top: topOffset,
            left: 16,
            right: 16,
            borderRadius: 18,
            backgroundColor: menuBg,
            paddingVertical: 6,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: isDark ? 0.45 : 0.18,
            shadowRadius: 20,
            elevation: 12,
            borderWidth: isDark ? 1 : 0,
            borderColor: "rgba(255,255,255,0.06)",
          }}
        >
          {options.map((opt, index) => {
            const active = selectedId === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => onSelect(opt.id)}
                style={({ pressed }) => ({
                  paddingHorizontal: 18,
                  paddingVertical: 14,
                  opacity: pressed ? 0.75 : 1,
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: divider,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  backgroundColor: active
                    ? isDark
                      ? "rgba(255,255,255,0.04)"
                      : colors.primarySoft
                    : "transparent",
                })}
              >
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text
                    style={{
                      fontFamily: ListifyFonts.semiBold,
                      fontSize: 17,
                      color: colors.textPrimary,
                      ...(Platform.OS === "android"
                        ? { includeFontPadding: false }
                        : {}),
                    }}
                  >
                    {opt.title}
                  </Text>
                  <Text
                    style={{
                      marginTop: 2,
                      fontFamily: ListifyFonts.regular,
                      fontSize: 13,
                      color: colors.textSecondary,
                      ...(Platform.OS === "android"
                        ? { includeFontPadding: false }
                        : {}),
                    }}
                  >
                    {opt.subtitle}
                  </Text>
                </View>

                {opt.badge ? (
                  <Text
                    style={{
                      fontFamily: ListifyFonts.medium,
                      fontSize: 14,
                      color: "#FF7A45",
                      ...(Platform.OS === "android"
                        ? { includeFontPadding: false }
                        : {}),
                    }}
                  >
                    {opt.badge}
                  </Text>
                ) : active ? (
                  <MaterialIcons
                    name="check"
                    size={20}
                    color={colors.primary}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

export function buildWeekPeriodOptions(now = new Date()): WeekPeriodOption[] {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  // Weekend = upcoming Sat–Sun (or current weekend if today is Sat/Sun)
  const day = today.getDay(); // 0 Sun … 6 Sat
  const saturday = new Date(today);
  if (day === 0) {
    saturday.setDate(today.getDate() - 1);
  } else if (day !== 6) {
    saturday.setDate(today.getDate() + (6 - day));
  }
  const sunday = new Date(saturday);
  sunday.setDate(saturday.getDate() + 1);

  const fmtDay = (d: Date) =>
    `${d.getDate()} ${d.toLocaleString("en-GB", { month: "short" })}`;

  return [
    {
      id: "today",
      title: "Today",
      subtitle: fmtDay(today),
      badge: "No events",
    },
    {
      id: "tomorrow",
      title: "Tomorrow",
      subtitle: fmtDay(tomorrow),
    },
    {
      id: "weekend",
      title: "This weekend",
      subtitle: `${saturday.getDate()}-${sunday.getDate()} ${sunday.toLocaleString("en-GB", { month: "short" })}`,
    },
    {
      id: "custom",
      title: "Custom dates",
      subtitle: "Choose your dates...",
    },
  ];
}

export function weekPeriodLabel(
  id: WeekPeriodId,
  customLabel?: string | null,
): string {
  switch (id) {
    case "today":
      return "today";
    case "tomorrow":
      return "tomorrow";
    case "weekend":
      return "this weekend";
    case "custom":
      return customLabel?.trim() || "custom dates";
    default:
      return "this week";
  }
}

export const EventsWeekPeriodMenu = memo(EventsWeekPeriodMenuImpl);
