/**
 * PhoneInputWithCountry
 *
 * A two-part field: a country-code picker on the left and a phone-number
 * TextInput on the right.  Tapping the code badge opens a searchable modal
 * listing all supported country calling codes.
 *
 * Props:
 *   phoneCode         – current E.164 calling-code prefix, e.g. "+91"
 *   phone             – current national phone number digits
 *   onChangePhoneCode – called when user selects a new calling code
 *   onChangePhone     – called on every keystroke in the number field
 */
import { MaterialIcons } from "@expo/vector-icons";
import { useState, useMemo } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { ListifyFonts } from "@/constants/typography";
import { useTheme } from "@/providers/theme-provider";

// ---------------------------------------------------------------------------
// Country catalogue (name + ISO code)
// ---------------------------------------------------------------------------
type CountryEntry = { name: string; iso: string; code: string };

const COUNTRIES: CountryEntry[] = [
  { name: "Afghanistan",            iso: "AF", code: "+93"  },
  { name: "Albania",                iso: "AL", code: "+355" },
  { name: "Algeria",                iso: "DZ", code: "+213" },
  { name: "Argentina",              iso: "AR", code: "+54"  },
  { name: "Armenia",                iso: "AM", code: "+374" },
  { name: "Australia",              iso: "AU", code: "+61"  },
  { name: "Austria",                iso: "AT", code: "+43"  },
  { name: "Azerbaijan",             iso: "AZ", code: "+994" },
  { name: "Bahrain",                iso: "BH", code: "+973" },
  { name: "Bangladesh",             iso: "BD", code: "+880" },
  { name: "Belarus",                iso: "BY", code: "+375" },
  { name: "Belgium",                iso: "BE", code: "+32"  },
  { name: "Bolivia",                iso: "BO", code: "+591" },
  { name: "Bosnia & Herzegovina",   iso: "BA", code: "+387" },
  { name: "Brazil",                 iso: "BR", code: "+55"  },
  { name: "Bulgaria",               iso: "BG", code: "+359" },
  { name: "Cambodia",               iso: "KH", code: "+855" },
  { name: "Cameroon",               iso: "CM", code: "+237" },
  { name: "Canada",                 iso: "CA", code: "+1"   },
  { name: "Chile",                  iso: "CL", code: "+56"  },
  { name: "China",                  iso: "CN", code: "+86"  },
  { name: "Colombia",               iso: "CO", code: "+57"  },
  { name: "Croatia",                iso: "HR", code: "+385" },
  { name: "Cuba",                   iso: "CU", code: "+53"  },
  { name: "Czech Republic",         iso: "CZ", code: "+420" },
  { name: "Denmark",                iso: "DK", code: "+45"  },
  { name: "Ecuador",                iso: "EC", code: "+593" },
  { name: "Egypt",                  iso: "EG", code: "+20"  },
  { name: "Ethiopia",               iso: "ET", code: "+251" },
  { name: "Finland",                iso: "FI", code: "+358" },
  { name: "France",                 iso: "FR", code: "+33"  },
  { name: "Georgia",                iso: "GE", code: "+995" },
  { name: "Germany",                iso: "DE", code: "+49"  },
  { name: "Ghana",                  iso: "GH", code: "+233" },
  { name: "Greece",                 iso: "GR", code: "+30"  },
  { name: "Hong Kong",              iso: "HK", code: "+852" },
  { name: "Hungary",                iso: "HU", code: "+36"  },
  { name: "India",                  iso: "IN", code: "+91"  },
  { name: "Indonesia",              iso: "ID", code: "+62"  },
  { name: "Iran",                   iso: "IR", code: "+98"  },
  { name: "Iraq",                   iso: "IQ", code: "+964" },
  { name: "Ireland",                iso: "IE", code: "+353" },
  { name: "Israel",                 iso: "IL", code: "+972" },
  { name: "Italy",                  iso: "IT", code: "+39"  },
  { name: "Japan",                  iso: "JP", code: "+81"  },
  { name: "Jordan",                 iso: "JO", code: "+962" },
  { name: "Kazakhstan",             iso: "KZ", code: "+7"   },
  { name: "Kenya",                  iso: "KE", code: "+254" },
  { name: "Kuwait",                 iso: "KW", code: "+965" },
  { name: "Kyrgyzstan",             iso: "KG", code: "+996" },
  { name: "Laos",                   iso: "LA", code: "+856" },
  { name: "Latvia",                 iso: "LV", code: "+371" },
  { name: "Lebanon",                iso: "LB", code: "+961" },
  { name: "Libya",                  iso: "LY", code: "+218" },
  { name: "Lithuania",              iso: "LT", code: "+370" },
  { name: "Luxembourg",             iso: "LU", code: "+352" },
  { name: "Malaysia",               iso: "MY", code: "+60"  },
  { name: "Maldives",               iso: "MV", code: "+960" },
  { name: "Mexico",                 iso: "MX", code: "+52"  },
  { name: "Moldova",                iso: "MD", code: "+373" },
  { name: "Mongolia",               iso: "MN", code: "+976" },
  { name: "Morocco",                iso: "MA", code: "+212" },
  { name: "Mozambique",             iso: "MZ", code: "+258" },
  { name: "Myanmar",                iso: "MM", code: "+95"  },
  { name: "Nepal",                  iso: "NP", code: "+977" },
  { name: "Netherlands",            iso: "NL", code: "+31"  },
  { name: "New Zealand",            iso: "NZ", code: "+64"  },
  { name: "Nigeria",                iso: "NG", code: "+234" },
  { name: "Norway",                 iso: "NO", code: "+47"  },
  { name: "Oman",                   iso: "OM", code: "+968" },
  { name: "Pakistan",               iso: "PK", code: "+92"  },
  { name: "Peru",                   iso: "PE", code: "+51"  },
  { name: "Philippines",            iso: "PH", code: "+63"  },
  { name: "Poland",                 iso: "PL", code: "+48"  },
  { name: "Portugal",               iso: "PT", code: "+351" },
  { name: "Qatar",                  iso: "QA", code: "+974" },
  { name: "Romania",                iso: "RO", code: "+40"  },
  { name: "Russia",                 iso: "RU", code: "+7"   },
  { name: "Saudi Arabia",           iso: "SA", code: "+966" },
  { name: "Senegal",                iso: "SN", code: "+221" },
  { name: "Singapore",              iso: "SG", code: "+65"  },
  { name: "Slovakia",               iso: "SK", code: "+421" },
  { name: "South Africa",           iso: "ZA", code: "+27"  },
  { name: "South Korea",            iso: "KR", code: "+82"  },
  { name: "Spain",                  iso: "ES", code: "+34"  },
  { name: "Sri Lanka",              iso: "LK", code: "+94"  },
  { name: "Sudan",                  iso: "SD", code: "+249" },
  { name: "Sweden",                 iso: "SE", code: "+46"  },
  { name: "Switzerland",            iso: "CH", code: "+41"  },
  { name: "Syria",                  iso: "SY", code: "+963" },
  { name: "Taiwan",                 iso: "TW", code: "+886" },
  { name: "Tanzania",               iso: "TZ", code: "+255" },
  { name: "Thailand",               iso: "TH", code: "+66"  },
  { name: "Tunisia",                iso: "TN", code: "+216" },
  { name: "Turkey",                 iso: "TR", code: "+90"  },
  { name: "UAE",                    iso: "AE", code: "+971" },
  { name: "Uganda",                 iso: "UG", code: "+256" },
  { name: "Ukraine",                iso: "UA", code: "+380" },
  { name: "United Kingdom",         iso: "GB", code: "+44"  },
  { name: "United States",          iso: "US", code: "+1"   },
  { name: "Uruguay",                iso: "UY", code: "+598" },
  { name: "Uzbekistan",             iso: "UZ", code: "+998" },
  { name: "Venezuela",              iso: "VE", code: "+58"  },
  { name: "Vietnam",                iso: "VN", code: "+84"  },
  { name: "Yemen",                  iso: "YE", code: "+967" },
  { name: "Zambia",                 iso: "ZM", code: "+260" },
  { name: "Zimbabwe",               iso: "ZW", code: "+263" },
];

