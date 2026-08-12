import { MaterialIcons } from "@expo/vector-icons";
import { type Href, useRouter } from "@/lib/safe-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BackHandler,
  Pressable,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { SellFlowLayout, SellSectionCard } from "@/components/sell-flow-layout";
import { ListifyFonts } from "@/constants/typography";
import { useTheme } from "@/providers/theme-provider";

import {
  CATEGORY_MAP,
  CONDITION_SKIP_CATEGORIES,
  PRICE_OPTIONAL_CATEGORIES,
  FORSALE_SUBCATEGORY_TO_CATEGORY,
} from "@/constants/categories";
import {
  checkImageModeration,
  createListing,
  updateListing,
  uploadListingImages,
  uploadListingVideos,
} from "@/features/listing/services/listing-api";
import { uploadEmployerCompanyLogo } from "@/features/jobs/services/jobs-company-api";
import { ListingMediaPicker } from "@/components/listing-media-picker";
import { isRemoteMediaUri, type PostMediaItem } from "@/lib/listing-media";
import { showErrorToast } from "@/lib/toast";
import { PostLocationMapPreview } from "@/components/post-location-map-preview";
import { PhoneInputWithCountry } from "@/components/phone-input-with-country";
import { GooglePlacesInput, type PlacesSelectResult } from "@/components/google-places-input";
import { useLocale } from "@/providers/locale-provider";
import { getMileageUnitForCountry } from "@/lib/listing-distance";
import { dateKey, normalizeToCalendarDate, parseDateRangeFromText } from "@/lib/event-dates";
import { getCurrencyCodeFromCountry } from "@/lib/currency";
import { validateListingContactPhone } from "@/lib/phone-validation";
import { AuthApiError } from "@/features/auth/services/auth-api";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { refreshDeviceLocation, selectLocationCoords, setLocationDirect } from "@/store/slices/location-slice";
import { showAuthGate } from "@/store/slices/auth-gate-slice";
import {
  addMediaItems,
  removeMediaItemAt,
  resetPostForm,
  setListingCoords,
  setLocation,
  setPhone,
  setCurrency,
  setMileageUnit,
  setSubmitError,
  setSubmitting,
  setUploadedImageUrls,
  setUploadedVideos,
  setUploadedCompanyLogoUrl,
  updateMediaItemAt,
} from "@/store/slices/post-form-slice";

// ── Per-image live moderation state ────────────────────────────────────────────
type ImageScanStatus = "scanning" | "allowed" | "blocked" | "review";
type ImageScanResult = { status: ImageScanStatus; category?: string };

/** Short label shown inside the thumbnail overlay. */
const JOB_TYPE_VALUES = new Set([
  "Full Time",
  "Part Time",
  "Contract",
  "Freelance",
  "Internship",
]);

const MODERATION_CATEGORY_SHORT: Record<string, string> = {
  explicit_sexual: "Explicit",
  sexual: "Adult content",
  graphic_violence: "Violence",
  violence: "Violence",
  racy: "Suggestive",
  illegal_drugs: "Drugs",
  illegal_drugs_web: "Drugs",
  weapon: "Weapon",
  weapon_web: "Weapon",
  hate_symbol: "Hate symbol",
};

const POST_AD_RETURN_PATH = "/post-ad-step3-media";

function isAuthFailureMessage(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("login") ||
    normalized.includes("log in") ||
    normalized.includes("sign in") ||
    normalized.includes("unauthorized") ||
    normalized.includes("authentication") ||
    normalized.includes("not authenticated") ||
    normalized.includes("session expired") ||
    normalized.includes("token expired") ||
    normalized.includes("refresh token") ||
    normalized.includes("not authorized")
  );
}

