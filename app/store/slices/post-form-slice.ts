import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { CategorySlug } from "@/constants/categories";
import type { PostMediaItem } from "@/lib/listing-media";
import { createPostMediaId } from "@/lib/listing-media";

export type PostFormState = {
  // Step 1
  category: CategorySlug;
  subcategory: string;
  // Step 2 – common
  title: string;
  description: string;
  price: string;
  condition: string;
  location: string;
  listingType: string;
  // ── Property ──
  bedrooms: string;
  bathrooms: string;
  furnishing: string;
  squareFeet: string;
  features: string[];
  petFriendly: boolean;
  availableFrom: string;
  genderPreference: string;
  occupancy: string;
  // ── Electronics ──
  brand: string;
  model: string;
  warranty: string;
  purchaseYear: string;
  screenSize: string;
  displayType: string;
  processor: string;
  ram: string;
  storage: string;
  capacity: string;
  energyRating: string;
  megapixels: string;
  lensType: string;
  // ── Vehicles ──
  variant: string;
  year: string;
  kmDriven: string;
  mileageUnit: "km" | "mi" | "";
  fuelType: string;
  transmission: string;
  ownership: string;
  color: string;
  engineCC: string;
  cycleType: string;
  gearCount: string;
  frameSize: string;
  compatibleVehicle: string;
  partCategory: string;
  // ── Jobs ──
  companyName: string;
  companyWebsite: string;
  companyEmail: string;
  companyLogoUri: string;
  uploadedCompanyLogoUrl: string;
  applyLink: string;
  jobType: string;
  experience: string;
  education: string;
  skills: string[];
  employmentType: string;
  workMode: string;
  workSchedule: string;
  shiftTiming: string;
  salaryMin: string;
  salaryMax: string;
  salaryType: string;
  benefits: string[];
  industry: string;
  department: string;
  noticePeriod: string;
  responsibilities: string;
  requirements: string;
  contactPerson: string;
  contactEmail: string;
  positions: string;
  aboutCompany: string;
  contactPhone: string;
  // ── TakeCare ──
  availability: string;
  age: string;
  languages: string[];
  certifications: string[];
  // ── Events ──
  eventDate: string;
  eventTime: string;
  organizer: string;
  venue: string;
  ticketsAvailable: string;
  ageRestriction: string;
  dressCode: string;
  eventFormat: string;
  eventDuration: string;
  // ── Mobiles ──
  batteryHealth: string;
  // ── Furniture ──
  material: string;
  dimensions: string;
  weight: string;
  assemblyRequired: string;
  numberOfPieces: string;
  // ── Fashion ──
  size: string;
  gender: string;
  fabricType: string;
  // ── Sports ──
  sportType: string;
  ageGroup: string;
  // ── Collectibles ──
  era: string;
  rarity: string;
  authenticity: string;
  origin: string;
  // ── Pets ──
  breed: string;
  petAge: string;
  vaccinated: string;
  trained: string;
  // ── Books ──
  author: string;
  isbn: string;
  publisher: string;
  edition: string;
  language: string;
  pages: string;
  // ── Beauty ──
  skinType: string;
  shade: string;
  volume: string;
  ingredients: string;
  expiryDate: string;
  // ── Toys ──
  batteryRequired: string;
  playMode: string;
  characterTheme: string;
  // ── Services ──
  priceUnit: string;
  serviceArea: string;
  serviceMode: string;
  responseTime: string;
  // Step 3
  mediaItems: PostMediaItem[];
  /** @deprecated Legacy image URIs — kept in sync with mediaItems for older callers */
  imageUris: string[];
  uploadedImageUrls: string[];
  uploadedVideos: Array<{
    url: string;
    duration?: number;
    mimeType?: string;
    order?: number;
    size?: number;
  }>;
  phone: string;
  currency: string;
  // Listing GPS coords (set when user picks location from autocomplete or uses device GPS)
  locationLat: number | null;
  locationLng: number | null;
  // Submission
  isSubmitting: boolean;
  submitError: string | null;
  /** When set, post-ad step 2/3 operate in edit mode for this listing id. */
  editListingId: string | null;
};

