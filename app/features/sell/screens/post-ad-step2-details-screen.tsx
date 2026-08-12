import { MaterialIcons } from "@expo/vector-icons";
import { type Href, useRouter } from "@/lib/safe-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, FlatList, Modal, Pressable, Text, TextInput, View, Alert, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { SellFlowLayout } from "@/components/sell-flow-layout";
import { ListifyFonts } from "@/constants/typography";
import { useLocale } from "@/providers/locale-provider";
import { useTheme } from "@/providers/theme-provider";
import { showErrorToast } from "@/lib/toast";
import { getMileageUnitForCountry } from "@/lib/listing-distance";

import { CATEGORY_MAP } from "@/constants/categories";
import { getAdPlaceholders, MOBILE_DEVICE_SUBCATEGORIES } from "@/constants/post-form-placeholders";
import {
  isEventDateTodayOrFuture,
  isValidEventTime,
  normalizeEventTime,
  parseEventDateInput,
} from "@/lib/post-form-validators";
import {
  EventDatePickerModal,
  EventTimePickerModal,
  PickerField,
} from "@/features/sell/components/event-date-time-pickers";
import { deleteListing } from "@/features/listing/services/listing-api";
import { CompanyLogoPicker } from "@/features/jobs/components/company-logo-picker";
import { fetchMyEmployerCompanyProfile } from "@/features/jobs/services/jobs-company-api";
import {
  CONDITION_OPTIONS,
  CONDITION_SKIP_CATEGORIES,
  PRICE_OPTIONAL_CATEGORIES,
} from "@/constants/categories";
import { CURRENCY_OPTIONS, type CurrencyEntry } from "@/constants/currencies";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  setTitle, setDescription, setPrice, setCondition, setListingType, setCurrency,
  // Property
  setBedrooms, setBathrooms, setFurnishing, setSquareFeet, toggleFeature, setPetFriendly, setGenderPreference, setOccupancy,
  // Electronics
  setBrand, setModel, setWarranty, setPurchaseYear, setScreenSize, setDisplayType,
  setProcessor, setRam, setStorage, setCapacity, setEnergyRating, setMegapixels, setLensType,
  // Vehicles
  setVariant, setYear, setKmDriven, setMileageUnit, setFuelType, setTransmission, setOwnership, setColor,
  setEngineCC, setCycleType, setGearCount, setFrameSize, setCompatibleVehicle, setPartCategory,
  // Jobs
  setCompanyName, setCompanyWebsite, setCompanyEmail, setApplyLink, setExperience, setEducation,
  setEmploymentType, setWorkMode, setSalaryMin, setSalaryMax, setSalaryType,
  setIndustry, setPositions, setCompanyLogoUri, setUploadedCompanyLogoUrl, clearCompanyLogo,
  // TakeCare
  setAvailability, setAge, toggleLanguage, toggleCertification,
  // Events
  setEventDate, setEventTime, setOrganizer, setVenue, setTicketsAvailable, setAgeRestriction, setDressCode,
  // Mobiles
  setBatteryHealth,
  // Furniture
  setMaterial, setDimensions, setWeight, setAssemblyRequired, setNumberOfPieces,
  // Fashion
  setSize, setGender, setFabricType,
  // Sports
  setSportType, setAgeGroup,
  // Collectibles
  setEra, setRarity, setAuthenticity, setOrigin,
  // Pets
  setBreed, setPetAge, setVaccinated, setTrained,
  // Books
  setAuthor, setIsbn, setPublisher, setEdition, setLanguage, setPages,
  // Beauty
  setSkinType, setShade, setVolume, setIngredients, setExpiryDate,
  // Toys
  setBatteryRequired, setPlayMode, setCharacterTheme,
  // Services
  setPriceUnit, setServiceArea, setServiceMode, setResponseTime,
  resetPostForm,
} from "@/store/slices/post-form-slice";

// ── Option constants ────────────────────────────────────────────────────────────
const FURNISHING_OPTIONS = ["Fully Furnished", "Semi-Furnished", "Unfurnished"];
const PROPERTY_AMENITIES = [
  "Parking", "Swimming Pool", "Gym", "Power Backup", "Lift",
  "Security", "Garden", "Clubhouse", "Play Area", "Water Supply",
  "Gas Pipeline", "CCTV", "Intercom", "Fire Safety",
];
const GENDER_PREF_OPTIONS = ["Any", "Male Only", "Female Only"];
const OCCUPANCY_OPTIONS = ["Single", "Shared", "Any"];

const WARRANTY_OPTIONS = ["Under Warranty", "Expired", "No Warranty"];
const ENERGY_RATING_OPTIONS = ["1 Star", "2 Star", "3 Star", "4 Star", "5 Star"];
const TV_AUDIO_SUBCATEGORIES = ["TVs, Video - Audio", "Hard Disks, Printers & Monitors"];
const COMPUTER_LAPTOP_SUBCATEGORIES = ["Computers & Laptops"];
const MONITOR_PRINTER_SUBCATEGORIES = ["Hard Disks, Printers & Monitors"];
const APPLIANCE_SUBCATEGORIES = ["Kitchen & Other Appliances", "Fridges", "Washing Machines", "ACs"];
const CAMERA_SUBCATEGORIES = ["Cameras & Lenses"];

const FUEL_OPTIONS = ["Petrol", "Diesel", "CNG", "Electric", "Hybrid", "LPG"];
const BIKE_FUEL_OPTIONS = ["Petrol", "CNG", "Electric", "Hybrid", "LPG"]; // Bikes don't use Diesel
const TRANSMISSION_OPTIONS = ["Manual", "Automatic"];
const OWNERSHIP_OPTIONS = ["1st Owner", "2nd Owner", "3rd Owner", "4th+ Owner"];
const CYCLE_TYPE_OPTIONS = ["Mountain", "Road", "Hybrid", "BMX", "Kids", "Folding", "Electric", "Cruiser"];
const COMPATIBLE_VEHICLE_OPTIONS = ["Car", "Bike", "Cycle", "Universal"];
const PART_CATEGORY_OPTIONS = ["Engine Parts", "Body Parts", "Electrical", "Suspension", "Brakes", "Tyres & Wheels", "Interior", "Exterior", "Exhaust", "Filters", "Other"];

const SALARY_TYPE_OPTIONS = ["monthly", "yearly", "hourly", "daily", "weekly"];
const EMPLOYMENT_TYPE_OPTIONS = ["Full Time", "Part Time", "Contract", "Freelance", "Internship"];
const WORK_MODE_OPTIONS = ["On-site", "Remote", "Hybrid"];

const TAKECARE_LANGUAGES = ["English", "Hindi", "Telugu", "Tamil", "Kannada", "Malayalam", "Bengali", "Marathi", "Gujarati", "Punjabi"];
const TAKECARE_CERTS = ["First Aid", "CPR", "Nursing", "Child Care", "Elder Care", "Pet Grooming"];

const ASSEMBLY_OPTIONS = ["Yes", "No"];
const FASHION_GENDER_OPTIONS = ["Men", "Women", "Kids", "Unisex"];
const SPORT_TYPE_OPTIONS = ["Cricket", "Football", "Badminton", "Tennis", "Basketball", "Swimming", "Running", "Yoga", "Boxing", "Hockey", "Table Tennis", "Gym & Fitness", "Cycling", "Hiking", "Other"];
const AGE_GROUP_OPTIONS = ["Kids", "Adults", "All Ages"];
const RARITY_OPTIONS = ["Common", "Uncommon", "Rare", "Very Rare", "Extremely Rare"];
const AUTHENTICITY_OPTIONS = ["Certified", "Uncertified"];
const PET_GENDER_OPTIONS = ["Male", "Female", "Unknown"];
const VACCINATED_OPTIONS = ["Yes", "No", "Partial"];
const TRAINED_OPTIONS = ["Yes", "No", "Partial"];
const SKIN_TYPE_OPTIONS = ["All", "Oily", "Dry", "Combination", "Sensitive", "Normal"];
const BEAUTY_GENDER_OPTIONS = ["Men", "Women", "Unisex"];
const BATTERY_REQUIRED_OPTIONS = ["Yes", "No", "Not Sure"];

const SERVICE_PRICE_UNIT_OPTIONS = ["Per Hour", "Per Visit", "Per Day", "Per Month", "Fixed Quote"];
const SERVICE_MODE_OPTIONS = ["On-site", "Remote", "Both"];
const SERVICE_AVAILABILITY_OPTIONS = ["Available Now", "Weekdays", "Weekends", "Flexible", "By Appointment"];
const SERVICE_RESPONSE_OPTIONS = ["Within 1 hour", "Within 2-4 hours", "Same Day", "Next Day"];

// ── Helpers ─────────────────────────────────────────────────────────────────────