export function PostAdStep3MediaScreen() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { colors } = useTheme();
  const {
    phoneCode: localePhoneCode,
    isoCountryCode: localeCountryCode,
    phoneCodeForCountry,
  } = useLocale();
  const locationIso = useAppSelector((s) => s.location.isoCountryCode);

  // Phone code is derived from locale (which tracks location globally).
  // `overridePhoneCode` / `overridePhoneIso` hold a manual selection from the
  // in-form country picker; they are cleared whenever the listing location changes.
  const [overridePhoneCode, setOverridePhoneCode] = useState<string | null>(null);
  const [overridePhoneIso, setOverridePhoneIso] = useState<string | null>(null);

  // Tracks Vision API scan result per image URI — populated as images are picked.
  const [imageScanMap, setImageScanMap] = useState<Record<string, ImageScanResult>>({});
  const [submitPhase, setSubmitPhase] = useState<"idle" | "uploading" | "publishing">("idle");
  const activePhoneCode = overridePhoneCode ?? localePhoneCode;
  const activePhoneIso  = overridePhoneIso  ?? locationIso ?? undefined;

  const {
    category, subcategory, title, description, price, condition, location, listingType,
    bedrooms, bathrooms, furnishing, squareFeet, features, petFriendly, availableFrom,
    genderPreference, occupancy,
    brand, model: productModel, warranty, purchaseYear, screenSize, displayType,
    processor, ram, storage, capacity, energyRating, megapixels, lensType,
    variant, year, kmDriven, mileageUnit, fuelType, transmission, ownership, color, engineCC,
    cycleType, gearCount, frameSize, compatibleVehicle, partCategory,
    companyName, companyWebsite, companyEmail, companyLogoUri, uploadedCompanyLogoUrl,
    applyLink, jobType, experience, education,
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
    mediaItems, phone, currency, locationLat, locationLng, isSubmitting, editListingId,
  } = useAppSelector((s) => s.postForm);

  const isEditMode = Boolean(editListingId);

  const locationStatus = useAppSelector((s) => s.location.status);
  const locationCoords = useAppSelector(selectLocationCoords);
  const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated);
  const globalLocationLabel = useAppSelector((s) => s.location.label);
  const globalLocationSource = useAppSelector((s) => s.location.source);

  const expectedPhoneIso = (locationIso ?? localeCountryCode)?.toUpperCase();
  const expectedPhoneCode = expectedPhoneIso
    ? phoneCodeForCountry(expectedPhoneIso)
    : activePhoneCode;

  const phoneValidation = useMemo(
    () =>
      validateListingContactPhone({
        phone,
        selectedIso: activePhoneIso,
        selectedPhoneCode: activePhoneCode,
        expectedIso: expectedPhoneIso,
        expectedPhoneCode,
      }),
    [activePhoneCode, activePhoneIso, expectedPhoneCode, expectedPhoneIso, phone],
  );

  // Sync listing location whenever the app-wide location changes (also runs on mount).
  // Skip in edit mode — keep the listing's saved location.
  useEffect(() => {
    if (isEditMode) return;
    if (
      globalLocationSource !== null &&
      globalLocationLabel &&
      globalLocationLabel !== "Set location" &&
      globalLocationLabel !== "Detecting location\u2026"
    ) {
      dispatch(setLocation(globalLocationLabel));
      if (locationCoords.lat != null && locationCoords.lng != null) {
        dispatch(setListingCoords({ lat: locationCoords.lat, lng: locationCoords.lng }));
      }
    }
  }, [dispatch, globalLocationLabel, globalLocationSource, isEditMode, locationCoords.lat, locationCoords.lng]);

  // Sync phone code + ISO with locale (updates when location changes globally)
  useEffect(() => {
    // When the locale phone code changes (global location change), drop any manual
    // override so the new location's code is shown automatically.
    setOverridePhoneCode(null);
    setOverridePhoneIso(null);
  }, [localePhoneCode]);

  const handleBack = useCallback(() => {
    router.replace("/post-ad-step2-details" as Href);
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      const onHardwareBack = () => {
        handleBack();
        return true;
      };

      const sub = BackHandler.addEventListener(
        "hardwareBackPress",
        onHardwareBack,
      );
      return () => sub.remove();
    }, [handleBack]),
  );

  const handleUseCurrentLocation = async () => {
    try {
      const result = await dispatch(refreshDeviceLocation({ force: true })).unwrap();
      dispatch(setLocation(result.label));
      if (result.lat != null && result.lng != null) {
        dispatch(setListingCoords({ lat: result.lat, lng: result.lng }));
      }
      // Update phone code + currency for the detected location's country
      if (result.isoCountryCode) {
        setOverridePhoneCode(null);
        setOverridePhoneIso(null);
        dispatch(setCurrency(getCurrencyCodeFromCountry(result.isoCountryCode)));
        if (category === "vehicles") {
          dispatch(setMileageUnit(getMileageUnitForCountry(result.isoCountryCode)));
        }
      }
    } catch {
      showErrorToast(
        "Location unavailable",
        "Enable location permission or enter your area manually.",
      );
    }
  };

  const handleAddMedia = async (newItems: PostMediaItem[]) => {
    if (newItems.length === 0) return;
    dispatch(addMediaItems(newItems));

    const imageUris = newItems
      .filter((item) => item.type === "image")
      .map((item) => item.uri);
    if (imageUris.length === 0) return;

    setImageScanMap((prev) => ({
      ...(prev ?? {}),
      ...Object.fromEntries(imageUris.map((u) => [u, { status: "scanning" } as ImageScanResult])),
    }));

    try {
      const modResult = await checkImageModeration(imageUris);
      setImageScanMap((prev) => {
        const next = { ...(prev ?? {}) };
        const results = Array.isArray(modResult?.results) ? modResult.results : [];
        imageUris.forEach((uri, i) => {
          const r = results[i];
          if (r) {
            next[uri] = {
              status: r.decision === "block" ? "blocked" : r.decision === "review" ? "review" : "allowed",
              category: r.category,
            };
          } else {
            next[uri] = { status: "allowed" };
          }
        });
        return next;
      });
    } catch {
      setImageScanMap((prev) => ({
        ...(prev ?? {}),
        ...Object.fromEntries(imageUris.map((u) => [u, { status: "allowed" } as ImageScanResult])),
      }));
    }
  };

  const handleRemoveMedia = (index: number) => {
    const sorted = [...mediaItems].sort((a, b) => a.order - b.order);
    const target = sorted[index];
    if (!target) return;
    dispatch(removeMediaItemAt(mediaItems.findIndex((item) => item.id === target.id)));
    if (target.type === "image") {
      setImageScanMap((prev) => {
        const next = { ...(prev ?? {}) };
        delete next[target.uri];
        return next;
      });
    }
  };

  const handleSubmit = async () => {
    if (mediaItems.length === 0) {
      showErrorToast("Media required", "Please add at least one photo or video.");
      return;
    }
    if (!title || title.length < 3) {
      showErrorToast("Title too short", "Title must be at least 3 characters.");
      return;
    }
    if (!description || description.length < 20) {
      showErrorToast("Description too short", "Description must be at least 20 characters.");
      return;
    }
    if (!location || location.length < 2) {
      showErrorToast("Location required", "Please enter a location (at least 2 characters).");
      return;
    }
    if (!phone?.trim()) {
      showErrorToast("Phone required", "Please enter your contact phone number.");
      return;
    }
    if (!phoneValidation.isValid) {
      showErrorToast(
        "Invalid contact number",
        phoneValidation.message ?? "Enter a valid phone number for the selected listing country.",
      );
      return;
    }

    if (!isAuthenticated) {
      dispatch(showAuthGate({ action: "sell", redirectTo: POST_AD_RETURN_PATH }));
      return;
    }

    // ── Human-readable labels for violation categories ─────────────────────────
    const MODERATION_LABELS: Record<string, string> = {
      explicit_sexual: "explicit sexual content",
      sexual: "potentially sexual content",
      graphic_violence: "graphic violence",
      violence: "violent content",
      racy: "suggestive content",
      illegal_drugs: "illegal drugs or paraphernalia",
      illegal_drugs_web: "illegal drugs",
      weapon: "illegal weapons",
      weapon_web: "weapons",
      hate_symbol: "hate symbols or extremist content",
    };

    // ── Guard: check live scan results (populated at pick time) ─────────────────
    const sortedMedia = [...mediaItems].sort((a, b) => a.order - b.order);
    const imageItems = sortedMedia.filter((item) => item.type === "image");
    const hasScanningImages = imageItems.some((item) => imageScanMap[item.uri]?.status === "scanning");
    if (hasScanningImages) {
      showErrorToast("Please wait", "Images are still being scanned for policy compliance.");
      return;
    }
    const firstBlockedUri = imageItems.find((item) => imageScanMap[item.uri]?.status === "blocked")?.uri;
    if (firstBlockedUri) {
      const violationType =
        MODERATION_LABELS[imageScanMap[firstBlockedUri]?.category ?? ""] ??
        "policy-violating content";
      showErrorToast(
        "Restricted image",
        `One or more images contain ${violationType} and cannot be posted. Remove images marked RESTRICTED.`,
      );
      return;
    }
    const firstFlaggedUri = imageItems.find((item) => imageScanMap[item.uri]?.status === "review")?.uri;
    if (firstFlaggedUri) {
      const violationType =
        MODERATION_LABELS[imageScanMap[firstFlaggedUri]?.category ?? ""] ?? "sensitive content";
      showErrorToast(
        "Image flagged",
        `One or more images were flagged for ${violationType}. Remove images marked FLAGGED before posting.`,
      );
      return;
    }

    dispatch(setSubmitting(true));
    dispatch(setSubmitError(null));
    setSubmitPhase("idle");

    try {
      const orderedMedia = [...mediaItems].sort((a, b) => a.order - b.order);

      const markUploadStatus = (id: string, status: PostMediaItem["uploadStatus"]) => {
        const index = mediaItems.findIndex((item) => item.id === id);
        if (index >= 0) {
          dispatch(updateMediaItemAt({ index, patch: { uploadStatus: status } }));
        }
      };

      const imageItemsToUpload = orderedMedia.filter(
        (item) => item.type === "image" && !isRemoteMediaUri(item.uri),
      );
      const videoItemsToUpload = orderedMedia.filter(
        (item) => item.type === "video" && !isRemoteMediaUri(item.uri),
      );

      imageItemsToUpload.forEach((item) => markUploadStatus(item.id, "uploading"));
      videoItemsToUpload.forEach((item) => markUploadStatus(item.id, "uploading"));

      if (videoItemsToUpload.length > 0) {
        setSubmitPhase("uploading");
      } else if (imageItemsToUpload.length > 0) {
        setSubmitPhase("uploading");
      }

      let uploadedImageUrls: string[] = [];
      if (imageItemsToUpload.length > 0) {
        const uploadResult = await uploadListingImages(
          category,
          imageItemsToUpload.map((item) => item.uri),
        );
        uploadedImageUrls = uploadResult.images ?? [];
        dispatch(setUploadedImageUrls(uploadedImageUrls));
        if (uploadedImageUrls.length === 0) {
          throw new Error("Image upload succeeded but no URLs were returned. Please try again.");
        }
        imageItemsToUpload.forEach((item, index) => {
          const indexInState = mediaItems.findIndex((m) => m.id === item.id);
          if (indexInState >= 0) {
            dispatch(
              updateMediaItemAt({
                index: indexInState,
                patch: {
                  uploadStatus: "done",
                  uploadedUrl: uploadedImageUrls[index],
                  uri: uploadedImageUrls[index] ?? item.uri,
                },
              }),
            );
          }
        });
      }

      let uploadedVideos: Array<{
        url: string;
        duration?: number;
        mimeType?: string;
        order?: number;
        size?: number;
      }> = [];

      if (videoItemsToUpload.length > 0) {
        const videoUploadResult = await uploadListingVideos(
          category,
          videoItemsToUpload.map((item) => ({
            uri: item.uri,
            duration: item.duration,
            mimeType: item.mimeType,
            order: item.order,
          })),
        );
        uploadedVideos = videoUploadResult.videos ?? [];
        dispatch(setUploadedVideos(uploadedVideos));
        if (uploadedVideos.length === 0) {
          throw new Error("Video upload succeeded but no URLs were returned. Please try again.");
        }
        videoItemsToUpload.forEach((item, index) => {
          const uploaded = uploadedVideos[index];
          const indexInState = mediaItems.findIndex((m) => m.id === item.id);
          if (indexInState >= 0 && uploaded?.url) {
            dispatch(
              updateMediaItemAt({
                index: indexInState,
                patch: {
                  uploadStatus: "done",
                  uploadedUrl: uploaded.url,
                  uri: uploaded.url,
                  duration: uploaded.duration ?? item.duration,
                  mimeType: uploaded.mimeType ?? item.mimeType,
                },
              }),
            );
          }
        });
      }

      let imageCursor = 0;
      let videoCursor = 0;
      const allImageUrls: string[] = [];
      const allVideos: Array<{
        url: string;
        duration?: number;
        mimeType?: string;
        order?: number;
        size?: number;
      }> = [];

      for (const item of orderedMedia) {
        if (item.type === "image") {
          const url = isRemoteMediaUri(item.uri)
            ? item.uri
            : uploadedImageUrls[imageCursor++];
          if (url) allImageUrls.push(url);
        } else {
          const uploaded = isRemoteMediaUri(item.uri)
            ? {
                url: item.uri,
                duration: item.duration,
                mimeType: item.mimeType,
                order: item.order,
              }
            : uploadedVideos[videoCursor++];
          if (uploaded?.url) allVideos.push(uploaded);
        }
      }

      if (allImageUrls.length === 0 && allVideos.length === 0) {
        throw new Error("Please keep at least one photo or video on the listing.");
      }
      const categoryConfig = CATEGORY_MAP[category];

      // Resolve the category name to send to the server
      let serverCategory: string;
      if (category === "properties") {
        serverCategory = listingType; // "Properties" or "Rentals"
      } else if (category === "forsale" && subcategory) {
        // ForSale controller expects sub-group name (e.g. "Mobiles", "Furniture")
        serverCategory = FORSALE_SUBCATEGORY_TO_CATEGORY[subcategory] ?? "Others";
      } else {
        serverCategory = categoryConfig?.name ?? category;
      }

      const skipCondition = CONDITION_SKIP_CATEGORIES.includes(category);
      const priceOptional = PRICE_OPTIONAL_CATEGORIES.includes(category);

      const listingBody: Record<string, unknown> = {
        title,
        description,
        ...(!priceOptional || price ? { price: Number(price) } : {}),
        ...(!skipCondition ? { condition } : {}),
        ...(currency ? { currency } : {}),
        category: serverCategory,
        subcategory,
        images: allImageUrls,
        imageUrls: allImageUrls,
        ...(allVideos.length > 0 ? { videos: allVideos } : {}),
        location,
        ...(locationIso ? { countryCode: locationIso.toUpperCase() } : {}),
        ...(phoneValidation.e164Phone ? { phone: phoneValidation.e164Phone } : {}),
        // GPS coordinates — listing-specific first, fall back to global device location
        ...(() => {
          const lat = locationLat ?? locationCoords.lat;
          const lng = locationLng ?? locationCoords.lng;
          return lat != null && lng != null ? { lat, lng } : {};
        })(),
      };

      // Attach property-specific fields
      if (category === "properties") {
        if (bedrooms) listingBody.bedrooms = Number(bedrooms);
        if (bathrooms) listingBody.bathrooms = Number(bathrooms);
        if (furnishing) listingBody.furnishing = furnishing;
        if (squareFeet) listingBody.squareFeet = Number(squareFeet);
        if (features.length > 0) listingBody.features = features;
        listingBody.petFriendly = petFriendly;
        if (availableFrom) listingBody.availableFrom = availableFrom;
        if (genderPreference) listingBody.genderPreference = genderPreference;
        if (occupancy) listingBody.occupancy = occupancy;
      }

      // Attach electronics-specific fields
      if (category === "electronics") {
        if (brand) listingBody.brand = brand;
        if (productModel) listingBody.model = productModel;
        if (warranty) listingBody.warranty = warranty;
        if (purchaseYear) listingBody.purchaseYear = Number(purchaseYear);
        if (screenSize) listingBody.screenSize = screenSize;
        if (displayType) listingBody.displayType = displayType;
        if (processor) listingBody.processor = processor;
        if (ram) listingBody.ram = ram;
        if (storage) listingBody.storage = storage;
        if (capacity) listingBody.capacity = capacity;
        if (energyRating) listingBody.energyRating = energyRating;
        if (megapixels) listingBody.megapixels = megapixels;
        if (lensType) listingBody.lensType = lensType;
      }

      // Attach vehicle-specific fields
      if (category === "vehicles") {
        if (brand) listingBody.brand = brand;
        if (productModel) listingBody.model = productModel;
        if (variant) listingBody.variant = variant;
        if (year) listingBody.year = year;
        if (kmDriven) {
          listingBody.kmDriven = kmDriven;
          listingBody.mileageUnit =
            mileageUnit || getMileageUnitForCountry(locationIso ?? localeCountryCode);
        }
        if (fuelType) listingBody.fuelType = fuelType;
        if (transmission) listingBody.transmission = transmission;
        if (ownership) listingBody.ownership = ownership;
        if (color) listingBody.color = color;
        if (engineCC) listingBody.engineCC = engineCC;
        if (cycleType) listingBody.cycleType = cycleType;
        if (gearCount) listingBody.gearCount = gearCount;
        if (frameSize) listingBody.frameSize = frameSize;
        if (compatibleVehicle) listingBody.compatibleVehicle = compatibleVehicle;
        if (partCategory) listingBody.partCategory = partCategory;
      }

      // Attach job-specific fields
      if (category === "jobs") {
        let companyLogoUrl = uploadedCompanyLogoUrl;
        const isRemoteLogo = companyLogoUri && /^https?:\/\//i.test(companyLogoUri);
        const localLogoUri =
          companyLogoUri && !isRemoteLogo ? companyLogoUri : "";

        if (localLogoUri) {
          companyLogoUrl = await uploadEmployerCompanyLogo(localLogoUri);
          dispatch(setUploadedCompanyLogoUrl(companyLogoUrl));
        } else if (isRemoteLogo) {
          companyLogoUrl = companyLogoUri;
        }

        if (companyName) listingBody.companyName = companyName;
        if (companyWebsite) listingBody.companyWebsite = companyWebsite;
        if (companyEmail) listingBody.companyEmail = companyEmail;
        if (companyLogoUrl) listingBody.companyLogo = companyLogoUrl;
        if (applyLink) listingBody.applyLink = applyLink;
        if (experience) listingBody.experience = experience;
        if (education) listingBody.education = education;
        const resolvedJobType =
          employmentType || (jobType && JOB_TYPE_VALUES.has(jobType) ? jobType : "");
        if (resolvedJobType) {
          listingBody.jobType = resolvedJobType;
          listingBody.employmentType = resolvedJobType;
        }
        if (workMode) listingBody.workMode = workMode;
        if (salaryMin || salaryMax) {
          listingBody.salary = {
            ...(salaryMin ? { min: Number(salaryMin) } : {}),
            ...(salaryMax ? { max: Number(salaryMax) } : {}),
            ...(salaryType ? { type: salaryType } : {}),
          };
        }
        if (salaryType) listingBody.salaryType = salaryType;
        if (industry) listingBody.industry = industry;
        if (positions) listingBody.positions = Number(positions);
      }

      // Attach takecare-specific fields
      if (category === "takecare") {
        if (experience) listingBody.experience = experience;
        if (availability) listingBody.availability = availability;
        if (age) listingBody.age = Number(age);
        if (languages.length > 0) listingBody.languages = languages;
        if (certifications.length > 0) listingBody.certifications = certifications;
      }

      // Attach event-specific fields
      if (category === "events") {
        if (eventDate) listingBody.eventDate = eventDate;
        if (eventTime) listingBody.eventTime = eventTime;
        const range = parseDateRangeFromText(eventDate);
        const startCal = range.start ? normalizeToCalendarDate(range.start) : null;
        const endCal = (range.end ?? range.start)
          ? normalizeToCalendarDate(range.end ?? range.start)
          : null;
        if (startCal) listingBody.startDate = startCal.toISOString();
        if (endCal) listingBody.endDate = endCal.toISOString();
        if (organizer) listingBody.organizer = organizer;
        if (venue) listingBody.venue = venue;
        if (ticketsAvailable) listingBody.ticketsAvailable = Number(ticketsAvailable);
        if (ageRestriction) listingBody.ageRestriction = ageRestriction;
        if (dressCode) listingBody.dressCode = dressCode;
      }

      // Attach mobile-specific fields
      if (category === "mobiles") {
        if (brand) listingBody.brand = brand;
        if (productModel) listingBody.model = productModel;
        if (storage) listingBody.storage = storage;
        if (ram) listingBody.ram = ram;
        if (screenSize) listingBody.screenSize = screenSize;
        if (batteryHealth) listingBody.batteryHealth = batteryHealth;
        if (warranty) listingBody.warranty = warranty;
        if (color) listingBody.color = color;
      }

      // Attach furniture-specific fields
      if (category === "furniture") {
        if (material) listingBody.material = material;
        if (dimensions) listingBody.dimensions = dimensions;
        if (weight) listingBody.weight = weight;
        if (assemblyRequired) listingBody.assemblyRequired = assemblyRequired;
        if (numberOfPieces) listingBody.numberOfPieces = numberOfPieces;
        if (color) listingBody.color = color;
      }

      // Attach fashion-specific fields
      if (category === "fashion") {
        if (brand) listingBody.brand = brand;
        if (size) listingBody.size = size;
        if (gender) listingBody.gender = gender;
        if (fabricType) listingBody.fabricType = fabricType;
        if (color) listingBody.color = color;
      }

      // Attach sports-specific fields
      if (category === "sports") {
        if (brand) listingBody.brand = brand;
        if (sportType) listingBody.sportType = sportType;
        if (size) listingBody.size = size;
        if (material) listingBody.material = material;
        if (color) listingBody.color = color;
        if (weight) listingBody.weight = weight;
        if (ageGroup) listingBody.ageGroup = ageGroup;
      }

      // Attach collectible-specific fields
      if (category === "collectibles") {
        if (brand) listingBody.brand = brand;
        if (era) listingBody.era = era;
        if (material) listingBody.material = material;
        if (color) listingBody.color = color;
        if (rarity) listingBody.rarity = rarity;
        if (authenticity) listingBody.authenticity = authenticity;
        if (origin) listingBody.origin = origin;
      }

      // Attach pet-specific fields
      if (category === "pets") {
        if (breed) listingBody.breed = breed;
        if (petAge) listingBody.petAge = petAge;
        if (gender) listingBody.gender = gender;
        if (vaccinated) listingBody.vaccinated = vaccinated;
        if (trained) listingBody.trained = trained;
        if (color) listingBody.color = color;
        if (weight) listingBody.weight = weight;
      }

      // Attach book-specific fields
      if (category === "books") {
        if (author) listingBody.author = author;
        if (isbn) listingBody.isbn = isbn;
        if (publisher) listingBody.publisher = publisher;
        if (edition) listingBody.edition = edition;
        if (language) listingBody.language = language;
        if (pages) listingBody.pages = pages;
      }

      // Attach beauty-specific fields
      if (category === "beauty") {
        if (brand) listingBody.brand = brand;
        if (skinType) listingBody.skinType = skinType;
        if (shade) listingBody.shade = shade;
        if (volume) listingBody.volume = volume;
        if (ingredients) listingBody.ingredients = ingredients;
        if (expiryDate) listingBody.expiryDate = expiryDate;
        if (gender) listingBody.gender = gender;
      }

      // Attach toy-specific fields
      if (category === "toys") {
        if (brand) listingBody.brand = brand;
        if (ageGroup) listingBody.ageGroup = ageGroup;
        if (material) listingBody.material = material;
        if (batteryRequired) listingBody.batteryRequired = batteryRequired;
        if (playMode) listingBody.playMode = playMode;
        if (numberOfPieces) listingBody.numberOfPieces = numberOfPieces;
        if (characterTheme) listingBody.characterTheme = characterTheme;
        if (color) listingBody.color = color;
      }

      // Attach forsale-specific fields (multi-category legacy)
      if (category === "forsale") {
        if (brand) listingBody.brand = brand;
        if (productModel) listingBody.model = productModel;
        if (storage) listingBody.storage = storage;
        if (ram) listingBody.ram = ram;
        if (screenSize) listingBody.screenSize = screenSize;
        if (batteryHealth) listingBody.batteryHealth = batteryHealth;
        if (warranty) listingBody.warranty = warranty;
        if (color) listingBody.color = color;
        if (material) listingBody.material = material;
        if (dimensions) listingBody.dimensions = dimensions;
        if (weight) listingBody.weight = weight;
        if (assemblyRequired) listingBody.assemblyRequired = assemblyRequired;
        if (numberOfPieces) listingBody.numberOfPieces = numberOfPieces;
        if (size) listingBody.size = size;
        if (gender) listingBody.gender = gender;
        if (fabricType) listingBody.fabricType = fabricType;
        if (author) listingBody.author = author;
        if (isbn) listingBody.isbn = isbn;
        if (publisher) listingBody.publisher = publisher;
        if (edition) listingBody.edition = edition;
        if (sportType) listingBody.sportType = sportType;
      }

      // Attach services-specific fields
      if (category === "services") {
        const PRICE_UNIT_MAP: Record<string, string> = {
          "Per Hour": "Hourly",
          "Per Visit": "Per Visit",
          "Per Day": "Daily",
          "Per Month": "Monthly",
          "Fixed Quote": "fixed",
        };
        if (experience) listingBody.experience = experience;
        if (serviceArea) listingBody.serviceArea = serviceArea;
        if (availability) listingBody.availability = availability;
        if (priceUnit) listingBody.priceType = PRICE_UNIT_MAP[priceUnit] ?? priceUnit;
        if (serviceMode) listingBody.serviceType = serviceMode;
        if (responseTime) listingBody.turnaroundTime = responseTime;
      }

      if (isEditMode && editListingId) {
        setSubmitPhase("publishing");
        await updateListing(category, editListingId, listingBody);
        dispatch(setSubmitting(false));
        setSubmitPhase("idle");
        dispatch(resetPostForm());
        router.replace("/my-listings-active" as Href);
        return;
      }

      setSubmitPhase("publishing");
      const result = await createListing(category, listingBody);

      dispatch(setSubmitting(false));
      setSubmitPhase("idle");
      dispatch(resetPostForm());

      // Pass the created listing data to success screen.
      // Prefer imageUrls[0] (already normalized absolute S3 URL from upload)
      // over listing.images[0] which may be a relative path if the server
      // doesn't fully resolve it in the create-listing response.
      const listing = result.listing;
      console.log("[PostAd] listing from result:", listing);
      console.log("[PostAd] navigating to listing-success...");
      router.push({
        pathname: "/listing-success",
        params: {
          id: String(listing?._id ?? listing?.id ?? ""),
          categorySlug: category,
          title: listing?.title ?? title,
          price: String(listing?.price ?? price),
          location: listing?.location ?? location,
          image: allImageUrls[0] ?? allVideos[0]?.url ?? listing?.images?.[0] ?? "",
          category: categoryConfig?.name ?? category,
          currency,
        },
      } as Href);
      console.log("[PostAd] router.push completed successfully");
    } catch (err: unknown) {
      console.error("[PostAd] handleSubmit error:", err);
      if (err instanceof Error) {
        console.error("[PostAd] Error name:", err.name);
        console.error("[PostAd] Error message:", err.message);
        console.error("[PostAd] Error stack:", err.stack);
        if ("details" in err) {
          console.error("[PostAd] Error details (server response):", JSON.stringify((err as { details: unknown }).details, null, 2));
        }
      }
      const message =
        err instanceof Error ? err.message : "Failed to post listing";
      dispatch(setSubmitError(message));
      dispatch(setSubmitting(false));
      setSubmitPhase("idle");
      if (
        !isAuthenticated ||
        isAuthFailureMessage(message) ||
        (err instanceof AuthApiError && err.status === 401)
      ) {
        dispatch(showAuthGate({ action: "sell", redirectTo: POST_AD_RETURN_PATH }));
        return;
      }
      showErrorToast("Error", message);
    }
  };

  return (
    <SellFlowLayout
      step={3}
      title={isEditMode ? "Media & location" : "Media & publish"}
      subtitle={isEditMode ? "Update media, location & contact" : "Photos, videos, location & contact"}
      onBack={handleBack}
      footerLabel={isEditMode ? "Editing" : undefined}
      footerMeta={isEditMode ? (CATEGORY_MAP[category]?.name ?? category) : undefined}
      primaryLabel={
        submitPhase === "uploading"
          ? "Uploading media…"
          : submitPhase === "publishing"
            ? "Publishing…"
            : isEditMode
              ? "Update listing"
              : "Post ad"
      }
      onPrimaryPress={handleSubmit}
      primaryDisabled={
        isSubmitting ||
        mediaItems.some((item) => item.uploadStatus === "uploading") ||
        mediaItems
          .filter((item) => item.type === "image")
          .some((item) => imageScanMap[item.uri]?.status === "scanning")
      }
      primaryLoading={isSubmitting}
    >
      <SellSectionCard title="Photos & videos" required>
        <ListingMediaPicker
          mediaItems={mediaItems}
          onAddMedia={handleAddMedia}
          onRemoveMedia={handleRemoveMedia}
          imageScanMap={imageScanMap}
          disabled={isSubmitting}
        />
      </SellSectionCard>

      <SellSectionCard title="Item location" required>
        <View className="px-4 py-4">
          {/* Google Places Autocomplete */}
          <GooglePlacesInput
            value={location}
            onChangeText={(v) => dispatch(setLocation(v))}
            onSelect={(result: PlacesSelectResult) => {
              dispatch(setLocation(result.label));
              dispatch(setListingCoords({ lat: result.lat, lng: result.lng }));
      // Listing location changed — drop manual phone-code override so the new
      // country's code is shown automatically from the locale.
      if (result.isoCountryCode) {
        setOverridePhoneCode(null);
        setOverridePhoneIso(null);
        dispatch(setCurrency(getCurrencyCodeFromCountry(result.isoCountryCode)));
        if (category === "vehicles") {
          dispatch(setMileageUnit(getMileageUnitForCountry(result.isoCountryCode)));
        }
      }
              dispatch(
                setLocationDirect({
                  label: result.label,
                  lat: result.lat,
                  lng: result.lng,
                  isoCountryCode: result.isoCountryCode,
                }),
              );
            }}
            userLat={locationCoords.lat}
            userLng={locationCoords.lng}
            placeholder="Neighborhood or city..."
          />
          <Pressable
            onPress={handleUseCurrentLocation}
            disabled={locationStatus === "loading"}
            className="mt-3 mb-3 flex-row items-center gap-2"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <MaterialIcons name="my-location" size={20} color={colors.textPrimary} />
            <Text
              className="text-[13px]"
              style={{ fontFamily: ListifyFonts.semiBold, color: colors.textPrimary }}
            >
              {locationStatus === "loading"
                ? "Detecting location..."
                : "Use my current location"}
            </Text>
          </Pressable>
          <PostLocationMapPreview
            lat={locationLat ?? locationCoords.lat}
            lng={locationLng ?? locationCoords.lng}
            locationLabel={location}
            height={144}
          />
        </View>
      </SellSectionCard>

      <SellSectionCard title="Contact" required>
        <View className="px-4 py-4">
          <PhoneInputWithCountry
            phoneCode={activePhoneCode}
            phone={phone}
            isoCode={activePhoneIso}
            onChangePhoneCode={(code, iso) => {
              setOverridePhoneCode(code);
              setOverridePhoneIso(iso);
            }}
            onChangePhone={(v) => dispatch(setPhone(v.replace(/[^\d\s()+-]/g, "")))}
          />
          {phone && !phoneValidation.isValid ? (
            <View className="mt-2 flex-row items-start gap-2">
              <MaterialIcons name="error-outline" size={16} color={colors.danger} />
              <Text
                className="flex-1 text-[12px]"
                style={{ fontFamily: ListifyFonts.medium, color: colors.danger }}
              >
                {phoneValidation.message}
              </Text>
            </View>
          ) : null}
          <View
            className="mt-3 flex-row items-center gap-3 rounded-2xl p-3"
            style={{ backgroundColor: colors.surfaceMuted }}
          >
            <MaterialIcons name="verified-user" size={20} color={colors.textSecondary} />
            <Text
              className="flex-1 text-[11px]"
              style={{ fontFamily: ListifyFonts.regular, color: colors.textSecondary }}
            >
              We&apos;ll verify this number to prevent spam and keep buyers safe.
            </Text>
          </View>
        </View>
      </SellSectionCard>

      <Text
        className="mb-6 text-center text-[12px]"
        style={{ fontFamily: ListifyFonts.regular, color: colors.textSecondary }}
      >
        By posting, you agree to Listifys&apos;s{" "}
        <Text
          onPress={() => router.push("/terms-of-service")}
          style={{ fontFamily: ListifyFonts.semiBold, color: colors.primary }}
        >
          Terms
        </Text>{" "}
        and{" "}
        <Text
          onPress={() => router.push("/privacy-policy")}
          style={{ fontFamily: ListifyFonts.semiBold, color: colors.primary }}
        >
          Privacy Policy
        </Text>
        .
      </Text>
    </SellFlowLayout>
  );
}