const initialState: PostFormState = {
  category: "electronics",
  subcategory: "",
  title: "",
  description: "",
  price: "",
  condition: "Good",
  location: "",
  listingType: "Properties",
  bedrooms: "",
  bathrooms: "",
  furnishing: "",
  squareFeet: "",
  features: [],
  petFriendly: false,
  availableFrom: "",
  genderPreference: "",
  occupancy: "",
  brand: "",
  model: "",
  warranty: "",
  purchaseYear: "",
  screenSize: "",
  displayType: "",
  processor: "",
  ram: "",
  storage: "",
  capacity: "",
  energyRating: "",
  megapixels: "",
  lensType: "",
  variant: "",
  year: "",
  kmDriven: "",
  mileageUnit: "",
  fuelType: "",
  transmission: "",
  ownership: "",
  color: "",
  engineCC: "",
  cycleType: "",
  gearCount: "",
  frameSize: "",
  compatibleVehicle: "",
  partCategory: "",
  companyName: "",
  companyWebsite: "",
  companyEmail: "",
  companyLogoUri: "",
  uploadedCompanyLogoUrl: "",
  applyLink: "",
  jobType: "",
  experience: "",
  education: "",
  skills: [],
  employmentType: "",
  workMode: "",
  workSchedule: "",
  shiftTiming: "",
  salaryMin: "",
  salaryMax: "",
  salaryType: "",
  benefits: [],
  industry: "",
  department: "",
  noticePeriod: "",
  responsibilities: "",
  requirements: "",
  contactPerson: "",
  contactEmail: "",
  positions: "",
  aboutCompany: "",
  contactPhone: "",
  availability: "",
  age: "",
  languages: [],
  certifications: [],
  eventDate: "",
  eventTime: "",
  organizer: "",
  venue: "",
  ticketsAvailable: "",
  ageRestriction: "",
  dressCode: "",
  eventFormat: "Stand-up",
  eventDuration: "",
  batteryHealth: "",
  material: "",
  dimensions: "",
  weight: "",
  assemblyRequired: "",
  numberOfPieces: "",
  size: "",
  gender: "",
  fabricType: "",
  sportType: "",
  ageGroup: "",
  era: "",
  rarity: "",
  authenticity: "",
  origin: "",
  breed: "",
  petAge: "",
  vaccinated: "",
  trained: "",
  author: "",
  isbn: "",
  publisher: "",
  edition: "",
  language: "",
  pages: "",
  skinType: "",
  shade: "",
  volume: "",
  ingredients: "",
  expiryDate: "",
  batteryRequired: "",
  playMode: "",
  characterTheme: "",
  priceUnit: "",
  serviceArea: "",
  serviceMode: "",
  responseTime: "",
  mediaItems: [],
  imageUris: [],
  uploadedImageUrls: [],
  uploadedVideos: [],
  phone: "",
  currency: "",
  locationLat: null,
  locationLng: null,
  isSubmitting: false,
  submitError: null,
  editListingId: null,
};

function syncLegacyImageUris(state: PostFormState) {
  state.imageUris = state.mediaItems
    .filter((item) => item.type === "image")
    .sort((a, b) => a.order - b.order)
    .map((item) => item.uri);
}

