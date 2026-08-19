import { MaterialIcons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ListifyFonts } from "@/constants/typography";
import {
  formatEventDateForForm,
  formatEventTimeFromParts,
  parseEventDateInput,
  parseEventTimeParts,
  type EventTimeParts,
} from "@/lib/post-form-validators";
import { buildCalendarGrid, isSameDay } from "@/lib/event-dates";
import { useTheme } from "@/providers/theme-provider";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const PERIODS: EventTimeParts["period"][] = ["AM", "PM"];
const WHEEL_ITEM_HEIGHT = 44;
const WHEEL_VISIBLE_ROWS = 5;

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

type PickerFieldProps = {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  value: string;
  placeholder: string;
  onPress: () => void;
};

export function PickerField({ icon, value, placeholder, onPress }: PickerFieldProps) {
  const { colors } = useTheme();
  const hasValue = Boolean(value.trim());

  return (
    <Pressable
      onPress={onPress}
      className="h-12 flex-row items-center rounded-2xl border px-4"
      style={{
        borderColor: hasValue ? colors.primary : colors.border,
        backgroundColor: colors.inputBackground,
      }}
    >
      <MaterialIcons name={icon} size={20} color={hasValue ? colors.primary : colors.icon} />
      <Text
        className="ml-2 flex-1"
        style={{
          fontSize: 14,
          fontFamily: hasValue ? ListifyFonts.semiBold : ListifyFonts.regular,
          color: hasValue ? colors.textPrimary : colors.inputPlaceholder,
        }}
        numberOfLines={1}
      >
        {hasValue ? value.trim() : placeholder}
      </Text>
    </Pressable>
  );
}

type BottomSheetModalProps = {
  visible: boolean;
  title: string;
  onClose: () => void;
  onConfirm?: () => void;
  confirmLabel?: string;
  children: React.ReactNode;
};

function BottomSheetModal({
  visible,
  title,
  onClose,
  onConfirm,
  confirmLabel = "Done",
  children,
}: BottomSheetModalProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: colors.scrim }} onPress={onClose} />
      <View
        style={{
          backgroundColor: colors.surface,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: Math.max(insets.bottom, 20),
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          maxHeight: "85%",
        }}
      >
        <View style={{ alignItems: "center", marginBottom: 16 }}>
          <View
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.border,
            }}
          />
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={{ fontFamily: ListifyFonts.medium, fontSize: 15, color: colors.textSecondary }}>
              Cancel
            </Text>
          </Pressable>
          <Text style={{ fontFamily: ListifyFonts.semiBold, fontSize: 16, color: colors.textPrimary }}>
            {title}
          </Text>
          <Pressable onPress={onConfirm ?? onClose} hitSlop={12}>
            <Text style={{ fontFamily: ListifyFonts.semiBold, fontSize: 15, color: colors.primary }}>
              {confirmLabel}
            </Text>
          </Pressable>
        </View>

        {children}
      </View>
    </Modal>
  );
}

type EventDatePickerModalProps = {
  visible: boolean;
  value: string;
  title?: string;
  minDate?: Date;
  onClose: () => void;
  onSelect: (formattedDate: string) => void;
};

