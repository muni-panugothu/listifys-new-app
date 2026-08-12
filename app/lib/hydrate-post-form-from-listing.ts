import type { CategorySlug } from "@/constants/categories";
import type { ListingItem } from "@/features/listing/services/listing-api";
import { mapListingToPostMediaItems, normalizeListingVideos } from "@/lib/listing-media";
import { parseListingCoordinates } from "@/lib/listing-coordinates";
import type { PostFormState } from "@/store/slices/post-form-slice";

function str(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(String).join(", ");
  return String(value);
}

function arr(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }
  if (value != null && value !== "") return [String(value)];
  return [];
}

function getLocationText(listing: ListingItem): string {
  const raw = listing.location;
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object") {
    const loc = raw as Record<string, unknown>;
    return [loc.address, loc.city, loc.state, loc.pincode]
      .filter(Boolean)
      .join(", ");
  }
  return "";
}

function mileageUnitFromListing(listing: ListingItem): "km" | "mi" | "" {
  const unit = listing.mileageUnit;
  if (unit === "mi" || unit === "km") return unit;
  return "";
}

/**
 * Maps an existing listing into post-form state so edit flow reuses post-ad step 2/3 UI.
 */
export function mapListingToPostForm(
  listing: ListingItem,
  categorySlug: CategorySlug,
): Partial<PostFormState> {
  const record = listing as Record<string, unknown>;
  const coords = parseListingCoordinates(listing);
  const listingCategory =
    typeof listing.category === "string" ? listing.category.trim() : "";
  const listingType =
    listingCategory.toLowerCase() === "rentals" ? "Rentals" : "Properties";

  const salary = record.salary as
    | { min?: number; max?: number; type?: string }
    | undefined;
  const salaryMin = record.salaryMin ?? salary?.min;
  const salaryMax = record.salaryMax ?? salary?.max;
  const salaryType = record.salaryType ?? salary?.type;

  const pricing = record.pricing as { priceType?: string } | undefined;
  const servicePricing = record.pricing as { basePrice?: number } | undefined;

  return {
    editListingId: listing._id,
    category: categorySlug,
    subcategory: str(listing.subcategory),
    title: listing.title || "",
    description: listing.description || "",
    price:
      listing.price != null
        ? String(listing.price)
        : servicePricing?.basePrice != null
          ? String(servicePricing.basePrice)
          : "",
    condition: listing.condition || "Good",
    location: getLocationText(listing),
    listingType,
    locationLat: coords?.lat ?? null,
    locationLng: coords?.lng ?? null,
    imageUris: listing.images || [],
    mediaItems: mapListingToPostMediaItems(listing),
    uploadedImageUrls: listing.images || [],
    uploadedVideos: normalizeListingVideos(listing.videos),
    phone: str(listing.phone),
    currency: str(listing.currency),
    bedrooms: str(listing.bedrooms),
    bathrooms: str(listing.bathrooms),
    furnishing: str(record.furnishing ?? listing.furnished),
    squareFeet: str(record.squareFeet ?? listing.area),
    features: arr(record.features),
    petFriendly: Boolean(record.petFriendly),
    availableFrom: str(record.availableFrom),
    genderPreference: str(record.genderPreference),
    occupancy: str(record.occupancy),
    brand: str(listing.brand),
    model: str(listing.model),
    warranty: str(listing.warranty),
    purchaseYear: str(record.purchaseYear),
    screenSize: str(record.screenSize),
    displayType: str(record.displayType),
    processor: str(record.processor),
    ram: str(listing.ram),
    storage: str(listing.storage),
    capacity: str(record.capacity),
    energyRating: str(record.energyRating),
    megapixels: str(record.megapixels),
    lensType: str(record.lensType),
    variant: str(record.variant),
    year: str(listing.year),
    kmDriven: str(listing.kmDriven ?? listing.mileage),
    mileageUnit: mileageUnitFromListing(listing),
    fuelType: str(listing.fuelType),
    transmission: str(listing.transmission),
    ownership: str(record.ownership),
    color: str(listing.color),
    engineCC: str(record.engineCC),
    cycleType: str(record.cycleType),
    gearCount: str(record.gearCount),
    frameSize: str(record.frameSize),
    compatibleVehicle: str(record.compatibleVehicle),
    partCategory: str(record.partCategory),
    companyName: str(record.companyName),
    companyWebsite: str(record.companyWebsite),
    companyEmail: str(record.companyEmail),
    companyLogoUri: str(record.companyLogo),
    uploadedCompanyLogoUrl: str(record.companyLogo),
    applyLink: str(record.applyLink),
    jobType: str(record.jobType ?? record.employmentType),
    experience: str(record.experience),
    education: str(record.education),
    employmentType: str(record.employmentType ?? record.jobType),
    workMode: str(record.workMode),
    salaryMin: salaryMin != null ? String(salaryMin) : "",
    salaryMax: salaryMax != null ? String(salaryMax) : "",
    salaryType: str(salaryType),
    industry: str(record.industry),
    positions: str(record.positions),
    availability: str(record.availability),
    age: str(record.age),
    languages: arr(record.languages),
    certifications: arr(record.certifications),
    eventDate: str(record.eventDate),
    eventTime: str(record.eventTime),
    organizer: str(record.organizer),
    venue: str(record.venue),
    ticketsAvailable: str(record.ticketsAvailable),
    ageRestriction: str(record.ageRestriction),
    dressCode: str(record.dressCode),
    eventFormat: str(record.eventFormat) || "Stand-up",
    eventDuration: str(record.eventDuration),
    batteryHealth: str(record.batteryHealth),
    material: str(record.material),
    dimensions: str(record.dimensions),
    weight: str(record.weight),
    assemblyRequired: str(record.assemblyRequired),
    numberOfPieces: str(record.numberOfPieces),
    size: str(record.size),
    gender: str(record.gender),
    fabricType: str(record.fabricType),
    sportType: str(record.sportType),
    ageGroup: str(record.ageGroup),
    era: str(record.era),
    rarity: str(record.rarity),
    authenticity: str(record.authenticity),
    origin: str(record.origin),
    breed: str(record.breed),
    petAge: str(record.petAge),
    vaccinated: str(record.vaccinated),
    trained: str(record.trained),
    author: str(record.author),
    isbn: str(record.isbn),
    publisher: str(record.publisher),
    edition: str(record.edition),
    language: str(record.language),
    pages: str(record.pages),
    skinType: str(record.skinType),
    shade: str(record.shade),
    volume: str(record.volume),
    ingredients: str(record.ingredients),
    expiryDate: str(record.expiryDate),
    batteryRequired: str(record.batteryRequired),
    playMode: str(record.playMode),
    characterTheme: str(record.characterTheme),
    priceUnit: str(record.priceUnit ?? record.priceType ?? pricing?.priceType),
    serviceArea: str(record.serviceArea),
    serviceMode: str(record.serviceMode ?? record.serviceType),
    responseTime: str(record.responseTime ?? record.turnaroundTime),
    isSubmitting: false,
    submitError: null,
  };
}