const postFormSlice = createSlice({
  name: "postForm",
  initialState,
  reducers: {
    setCategory(state, action: PayloadAction<CategorySlug>) {
      state.category = action.payload;
      state.subcategory = "";
    },
    setSubcategory(state, action: PayloadAction<string>) {
      state.subcategory = action.payload;
    },
    setTitle(state, action: PayloadAction<string>) {
      state.title = action.payload;
    },
    setDescription(state, action: PayloadAction<string>) {
      state.description = action.payload;
    },
    setPrice(state, action: PayloadAction<string>) {
      state.price = action.payload;
    },
    setCondition(state, action: PayloadAction<string>) {
      state.condition = action.payload;
    },
    setLocation(state, action: PayloadAction<string>) {
      state.location = action.payload;
    },
    setListingType(state, action: PayloadAction<string>) {
      state.listingType = action.payload;
    },
    setBedrooms(state, action: PayloadAction<string>) {
      state.bedrooms = action.payload;
    },
    setBathrooms(state, action: PayloadAction<string>) {
      state.bathrooms = action.payload;
    },
    setFurnishing(state, action: PayloadAction<string>) {
      state.furnishing = action.payload;
    },
    setSquareFeet(state, action: PayloadAction<string>) {
      state.squareFeet = action.payload;
    },
    setFeatures(state, action: PayloadAction<string[]>) {
      state.features = action.payload;
    },
    toggleFeature(state, action: PayloadAction<string>) {
      const idx = state.features.indexOf(action.payload);
      if (idx >= 0) state.features.splice(idx, 1);
      else state.features.push(action.payload);
    },
    setPetFriendly(state, action: PayloadAction<boolean>) {
      state.petFriendly = action.payload;
    },
    setAvailableFrom(state, action: PayloadAction<string>) {
      state.availableFrom = action.payload;
    },
    setGenderPreference(state, action: PayloadAction<string>) {
      state.genderPreference = action.payload;
    },
    setOccupancy(state, action: PayloadAction<string>) {
      state.occupancy = action.payload;
    },
    setBrand(state, action: PayloadAction<string>) {
      state.brand = action.payload;
    },
    setModel(state, action: PayloadAction<string>) {
      state.model = action.payload;
    },
    setWarranty(state, action: PayloadAction<string>) {
      state.warranty = action.payload;
    },
    setPurchaseYear(state, action: PayloadAction<string>) {
      state.purchaseYear = action.payload;
    },
    setScreenSize(state, action: PayloadAction<string>) {
      state.screenSize = action.payload;
    },
    setDisplayType(state, action: PayloadAction<string>) {
      state.displayType = action.payload;
    },
    setProcessor(state, action: PayloadAction<string>) {
      state.processor = action.payload;
    },
    setRam(state, action: PayloadAction<string>) {
      state.ram = action.payload;
    },
    setStorage(state, action: PayloadAction<string>) {
      state.storage = action.payload;
    },
    setCapacity(state, action: PayloadAction<string>) {
      state.capacity = action.payload;
    },
    setEnergyRating(state, action: PayloadAction<string>) {
      state.energyRating = action.payload;
    },
    setMegapixels(state, action: PayloadAction<string>) {
      state.megapixels = action.payload;
    },
    setLensType(state, action: PayloadAction<string>) {
      state.lensType = action.payload;
    },
    setVariant(state, action: PayloadAction<string>) {
      state.variant = action.payload;
    },
    setYear(state, action: PayloadAction<string>) {
      state.year = action.payload;
    },
    setKmDriven(state, action: PayloadAction<string>) {
      state.kmDriven = action.payload;
    },
    setMileageUnit(state, action: PayloadAction<"km" | "mi" | "">) {
      state.mileageUnit = action.payload;
    },
    setFuelType(state, action: PayloadAction<string>) {
      state.fuelType = action.payload;
    },
    setTransmission(state, action: PayloadAction<string>) {
      state.transmission = action.payload;
    },
    setOwnership(state, action: PayloadAction<string>) {
      state.ownership = action.payload;
    },
    setColor(state, action: PayloadAction<string>) {
      state.color = action.payload;
    },
    setEngineCC(state, action: PayloadAction<string>) {
      state.engineCC = action.payload;
    },
    setCycleType(state, action: PayloadAction<string>) {
      state.cycleType = action.payload;
    },
    setGearCount(state, action: PayloadAction<string>) {
      state.gearCount = action.payload;
    },
    setFrameSize(state, action: PayloadAction<string>) {
      state.frameSize = action.payload;
    },
    setCompatibleVehicle(state, action: PayloadAction<string>) {
      state.compatibleVehicle = action.payload;
    },
    setPartCategory(state, action: PayloadAction<string>) {
      state.partCategory = action.payload;
    },
    setCompanyName(state, action: PayloadAction<string>) {
      state.companyName = action.payload;
    },
    setCompanyWebsite(state, action: PayloadAction<string>) {
      state.companyWebsite = action.payload;
    },
    setCompanyEmail(state, action: PayloadAction<string>) {
      state.companyEmail = action.payload;
    },
    setCompanyLogoUri(state, action: PayloadAction<string>) {
      state.companyLogoUri = action.payload;
    },
    setUploadedCompanyLogoUrl(state, action: PayloadAction<string>) {
      state.uploadedCompanyLogoUrl = action.payload;
    },
    clearCompanyLogo(state) {
      state.companyLogoUri = "";
      state.uploadedCompanyLogoUrl = "";
    },
    setApplyLink(state, action: PayloadAction<string>) {
      state.applyLink = action.payload;
    },
    setJobType(state, action: PayloadAction<string>) {
      state.jobType = action.payload;
    },
    setExperience(state, action: PayloadAction<string>) {
      state.experience = action.payload;
    },
    setEducation(state, action: PayloadAction<string>) {
      state.education = action.payload;
    },
    setSkills(state, action: PayloadAction<string[]>) {
      state.skills = action.payload;
    },
    toggleSkill(state, action: PayloadAction<string>) {
      const idx = state.skills.indexOf(action.payload);
      if (idx >= 0) state.skills.splice(idx, 1);
      else state.skills.push(action.payload);
    },
    setEmploymentType(state, action: PayloadAction<string>) {
      state.employmentType = action.payload;
    },
    setWorkMode(state, action: PayloadAction<string>) {
      state.workMode = action.payload;
    },
    setWorkSchedule(state, action: PayloadAction<string>) {
      state.workSchedule = action.payload;
    },
    setShiftTiming(state, action: PayloadAction<string>) {
      state.shiftTiming = action.payload;
    },
    setSalaryMin(state, action: PayloadAction<string>) {
      state.salaryMin = action.payload;
    },
    setSalaryMax(state, action: PayloadAction<string>) {
      state.salaryMax = action.payload;
    },
    setSalaryType(state, action: PayloadAction<string>) {
      state.salaryType = action.payload;
    },
    setBenefits(state, action: PayloadAction<string[]>) {
      state.benefits = action.payload;
    },
    toggleBenefit(state, action: PayloadAction<string>) {
      const idx = state.benefits.indexOf(action.payload);
      if (idx >= 0) state.benefits.splice(idx, 1);
      else state.benefits.push(action.payload);
    },
    setIndustry(state, action: PayloadAction<string>) {
      state.industry = action.payload;
    },
    setDepartment(state, action: PayloadAction<string>) {
      state.department = action.payload;
    },
    setNoticePeriod(state, action: PayloadAction<string>) {
      state.noticePeriod = action.payload;
    },
    setResponsibilities(state, action: PayloadAction<string>) {
      state.responsibilities = action.payload;
    },
    setRequirements(state, action: PayloadAction<string>) {
      state.requirements = action.payload;
    },
    setContactPerson(state, action: PayloadAction<string>) {
      state.contactPerson = action.payload;
    },
    setContactEmail(state, action: PayloadAction<string>) {
      state.contactEmail = action.payload;
    },
    setPositions(state, action: PayloadAction<string>) {
      state.positions = action.payload;
    },
    setAboutCompany(state, action: PayloadAction<string>) {
      state.aboutCompany = action.payload;
    },
    setContactPhone(state, action: PayloadAction<string>) {
      state.contactPhone = action.payload;
    },
    setAvailability(state, action: PayloadAction<string>) {
      state.availability = action.payload;
    },
    setAge(state, action: PayloadAction<string>) {
      state.age = action.payload;
    },
    setLanguages(state, action: PayloadAction<string[]>) {
      state.languages = action.payload;
    },
    toggleLanguage(state, action: PayloadAction<string>) {
      const idx = state.languages.indexOf(action.payload);
      if (idx >= 0) state.languages.splice(idx, 1);
      else state.languages.push(action.payload);
    },
    setCertifications(state, action: PayloadAction<string[]>) {
      state.certifications = action.payload;
    },
    toggleCertification(state, action: PayloadAction<string>) {
      const idx = state.certifications.indexOf(action.payload);
      if (idx >= 0) state.certifications.splice(idx, 1);
      else state.certifications.push(action.payload);
    },
    setEventDate(state, action: PayloadAction<string>) {
      state.eventDate = action.payload;
    },
    setEventTime(state, action: PayloadAction<string>) {
      state.eventTime = action.payload;
    },
    setOrganizer(state, action: PayloadAction<string>) {
      state.organizer = action.payload;
    },
    setVenue(state, action: PayloadAction<string>) {
      state.venue = action.payload;
    },
    setTicketsAvailable(state, action: PayloadAction<string>) {
      state.ticketsAvailable = action.payload;
    },
    setAgeRestriction(state, action: PayloadAction<string>) {
      state.ageRestriction = action.payload;
    },
    setDressCode(state, action: PayloadAction<string>) {
      state.dressCode = action.payload;
    },
    setEventFormat(state, action: PayloadAction<string>) {
      state.eventFormat = action.payload;
    },
    setEventDuration(state, action: PayloadAction<string>) {
      state.eventDuration = action.payload;
    },
    setBatteryHealth(state, action: PayloadAction<string>) {
      state.batteryHealth = action.payload;
    },
    setMaterial(state, action: PayloadAction<string>) {
      state.material = action.payload;
    },
    setDimensions(state, action: PayloadAction<string>) {
      state.dimensions = action.payload;
    },
    setWeight(state, action: PayloadAction<string>) {
      state.weight = action.payload;
    },
    setAssemblyRequired(state, action: PayloadAction<string>) {
      state.assemblyRequired = action.payload;
    },
    setNumberOfPieces(state, action: PayloadAction<string>) {
      state.numberOfPieces = action.payload;
    },
    setSize(state, action: PayloadAction<string>) {
      state.size = action.payload;
    },
    setGender(state, action: PayloadAction<string>) {
      state.gender = action.payload;
    },
    setFabricType(state, action: PayloadAction<string>) {
      state.fabricType = action.payload;
    },
    setSportType(state, action: PayloadAction<string>) {
      state.sportType = action.payload;
    },
    setAgeGroup(state, action: PayloadAction<string>) {
      state.ageGroup = action.payload;
    },
    setEra(state, action: PayloadAction<string>) {
      state.era = action.payload;
    },
    setRarity(state, action: PayloadAction<string>) {
      state.rarity = action.payload;
    },
    setAuthenticity(state, action: PayloadAction<string>) {
      state.authenticity = action.payload;
    },
    setOrigin(state, action: PayloadAction<string>) {
      state.origin = action.payload;
    },
    setBreed(state, action: PayloadAction<string>) {
      state.breed = action.payload;
    },
    setPetAge(state, action: PayloadAction<string>) {
      state.petAge = action.payload;
    },
    setVaccinated(state, action: PayloadAction<string>) {
      state.vaccinated = action.payload;
    },
    setTrained(state, action: PayloadAction<string>) {
      state.trained = action.payload;
    },
    setAuthor(state, action: PayloadAction<string>) {
      state.author = action.payload;
    },
    setIsbn(state, action: PayloadAction<string>) {
      state.isbn = action.payload;
    },
    setPublisher(state, action: PayloadAction<string>) {
      state.publisher = action.payload;
    },
    setEdition(state, action: PayloadAction<string>) {
      state.edition = action.payload;
    },
    setLanguage(state, action: PayloadAction<string>) {
      state.language = action.payload;
    },
    setPages(state, action: PayloadAction<string>) {
      state.pages = action.payload;
    },
    setSkinType(state, action: PayloadAction<string>) {
      state.skinType = action.payload;
    },
    setShade(state, action: PayloadAction<string>) {
      state.shade = action.payload;
    },
    setVolume(state, action: PayloadAction<string>) {
      state.volume = action.payload;
    },
    setIngredients(state, action: PayloadAction<string>) {
      state.ingredients = action.payload;
    },
    setExpiryDate(state, action: PayloadAction<string>) {
      state.expiryDate = action.payload;
    },
    setBatteryRequired(state, action: PayloadAction<string>) {
      state.batteryRequired = action.payload;
    },
    setPlayMode(state, action: PayloadAction<string>) {
      state.playMode = action.payload;
    },
    setCharacterTheme(state, action: PayloadAction<string>) {
      state.characterTheme = action.payload;
    },
    setPriceUnit(state, action: PayloadAction<string>) {
      state.priceUnit = action.payload;
    },
    setServiceArea(state, action: PayloadAction<string>) {
      state.serviceArea = action.payload;
    },
    setServiceMode(state, action: PayloadAction<string>) {
      state.serviceMode = action.payload;
    },
    setResponseTime(state, action: PayloadAction<string>) {
      state.responseTime = action.payload;
    },
    setMediaItems(state, action: PayloadAction<PostMediaItem[]>) {
      state.mediaItems = action.payload
        .slice(0, 6)
        .map((item, index) => ({ ...item, order: item.order ?? index }));
      syncLegacyImageUris(state);
    },
    addMediaItems(state, action: PayloadAction<PostMediaItem[]>) {
      const room = 6 - state.mediaItems.length;
      if (room <= 0) return;
      const toAdd = action.payload.slice(0, room).map((item, offset) => ({
        ...item,
        order: item.order ?? state.mediaItems.length + offset,
      }));
      state.mediaItems.push(...toAdd);
      syncLegacyImageUris(state);
    },
    removeMediaItemAt(state, action: PayloadAction<number>) {
      state.mediaItems.splice(action.payload, 1);
      state.mediaItems.forEach((item, index) => {
        item.order = index;
      });
      syncLegacyImageUris(state);
    },
    updateMediaItemAt(
      state,
      action: PayloadAction<{ index: number; patch: Partial<PostMediaItem> }>,
    ) {
      const item = state.mediaItems[action.payload.index];
      if (!item) return;
      state.mediaItems[action.payload.index] = {
        ...item,
        ...action.payload.patch,
      };
      syncLegacyImageUris(state);
    },
    setImageUris(state, action: PayloadAction<string[]>) {
      state.mediaItems = action.payload.map((uri, index) => ({
        id: createPostMediaId(),
        type: "image" as const,
        uri,
        order: index,
        uploadStatus: "idle" as const,
      }));
      syncLegacyImageUris(state);
    },
    addImageUri(state, action: PayloadAction<string>) {
      if (state.mediaItems.length >= 6) return;
      state.mediaItems.push({
        id: createPostMediaId(),
        type: "image",
        uri: action.payload,
        order: state.mediaItems.length,
        uploadStatus: "idle",
      });
      syncLegacyImageUris(state);
    },
    removeImageUri(state, action: PayloadAction<number>) {
      const imageItems = state.mediaItems
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item.type === "image");
      const target = imageItems[action.payload];
      if (!target) return;
      state.mediaItems.splice(target.index, 1);
      state.mediaItems.forEach((item, index) => {
        item.order = index;
      });
      syncLegacyImageUris(state);
    },
    setUploadedImageUrls(state, action: PayloadAction<string[]>) {
      state.uploadedImageUrls = action.payload;
    },
    setUploadedVideos(
      state,
      action: PayloadAction<
        Array<{
          url: string;
          duration?: number;
          mimeType?: string;
          order?: number;
          size?: number;
        }>
      >,
    ) {
      state.uploadedVideos = action.payload;
    },
    setPhone(state, action: PayloadAction<string>) {
      state.phone = action.payload;
    },
    setCurrency(state, action: PayloadAction<string>) {
      state.currency = action.payload;
    },
    setSubmitting(state, action: PayloadAction<boolean>) {
      state.isSubmitting = action.payload;
    },
    setSubmitError(state, action: PayloadAction<string | null>) {
      state.submitError = action.payload;
    },
    setListingCoords(state, action: PayloadAction<{ lat: number; lng: number } | null>) {
      state.locationLat = action.payload?.lat ?? null;
      state.locationLng = action.payload?.lng ?? null;
    },
    setEditListingId(state, action: PayloadAction<string | null>) {
      state.editListingId = action.payload;
    },
    hydratePostForm(state, action: PayloadAction<Partial<PostFormState>>) {
      return { ...initialState, ...action.payload };
    },
    resetPostForm() {
      return initialState;
    },
  },
});

