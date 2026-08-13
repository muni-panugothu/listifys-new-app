import { MaterialIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { type Href, useRouter } from "@/lib/safe-router";
import { type ReactNode, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { KeyboardFormScroll } from "@/components/keyboard-form-scroll";

import { ProfileAvatarImage } from "@/components/profile-avatar-image";
import { ListifyFonts } from "@/constants/typography";
import { useTheme } from "@/providers/theme-provider";
import { uploadProfileImage } from "@/features/auth/services/auth-api";
import { showErrorToast } from "@/lib/toast";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  fetchProfile,
  setAuthUser,
  updateUserProfile,
} from "@/store/slices/auth-slice";
import { showAuthGate } from "@/store/slices/auth-gate-slice";
import { GooglePlacesInput, type PlacesSelectResult } from "@/components/google-places-input";
import { clearLocation, setLocationDirect, setProfileFallbackLocation, selectLocationLabel } from "@/store/slices/location-slice";
import { clearAllPersistedLocations, saveStoredLocation } from "@/lib/location-service";
import { useLocale, CALLING_CODE } from "@/providers/locale-provider";
import { selectLocationCoords } from "@/store/slices/location-slice";

const USER_STORAGE_KEY = "@listify/auth_user";

const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer-not-to-say", label: "Prefer not" },
] as const;

function FieldLabel({ children }: { children: string }) {
  const { colors } = useTheme();
  return (
    <Text
      className="mb-2 text-[13px]"
      style={{ fontFamily: ListifyFonts.medium, color: colors.textSecondary }}
    >
      {children}
    </Text>
  );
}

function FormCard({ children }: { children: React.ReactNode }) {
  const { colors, resolvedMode } = useTheme();
  return (
    <View
      className="rounded-2xl p-4"
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: resolvedMode === "dark" ? 2 : 1 },
        shadowOpacity: resolvedMode === "dark" ? 0.22 : 0.04,
        shadowRadius: 8,
        elevation: resolvedMode === "dark" ? 3 : 2,
      }}
    >
      {children}
    </View>
  );
}

