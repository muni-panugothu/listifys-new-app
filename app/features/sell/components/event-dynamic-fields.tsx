import { Pressable, Switch, Text, TextInput, View } from "react-native";

import { SellSectionCard } from "@/components/sell-flow-layout";
import { ListifyFonts } from "@/constants/typography";
import {
  getDynamicFieldsForEvent,
  type EventFormField,
} from "@/features/events/data/events-form-schema";
import { useTheme } from "@/providers/theme-provider";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setCategoryDataField } from "@/store/slices/post-form-slice";

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: EventFormField;
  value: string | number | boolean | undefined;
  onChange: (val: string | number | boolean) => void;
}) {
  const { colors } = useTheme();

  if (field.type === "boolean") {
    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingVertical: 12,
        }}
      >
        <Text
          style={{
            flex: 1,
            fontFamily: ListifyFonts.medium,
            fontSize: 14,
            color: colors.textPrimary,
          }}
        >
          {field.label}
          {field.required ? " *" : ""}
        </Text>
        <Switch
          value={Boolean(value)}
          onValueChange={(next) => onChange(next)}
          trackColor={{ false: colors.border, true: "#10B981" }}
        />
      </View>
    );
  }

  if (field.type === "select" && field.options?.length) {
    return (
      <View style={{ marginBottom: 16 }}>
        <Text
          style={{
            fontFamily: ListifyFonts.medium,
            fontSize: 13,
            color: colors.textSecondary,
            marginBottom: 8,
          }}
        >
          {field.label}
          {field.required ? " *" : ""}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {field.options.map((opt) => {
            const selected = String(value ?? "") === opt;
            return (
              <Pressable
                key={opt}
                onPress={() => onChange(opt)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: selected ? "#10B981" : colors.border,
                  backgroundColor: selected ? "#ECFDF5" : colors.inputBackground,
                }}
              >
                <Text
                  style={{
                    fontFamily: ListifyFonts.medium,
                    fontSize: 13,
                    color: selected ? "#059669" : colors.textPrimary,
                  }}
                >
                  {opt}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  const isMultiline = field.type === "textarea" || field.multiline;
  const stringValue =
    value == null ? "" : typeof value === "string" ? value : String(value);

  return (
    <View style={{ marginBottom: 16 }}>
      <Text
        style={{
          fontFamily: ListifyFonts.medium,
          fontSize: 13,
          color: colors.textSecondary,
          marginBottom: 6,
        }}
      >
        {field.label}
        {field.required ? " *" : ""}
      </Text>
      <TextInput
        value={stringValue}
        onChangeText={(text) => {
          if (field.type === "number") {
            onChange(text.trim() === "" ? "" : Number(text));
          } else {
            onChange(text);
          }
        }}
        placeholder={field.placeholder || field.label}
        placeholderTextColor={colors.inputPlaceholder}
        keyboardType={field.type === "number" ? "numeric" : "default"}
        multiline={isMultiline}
        numberOfLines={isMultiline ? 4 : 1}
        textAlignVertical={isMultiline ? "top" : "center"}
        style={{
          fontFamily: ListifyFonts.regular,
          fontSize: 14,
          color: colors.textPrimary,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          backgroundColor: colors.inputBackground,
          paddingHorizontal: 14,
          paddingVertical: isMultiline ? 12 : 10,
          minHeight: isMultiline ? 96 : undefined,
        }}
      />
      {field.hint ? (
        <Text
          style={{
            marginTop: 4,
            fontFamily: ListifyFonts.regular,
            fontSize: 12,
            color: colors.textSecondary,
          }}
        >
          {field.hint}
        </Text>
      ) : null}
    </View>
  );
}

export function EventDynamicFields() {
  const { colors } = useTheme();
  const dispatch = useAppDispatch();
  const eventCategory = useAppSelector((s) => s.postForm.eventCategory);
  const eventType = useAppSelector((s) => s.postForm.eventType);
  const categoryData = useAppSelector((s) => s.postForm.categoryData);

  const fields = getDynamicFieldsForEvent(eventCategory, eventType);
  if (!eventCategory || !eventType || fields.length === 0) return null;

  return (
    <SellSectionCard title="Event details">
      <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
      {fields.map((field) => (
        <FieldInput
          key={field.key}
          field={field}
          value={categoryData[field.key]}
          onChange={(val) =>
            dispatch(setCategoryDataField({ key: field.key, value: val as string | number | boolean }))
          }
        />
      ))}
      </View>
    </SellSectionCard>
  );
}