// ---------------------------------------------------------------------------
// Flag emoji helper  (works on Android 7+ and all iOS versions)
// ---------------------------------------------------------------------------
function flagEmoji(isoCode: string) {
  const codePoints = [...isoCode.toUpperCase()].map(
    (c) => 0x1f1e6 + c.charCodeAt(0) - 65,
  );
  return String.fromCodePoint(...codePoints);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
type Props = {
  phoneCode: string;
  phone: string;
  isoCode?: string;
  onChangePhoneCode: (code: string, iso: string) => void;
  onChangePhone: (value: string) => void;
};

export function PhoneInputWithCountry({
  phoneCode,
  phone,
  isoCode,
  onChangePhoneCode,
  onChangePhone,
}: Props) {
  const { colors } = useTheme();
  const [pickerVisible, setPickerVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredCountries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.includes(q) ||
        c.iso.toLowerCase().includes(q),
    );
  }, [searchQuery]);

  // Find the ISO for the current phone code to show the flag.
  // When isoCode is provided (set from location), use it to resolve the correct
  // country for codes shared by multiple nations (e.g. +1 for US vs CA).
  const activeEntry = useMemo(() => {
    if (isoCode) {
      const exact = COUNTRIES.find((c) => c.iso === isoCode && c.code === phoneCode);
      if (exact) return exact;
    }
    return COUNTRIES.find((c) => c.code === phoneCode);
  }, [phoneCode, isoCode]);
  const flagDisplay = activeEntry ? flagEmoji(activeEntry.iso) : "🌐";

  return (
    <>
      {/* ── Inline input row ── */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          borderWidth: 1.5,
          borderColor: colors.border,
          borderRadius: 12,
          backgroundColor: colors.inputBackground,
          overflow: "hidden",
          height: 52,
        }}
      >
        {/* Country code badge */}
        <Pressable
          onPress={() => setPickerVisible(true)}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            paddingHorizontal: 12,
            height: "100%",
            borderRightWidth: 1,
            borderRightColor: colors.border,
            backgroundColor: pressed ? colors.surfaceMuted : "transparent",
          })}
          accessibilityLabel="Select country code"
        >
          <Text style={{ fontSize: 20 }}>{flagDisplay}</Text>
          <Text
            style={{
              fontSize: 14,
              fontFamily: ListifyFonts.semiBold,
              color: colors.textPrimary,
              minWidth: 38,
            }}
          >
            {phoneCode}
          </Text>
          <MaterialIcons name="arrow-drop-down" size={18} color={colors.textSecondary} />
        </Pressable>

        {/* Phone number input */}
        <TextInput
          value={phone}
          onChangeText={onChangePhone}
          keyboardType="phone-pad"
          placeholder="Phone number"
          placeholderTextColor={colors.inputPlaceholder}
          returnKeyType="done"
          style={{
            flex: 1,
            paddingHorizontal: 12,
            fontSize: 15,
            fontFamily: ListifyFonts.regular,
            color: colors.textPrimary,
            paddingVertical: 0,
          }}
          accessibilityLabel="Phone number"
        />
      </View>

      {/* ── Country picker modal ── */}
      <Modal
        visible={pickerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerVisible(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: colors.scrim }}
          onPress={() => setPickerVisible(false)}
        />
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: colors.surfaceElevated,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            maxHeight: "75%",
          }}
        >
          {/* Handle */}
          <View style={{ alignItems: "center", paddingVertical: 10 }}>
            <View
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.borderStrong,
              }}
            />
          </View>

          {/* Title */}
          <Text
            style={{
              textAlign: "center",
              fontSize: 17,
              fontFamily: ListifyFonts.bold,
              color: colors.textPrimary,
              marginBottom: 12,
              paddingHorizontal: 16,
            }}
          >
            Select Country
          </Text>

          {/* Search */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginHorizontal: 16,
              marginBottom: 8,
              paddingHorizontal: 12,
              height: 44,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.inputBackground,
              gap: 8,
            }}
          >
            <MaterialIcons name="search" size={18} color={colors.iconMuted} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search country or code…"
              placeholderTextColor={colors.inputPlaceholder}
              returnKeyType="search"
              autoCapitalize="words"
              style={{
                flex: 1,
                fontSize: 14,
                fontFamily: ListifyFonts.regular,
                color: colors.textPrimary,
                paddingVertical: 0,
              }}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
                <MaterialIcons name="close" size={16} color={colors.iconMuted} />
              </Pressable>
            )}
          </View>

          {/* List */}
          <FlatList
            data={filteredCountries}
            keyExtractor={(item) => item.iso}
            keyboardShouldPersistTaps="handled"
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 32 }}
            renderItem={({ item }) => {
              const isSelected = item.code === phoneCode;
              return (
                <Pressable
                  onPress={() => {
                    onChangePhoneCode(item.code, item.iso);
                    setPickerVisible(false);
                    setSearchQuery("");
                  }}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    gap: 12,
                    backgroundColor: pressed
                      ? colors.surfaceMuted
                      : isSelected
                        ? colors.primarySoft
                        : colors.surfaceElevated,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  })}
                >
                  <Text style={{ fontSize: 22, width: 30 }}>
                    {flagEmoji(item.iso)}
                  </Text>
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 15,
                      fontFamily: ListifyFonts.regular,
                      color: colors.textPrimary,
                    }}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                  <Text
                    style={{
                      fontSize: 14,
                      fontFamily: ListifyFonts.semiBold,
                      color: isSelected ? colors.primaryDeep : colors.textSecondary,
                      minWidth: 44,
                      textAlign: "right",
                    }}
                  >
                    {item.code}
                  </Text>
                  {isSelected && (
                    <MaterialIcons
                      name="check-circle"
                      size={18}
                      color={colors.primaryDeep}
                    />
                  )}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </>
  );
}