export function ProfileDetailsEditScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { colors, resolvedMode } = useTheme();
  const user = useAppSelector((s) => s.auth.user);
  const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated);
  const sessionHydrated = useAppSelector((s) => s.auth.sessionHydrated);
  const status = useAppSelector((s) => s.auth.status);
  const locationCoords = useAppSelector(selectLocationCoords);
  const reduxLocationLabel = useAppSelector(selectLocationLabel);
  const locationHydrated = useAppSelector((s) => s.location.hydrated);
  const { phoneCode: localePhoneCode, isoCountryCode: localeIso } = useLocale();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  // phone split into country code and digits for the picker
  const [phoneCode, setPhoneCode] = useState(localePhoneCode);
  const [phoneIso, setPhoneIso] = useState(localeIso);
  const [phoneDigits, setPhoneDigits] = useState("");
  const [location, setLocation] = useState("");
  const [bio, setBio] = useState("");
  const [gender, setGender] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [uploadedImageUri, setUploadedImageUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [avatarKey, setAvatarKey] = useState(0);

  const avatarUser = uploadedImageUri
    ? {
        profileImageUrl: uploadedImageUri,
        profileImage: uploadedImageUri,
        avatar: uploadedImageUri,
      }
    : user;

  useEffect(() => {
    if (!sessionHydrated) return;
    if (!isAuthenticated) {
      dispatch(showAuthGate({ action: "profile", redirectTo: "/profile-details-edit" }));
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/(tabs)/dashboard-home" as Href);
      }
      return;
    }
    if (!user) {
      void dispatch(fetchProfile());
    }
  }, [dispatch, isAuthenticated, router, sessionHydrated, user]);

  // ── Location sync ──────────────────────────────────────────────────────────
  // Always follow the Redux location slice so any change made in the location
  // picker (or home-feed header) is immediately reflected here.
  // Falls back to user.address when the slice has no real value yet.
  useEffect(() => {
    if (!locationHydrated) return;
    const PLACEHOLDER = ["Set location", "Detecting location\u2026"];
    const sliceReady = reduxLocationLabel && !PLACEHOLDER.includes(reduxLocationLabel);
    if (sliceReady) {
      setLocation(reduxLocationLabel);
    } else if (user) {
      const addr = (user as { address?: string }).address || (user as { location?: string }).location || "";
      setLocation(addr);
    }
  }, [user, reduxLocationLabel, locationHydrated]);

  useEffect(() => {
    if (user) {
      setFullName(user.name || "");
      setEmail(user.email || "");
      // Parse stored phone: it may be "+91XXXXXXXXXX" or just "XXXXXXXXXX"
      const rawPhone: string = (user as { phone?: string }).phone || "";
      if (rawPhone.startsWith("+")) {
        // Sort all known calling codes longest-first so +355 matches before +35
        const allCodes = [...new Set(Object.values(CALLING_CODE))]
          .sort((a, b) => b.length - a.length);
        const matchedCode = allCodes.find((c) => rawPhone.startsWith(c));
        if (matchedCode) {
          setPhoneCode(matchedCode);
          setPhoneDigits(rawPhone.slice(matchedCode.length));
          // Reverse-lookup ISO from calling code so the flag updates correctly.
          // For ambiguous codes (+1 → US, +7 → RU) prefer the primary country.
          const PREFERRED_ISO: Record<string, string> = { "+1": "US", "+7": "RU" };
          const iso = PREFERRED_ISO[matchedCode] ??
            (Object.entries(CALLING_CODE).find(([, c]) => c === matchedCode)?.[0] ?? localeIso);
          setPhoneIso(iso);
        } else {
          setPhoneDigits(rawPhone.replace(/^\+\d{1,4}/, ""));
        }
      } else {
        setPhoneDigits(rawPhone);
      }
      setBio((user as { bio?: string }).bio || "");
      setGender((user as { gender?: string }).gender || "");
      const dob = (user as { dateOfBirth?: string }).dateOfBirth;
      setDateOfBirth(dob ? new Date(dob).toISOString().split("T")[0] : "");
    }
  }, [user]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(tabs)/dashboard-home" as Href);
  };

  const handleSave = async () => {
    const trimmedLocation = location.trim();
    const result = await dispatch(
      updateUserProfile({
        name: fullName,
        address: trimmedLocation,
        bio,
        dateOfBirth,
        gender,
      }),
    );
    if (updateUserProfile.fulfilled.match(result)) {
      // Sync the location text back to the Redux location slice so the home
      // feed, post form, and any other consumer that reads selectLocationLabel
      // reflects the profile's address immediately.
      if (trimmedLocation) {
        // setProfileFallbackLocation is a no-op when the user already has a
        // GPS or manually-picked location (it never overrides those).
        dispatch(setProfileFallbackLocation(trimmedLocation));
      } else {
        // User cleared their address — wipe the global location slice and the
        // persisted location so the app no longer shows the stale value.
        dispatch(clearLocation());
        await clearAllPersistedLocations().catch(() => {});
      }
      handleBack();
    } else {
      showErrorToast("Error", (result.payload as string) || "Failed to update profile");
    }
  };

  const handleLocationSelect = async (result: PlacesSelectResult) => {
    setLocation(result.label);
    // Sync to global location slice so all screens instantly see new location
    dispatch(setLocationDirect({
      label: result.label,
      lat: result.lat,
      lng: result.lng,
      isoCountryCode: result.isoCountryCode,
    }));
    await saveStoredLocation({
      label: result.label,
      lat: result.lat,
      lng: result.lng,
      isoCountryCode: result.isoCountryCode,
      source: "manual",
      updatedAt: Date.now(),
    });
  };

  const handlePickImage = async () => {
    try {
      const permResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permResult.granted) {
        showErrorToast("Permission required", "Please allow access to your photos.");
        return;
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (pickerResult.canceled || !pickerResult.assets?.[0]) return;

      const asset = pickerResult.assets[0];
      const filename = asset.uri.split("/").pop() || `profile_${Date.now()}.jpg`;
      const match = /\.(\w+)$/.exec(filename);
      const ext = match ? match[1].toLowerCase() : "jpg";
      const mimeType =
        asset.mimeType ?? `image/${ext === "jpg" ? "jpeg" : ext}`;

      const formData = new FormData();
      formData.append("image", {
        uri: Platform.OS === "android" ? asset.uri : asset.uri.replace("file://", ""),
        name: filename,
        type: mimeType,
      } as unknown as Blob);

      setUploading(true);
      const uploadRes = await uploadProfileImage(formData);
      const freshImageUri =
        uploadRes.imageUrl ||
        uploadRes.user?.profileImageUrl ||
        uploadRes.user?.profileImage ||
        uploadRes.profileImageUrl ||
        uploadRes.profileImage ||
        null;

      if (freshImageUri) {
        const cacheBusted = `${freshImageUri}${freshImageUri.includes("?") ? "&" : "?"}t=${Date.now()}`;
        setUploadedImageUri(cacheBusted);
        setAvatarKey((k) => k + 1);
      }
      if (uploadRes.user) {
        dispatch(setAuthUser(uploadRes.user));
        await AsyncStorage.setItem(
          USER_STORAGE_KEY,
          JSON.stringify(uploadRes.user),
        );
      }

      // Refresh profile in background — don't fail the upload if this errors
      try {
        await dispatch(fetchProfile()).unwrap();
      } catch {
        // Upload already succeeded; ignore refresh errors
      }


    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : "Could not upload image";
      showErrorToast("Upload failed", message);
    } finally {
      setUploading(false);
    }
  };

  const fieldBackground = colors.inputBackground;
  const fieldTextColor = colors.textPrimary;
  const fieldBorderColor = colors.borderStrong;

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <View
        className="flex-row items-center justify-between px-5"
        style={{ paddingTop: insets.top + 8, paddingBottom: 12 }}
      >
        <View className="flex-row items-center">
          <Pressable
            onPress={handleBack}
            hitSlop={12}
            className="mr-2 h-10 w-10 items-center justify-center"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <MaterialIcons name="chevron-left" size={32} color={colors.icon} />
          </Pressable>
          <Text
            className="text-[22px]"
            style={{ fontFamily: ListifyFonts.bold, color: colors.textPrimary }}
          >
            Edit profile
          </Text>
        </View>
        <Pressable
          onPress={() => router.push("/app-settings" as Href)}
          className="h-10 w-10 items-center justify-center rounded-full"
          style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1, backgroundColor: colors.surface })}
        >
          <MaterialIcons name="settings" size={22} color={colors.iconMuted} />
        </Pressable>
      </View>

      <KeyboardFormScroll
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: 24,
        }}
      >
        <FormCard>
          <View className="items-center py-2">
            <View className="relative">
              <View
                className="h-28 w-28 overflow-hidden rounded-full border-[3px]"
                style={{
                  borderColor: colors.surface,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: resolvedMode === "dark" ? 0.3 : 0.1,
                  shadowRadius: 8,
                  elevation: 4,
                }}
              >
                <ProfileAvatarImage
                  key={avatarKey}
                  user={avatarUser}
                  fallbackName={fullName || user?.name}
                  className="h-full w-full"
                  iconSize={40}
                />
              </View>
              <Pressable
                onPress={handlePickImage}
                className="absolute bottom-0 right-0 h-9 w-9 items-center justify-center rounded-full"
                style={{ backgroundColor: colors.primary }}
              >
                {uploading ? (
                  <ActivityIndicator size="small" color={colors.textOnPrimary} />
                ) : (
                  <MaterialIcons name="photo-camera" size={18} color={colors.textOnPrimary} />
                )}
              </Pressable>
            </View>
            <Text
              className="mt-3 text-[13px]"
              style={{ fontFamily: ListifyFonts.regular, color: colors.textTertiary }}
            >
              Tap camera to change photo
            </Text>
          </View>
        </FormCard>

        <View className="mt-4 gap-4">
          <FormCard>
            <FieldLabel>Full name</FieldLabel>
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholder="Your name"
              placeholderTextColor={colors.inputPlaceholder}
              className="h-12 rounded-xl px-4 text-[15px]"
              style={{
                fontFamily: ListifyFonts.regular,
                color: fieldTextColor,
                backgroundColor: fieldBackground,
                borderWidth: 1,
                borderColor: fieldBorderColor,
              }}
            />
          </FormCard>

          {/* ── Email & Phone read-only ── */}
          <FormCard>
            <FieldLabel>Email</FieldLabel>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                height: 48,
                backgroundColor: fieldBackground,
                borderRadius: 12,
                paddingHorizontal: 14,
                borderWidth: 1,
                borderColor: fieldBorderColor,
              }}
            >
              <Text
                style={{
                  flex: 1,
                  fontSize: 15,
                  fontFamily: ListifyFonts.regular,
                  color: fieldTextColor,
                }}
                numberOfLines={1}
              >
                {email || "—"}
              </Text>
              <Pressable
                onPress={() => router.push("/change-email" as Href)}
                hitSlop={8}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.6 : 1,
                  paddingVertical: 4,
                  paddingLeft: 8,
                })}
              >
                <Text style={{ fontSize: 13.5, fontFamily: ListifyFonts.semiBold, color: colors.primary }}>
                  Change
                </Text>
              </Pressable>
            </View>

            <View className="mt-4">
              <FieldLabel>Phone</FieldLabel>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  height: 48,
                  backgroundColor: fieldBackground,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  borderWidth: 1,
                  borderColor: fieldBorderColor,
                }}
              >
                <Text
                  style={{
                    flex: 1,
                    fontSize: 15,
                    fontFamily: ListifyFonts.regular,
                    color: fieldTextColor,
                  }}
                  numberOfLines={1}
                >
                  {phoneDigits ? `${phoneCode} ${phoneDigits}` : (email ? "—" : "—")}
                </Text>
                <Pressable
                  onPress={() => router.push("/change-phone-primary" as Href)}
                  hitSlop={8}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.6 : 1,
                    paddingVertical: 4,
                    paddingLeft: 8,
                  })}
                >
                  <Text style={{ fontSize: 13.5, fontFamily: ListifyFonts.semiBold, color: colors.primary }}>
                    Change
                  </Text>
                </Pressable>
              </View>
            </View>
          </FormCard>

          <FormCard>
            <FieldLabel>Gender</FieldLabel>
            <View className="flex-row flex-wrap gap-2">
              {GENDER_OPTIONS.map((option) => {
                const selected = gender === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setGender(option.value)}
                    className="rounded-full px-4 py-2"
                    style={{
                      backgroundColor: selected ? colors.primarySoftStrong : fieldBackground,
                      borderWidth: 1,
                      borderColor: selected ? colors.primary : colors.border,
                    }}
                  >
                    <Text
                      className="text-[13px]"
                      style={{
                        fontFamily: selected ? ListifyFonts.semiBold : ListifyFonts.medium,
                        color: selected ? colors.primary : colors.textSecondary,
                      }}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View className="mt-4">
              <FieldLabel>Date of birth</FieldLabel>
              <TextInput
                value={dateOfBirth}
                onChangeText={setDateOfBirth}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.inputPlaceholder}
                className="h-12 rounded-xl px-4 text-[15px]"
                style={{
                  fontFamily: ListifyFonts.regular,
                  color: fieldTextColor,
                  backgroundColor: fieldBackground,
                  borderWidth: 1,
                  borderColor: fieldBorderColor,
                }}
              />
            </View>
          </FormCard>

          <FormCard>
            <FieldLabel>Location</FieldLabel>
            <GooglePlacesInput
              value={location}
              onChangeText={setLocation}
              onSelect={handleLocationSelect}
              placeholder="City, area"
              userLat={locationCoords?.lat}
              userLng={locationCoords?.lng}
              inputBackgroundColor={fieldBackground}
              inputTextColor={fieldTextColor}
            />
            <View className="mt-4">
              <FieldLabel>Bio</FieldLabel>
              <TextInput
                value={bio}
                onChangeText={(t) => t.length <= 150 && setBio(t)}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                placeholder="Tell buyers a bit about you"
                placeholderTextColor={colors.inputPlaceholder}
                className="min-h-[96px] rounded-xl px-4 py-3 text-[15px] leading-[22px]"
                style={{
                  fontFamily: ListifyFonts.regular,
                  color: fieldTextColor,
                  backgroundColor: fieldBackground,
                  borderWidth: 1,
                  borderColor: fieldBorderColor,
                }}
              />
              <Text
                className="mt-2 text-right text-[12px]"
                style={{ fontFamily: ListifyFonts.regular, color: colors.textTertiary }}
              >
                {bio.length}/150
              </Text>
            </View>
          </FormCard>
        </View>
      </KeyboardFormScroll>

      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.surface,
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: Math.max(insets.bottom, 12),
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: resolvedMode === "dark" ? 0.2 : 0.06,
          shadowRadius: 8,
          elevation: 16,
        }}
      >
        <Pressable
          onPress={handleSave}
          disabled={status === "loading"}
          style={({ pressed }) => ({
            opacity: status === "loading" ? 0.6 : pressed ? 0.9 : 1,
          })}
        >
          <View
            style={{
              minHeight: 52,
              borderRadius: 16,
              backgroundColor: colors.primary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {status === "loading" ? (
              <ActivityIndicator color={colors.textOnPrimary} />
            ) : (
              <Text
                style={{
                  fontFamily: ListifyFonts.semiBold,
                  fontSize: 16,
                  color: colors.textOnPrimary,
                }}
              >
                Save changes
              </Text>
            )}
          </View>
        </Pressable>
      </View>
    </View>
  );
}
