/**
 * GooglePlacesInput
 *
 * Inline Google Places autocomplete input + dropdown for use inside forms.
 * No recent-searches — just live suggestions as the user types.
 *
 * Features:
 *   - 300ms debounced Google Places Autocomplete API
 *   - AbortController per request (cancels on fast typing)
 *   - Bold matched text via Google's exact matched_substrings offsets
 *   - Loading spinner / empty state / error state
 *   - FlatList with keyboardShouldPersistTaps
 *   - fetchPlaceDetails called on selection (exact lat/lng, no re-geocode)
 */

import { MaterialIcons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { HighlightedText } from "@/components/highlighted-text";
import { ListifyFonts } from "@/constants/typography";
import { useTheme } from "@/providers/theme-provider";
import {
  extractIsoCountryCode,
  fetchPlaceDetails,
  type MatchedSubstring,
  type PlacePrediction,
} from "@/lib/google-places.service";
import { usePlacesAutocomplete } from "@/hooks/usePlacesAutocomplete";
import { showErrorToast } from "@/lib/toast";

export type PlacesSelectResult = {
  label: string;
  lat: number;
  lng: number;
  place_id: string;
  isoCountryCode: string | null;
};

type GooglePlacesInputProps = {
  /** Controlled value shown in the input (comes from parent/Redux state). */
  value: string;
  /** Called on every keystroke so parent can keep its state in sync. */
  onChangeText: (text: string) => void;
  /**
   * Called when the user picks a suggestion and place details have been fetched.
   * Receives exact lat/lng from Place Details API — no extra geocode call.
   */
  onSelect: (result: PlacesSelectResult) => void | Promise<void>;
  placeholder?: string;
  /** Optional location bias — nudges results toward the user's area. */
  userLat?: number | null;
  userLng?: number | null;
  /** Override input surface (e.g. white fields on dark edit-profile cards). */
  inputBackgroundColor?: string;
  inputTextColor?: string;
};

export function GooglePlacesInput({
  value,
  onChangeText,
  onSelect,
  placeholder = "Neighborhood or city...",
  userLat,
  userLng,
  inputBackgroundColor,
  inputTextColor,
}: GooglePlacesInputProps) {
  const { colors } = useTheme();
  const resolvedInputBg = inputBackgroundColor ?? colors.inputBackground;
  const resolvedInputText = inputTextColor ?? colors.textPrimary;
  /**
   * inputText — what is shown in the TextInput
   * searchQuery — what is sent to the Autocomplete API
   *
   * They diverge after a selection: inputText = selected label,
   * searchQuery = "" (prevents further API calls until user types again).
   */
  const [inputText, setInputText] = useState(value);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectingId, setSelectingId] = useState<string | null>(null);

  const inputRef = useRef<TextInput>(null);
  const prevValueRef = useRef(value);

  // Sync inputText when value changes externally
  // (e.g. parent presses "Use current location" and updates Redux → value prop)
  useEffect(() => {
    if (value !== prevValueRef.current && value !== inputText) {
      setInputText(value);
      setSearchQuery(""); // clear autocomplete when externally overridden
    }
    prevValueRef.current = value;
  }, [value, inputText]);

  const { predictions, loading, error, sessionToken, resetSession } =
    usePlacesAutocomplete(searchQuery, userLat, userLng);

  const showDropdown =
    searchQuery.trim().length >= 2 &&
    (loading || predictions.length > 0 || !!error);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleChangeText = useCallback(
    (text: string) => {
      setInputText(text);
      setSearchQuery(text); // triggers autocomplete
      onChangeText(text);
    },
    [onChangeText],
  );

  const handleClear = useCallback(() => {
    setInputText("");
    setSearchQuery("");
    onChangeText("");
    inputRef.current?.focus();
  }, [onChangeText]);

  const handleSelect = useCallback(
    async (prediction: PlacePrediction) => {
      setSelectingId(prediction.place_id);
      try {
        const details = await fetchPlaceDetails(prediction.place_id, sessionToken);
        const { lat, lng } = details.geometry.location;
        const isoCountryCode = extractIsoCountryCode(details);

        const main = prediction.structured_formatting.main_text;
        const secondary = prediction.structured_formatting.secondary_text;
        const label = secondary
          ? `${main}, ${secondary.split(",")[0]?.trim()}`
          : main;

        // Update input to show selected label
        setInputText(label);
        // Clear search so no further API calls until user types again
        setSearchQuery("");
        onChangeText(label);

        await onSelect({ label, lat, lng, place_id: prediction.place_id, isoCountryCode });
        resetSession();
      } catch (err) {
        showErrorToast(
          "Location unavailable",
          err instanceof Error ? err.message : "Could not load place details.",
        );
      } finally {
        setSelectingId(null);
      }
    },
    [sessionToken, onChangeText, onSelect, resetSession],
  );

  // ── FlatList ───────────────────────────────────────────────────────────────

  const renderItem = useCallback(
    ({ item, index }: { item: PlacePrediction; index: number }) => {
      const { main_text, secondary_text, main_text_matched_substrings } =
        item.structured_formatting;
      const isSelecting = selectingId === item.place_id;
      const isLast = index === predictions.length - 1;

      return (
        <Pressable
          onPress={() => void handleSelect(item)}
          android_ripple={{ color: "#E6FBF4" }}
          disabled={!!selectingId}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 14,
            paddingVertical: 12,
            backgroundColor: pressed ? colors.primarySoft : colors.surfaceElevated,
            borderBottomWidth: isLast ? 0 : 1,
            borderBottomColor: colors.border,
            opacity: selectingId && !isSelecting ? 0.5 : 1,
          })}
        >
          {/* Icon circle */}
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: colors.primarySoft,
              alignItems: "center",
              justifyContent: "center",
              marginRight: 11,
              flexShrink: 0,
            }}
          >
            {isSelecting ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <MaterialIcons name="location-on" size={17} color={colors.primary} />
            )}
          </View>

          {/* Text */}
          <View style={{ flex: 1, gap: 2 }}>
            <HighlightedText
              text={main_text}
              matchedSubstrings={
                main_text_matched_substrings as MatchedSubstring[]
              }
              style={{ fontSize: 13.5, lineHeight: 18, color: colors.textPrimary }}
              numberOfLines={1}
            />
            {secondary_text ? (
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 11.5,
                  color: colors.textSecondary,
                  fontFamily: ListifyFonts.regular,
                  lineHeight: 16,
                }}
              >
                {secondary_text}
              </Text>
            ) : null}
          </View>

          {/* Arrow */}
          <MaterialIcons
            name="north-west"
            size={14}
            color={colors.iconMuted}
            style={{ marginLeft: 8, flexShrink: 0 }}
          />
        </Pressable>
      );
    },
    [predictions.length, selectingId, handleSelect, colors],
  );

  const keyExtractor = useCallback(
    (item: PlacePrediction) => item.place_id,
    [],
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={{ position: "relative", zIndex: 20 }}>
      {/* Search input */}
      <View
        style={{
          height: 48,
          flexDirection: "row",
          alignItems: "center",
          borderRadius: 12,
          borderWidth: 1.5,
          borderColor: colors.border,
          backgroundColor: resolvedInputBg,
          paddingHorizontal: 12,
          gap: 8,
        }}
      >
        <MaterialIcons
          name="search"
          size={20}
          color={inputText.length > 0 ? colors.primary : colors.iconMuted}
        />
        <TextInput
          ref={inputRef}
          value={inputText}
          onChangeText={handleChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.inputPlaceholder}
          returnKeyType="search"
          autoCapitalize="words"
          autoCorrect={false}
          style={{
            flex: 1,
            fontSize: 14,
            color: resolvedInputText,
            fontFamily: ListifyFonts.regular,
            paddingVertical: 0,
          }}
        />
        {loading && searchQuery.trim().length >= 2 ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : inputText.length > 0 ? (
          <Pressable onPress={handleClear} hitSlop={8}>
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: colors.border,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MaterialIcons name="close" size={13} color={colors.textSecondary} />
            </View>
          </Pressable>
        ) : null}
      </View>

      {/* Dropdown */}
      {showDropdown ? (
        <View
          style={{
            position: "absolute",
            top: 52,
            left: 0,
            right: 0,
            backgroundColor: colors.surfaceElevated,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.1,
            shadowRadius: 12,
            elevation: 8,
            overflow: "hidden",
            zIndex: 100,
            maxHeight: 300,
          }}
        >
          {/* Loading skeleton */}
          {loading && predictions.length === 0 && !error ? (
            <View style={{ padding: 16, alignItems: "center" }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null}

          {/* Error */}
          {!!error && !loading ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: 14,
                gap: 8,
              }}
            >
              <MaterialIcons name="wifi-off" size={16} color={colors.danger} />
              <Text
                style={{
                  fontSize: 13,
                  color: colors.textSecondary,
                  fontFamily: ListifyFonts.regular,
                }}
              >
                Could not load suggestions.
              </Text>
            </View>
          ) : null}

          {/* Predictions */}
          {predictions.length > 0 ? (
            <FlatList
              data={predictions}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
              scrollEnabled={predictions.length > 4}
            />
          ) : null}

          {/* Empty */}
          {!loading && !error && predictions.length === 0 ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: 14,
                gap: 8,
              }}
            >
              <MaterialIcons name="search-off" size={16} color={colors.iconMuted} />
              <Text
                style={{
                  fontSize: 13,
                  color: colors.textTertiary,
                  fontFamily: ListifyFonts.regular,
                }}
              >
                {`No results for "${searchQuery.trim()}"`}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