export function EventDatePickerModal({
  visible,
  value,
  title = "Event Date",
  minDate,
  onClose,
  onSelect,
}: EventDatePickerModalProps) {
  const { colors } = useTheme();
  const parsed = useMemo(() => parseEventDateInput(value) ?? startOfToday(), [value]);

  const [selectedDate, setSelectedDate] = useState(parsed);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(parsed));

  useEffect(() => {
    if (!visible) return;
    setSelectedDate(parsed);
    setCalendarMonth(new Date(parsed));
  }, [visible, parsed]);

  const calendarGrid = useMemo(() => buildCalendarGrid(calendarMonth), [calendarMonth]);
  const todayStart = useMemo(() => startOfToday(), []);
  const earliestSelectable = useMemo(() => {
    const floor = minDate ? new Date(minDate) : todayStart;
    floor.setHours(0, 0, 0, 0);
    return floor;
  }, [minDate, todayStart]);

  const navigateMonth = useCallback((dir: number) => {
    setCalendarMonth((prev) => {
      const next = new Date(prev);
      next.setMonth(next.getMonth() + dir);
      return next;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    onSelect(formatEventDateForForm(selectedDate));
    onClose();
  }, [onClose, onSelect, selectedDate]);

  return (
    <BottomSheetModal
      visible={visible}
      title={title}
      onClose={onClose}
      onConfirm={handleConfirm}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <Pressable onPress={() => navigateMonth(-1)} hitSlop={12} style={{ padding: 4 }}>
          <MaterialIcons name="chevron-left" size={28} color={colors.icon} />
        </Pressable>
        <Text style={{ fontFamily: ListifyFonts.bold, fontSize: 18, color: colors.textPrimary }}>
          {calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </Text>
        <Pressable onPress={() => navigateMonth(1)} hitSlop={12} style={{ padding: 4 }}>
          <MaterialIcons name="chevron-right" size={28} color={colors.icon} />
        </Pressable>
      </View>

      <View style={{ flexDirection: "row", marginBottom: 8 }}>
        {WEEKDAY_LABELS.map((label, index) => (
          <View key={`${label}-${index}`} style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontFamily: ListifyFonts.medium, fontSize: 12, color: colors.textSecondary }}>
              {label}
            </Text>
          </View>
        ))}
      </View>

      {calendarGrid.map((week, weekIndex) => (
        <View key={weekIndex} style={{ flexDirection: "row", marginBottom: 4 }}>
          {week.map((day, dayIndex) => {
            if (!day) {
              return <View key={dayIndex} style={{ flex: 1 }} />;
            }

            const isToday = isSameDay(day, new Date());
            const isPicked = isSameDay(day, selectedDate);
            const isPast = day < earliestSelectable;

            return (
              <Pressable
                key={dayIndex}
                onPress={() => !isPast && setSelectedDate(day)}
                style={{ flex: 1, alignItems: "center", paddingVertical: 4 }}
                disabled={isPast}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: isPicked
                      ? colors.primary
                      : isToday
                        ? colors.primarySoft
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
                      color: isPicked
                        ? colors.textOnPrimary
                        : isToday
                          ? colors.primary
                          : colors.textPrimary,
                    }}
                  >
                    {day.getDate()}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </BottomSheetModal>
  );
}

type TimeWheelColumnProps<T extends string | number> = {
  items: T[];
  selected: T;
  onSelect: (value: T) => void;
  format?: (value: T) => string;
};

function TimeWheelColumn<T extends string | number>({
  items,
  selected,
  onSelect,
  format = (v) => String(v),
}: TimeWheelColumnProps<T>) {
  const { colors } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const selectedIndex = Math.max(0, items.indexOf(selected));
  const paddingRows = Math.floor(WHEEL_VISIBLE_ROWS / 2);

  useEffect(() => {
    const offset = selectedIndex * WHEEL_ITEM_HEIGHT;
    scrollRef.current?.scrollTo({ y: offset, animated: false });
  }, [selectedIndex]);

  const handleScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(event.nativeEvent.contentOffset.y / WHEEL_ITEM_HEIGHT);
      const clamped = Math.min(Math.max(index, 0), items.length - 1);
      onSelect(items[clamped]!);
    },
    [items, onSelect],
  );

  return (
    <View style={{ flex: 1, height: WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_ROWS, overflow: "hidden" }}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ITEM_HEIGHT}
        decelerationRate="fast"
        onMomentumScrollEnd={handleScrollEnd}
        contentContainerStyle={{ paddingVertical: WHEEL_ITEM_HEIGHT * paddingRows }}
      >
        {items.map((item) => {
          const active = item === selected;
          return (
            <Pressable
              key={String(item)}
              onPress={() => onSelect(item)}
              style={{
                height: WHEEL_ITEM_HEIGHT,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: active ? ListifyFonts.semiBold : ListifyFonts.regular,
                  fontSize: active ? 20 : 16,
                  color: active ? colors.textPrimary : colors.textSecondary,
                }}
              >
                {format(item)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

type EventTimePickerModalProps = {
  visible: boolean;
  value: string;
  title?: string;
  onClose: () => void;
  onSelect: (formattedTime: string) => void;
};

export function EventTimePickerModal({
  visible,
  value,
  title = "Event Time",
  onClose,
  onSelect,
}: EventTimePickerModalProps) {
  const { colors } = useTheme();
  const initialParts = useMemo(() => parseEventTimeParts(value), [value]);
  const [parts, setParts] = useState<EventTimeParts>(initialParts);

  useEffect(() => {
    if (!visible) return;
    setParts(parseEventTimeParts(value));
  }, [visible, value]);

  const handleConfirm = useCallback(() => {
    onSelect(formatEventTimeFromParts(parts));
    onClose();
  }, [onClose, onSelect, parts]);

  return (
    <BottomSheetModal
      visible={visible}
      title={title}
      onClose={onClose}
      onConfirm={handleConfirm}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.inputBackground,
          paddingHorizontal: 8,
          marginBottom: 8,
        }}
      >
        <TimeWheelColumn
          items={HOURS}
          selected={parts.hour12}
          onSelect={(hour12) => setParts((prev) => ({ ...prev, hour12 }))}
        />
        <Text style={{ fontFamily: ListifyFonts.bold, fontSize: 20, color: colors.textPrimary }}>:</Text>
        <TimeWheelColumn
          items={MINUTES}
          selected={parts.minute}
          onSelect={(minute) => setParts((prev) => ({ ...prev, minute }))}
          format={(minute) => String(minute).padStart(2, "0")}
        />
        <TimeWheelColumn
          items={PERIODS}
          selected={parts.period}
          onSelect={(period) => setParts((prev) => ({ ...prev, period }))}
        />
      </View>
      <Text
        style={{
          textAlign: "center",
          fontFamily: ListifyFonts.regular,
          fontSize: 12,
          color: colors.textTertiary,
          marginTop: 4,
        }}
      >
        Selected: {formatEventTimeFromParts(parts)}
      </Text>
    </BottomSheetModal>
  );
}