export const {
  setCategory,
  setSubcategory,
  setTitle,
  setDescription,
  setPrice,
  setCondition,
  setLocation,
  setListingType,
  setBedrooms,
  setBathrooms,
  setFurnishing,
  setSquareFeet,
  setFeatures,
  toggleFeature,
  setPetFriendly,
  setAvailableFrom,
  setGenderPreference,
  setOccupancy,
  setBrand,
  setModel,
  setWarranty,
  setPurchaseYear,
  setScreenSize,
  setDisplayType,
  setProcessor,
  setRam,
  setStorage,
  setCapacity,
  setEnergyRating,
  setMegapixels,
  setLensType,
  setVariant,
  setYear,
  setKmDriven,
  setMileageUnit,
  setFuelType,
  setTransmission,
  setOwnership,
  setColor,
  setEngineCC,
  setCycleType,
  setGearCount,
  setFrameSize,
  setCompatibleVehicle,
  setPartCategory,
  setCompanyName,
  setCompanyWebsite,
  setCompanyEmail,
  setCompanyLogoUri,
  setUploadedCompanyLogoUrl,
  clearCompanyLogo,
  setApplyLink,
  setJobType,
  setExperience,
  setEducation,
  setSkills,
  toggleSkill,
  setEmploymentType,
  setWorkMode,
  setWorkSchedule,
  setShiftTiming,
  setSalaryMin,
  setSalaryMax,
  setSalaryType,
  setBenefits,
  toggleBenefit,
  setIndustry,
  setDepartment,
  setNoticePeriod,
  setResponsibilities,
  setRequirements,
  setContactPerson,
  setContactEmail,
  setPositions,
  setAboutCompany,
  setContactPhone,
  setAvailability,
  setAge,
  setLanguages,
  toggleLanguage,
  setCertifications,
  toggleCertification,
  setEventDate,
  setEventTime,
  setOrganizer,
  setVenue,
  setTicketsAvailable,
  setAgeRestriction,
  setDressCode,
  setEventFormat,
  setEventDuration,
  setBatteryHealth,
  setMaterial,
  setDimensions,
  setWeight,
  setAssemblyRequired,
  setNumberOfPieces,
  setSize,
  setGender,
  setFabricType,
  setSportType,
  setAgeGroup,
  setEra,
  setRarity,
  setAuthenticity,
  setOrigin,
  setBreed,
  setPetAge,
  setVaccinated,
  setTrained,
  setAuthor,
  setIsbn,
  setPublisher,
  setEdition,
  setLanguage,
  setPages,
  setSkinType,
  setShade,
  setVolume,
  setIngredients,
  setExpiryDate,
  setBatteryRequired,
  setPlayMode,
  setCharacterTheme,
  setPriceUnit,
  setServiceArea,
  setServiceMode,
  setResponseTime,
  setMediaItems,
  addMediaItems,
  removeMediaItemAt,
  updateMediaItemAt,
  setImageUris,
  addImageUri,
  removeImageUri,
  setUploadedImageUrls,
  setUploadedVideos,
  setPhone,
  setCurrency,
  setSubmitting,
  setSubmitError,
  setListingCoords,
  setEditListingId,
  hydratePostForm,
  resetPostForm,
} = postFormSlice.actions;

export default postFormSlice.reducer;
