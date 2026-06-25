/**
 * LocationPermissionSheet
 *
 * A bottom-sheet overlay shown when the user has permanently denied location
 * permission or when device GPS is disabled.
 *
 * - "permanently_denied" → asks user to open app Settings
 * - "services_disabled"  → asks user to enable GPS in device Settings
 */

import { MaterialIcons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ListifyFonts } from "@/constants/typography";

const BRAND = "#27BB97";

export type LocationPermissionSheetReason =
  | "permanently_denied"
  | "services_disabled";

interface Props {
  visible: boolean;
  reason: LocationPermissionSheetReason;
  onOpenSettings: () => void;
  onCancel: () => void;
}

export function LocationPermissionSheet({
  visible,
  reason,
  onOpenSettings,
  onCancel,
}: Props) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(300)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(overlayAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 60,
          friction: 10,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(overlayAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 300,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, overlayAnim, slideAnim]);

  const isServicesDisabled = reason === "services_disabled";

  const iconName = isServicesDisabled
    ? ("location-off" as const)
    : ("lock" as const);

  const title = isServicesDisabled
    ? "Location Services Off"
    : "Location Permission Required";

  const body = isServicesDisabled
    ? Platform.OS === "android"
      ? "Your device's GPS is turned off. Tap below to enable Location Services so Listifys can find listings near you."
      : "Your device's Location Services are disabled. Go to Settings → Privacy & Security → Location Services to turn them on."
    : Platform.OS === "android"
    ? "Location access is blocked. Tap 'Open Settings', then go to Permissions → Location and select 'Allow'."
    : "Location access is blocked. Tap 'Open Settings', then tap 'Location' and choose 'While Using the App'.";

  const settingsLabel = isServicesDisabled
    ? "Open Location Settings"
    : "Open App Settings";

  return (
    <Modal
      transparent
      visible={visible}
      statusBarTranslucent
      animationType="none"
      onRequestClose={onCancel}
    >
      {/* Dim overlay */}
      <Animated.View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.45)",
          justifyContent: "flex-end",
          opacity: overlayAnim,
        }}
      >
        <Pressable
          style={{ flex: 1 }}
          onPress={onCancel}
          accessible={false}
        />

        {/* Sheet */}
        <Animated.View
          style={{
            backgroundColor: "#FFFFFF",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingTop: 12,
            paddingBottom: insets.bottom + 16,
            paddingHorizontal: 24,
            transform: [{ translateY: slideAnim }],
          }}
        >
          {/* Drag handle */}
          <View
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: "#E5E7EB",
              alignSelf: "center",
              marginBottom: 20,
            }}
          />

          {/* Icon */}
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: isServicesDisabled ? "#FFF3CD" : "#FEE2E2",
              alignItems: "center",
              justifyContent: "center",
              alignSelf: "center",
              marginBottom: 16,
            }}
          >
            <MaterialIcons
              name={iconName}
              size={32}
              color={isServicesDisabled ? "#D97706" : "#EF4444"}
            />
          </View>

          {/* Title */}
          <Text
            style={{
              fontSize: 18,
              fontFamily: ListifyFonts.bold,
              color: "#111827",
              textAlign: "center",
              marginBottom: 10,
            }}
          >
            {title}
          </Text>

          {/* Body */}
          <Text
            style={{
              fontSize: 14,
              fontFamily: ListifyFonts.regular,
              color: "#6B7280",
              textAlign: "center",
              lineHeight: 21,
              marginBottom: 28,
            }}
          >
            {body}
          </Text>

          {/* Open Settings button */}
          <Pressable
            onPress={onOpenSettings}
            android_ripple={{ color: "#D1FAE5" }}
            style={({ pressed }) => ({
              backgroundColor: pressed ? "#22A785" : BRAND,
              borderRadius: 14,
              paddingVertical: 15,
              alignItems: "center",
              marginBottom: 12,
            })}
          >
            <Text
              style={{
                fontSize: 15,
                fontFamily: ListifyFonts.semiBold,
                color: "#FFFFFF",
              }}
            >
              {settingsLabel}
            </Text>
          </Pressable>

          {/* Cancel button */}
          <Pressable
            onPress={onCancel}
            android_ripple={{ color: "#F3F4F6" }}
            style={({ pressed }) => ({
              backgroundColor: pressed ? "#F9FAFB" : "#F3F4F6",
              borderRadius: 14,
              paddingVertical: 15,
              alignItems: "center",
            })}
          >
            <Text
              style={{
                fontSize: 15,
                fontFamily: ListifyFonts.medium,
                color: "#374151",
              }}
            >
              Cancel
            </Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