/** Pill selector row */
function PillRow({ options, value, onSelect }: { options: string[]; value: string; onSelect: (v: string) => void }) {
  const { colors } = useTheme();

  return (
    <View className="flex-row flex-wrap gap-3">
      {options.map((opt) => {
        const isActive = value === opt;
        return (
          <Pressable
            key={opt}
            onPress={() => onSelect(isActive ? "" : opt)}
            className="rounded-full px-5 py-2.5"
            style={{
              backgroundColor: isActive ? colors.textPrimary : colors.inputBackground,
              borderWidth: 1,
              borderColor: isActive ? colors.textPrimary : colors.border,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontFamily: isActive ? ListifyFonts.semiBold : ListifyFonts.medium,
                color: isActive ? colors.background : colors.textPrimary,
              }}
            >
              {opt}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Multi-select chip row */
function ChipRow({ options, selected, onToggle }: { options: string[]; selected: string[]; onToggle: (v: string) => void }) {
  const { colors } = useTheme();

  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((item) => {
        const isActive = selected.includes(item);
        return (
          <Pressable
            key={item}
            onPress={() => onToggle(item)}
            className="flex-row items-center gap-1.5 rounded-full px-4 py-2"
            style={{
              backgroundColor: isActive ? colors.surfaceMuted : colors.inputBackground,
              borderWidth: 1,
              borderColor: isActive ? colors.textPrimary : colors.border,
            }}
          >
            <MaterialIcons
              name={isActive ? "check-circle" : "add-circle-outline"}
              size={16}
              color={isActive ? colors.textPrimary : colors.iconMuted}
            />
            <Text
              style={{
                fontSize: 12,
                fontFamily: ListifyFonts.medium,
                color: isActive ? colors.textPrimary : colors.textSecondary,
              }}
            >
              {item}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Text input field with icon */
function IconField({ icon, value, onChangeText, placeholder, numeric, maxLength, dateExpiry, onBlur }: {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  numeric?: boolean;
  maxLength?: number;
  dateExpiry?: boolean;
  onBlur?: () => void;
}) {
  const handleChange = (v: string) => {
    if (numeric) {
      onChangeText(v.replace(/[^0-9]/g, ""));
      return;
    }
    if (dateExpiry) {
      const digits = v.replace(/\D/g, "").slice(0, 6);
      if (digits.length <= 2) {
        onChangeText(digits);
      } else {
        onChangeText(`${digits.slice(0, 2)}/${digits.slice(2)}`);
      }
      return;
    }
    onChangeText(v);
  };

  const { colors } = useTheme();

  return (
    <View
      className="h-12 flex-row items-center rounded-2xl border px-4"
      style={{ borderColor: colors.border, backgroundColor: colors.inputBackground }}
    >
      <MaterialIcons name={icon} size={20} color={colors.icon} />
      <TextInput
        value={value}
        onChangeText={handleChange}
        onBlur={onBlur}
        keyboardType={numeric || dateExpiry ? "numeric" : "default"}
        maxLength={dateExpiry ? 7 : maxLength}
        placeholder={placeholder}
        placeholderTextColor={colors.inputPlaceholder}
        className="ml-2 flex-1"
        style={{ paddingVertical: 0, fontSize: 14, color: colors.textPrimary }}
      />
    </View>
  );
}

function isValidExpiryDate(value: string): boolean {
  if (!value.trim()) return true;
  const match = /^(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return false;
  const month = Number(match[1]);
  const year = Number(match[2]);
  return month >= 1 && month <= 12 && year >= 2000 && year <= 2100;
}

/** Section label */
function Label({ text, required }: { text: string; required?: boolean }) {
  const { colors } = useTheme();

  return (
    <View style={{ marginBottom: 8, flexDirection: "row", alignItems: "center" }}>
      <Text
        style={{
          fontSize: 12,
          fontFamily: ListifyFonts.medium,
          color: colors.textPrimary,
        }}
      >
        {text}
      </Text>
      {required ? (
        <Text style={{ fontSize: 12, fontFamily: ListifyFonts.medium, color: colors.danger }}>
          {" *"}
        </Text>
      ) : null}
    </View>
  );
}

function LabelPill({ text, required }: { text: string; required?: boolean }) {
  const { colors } = useTheme();

  return (
    <View style={{ marginBottom: 12, flexDirection: "row", alignItems: "center" }}>
      <Text
        style={{
          fontSize: 12,
          fontFamily: ListifyFonts.medium,
          color: colors.textPrimary,
        }}
      >
        {text}
      </Text>
      {required ? (
        <Text style={{ fontSize: 12, fontFamily: ListifyFonts.medium, color: colors.danger }}>
          {" *"}
        </Text>
      ) : null}
    </View>
  );
}

// ── Main Screen ─────────────────────────────────────────────────────────────────

export function PostAdStep2DetailsScreen() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { colors } = useTheme();
  const { currencyCode, currencySymbol, isoCountryCode } = useLocale();

  // Track if user has manually chosen a currency this session.
  // When false, currency always mirrors the selected location's locale.
  const [isCurrencyManual, setIsCurrencyManual] = useState(false);
  const editListingId = useAppSelector((s) => s.postForm.editListingId);
  const isEditMode = Boolean(editListingId);

  // Auto-sync currency from locale whenever the location (and thus currencyCode) changes
  useEffect(() => {
    if (isEditMode) {
      setIsCurrencyManual(true);
      return;
    }
    if (!isCurrencyManual) {
      dispatch(setCurrency(currencyCode));
    }
  }, [currencyCode, isCurrencyManual, isEditMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const prevCountryRef = useRef(isoCountryCode);
  useEffect(() => {
    if (isEditMode) return;
    if (prevCountryRef.current !== isoCountryCode) {
      prevCountryRef.current = isoCountryCode;
      setIsCurrencyManual(false);
      dispatch(setCurrency(currencyCode));
      dispatch(setMileageUnit(getMileageUnitForCountry(isoCountryCode)));
    }
  }, [currencyCode, dispatch, isoCountryCode, isEditMode]);

  const [currencyPickerVisible, setCurrencyPickerVisible] = useState(false);
  const [currencySearch, setCurrencySearch] = useState("");
  const [eventDatePickerVisible, setEventDatePickerVisible] = useState(false);
  const [eventTimePickerVisible, setEventTimePickerVisible] = useState(false);

  const pf = useAppSelector((s) => s.postForm);
  const [deleting, setDeleting] = useState(false);
  const {
    title, description, price, condition, category, subcategory, listingType, currency,
    bedrooms, bathrooms, furnishing, squareFeet, features, petFriendly, genderPreference, occupancy,
    brand, model: productModel, warranty, purchaseYear, screenSize, displayType,
    processor, ram, storage, capacity, energyRating, megapixels, lensType,
    variant, year, kmDriven, mileageUnit, fuelType, transmission, ownership, color, engineCC,
    cycleType, gearCount, frameSize, compatibleVehicle, partCategory,
    companyName, companyWebsite, companyEmail, companyLogoUri, uploadedCompanyLogoUrl, applyLink, experience, education,
    employmentType, workMode, salaryMin, salaryMax, salaryType, industry, positions,
    availability, age, languages, certifications,
    eventDate, eventTime, organizer, venue, ticketsAvailable, ageRestriction, dressCode,
    batteryHealth,
    material, dimensions, weight, assemblyRequired, numberOfPieces,
    size, gender, fabricType,
    sportType, ageGroup,
    era, rarity, authenticity, origin,
    breed, petAge, vaccinated, trained,
    author, isbn, publisher, edition, language, pages,
    skinType, shade, volume, ingredients, expiryDate,
    batteryRequired, playMode, characterTheme,
    priceUnit, serviceArea, serviceMode, responseTime,
  } = pf;

  const filteredCurrencies = useMemo(() => {
    const q = currencySearch.trim().toLowerCase();
    if (!q) return CURRENCY_OPTIONS;
    return CURRENCY_OPTIONS.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q) || c.symbol.includes(q),
    );
  }, [currencySearch]);

  // Show the symbol for the selected currency code, falling back to locale symbol
  const displayCurrency =
    CURRENCY_OPTIONS.find((c) => c.code === currency)?.symbol ?? currencySymbol;
  const localeMileageUnit = getMileageUnitForCountry(isoCountryCode);
  const activeMileageUnit = mileageUnit || localeMileageUnit;
  const mileageLabel = activeMileageUnit === "mi" ? "Miles Driven" : "KM Driven";
  const mileagePlaceholder = activeMileageUnit === "mi" ? "e.g. 15000" : "e.g. 25000";

  const isProperty = category === "properties";
  const isElectronics = category === "electronics";
  const isVehicle = category === "vehicles";
  const isJob = category === "jobs";

  useEffect(() => {
    if (!isJob || isEditMode) return;

    let cancelled = false;
    void (async () => {
      try {
        const profile = await fetchMyEmployerCompanyProfile();
        if (!profile || cancelled) return;

        if (!companyName && profile.companyName) {
          dispatch(setCompanyName(profile.companyName));
        }
        if (!companyEmail && profile.companyEmail) {
          dispatch(setCompanyEmail(profile.companyEmail));
        }
        if (!companyWebsite && profile.companyWebsite) {
          dispatch(setCompanyWebsite(profile.companyWebsite));
        }
        if (!industry && profile.industry) {
          dispatch(setIndustry(profile.industry));
        }
        if (profile.companyLogo && !companyLogoUri && !uploadedCompanyLogoUrl) {
          dispatch(setUploadedCompanyLogoUrl(profile.companyLogo));
          dispatch(setCompanyLogoUri(profile.companyLogo));
        }
      } catch {
        // Profile is optional for first-time posters.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    isJob,
    isEditMode,
    dispatch,
    companyName,
    companyEmail,
    companyWebsite,
    industry,
    companyLogoUri,
    uploadedCompanyLogoUrl,
  ]);

  const isTakeCare = category === "takecare";
  const isEvent = category === "events";
  const isMobile = category === "mobiles";
  const isFurniture = category === "furniture";
  const isFashion = category === "fashion";
  const isSports = category === "sports";
  const isCollectible = category === "collectibles";
  const isPet = category === "pets supplies";
  const isBook = category === "books";
  const isBeauty = category === "beauty";
  const isToy = category === "toys";
  const isForSale = category === "forsale";
  const isService = category === "services";

  // Electronics subcategory-specific
  const showTvFields = isElectronics && TV_AUDIO_SUBCATEGORIES.includes(subcategory);
  const showComputerFields = isElectronics && COMPUTER_LAPTOP_SUBCATEGORIES.includes(subcategory);
  const showMonitorFields = isElectronics && MONITOR_PRINTER_SUBCATEGORIES.includes(subcategory);
  const showApplianceFields = isElectronics && APPLIANCE_SUBCATEGORIES.includes(subcategory);
  const showCameraFields = isElectronics && CAMERA_SUBCATEGORIES.includes(subcategory);

  const isMobileDevice = isMobile && MOBILE_DEVICE_SUBCATEGORIES.has(subcategory);
  const isMobileAccessory = isMobile && !isMobileDevice;

  const adPlaceholders = useMemo(
    () => getAdPlaceholders(category, subcategory),
    [category, subcategory],
  );

  const eventDatePlaceholder = useMemo(() => {
    const today = new Date();
    const day = today.getDate();
    const month = today.toLocaleString("en-IN", { month: "short" });
    const year = today.getFullYear();
    return `e.g. ${day} ${month} ${year}`;
  }, []);

  // Vehicle subcategory-specific
  const isCar = isVehicle && subcategory === "Cars";
  const isBike = isVehicle && subcategory === "Bikes";
  const isCycle = isVehicle && subcategory === "Cycle";
  const isSparePart = isVehicle && subcategory === "Spare Parts";

  const showCondition = !CONDITION_SKIP_CATEGORIES.includes(category);
  const priceOptional = PRICE_OPTIONAL_CATEGORIES.includes(category);

  const priceError =
    !priceOptional && price.length > 0 && (Number(price) <= 100 || Number(price) === 0);

  const handleNext = () => {
    // ── Title ────────────────────────────────────────────────────────────────
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 3) {
      showErrorToast("Title required", "Title must be at least 3 characters.");
      return;
    }
    if (trimmedTitle.length > 200) {
      showErrorToast("Title too long", "Title cannot exceed 200 characters.");
      return;
    }

    // ── Description ──────────────────────────────────────────────────────────
    const trimmedDesc = description.trim();
    if (trimmedDesc.length < 20) {
      showErrorToast("Description too short", "Description must be at least 20 characters.");
      return;
    }
    if (trimmedDesc.length > 5000) {
      showErrorToast("Description too long", "Description cannot exceed 5000 characters.");
      return;
    }

    // ── Price ─────────────────────────────────────────────────────────────────
    if (!priceOptional) {
      const numericPrice = Number(price);
      if (price.trim() === "" || isNaN(numericPrice) || numericPrice < 0) {
        showErrorToast("Price required", "Please enter a valid price (0 or more).");
        return;
      }
    }

    // ── Job-specific ─────────────────────────────────────────────────────────
    if (isJob) {
      if (companyEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(companyEmail)) {
        showErrorToast("Invalid email", "Please enter a valid company email address.");
        return;
      }
      if (applyLink && !/^https?:\/\/.+/.test(applyLink)) {
        showErrorToast("Invalid apply link", "Apply link must start with http:// or https://");
        return;
      }
    }

    if (isBeauty && expiryDate.trim() && !isValidExpiryDate(expiryDate)) {
      showErrorToast(
        "Invalid expiry date",
        "Use MM/YYYY format (e.g. 12/2026). Month must be 01–12.",
      );
      return;
    }

    if (isEvent) {
      if (!eventDate.trim()) {
        showErrorToast("Event date required", "Enter the event date (today or a future date).");
        return;
      }
      const parsedDate = parseEventDateInput(eventDate);
      if (!parsedDate) {
        showErrorToast(
          "Invalid event date",
          "Use a valid date like 25 Dec 2026, 25/12/2026, or 2026-12-25. Past dates are not allowed.",
        );
        return;
      }
      if (!isEventDateTodayOrFuture(parsedDate)) {
        showErrorToast("Past date not allowed", "Event date must be today or a future date.");
        return;
      }
      if (!eventTime.trim()) {
        showErrorToast("Event time required", "Enter the event start time.");
        return;
      }
      if (!isValidEventTime(eventTime)) {
        showErrorToast(
          "Invalid event time",
          "Use 12-hour time with AM/PM (e.g. 7:00 PM) or 24-hour format (e.g. 19:00).",
        );
        return;
      }
      if (!organizer.trim()) {
        showErrorToast("Organizer required", "Enter who is organizing this event.");
        return;
      }
      if (!venue.trim()) {
        showErrorToast("Venue required", "Enter where the event will take place.");
        return;
      }
    }

    router.push("/post-ad-step3-media");
  };

  const handleBack = () => {
    if (isEditMode) {
      dispatch(resetPostForm());
      router.back();
      return;
    }
    router.replace({
      pathname: "/post-ad-step1-category",
      params: { category },
    } as Href);
  };

  const handleDeleteListing = () => {
    if (!editListingId) return;
    Alert.alert(
      "Delete Listing",
      "This will permanently delete the listing and all associated images. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteListing(category, editListingId);
              dispatch(resetPostForm());
              router.replace("/my-listings-active" as Href);
            } catch {
              showErrorToast("Error", "Failed to delete listing.");
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  useFocusEffect(
    useCallback(() => {
      const onHardwareBack = () => {
        handleBack();
        return true;
      };
      const sub = BackHandler.addEventListener("hardwareBackPress", onHardwareBack);
      return () => sub.remove();
    }, [category, isEditMode, router]),
  );

  return (
    <>
    <SellFlowLayout
      step={isEditMode ? 2 : 2}
      title={isEditMode ? "Edit listing" : "Listing details"}
      subtitle={isEditMode ? "Update title, price & item info" : "Title, price & item info"}
      onBack={handleBack}
      rightAction={
        isEditMode ? (
          <Pressable
            onPress={handleDeleteListing}
            disabled={deleting}
            className="flex-row items-center gap-1.5 rounded-lg px-3 py-1.5"
            style={({ pressed }) => ({ opacity: pressed || deleting ? 0.5 : 1 })}
          >
            {deleting ? (
              <ActivityIndicator size="small" color={colors.danger} />
            ) : (
              <>
                <MaterialIcons name="delete" size={20} color={colors.danger} />
                <Text className="text-[12px] font-medium" style={{ color: colors.danger }}>Delete</Text>
              </>
            )}
          </Pressable>
        ) : undefined
      }
      footerLabel={isEditMode ? "Editing" : undefined}
      footerMeta={isEditMode ? (CATEGORY_MAP[category]?.name ?? category) : undefined}
      primaryLabel={isEditMode ? "Continue" : "Continue"}
      onPrimaryPress={handleNext}
    >

          {/* Property Listing Type */}
          {isProperty && (
            <View className="mb-6">
              <Label text="Listing Type" required />
              <View className="rounded-xl p-1 flex-row" style={{ backgroundColor: colors.surfaceMuted }}>
                {["Properties", "Rentals"].map((t) => (
                  <Pressable
                    key={t}
                    onPress={() => dispatch(setListingType(t))}
                    className="flex-1 rounded-lg py-2.5"
                    style={{
                      backgroundColor: listingType === t ? colors.surfaceElevated : "transparent",
                      shadowColor: listingType === t ? "#000" : "transparent",
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: listingType === t ? 0.08 : 0,
                      shadowRadius: 2,
                      elevation: listingType === t ? 1 : 0,
                    }}
                  >
                    <Text className="text-center text-[14px] font-semibold" style={{ color: listingType === t ? colors.textPrimary : colors.textSecondary }}>
                      {t === "Properties" ? "For Sale" : "For Rent"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* ── Ad Title ── */}
          <View className="mb-6">
            <View className="mb-2 flex-row items-end justify-between">
              <Label text="Ad Title" required />
              <Text style={{ fontSize: 10, fontFamily: ListifyFonts.medium, color: colors.textTertiary }}>
                {title.length}/70
              </Text>
            </View>
            <TextInput
              value={title}
              onChangeText={(v) => dispatch(setTitle(v))}
              maxLength={70}
              placeholder={adPlaceholders.title}
              placeholderTextColor={colors.inputPlaceholder}
              style={{
                height: 48,
                borderRadius: 8,
                borderWidth: 1,
                paddingHorizontal: 16,
                fontSize: 14,
                paddingVertical: 0,
                borderColor: colors.border,
                backgroundColor: colors.inputBackground,
                color: colors.textPrimary,
              }}
            />
          </View>

          {/* ── Description ── */}
          <View className="mb-6">
            <Label text="Description" required />
            <TextInput
              value={description}
              onChangeText={(v) => dispatch(setDescription(v))}
              placeholder={adPlaceholders.description}
              placeholderTextColor={colors.inputPlaceholder}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              style={{
                minHeight: 120,
                borderRadius: 8,
                borderWidth: 1,
                padding: 16,
                fontSize: 14,
                borderColor: colors.border,
                backgroundColor: colors.inputBackground,
                color: colors.textPrimary,
              }}
            />
            <Text style={{ marginTop: 4, paddingHorizontal: 4, fontSize: 11, color: colors.textTertiary }}>
              {adPlaceholders.hint ?? "Mention key selling points like brand, age, and condition details."}
            </Text>
          </View>

          {!priceOptional && (
            <View className="mb-6">
              <Label text="Price" required />
              <View
                className="h-12 flex-row items-center rounded-lg overflow-hidden"
                style={{
                  borderWidth: 1,
                  borderColor: priceError ? colors.danger : colors.border,
                  backgroundColor: colors.inputBackground,
                }}
              >
                {/* Tappable currency badge */}
                <Pressable
                  onPress={() => setCurrencyPickerVisible(true)}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 2,
                    paddingHorizontal: 10,
                    height: "100%",
                    borderRightWidth: 1,
                    borderRightColor: colors.border,
                    backgroundColor: pressed ? colors.surfaceMuted : "transparent",
                  })}
                  accessibilityLabel="Select currency"
                >
                  <Text style={{ fontSize: 15, fontFamily: ListifyFonts.semiBold, color: colors.textPrimary }}>
                    {displayCurrency}
                  </Text>
                  <MaterialIcons name="arrow-drop-down" size={16} color={colors.textSecondary} />
                </Pressable>
                <TextInput
                  value={price}
                  onChangeText={(v) => dispatch(setPrice(v))}
                  keyboardType="numeric"
                  className="flex-1 text-[16px] font-bold px-3"
                  style={{ paddingVertical: 0, color: priceError ? colors.danger : colors.textPrimary }}
                />
              </View>
              {priceError && (
                <View className="mt-1 flex-row items-center gap-1 px-1">
                  <MaterialIcons name="error" size={14} color={colors.danger} />
                  <Text className="text-[11px]" style={{ color: colors.danger }}>Price must be greater than {displayCurrency}100</Text>
                </View>
              )}
            </View>
          )}

          {/* ── Condition ── */}
          {showCondition && (
            <View className="mb-8">
              <LabelPill text="Condition" required />
              <PillRow options={[...CONDITION_OPTIONS]} value={condition} onSelect={(v) => dispatch(setCondition(v || "Good"))} />
            </View>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              SERVICES FIELDS
             ═══════════════════════════════════════════════════════════════ */}
          {isService && (
            <>
              <View className="mb-6 flex-row gap-4">
                <View className="flex-1">
                  <Label text="Experience" required />
                  <IconField icon="trending-up" value={experience} onChangeText={(v) => dispatch(setExperience(v))} placeholder="e.g. 3 years" />
                </View>
                <View className="flex-1">
                  <Label text="Service Area" required />
                  <IconField icon="location-on" value={serviceArea} onChangeText={(v) => dispatch(setServiceArea(v))} placeholder="e.g. 10 km radius" />
                </View>
              </View>
              <View className="mb-6">
                <LabelPill text="Price Unit" required />
                <PillRow options={SERVICE_PRICE_UNIT_OPTIONS} value={priceUnit} onSelect={(v) => dispatch(setPriceUnit(v))} />
              </View>
              <View className="mb-6">
                <LabelPill text="Service Mode" required />
                <PillRow options={SERVICE_MODE_OPTIONS} value={serviceMode} onSelect={(v) => dispatch(setServiceMode(v))} />
              </View>
              <View className="mb-6">
                <LabelPill text="Availability" />
                <PillRow options={SERVICE_AVAILABILITY_OPTIONS} value={availability} onSelect={(v) => dispatch(setAvailability(v))} />
              </View>
              <View className="mb-8">
                <LabelPill text="Typical Response Time" />
                <PillRow options={SERVICE_RESPONSE_OPTIONS} value={responseTime} onSelect={(v) => dispatch(setResponseTime(v))} />
              </View>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              PROPERTY FIELDS
             ═══════════════════════════════════════════════════════════════ */}
          {isProperty && (
            <>
              <View className="mb-6 flex-row gap-4">
                <View className="flex-1">
                  <Label text="Bedrooms" required />
                  <IconField icon="bed" value={bedrooms} onChangeText={(v) => dispatch(setBedrooms(v))} placeholder="0" numeric />
                </View>
                <View className="flex-1">
                  <Label text="Bathrooms" required />
                  <IconField icon="bathtub" value={bathrooms} onChangeText={(v) => dispatch(setBathrooms(v))} placeholder="0" numeric />
                </View>
              </View>
              <View className="mb-6">
                <Label text="Area (sq.ft)" required />
                <IconField icon="square-foot" value={squareFeet} onChangeText={(v) => dispatch(setSquareFeet(v))} placeholder="e.g. 1200" numeric />
              </View>
              <View className="mb-6">
                <LabelPill text="Furnishing" required />
                <PillRow options={FURNISHING_OPTIONS} value={furnishing} onSelect={(v) => dispatch(setFurnishing(v))} />
              </View>
              <View className="mb-6">
                <LabelPill text="Pet Friendly" />
                <View className="flex-row gap-3">
                  {[true, false].map((val) => {
                    const isActive = petFriendly === val;
                    return (
                      <Pressable
                        key={String(val)}
                        onPress={() => dispatch(setPetFriendly(val))}
                        className="rounded-full px-6 py-2.5"
                        style={{
                          backgroundColor: isActive ? colors.textPrimary : colors.inputBackground,
                          borderWidth: 1,
                          borderColor: isActive ? colors.textPrimary : colors.border,
                        }}
                      >
                        <Text
              style={{
                fontSize: 12,
                fontFamily: isActive ? ListifyFonts.semiBold : ListifyFonts.medium,
                color: isActive ? colors.background : colors.textPrimary,
              }}
            >
                          {val ? "Yes" : "No"}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <View className="mb-6">
                <LabelPill text="Gender Preference" />
                <PillRow options={GENDER_PREF_OPTIONS} value={genderPreference} onSelect={(v) => dispatch(setGenderPreference(v))} />
              </View>
              <View className="mb-6">
                <LabelPill text="Occupancy" />
                <PillRow options={OCCUPANCY_OPTIONS} value={occupancy} onSelect={(v) => dispatch(setOccupancy(v))} />
              </View>
              <View className="mb-8">
                <LabelPill text="Amenities" />
                <ChipRow options={PROPERTY_AMENITIES} selected={features} onToggle={(v) => dispatch(toggleFeature(v))} />
              </View>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              ELECTRONICS FIELDS
             ═══════════════════════════════════════════════════════════════ */}
          {isElectronics && (
            <>
              <View className="mb-6 flex-row gap-4">
                <View className="flex-1">
                  <Label text="Brand" required />
                  <IconField icon="branding-watermark" value={brand} onChangeText={(v) => dispatch(setBrand(v))} placeholder="e.g. Samsung" />
                </View>
                <View className="flex-1">
                  <Label text="Model" required />
                  <IconField icon="info-outline" value={productModel} onChangeText={(v) => dispatch(setModel(v))} placeholder="e.g. Galaxy S24" />
                </View>
              </View>
              <View className="mb-6">
                <Label text="Purchase Year" />
                <IconField icon="date-range" value={purchaseYear} onChangeText={(v) => dispatch(setPurchaseYear(v))} placeholder="e.g. 2023" numeric maxLength={4} />
              </View>
              <View className="mb-6">
                <LabelPill text="Warranty" />
                <PillRow options={WARRANTY_OPTIONS} value={warranty} onSelect={(v) => dispatch(setWarranty(v))} />
              </View>
              {showTvFields && (
                <View className="mb-6 flex-row gap-4">
                  <View className="flex-1">
                    <Label text="Screen Size" />
                    <IconField icon="tv" value={screenSize} onChangeText={(v) => dispatch(setScreenSize(v))} placeholder='e.g. 55"' />
                  </View>
                  <View className="flex-1">
                    <Label text="Display Type" />
                    <IconField icon="hd" value={displayType} onChangeText={(v) => dispatch(setDisplayType(v))} placeholder="e.g. OLED" />
                  </View>
                </View>
              )}
              {showComputerFields && (
                <>
                  <View className="mb-6">
                    <Label text="Processor" />
                    <IconField icon="memory" value={processor} onChangeText={(v) => dispatch(setProcessor(v))} placeholder="e.g. Intel i7 12th Gen" />
                  </View>
                  <View className="mb-6 flex-row gap-4">
                    <View className="flex-1">
                      <Label text="RAM" />
                      <IconField icon="developer-board" value={ram} onChangeText={(v) => dispatch(setRam(v))} placeholder="e.g. 16 GB" />
                    </View>
                    <View className="flex-1">
                      <Label text="Storage" />
                      <IconField icon="sd-storage" value={storage} onChangeText={(v) => dispatch(setStorage(v))} placeholder="e.g. 512 GB SSD" />
                    </View>
                  </View>
                </>
              )}
              {showApplianceFields && (
                <>
                  <View className="mb-6">
                    <Label text="Capacity" />
                    <IconField icon="straighten" value={capacity} onChangeText={(v) => dispatch(setCapacity(v))} placeholder="e.g. 260L / 7kg / 1.5 Ton" />
                  </View>
                  <View className="mb-6">
                    <LabelPill text="Energy Rating" />
                    <PillRow options={ENERGY_RATING_OPTIONS} value={energyRating} onSelect={(v) => dispatch(setEnergyRating(v))} />
                  </View>
                </>
              )}
              {showMonitorFields && (
                <View className="mb-6">
                  <Label text="Screen Size / Specs" />
                  <IconField icon="desktop-windows" value={screenSize} onChangeText={(v) => dispatch(setScreenSize(v))} placeholder='e.g. 24" monitor / 1TB HDD' />
                </View>
              )}
              {showCameraFields && (
                <View className="mb-6 flex-row gap-4">
                  <View className="flex-1">
                    <Label text="Megapixels" />
                    <IconField icon="camera-alt" value={megapixels} onChangeText={(v) => dispatch(setMegapixels(v))} placeholder="e.g. 50 MP" />
                  </View>
                  <View className="flex-1">
                    <Label text="Lens Type" />
                    <IconField icon="camera" value={lensType} onChangeText={(v) => dispatch(setLensType(v))} placeholder="e.g. Wide Angle" />
                  </View>
                </View>
              )}
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              VEHICLES FIELDS
             ═══════════════════════════════════════════════════════════════ */}
          {isVehicle && (
            <>
              <View className="mb-6 flex-row gap-4">
                <View className="flex-1">
                  <Label text="Brand" required />
                  <IconField icon="branding-watermark" value={brand} onChangeText={(v) => dispatch(setBrand(v))} placeholder="e.g. Honda" />
                </View>
                <View className="flex-1">
                  <Label text="Model" required />
                  <IconField icon="info-outline" value={productModel} onChangeText={(v) => dispatch(setModel(v))} placeholder="e.g. City" />
                </View>
              </View>
              {(isCar || isBike) && (
                <>
                  <View className="mb-6">
                    <Label text="Variant" />
                    <IconField icon="tune" value={variant} onChangeText={(v) => dispatch(setVariant(v))} placeholder="e.g. VX CVT" />
                  </View>
                  <View className="mb-6 flex-row gap-4">
                    <View className="flex-1">
                      <Label text="Year" required />
                      <IconField icon="date-range" value={year} onChangeText={(v) => dispatch(setYear(v))} placeholder="e.g. 2022" numeric maxLength={4} />
                    </View>
                    <View className="flex-1">
                      <Label text={mileageLabel} />
                      <IconField
                        icon="speed"
                        value={kmDriven}
                        onChangeText={(v) => {
                          dispatch(setMileageUnit(activeMileageUnit));
                          dispatch(setKmDriven(v));
                        }}
                        placeholder={mileagePlaceholder}
                      />
                    </View>
                  </View>
                  <View className="mb-6">
                    <LabelPill text="Fuel Type" required />
                    <PillRow options={isCar ? FUEL_OPTIONS : BIKE_FUEL_OPTIONS} value={fuelType} onSelect={(v) => dispatch(setFuelType(v))} />
                  </View>
                  {isCar && (
                    <View className="mb-6">
                      <LabelPill text="Transmission" required />
                      <PillRow options={TRANSMISSION_OPTIONS} value={transmission} onSelect={(v) => dispatch(setTransmission(v))} />
                    </View>
                  )}
                  <View className="mb-6">
                    <LabelPill text="Ownership" required />
                    <PillRow options={OWNERSHIP_OPTIONS} value={ownership} onSelect={(v) => dispatch(setOwnership(v))} />
                  </View>
                  <View className="mb-6">
                    <Label text="Color" />
                    <IconField icon="palette" value={color} onChangeText={(v) => dispatch(setColor(v))} placeholder="e.g. White" />
                  </View>
                </>
              )}
              {isBike && (
                <View className="mb-6">
                  <Label text="Engine CC" />
                  <IconField icon="settings" value={engineCC} onChangeText={(v) => dispatch(setEngineCC(v))} placeholder="e.g. 150" />
                </View>
              )}
              {isCycle && (
                <>
                  <View className="mb-6">
                    <LabelPill text="Cycle Type" />
                    <PillRow options={CYCLE_TYPE_OPTIONS} value={cycleType} onSelect={(v) => dispatch(setCycleType(v))} />
                  </View>
                  <View className="mb-6 flex-row gap-4">
                    <View className="flex-1">
                      <Label text="Gear Count" />
                      <IconField icon="settings" value={gearCount} onChangeText={(v) => dispatch(setGearCount(v))} placeholder="e.g. 21" />
                    </View>
                    <View className="flex-1">
                      <Label text="Frame Size" />
                      <IconField icon="straighten" value={frameSize} onChangeText={(v) => dispatch(setFrameSize(v))} placeholder='e.g. 18"' />
                    </View>
                  </View>
                  <View className="mb-6">
                    <Label text="Color" />
                    <IconField icon="palette" value={color} onChangeText={(v) => dispatch(setColor(v))} placeholder="e.g. Red" />
                  </View>
                </>
              )}
              {isSparePart && (
                <>
                  <View className="mb-6">
                    <LabelPill text="Compatible Vehicle" />
                    <PillRow options={COMPATIBLE_VEHICLE_OPTIONS} value={compatibleVehicle} onSelect={(v) => dispatch(setCompatibleVehicle(v))} />
                  </View>
                  <View className="mb-6">
                    <LabelPill text="Part Category" />
                    <PillRow options={PART_CATEGORY_OPTIONS} value={partCategory} onSelect={(v) => dispatch(setPartCategory(v))} />
                  </View>
                </>
              )}
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              JOBS FIELDS
             ═══════════════════════════════════════════════════════════════ */}
          {isJob && (
            <>
              <CompanyLogoPicker
                companyName={companyName}
                logoUri={companyLogoUri}
                uploadedLogoUrl={uploadedCompanyLogoUrl}
                onPick={(uri) => {
                  dispatch(setCompanyLogoUri(uri));
                  dispatch(setUploadedCompanyLogoUrl(""));
                }}
                onRemove={() => dispatch(clearCompanyLogo())}
              />
              <View className="mb-6">
                <Label text="Company Name" required />
                <IconField icon="business" value={companyName} onChangeText={(v) => dispatch(setCompanyName(v))} placeholder="e.g. Amazon, Infosys" />
              </View>
              <View className="mb-6">
                <Label text="Company Website" />
                <IconField icon="language" value={companyWebsite} onChangeText={(v) => dispatch(setCompanyWebsite(v))} placeholder="e.g. amazon.com" />
              </View>
              <View className="mb-6">
                <Label text="Company Email" />
                <IconField icon="email" value={companyEmail} onChangeText={(v) => dispatch(setCompanyEmail(v))} placeholder="e.g. hr@company.com" />
              </View>
              <View className="mb-6">
                <Label text="Apply Link" />
                <IconField icon="link" value={applyLink} onChangeText={(v) => dispatch(setApplyLink(v))} placeholder="https://careers.company.com" />
              </View>
              <View className="mb-6 flex-row gap-4">
                <View className="flex-1">
                  <Label text="Experience" required />
                  <IconField icon="trending-up" value={experience} onChangeText={(v) => dispatch(setExperience(v))} placeholder="e.g. 2-4 years" />
                </View>
                <View className="flex-1">
                  <Label text="Education" />
                  <IconField icon="school" value={education} onChangeText={(v) => dispatch(setEducation(v))} placeholder="e.g. B.Tech" />
                </View>
              </View>
              <View className="mb-6">
                <LabelPill text="Job Type" required />
                <PillRow options={EMPLOYMENT_TYPE_OPTIONS} value={employmentType} onSelect={(v) => dispatch(setEmploymentType(v))} />
              </View>
              <View className="mb-6">
                <LabelPill text="Work Mode" required />
                <PillRow options={WORK_MODE_OPTIONS} value={workMode} onSelect={(v) => dispatch(setWorkMode(v))} />
              </View>
              <View className="mb-6 flex-row gap-4">
                <View className="flex-1">
                  <Label text="Salary Min" />
                  <IconField icon="attach-money" value={salaryMin} onChangeText={(v) => dispatch(setSalaryMin(v))} placeholder="e.g. 30000" numeric />
                </View>
                <View className="flex-1">
                  <Label text="Salary Max" />
                  <IconField icon="attach-money" value={salaryMax} onChangeText={(v) => dispatch(setSalaryMax(v))} placeholder="e.g. 60000" numeric />
                </View>
              </View>
              <View className="mb-6">
                <LabelPill text="Salary Type" />
                <PillRow options={SALARY_TYPE_OPTIONS} value={salaryType} onSelect={(v) => dispatch(setSalaryType(v))} />
              </View>
              <View className="mb-6 flex-row gap-4">
                <View className="flex-1">
                  <Label text="Industry" />
                  <IconField icon="domain" value={industry} onChangeText={(v) => dispatch(setIndustry(v))} placeholder="e.g. IT" />
                </View>
                <View className="flex-1">
                  <Label text="Positions" />
                  <IconField icon="group" value={positions} onChangeText={(v) => dispatch(setPositions(v))} placeholder="e.g. 5" numeric />
                </View>
              </View>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              TAKECARE FIELDS
             ═══════════════════════════════════════════════════════════════ */}
          {isTakeCare && (
            <>
              <View className="mb-6 flex-row gap-4">
                <View className="flex-1">
                  <Label text="Experience" />
                  <IconField icon="trending-up" value={experience} onChangeText={(v) => dispatch(setExperience(v))} placeholder="e.g. 3 years" />
                </View>
                <View className="flex-1">
                  <Label text="Availability" />
                  <IconField icon="schedule" value={availability} onChangeText={(v) => dispatch(setAvailability(v))} placeholder="e.g. Full Time" />
                </View>
              </View>
              <View className="mb-6">
                <Label text="Age" />
                <IconField icon="person" value={age} onChangeText={(v) => dispatch(setAge(v))} placeholder="e.g. 30" numeric />
              </View>
              <View className="mb-6">
                <LabelPill text="Languages" />
                <ChipRow options={TAKECARE_LANGUAGES} selected={languages} onToggle={(v) => dispatch(toggleLanguage(v))} />
              </View>
              <View className="mb-8">
                <LabelPill text="Certifications" />
                <ChipRow options={TAKECARE_CERTS} selected={certifications} onToggle={(v) => dispatch(toggleCertification(v))} />
              </View>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              EVENTS FIELDS
             ═══════════════════════════════════════════════════════════════ */}
          {isEvent && (
            <>
              <View className="mb-6 flex-row gap-4">
                <View className="flex-1">
                  <Label text="Event Date" required />
                  <PickerField
                    icon="event"
                    value={eventDate}
                    placeholder={eventDatePlaceholder}
                    onPress={() => setEventDatePickerVisible(true)}
                  />
                </View>
                <View className="flex-1">
                  <Label text="Event Time" required />
                  <PickerField
                    icon="access-time"
                    value={eventTime}
                    placeholder="e.g. 7:00 PM"
                    onPress={() => setEventTimePickerVisible(true)}
                  />
                </View>
              </View>
              <Text className="mb-6 px-1 text-[11px]" style={{ color: colors.textTertiary }}>
                Event date must be today or later. Tap the fields above to pick date and time.
              </Text>
              <View className="mb-6">
                <IconField icon="person" value={organizer} onChangeText={(v) => dispatch(setOrganizer(v))} placeholder="e.g. EventBrite Inc." />
              </View>
              <View className="mb-6">
                <Label text="Venue" required />
                <IconField icon="place" value={venue} onChangeText={(v) => dispatch(setVenue(v))} placeholder="e.g. HICC, Hyderabad" />
              </View>
              <View className="mb-6 flex-row gap-4">
                <View className="flex-1">
                  <Label text="Age Restriction" />
                  <IconField icon="no-accounts" value={ageRestriction} onChangeText={(v) => dispatch(setAgeRestriction(v))} placeholder="e.g. 18+" />
                </View>
              </View>
              <View className="mb-6">
                <Label text="Dress Code" />
                <IconField icon="checkroom" value={dressCode} onChangeText={(v) => dispatch(setDressCode(v))} placeholder="e.g. Formal" />
              </View>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              MOBILES FIELDS
             ═══════════════════════════════════════════════════════════════ */}
          {isMobile && isMobileDevice && (
            <>
              <View className="mb-6 flex-row gap-4">
                <View className="flex-1">
                  <Label text="Brand" required />
                  <IconField icon="branding-watermark" value={brand} onChangeText={(v) => dispatch(setBrand(v))} placeholder="e.g. Apple" />
                </View>
                <View className="flex-1">
                  <Label text="Model" required />
                  <IconField icon="info-outline" value={productModel} onChangeText={(v) => dispatch(setModel(v))} placeholder="e.g. iPhone 15" />
                </View>
              </View>
              <View className="mb-6 flex-row gap-4">
                <View className="flex-1">
                  <Label text="Storage" required />
                  <IconField icon="sd-storage" value={storage} onChangeText={(v) => dispatch(setStorage(v))} placeholder="e.g. 128 GB" />
                </View>
                <View className="flex-1">
                  <Label text="RAM" />
                  <IconField icon="developer-board" value={ram} onChangeText={(v) => dispatch(setRam(v))} placeholder="e.g. 6 GB" />
                </View>
              </View>
              <View className="mb-6 flex-row gap-4">
                <View className="flex-1">
                  <Label text="Screen Size" />
                  <IconField icon="smartphone" value={screenSize} onChangeText={(v) => dispatch(setScreenSize(v))} placeholder='e.g. 6.1"' />
                </View>
                <View className="flex-1">
                  <Label text="Battery Health" />
                  <IconField icon="battery-full" value={batteryHealth} onChangeText={(v) => dispatch(setBatteryHealth(v))} placeholder="e.g. 92%" />
                </View>
              </View>
              <View className="mb-6">
                <LabelPill text="Warranty" />
                <PillRow options={WARRANTY_OPTIONS} value={warranty} onSelect={(v) => dispatch(setWarranty(v))} />
              </View>
              <View className="mb-6">
                <Label text="Color" />
                <IconField icon="palette" value={color} onChangeText={(v) => dispatch(setColor(v))} placeholder="e.g. Space Black" />
              </View>
            </>
          )}

          {isMobile && isMobileAccessory && (
            <>
              <View className="mb-6 flex-row gap-4">
                <View className="flex-1">
                  <Label text="Brand" required />
                  <IconField icon="branding-watermark" value={brand} onChangeText={(v) => dispatch(setBrand(v))} placeholder="e.g. Spigen, Anker, Boat" />
                </View>
                <View className="flex-1">
                  <Label text={subcategory === "Cases & Covers" ? "Compatible Phone" : "Model / Spec"} required />
                  <IconField
                    icon="info-outline"
                    value={productModel}
                    onChangeText={(v) => dispatch(setModel(v))}
                    placeholder={
                      subcategory === "Cases & Covers"
                        ? "e.g. iPhone 15 Pro"
                        : subcategory === "Chargers & Cables"
                          ? "e.g. 65W USB-C"
                          : subcategory === "Power Banks"
                            ? "e.g. 20000mAh"
                            : subcategory === "Memory Cards & Storage"
                              ? "e.g. 128GB microSD"
                              : "e.g. Galaxy S24 / Watch 6"
                    }
                  />
                </View>
              </View>
              {(subcategory === "Cases & Covers" || subcategory === "Screen Guards & Protectors") && (
                <View className="mb-6">
                  <Label text="Material / Type" />
                  <IconField icon="layers" value={material} onChangeText={(v) => dispatch(setMaterial(v))} placeholder="e.g. TPU back cover / tempered glass" />
                </View>
              )}
              {(subcategory === "Power Banks" || subcategory === "Memory Cards & Storage") && (
                <View className="mb-6">
                  <Label text="Capacity" />
                  <IconField icon="straighten" value={capacity || storage} onChangeText={(v) => dispatch(setCapacity(v))} placeholder="e.g. 20000mAh / 128GB" />
                </View>
              )}
              <View className="mb-6">
                <LabelPill text="Warranty" />
                <PillRow options={WARRANTY_OPTIONS} value={warranty} onSelect={(v) => dispatch(setWarranty(v))} />
              </View>
              <View className="mb-6">
                <Label text="Color" />
                <IconField icon="palette" value={color} onChangeText={(v) => dispatch(setColor(v))} placeholder="e.g. Black, Clear, Blue" />
              </View>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              FURNITURE FIELDS
             ═══════════════════════════════════════════════════════════════ */}
          {isFurniture && (
            <>
              <View className="mb-6 flex-row gap-4">
                <View className="flex-1">
                  <Label text="Material" required />
                  <IconField icon="layers" value={material} onChangeText={(v) => dispatch(setMaterial(v))} placeholder="e.g. Teak Wood" />
                </View>
                <View className="flex-1">
                  <Label text="Color" />
                  <IconField icon="palette" value={color} onChangeText={(v) => dispatch(setColor(v))} placeholder="e.g. Brown" />
                </View>
              </View>
              <View className="mb-6">
                <Label text="Dimensions" />
                <IconField icon="straighten" value={dimensions} onChangeText={(v) => dispatch(setDimensions(v))} placeholder="e.g. 6x4x3 ft" />
              </View>
              <View className="mb-6 flex-row gap-4">
                <View className="flex-1">
                  <Label text="Weight" />
                  <IconField icon="fitness-center" value={weight} onChangeText={(v) => dispatch(setWeight(v))} placeholder="e.g. 25 kg" />
                </View>
                <View className="flex-1">
                  <Label text="No. of Pieces" />
                  <IconField icon="format-list-numbered" value={numberOfPieces} onChangeText={(v) => dispatch(setNumberOfPieces(v))} placeholder="e.g. 3" />
                </View>
              </View>
              <View className="mb-6">
                <LabelPill text="Assembly Required" />
                <PillRow options={ASSEMBLY_OPTIONS} value={assemblyRequired} onSelect={(v) => dispatch(setAssemblyRequired(v))} />
              </View>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              FASHION FIELDS
             ═══════════════════════════════════════════════════════════════ */}
          {isFashion && (
            <>
              <View className="mb-6 flex-row gap-4">
                <View className="flex-1">
                  <Label text="Brand" />
                  <IconField icon="branding-watermark" value={brand} onChangeText={(v) => dispatch(setBrand(v))} placeholder="e.g. Nike" />
                </View>
                <View className="flex-1">
                  <Label text="Size" required />
                  <IconField icon="straighten" value={size} onChangeText={(v) => dispatch(setSize(v))} placeholder="e.g. M / 42" />
                </View>
              </View>
              <View className="mb-6">
                <LabelPill text="Gender" required />
                <PillRow options={FASHION_GENDER_OPTIONS} value={gender} onSelect={(v) => dispatch(setGender(v))} />
              </View>
              <View className="mb-6 flex-row gap-4">
                <View className="flex-1">
                  <Label text="Fabric Type" />
                  <IconField icon="layers" value={fabricType} onChangeText={(v) => dispatch(setFabricType(v))} placeholder="e.g. Cotton" />
                </View>
                <View className="flex-1">
                  <Label text="Color" />
                  <IconField icon="palette" value={color} onChangeText={(v) => dispatch(setColor(v))} placeholder="e.g. Blue" />
                </View>
              </View>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              SPORTS FIELDS
             ═══════════════════════════════════════════════════════════════ */}
          {isSports && (
            <>
              <View className="mb-6 flex-row gap-4">
                <View className="flex-1">
                  <Label text="Brand" />
                  <IconField icon="branding-watermark" value={brand} onChangeText={(v) => dispatch(setBrand(v))} placeholder="e.g. Yonex" />
                </View>
                <View className="flex-1">
                  <Label text="Size" />
                  <IconField icon="straighten" value={size} onChangeText={(v) => dispatch(setSize(v))} placeholder="e.g. Full Size" />
                </View>
              </View>
              <View className="mb-6">
                <LabelPill text="Sport Type" required />
                <PillRow options={SPORT_TYPE_OPTIONS} value={sportType} onSelect={(v) => dispatch(setSportType(v))} />
              </View>
              <View className="mb-6 flex-row gap-4">
                <View className="flex-1">
                  <Label text="Material" />
                  <IconField icon="layers" value={material} onChangeText={(v) => dispatch(setMaterial(v))} placeholder="e.g. Carbon Fiber" />
                </View>
                <View className="flex-1">
                  <Label text="Color" />
                  <IconField icon="palette" value={color} onChangeText={(v) => dispatch(setColor(v))} placeholder="e.g. Black" />
                </View>
              </View>
              <View className="mb-6 flex-row gap-4">
                <View className="flex-1">
                  <Label text="Weight" />
                  <IconField icon="fitness-center" value={weight} onChangeText={(v) => dispatch(setWeight(v))} placeholder="e.g. 300g" />
                </View>
                <View className="flex-1">
                  <LabelPill text="Age Group" />
                  <PillRow options={AGE_GROUP_OPTIONS} value={ageGroup} onSelect={(v) => dispatch(setAgeGroup(v))} />
                </View>
              </View>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              COLLECTIBLES FIELDS
             ═══════════════════════════════════════════════════════════════ */}
          {isCollectible && (
            <>
              <View className="mb-6 flex-row gap-4">
                <View className="flex-1">
                  <Label text="Brand / Maker" />
                  <IconField icon="branding-watermark" value={brand} onChangeText={(v) => dispatch(setBrand(v))} placeholder="e.g. Royal Mint" />
                </View>
                <View className="flex-1">
                  <Label text="Era / Period" />
                  <IconField icon="history" value={era} onChangeText={(v) => dispatch(setEra(v))} placeholder="e.g. 1960s" />
                </View>
              </View>
              <View className="mb-6 flex-row gap-4">
                <View className="flex-1">
                  <Label text="Material" />
                  <IconField icon="layers" value={material} onChangeText={(v) => dispatch(setMaterial(v))} placeholder="e.g. Silver" />
                </View>
                <View className="flex-1">
                  <Label text="Color" />
                  <IconField icon="palette" value={color} onChangeText={(v) => dispatch(setColor(v))} placeholder="e.g. Gold" />
                </View>
              </View>
              <View className="mb-6">
                <LabelPill text="Rarity" />
                <PillRow options={RARITY_OPTIONS} value={rarity} onSelect={(v) => dispatch(setRarity(v))} />
              </View>
              <View className="mb-6">
                <LabelPill text="Authenticity" />
                <PillRow options={AUTHENTICITY_OPTIONS} value={authenticity} onSelect={(v) => dispatch(setAuthenticity(v))} />
              </View>
              <View className="mb-6">
                <Label text="Origin / Country" />
                <IconField icon="public" value={origin} onChangeText={(v) => dispatch(setOrigin(v))} placeholder="e.g. India" />
              </View>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              PETS FIELDS
             ═══════════════════════════════════════════════════════════════ */}
          {isPet && (
            <>
              <View className="mb-6 flex-row gap-4">
                <View className="flex-1">
                  <Label text="Breed" required />
                  <IconField icon="pets" value={breed} onChangeText={(v) => dispatch(setBreed(v))} placeholder="e.g. Golden Retriever" />
                </View>
                <View className="flex-1">
                  <Label text="Age" required />
                  <IconField icon="cake" value={petAge} onChangeText={(v) => dispatch(setPetAge(v))} placeholder="e.g. 2 years" />
                </View>
              </View>
              <View className="mb-6">
                <LabelPill text="Gender" required />
                <PillRow options={PET_GENDER_OPTIONS} value={gender} onSelect={(v) => dispatch(setGender(v))} />
              </View>
              <View className="mb-6">
                <LabelPill text="Vaccinated" required />
                <PillRow options={VACCINATED_OPTIONS} value={vaccinated} onSelect={(v) => dispatch(setVaccinated(v))} />
              </View>
              <View className="mb-6">
                <LabelPill text="Trained" />
                <PillRow options={TRAINED_OPTIONS} value={trained} onSelect={(v) => dispatch(setTrained(v))} />
              </View>
              <View className="mb-6 flex-row gap-4">
                <View className="flex-1">
                  <Label text="Color" />
                  <IconField icon="palette" value={color} onChangeText={(v) => dispatch(setColor(v))} placeholder="e.g. Golden" />
                </View>
                <View className="flex-1">
                  <Label text="Weight" />
                  <IconField icon="fitness-center" value={weight} onChangeText={(v) => dispatch(setWeight(v))} placeholder="e.g. 12 kg" />
                </View>
              </View>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              BOOKS FIELDS
             ═══════════════════════════════════════════════════════════════ */}
          {isBook && (
            <>
              <View className="mb-6 flex-row gap-4">
                <View className="flex-1">
                  <Label text="Author" required />
                  <IconField icon="person" value={author} onChangeText={(v) => dispatch(setAuthor(v))} placeholder="e.g. J.K. Rowling" />
                </View>
                <View className="flex-1">
                  <Label text="Publisher" />
                  <IconField icon="business" value={publisher} onChangeText={(v) => dispatch(setPublisher(v))} placeholder="e.g. Penguin" />
                </View>
              </View>
              <View className="mb-6 flex-row gap-4">
                <View className="flex-1">
                  <Label text="ISBN" />
                  <IconField icon="qr-code" value={isbn} onChangeText={(v) => dispatch(setIsbn(v))} placeholder="e.g. 978-0-13..." />
                </View>
                <View className="flex-1">
                  <Label text="Edition" />
                  <IconField icon="menu-book" value={edition} onChangeText={(v) => dispatch(setEdition(v))} placeholder="e.g. 3rd" />
                </View>
              </View>
              <View className="mb-6 flex-row gap-4">
                <View className="flex-1">
                  <Label text="Language" />
                  <IconField icon="translate" value={language} onChangeText={(v) => dispatch(setLanguage(v))} placeholder="e.g. English" />
                </View>
                <View className="flex-1">
                  <Label text="Pages" />
                  <IconField icon="description" value={pages} onChangeText={(v) => dispatch(setPages(v))} placeholder="e.g. 320" numeric />
                </View>
              </View>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              BEAUTY FIELDS
             ═══════════════════════════════════════════════════════════════ */}
          {isBeauty && (
            <>
              <View className="mb-6 flex-row gap-4">
                <View className="flex-1">
                  <Label text="Brand" />
                  <IconField icon="branding-watermark" value={brand} onChangeText={(v) => dispatch(setBrand(v))} placeholder="e.g. MAC" />
                </View>
                <View className="flex-1">
                  <Label text="Shade" />
                  <IconField icon="palette" value={shade} onChangeText={(v) => dispatch(setShade(v))} placeholder="e.g. Ruby Woo" />
                </View>
              </View>
              <View className="mb-6">
                <LabelPill text="Skin Type" />
                <PillRow options={SKIN_TYPE_OPTIONS} value={skinType} onSelect={(v) => dispatch(setSkinType(v))} />
              </View>
              <View className="mb-6">
                <LabelPill text="Gender" />
                <PillRow options={BEAUTY_GENDER_OPTIONS} value={gender} onSelect={(v) => dispatch(setGender(v))} />
              </View>
              <View className="mb-6 flex-row gap-4">
                <View className="flex-1">
                  <Label text="Volume" />
                  <IconField icon="local-drink" value={volume} onChangeText={(v) => dispatch(setVolume(v))} placeholder="e.g. 50ml" />
                </View>
                <View className="flex-1">
                  <Label text="Expiry Date" />
                  <IconField
                    icon="event"
                    value={expiryDate}
                    onChangeText={(v) => dispatch(setExpiryDate(v))}
                    placeholder="MM/YYYY"
                    dateExpiry
                  />
                </View>
              </View>
              <View className="mb-6">
                <Label text="Key Ingredients" />
                <IconField icon="science" value={ingredients} onChangeText={(v) => dispatch(setIngredients(v))} placeholder="e.g. Retinol, Vitamin C" />
              </View>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              TOYS FIELDS
             ═══════════════════════════════════════════════════════════════ */}
          {isToy && (
            <>
              <View className="mb-6 flex-row gap-4">
                <View className="flex-1">
                  <Label text="Brand" />
                  <IconField icon="branding-watermark" value={brand} onChangeText={(v) => dispatch(setBrand(v))} placeholder="e.g. LEGO" />
                </View>
                <View className="flex-1">
                  <Label text="Age Group" />
                  <IconField icon="child-care" value={ageGroup} onChangeText={(v) => dispatch(setAgeGroup(v))} placeholder="e.g. 3-6 years" />
                </View>
              </View>
              <View className="mb-6 flex-row gap-4">
                <View className="flex-1">
                  <Label text="Material" />
                  <IconField icon="layers" value={material} onChangeText={(v) => dispatch(setMaterial(v))} placeholder="e.g. Plastic" />
                </View>
                <View className="flex-1">
                  <Label text="Color" />
                  <IconField icon="palette" value={color} onChangeText={(v) => dispatch(setColor(v))} placeholder="e.g. Multi" />
                </View>
              </View>
              <View className="mb-6">
                <LabelPill text="Battery Required" />
                <PillRow options={BATTERY_REQUIRED_OPTIONS} value={batteryRequired} onSelect={(v) => dispatch(setBatteryRequired(v))} />
              </View>
              <View className="mb-6 flex-row gap-4">
                <View className="flex-1">
                  <Label text="Play Mode" />
                  <IconField icon="sports-esports" value={playMode} onChangeText={(v) => dispatch(setPlayMode(v))} placeholder="e.g. Solo / Multi" />
                </View>
                <View className="flex-1">
                  <Label text="No. of Pieces" />
                  <IconField icon="format-list-numbered" value={numberOfPieces} onChangeText={(v) => dispatch(setNumberOfPieces(v))} placeholder="e.g. 500" />
                </View>
              </View>
              <View className="mb-6">
                <Label text="Character / Theme" />
                <IconField icon="face" value={characterTheme} onChangeText={(v) => dispatch(setCharacterTheme(v))} placeholder="e.g. Star Wars" />
              </View>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              FOR SALE (legacy multi-cat) — show fields based on subcategory
             ═══════════════════════════════════════════════════════════════ */}
          {isForSale && (
            <>
              {/* Mobile sub-group in forsale */}
              {["Mobile Phones", "Accessories", "Tablets"].includes(subcategory) && (
                <>
                  <View className="mb-6 flex-row gap-4">
                    <View className="flex-1">
                      <Label text="Brand" />
                      <IconField icon="branding-watermark" value={brand} onChangeText={(v) => dispatch(setBrand(v))} placeholder="e.g. Apple" />
                    </View>
                    <View className="flex-1">
                      <Label text="Model" />
                      <IconField icon="info-outline" value={productModel} onChangeText={(v) => dispatch(setModel(v))} placeholder="e.g. iPhone 15" />
                    </View>
                  </View>
                  <View className="mb-6 flex-row gap-4">
                    <View className="flex-1">
                      <Label text="Storage" />
                      <IconField icon="sd-storage" value={storage} onChangeText={(v) => dispatch(setStorage(v))} placeholder="e.g. 128 GB" />
                    </View>
                    <View className="flex-1">
                      <Label text="RAM" />
                      <IconField icon="developer-board" value={ram} onChangeText={(v) => dispatch(setRam(v))} placeholder="e.g. 8 GB" />
                    </View>
                  </View>
                  <View className="mb-6">
                    <Label text="Color" />
                    <IconField icon="palette" value={color} onChangeText={(v) => dispatch(setColor(v))} placeholder="e.g. Black" />
                  </View>
                </>
              )}
              {/* Furniture sub-group in forsale */}
              {["Sofas & Dining", "Beds & Wardrobes", "Tables & Chairs", "Home Decor", "Office Furniture"].includes(subcategory) && (
                <>
                  <View className="mb-6 flex-row gap-4">
                    <View className="flex-1">
                      <Label text="Material" />
                      <IconField icon="layers" value={material} onChangeText={(v) => dispatch(setMaterial(v))} placeholder="e.g. Wood" />
                    </View>
                    <View className="flex-1">
                      <Label text="Color" />
                      <IconField icon="palette" value={color} onChangeText={(v) => dispatch(setColor(v))} placeholder="e.g. Walnut" />
                    </View>
                  </View>
                  <View className="mb-6">
                    <Label text="Dimensions" />
                    <IconField icon="straighten" value={dimensions} onChangeText={(v) => dispatch(setDimensions(v))} placeholder="e.g. LxWxH" />
                  </View>
                </>
              )}
              {/* Fashion sub-group in forsale */}
              {["Men's Clothing", "Women's Clothing", "Kids Clothing", "Footwear", "Watches"].includes(subcategory) && (
                <>
                  <View className="mb-6 flex-row gap-4">
                    <View className="flex-1">
                      <Label text="Size" />
                      <IconField icon="straighten" value={size} onChangeText={(v) => dispatch(setSize(v))} placeholder="e.g. L" />
                    </View>
                    <View className="flex-1">
                      <Label text="Color" />
                      <IconField icon="palette" value={color} onChangeText={(v) => dispatch(setColor(v))} placeholder="e.g. Red" />
                    </View>
                  </View>
                  <View className="mb-6">
                    <LabelPill text="Gender" />
                    <PillRow options={FASHION_GENDER_OPTIONS} value={gender} onSelect={(v) => dispatch(setGender(v))} />
                  </View>
                </>
              )}
              {/* Books sub-group in forsale */}
              {["Fiction", "Non-Fiction", "Children's Books", "Textbooks", "Comics", "Magazines"].includes(subcategory) && (
                <View className="mb-6 flex-row gap-4">
                  <View className="flex-1">
                    <Label text="Author" />
                    <IconField icon="person" value={author} onChangeText={(v) => dispatch(setAuthor(v))} placeholder="e.g. Author name" />
                  </View>
                  <View className="flex-1">
                    <Label text="ISBN" />
                    <IconField icon="qr-code" value={isbn} onChangeText={(v) => dispatch(setIsbn(v))} placeholder="ISBN" />
                  </View>
                </View>
              )}
              {/* Sports sub-group in forsale */}
              {["Exercise", "Camping", "Sports Equipment", "Gym & Fitness", "Cycling"].includes(subcategory) && (
                <View className="mb-6">
                  <LabelPill text="Sport Type" />
                  <PillRow options={SPORT_TYPE_OPTIONS} value={sportType} onSelect={(v) => dispatch(setSportType(v))} />
                </View>
              )}
            </>
          )}

      <Text
        style={{
          marginTop: 8,
          fontFamily: ListifyFonts.regular,
          fontSize: 13,
          lineHeight: 20,
          color: colors.textSecondary,
        }}
      >
        Clear titles and fair pricing help buyers find your listing faster.
      </Text>
    </SellFlowLayout>

    {/* ── Currency Picker Modal ─────────────────────────────────────────── */}
    <Modal
      visible={currencyPickerVisible}
      animationType="slide"
      transparent
      onRequestClose={() => setCurrencyPickerVisible(false)}
    >
      <Pressable
        style={{ flex: 1, backgroundColor: colors.scrim }}
        onPress={() => setCurrencyPickerVisible(false)}
      />
      <View
        style={{
          position: "absolute",
          bottom: 0, left: 0, right: 0,
          backgroundColor: colors.surfaceElevated,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          maxHeight: "75%",
        }}
      >
        {/* Handle */}
        <View style={{ alignItems: "center", paddingVertical: 10 }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong }} />
        </View>
        {/* Title */}
        <Text
          style={{
            textAlign: "center", fontSize: 17,
            fontFamily: ListifyFonts.bold, color: colors.textPrimary,
            marginBottom: 12, paddingHorizontal: 16,
          }}
        >
          Select Currency
        </Text>
        {/* Search */}
        <View
          style={{
            flexDirection: "row", alignItems: "center",
            marginHorizontal: 16, marginBottom: 8,
            paddingHorizontal: 12, height: 44,
            borderRadius: 10, borderWidth: 1,
            borderColor: colors.border, backgroundColor: colors.inputBackground, gap: 8,
          }}
        >
          <MaterialIcons name="search" size={18} color={colors.iconMuted} />
          <TextInput
            value={currencySearch}
            onChangeText={setCurrencySearch}
            placeholder="Search currency…"
            placeholderTextColor={colors.inputPlaceholder}
            returnKeyType="search"
            style={{ flex: 1, fontSize: 14, fontFamily: ListifyFonts.regular, color: colors.textPrimary, paddingVertical: 0 }}
          />
          {currencySearch.length > 0 && (
            <Pressable onPress={() => setCurrencySearch("")} hitSlop={8}>
              <MaterialIcons name="close" size={16} color={colors.iconMuted} />
            </Pressable>
          )}
        </View>
        {/* List */}
        <FlatList
          data={filteredCurrencies}
          keyExtractor={(item) => item.code}
          keyboardShouldPersistTaps="handled"
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 32 }}
          renderItem={({ item }) => {
            const isSelected = item.code === currency;
            return (
              <Pressable
                onPress={() => {
                  dispatch(setCurrency(item.code));
                  setIsCurrencyManual(true);
                  setCurrencyPickerVisible(false);
                  setCurrencySearch("");
                }}
                style={({ pressed }) => ({
                  flexDirection: "row", alignItems: "center",
                  paddingHorizontal: 16, paddingVertical: 14, gap: 12,
                  backgroundColor: pressed ? colors.surfaceMuted : isSelected ? colors.primarySoft : colors.surfaceElevated,
                  borderBottomWidth: 1, borderBottomColor: colors.border,
                })}
              >
                <Text
                  style={{
                    fontSize: 18, fontFamily: ListifyFonts.semiBold,
                    color: isSelected ? colors.primaryDeep : colors.textPrimary,
                    width: 36, textAlign: "center",
                  }}
                >
                  {item.symbol}
                </Text>
                <Text style={{ flex: 1, fontSize: 15, fontFamily: ListifyFonts.regular, color: colors.textPrimary }} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text
                  style={{
                    fontSize: 13, fontFamily: ListifyFonts.medium,
                    color: isSelected ? colors.primaryDeep : colors.textTertiary,
                  }}
                >
                  {item.code}
                </Text>
                {isSelected && <MaterialIcons name="check-circle" size={18} color={colors.primaryDeep} />}
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>

    <EventDatePickerModal
      visible={eventDatePickerVisible}
      value={eventDate}
      onClose={() => setEventDatePickerVisible(false)}
      onSelect={(formattedDate) => dispatch(setEventDate(formattedDate))}
    />
    <EventTimePickerModal
      visible={eventTimePickerVisible}
      value={eventTime}
      onClose={() => setEventTimePickerVisible(false)}
      onSelect={(formattedTime) => dispatch(setEventTime(normalizeEventTime(formattedTime)))}
    />
    </>
  );
}
