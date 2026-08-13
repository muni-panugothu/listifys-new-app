/**
 * Listing API service — handles all listing CRUD and image upload calls.
 * Re-uses the auth-aware requestJson() from auth-api.ts.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import {
  AUTH_API_BASE_URL,
  AuthApiError,
  getAccessToken,
  requestJson,
  resolveAbsoluteMediaUrl,
} from "@/features/auth/services/auth-api";
import {
  normalizeListingVideos,
  normalizeVideoDurationSeconds,
  type ListingVideoEntry,
} from "@/lib/listing-media";
import { authenticatedMultipartPost } from "@/lib/authenticated-multipart";
import type { CategorySlug } from "@/constants/categories";
import { cacheKeys, invalidateCache, seedListingsBatch, withCache, withStaleCache } from "@/lib/cache";
import { getListingSellerId } from "@/lib/is-own-listing";
import Constants from "expo-constants";
import { requireOptionalNativeModule } from "expo-modules-core";

type ExpoDeviceModule = {
  brand?: string | null;
  modelName?: string | null;
  osName?: string | null;
  osVersion?: string | null;
};

const deviceModule = requireOptionalNativeModule<ExpoDeviceModule>("ExpoDevice");

function buildUserAgent(): string {
  const appVersion = Constants.expoConfig?.version ?? "1.0.0";
  const brand = deviceModule?.brand ?? "Unknown";
  const modelName = deviceModule?.modelName ?? "Unknown";
  const osName = deviceModule?.osName ?? Platform.OS;
  const osVersion = deviceModule?.osVersion ?? Platform.Version?.toString() ?? "";
  return `Listify/${appVersion} (${brand} ${modelName}; ${osName} ${osVersion})`;
}

const APP_USER_AGENT = buildUserAgent();

// ── Generic authenticated JSON request (delegates to auth-api) ─────────────────

async function apiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  return requestJson<T>(path, init);
}

// ── Types ──────────────────────────────────────────────────────────────────────

export type ListingItem = {
  _id: string;
  title: string;
  slug?: string;
  description?: string;
  price?: number;
  currency?: string;
  category: string;
  subcategory?: string;
  condition?: string;
  location?: string;
  countryCode?: string;
  images: string[];
  videos?: ListingVideoEntry[];
  sellerName?: string;
  seller?: {
    _id: string;
    name?: string;
    profileImage?: string;
    createdAt?: string;
  };
  userId?: string | {
    _id?: string;
    name?: string;
    profileImage?: string;
    googleProfileImage?: string;
    avatar?: string;
  };
  sellerId?: string;
  views?: number;
  phone?: string;
  status?: string;
  savedBy?: string[];
  createdAt?: string;
  brand?: string;
  model?: string;
  warranty?: string;
  ram?: string;
  storage?: string;
  color?: string;
  year?: number;
  mileage?: string;
  kmDriven?: string;
  mileageUnit?: "km" | "mi" | string;
  fuelType?: string;
  transmission?: string;
  bedrooms?: number;
  bathrooms?: number;
  area?: string;
  propertyType?: string;
  furnished?: string;
  [key: string]: unknown;
  coordinates?: {
    type: string;
    coordinates: [number, number];
  };
};

export type FeedCategoryData = {
  listings: ListingItem[];
  count: number;
  hasMore: boolean;
};

export type FeedResponse = {
  success: boolean;
  total: number;
  categories: Record<string, FeedCategoryData>;
  pagination?: {
    page: number;
    limit: number;
    hasMore: boolean;
  };
};

export type CachedHomeFeed = {
  savedAt: number;
  data: FeedResponse;
};

export type ListingsResponse = {
  success: boolean;
  listings: ListingItem[];
  pagination?: {
    page: number;
    limit: number;
    totalPages: number;
    totalListings: number;
  };
};

export type SingleListingResponse = {
  success: boolean;
  listing: ListingItem;
};

export type CreateListingResponse = {
  success: boolean;
  message: string;
  listing: ListingItem;
};

export type ImageUploadResponse = {
  success: boolean;
  images: string[];
  message?: string;
};

export type VideoUploadResponse = {
  success: boolean;
  videos: ListingVideoEntry[];
  message?: string;
};

// ── Normalise image URLs in listings ───────────────────────────────────────────

/**
 * Feed/list endpoints often return `seller` as a plain ObjectId string.
 * Spreading a string (`{ ...seller }`) corrupts it into `{0:"6",1:"7",...}` and
 * breaks getListingSellerId — which caused "Seller information is missing".
 */
function normaliseSellerField(
  seller: ListingItem["seller"] | undefined,
): ListingItem["seller"] | undefined {
  if (seller == null) return seller;

  if (typeof seller === "string") {
    return seller.trim() || seller;
  }

  if (typeof seller === "object") {
    const rec = seller as {
      _id?: string;
      id?: string;
      name?: string;
      profileImage?: string;
      toString?: () => string;
    };

    // Populated seller document
    if (rec._id || rec.id || rec.name || rec.profileImage) {
      return {
        ...rec,
        profileImage: resolveAbsoluteMediaUrl(rec.profileImage) ?? undefined,
      };
    }

    // Raw Mongo ObjectId object from lean queries
    const asString = String(seller);
    if (/^[a-f\d]{24}$/i.test(asString)) return asString;
  }

  return seller;
}

function normaliseListingImages(listing: ListingItem): ListingItem {
  const userId =
    listing.userId && typeof listing.userId === "object"
      ? {
          ...listing.userId,
          profileImage: resolveAbsoluteMediaUrl(listing.userId.profileImage) ?? undefined,
          googleProfileImage:
            resolveAbsoluteMediaUrl(listing.userId.googleProfileImage) ?? undefined,
          avatar: resolveAbsoluteMediaUrl(listing.userId.avatar) ?? undefined,
        }
      : listing.userId;

  const seller = normaliseSellerField(listing.seller);
  // Keep sellerId in sync when API only sends an unpopulated seller ref.
  const sellerId =
    listing.sellerId ??
    (typeof seller === "string" ? seller : seller?._id);

  const applicantAvatars = (
    listing as ListingItem & {
      applicantAvatars?: Array<{ profileImage?: string | null; name?: string }>;
    }
  ).applicantAvatars?.map((avatar) => ({
    ...avatar,
    profileImage: resolveAbsoluteMediaUrl(avatar.profileImage) ?? avatar.profileImage ?? null,
  }));

  return {
    ...listing,
    userId,
    seller,
    sellerId: sellerId ? String(sellerId) : listing.sellerId,
    companyLogo: resolveAbsoluteMediaUrl(listing.companyLogo) ?? listing.companyLogo ?? undefined,
    applicantAvatars,
    images: (listing.images || []).map((img) => {
      // Server may return image objects {url, publicId, isPrimary} — extract the URL string
      const rawUrl = typeof img === "string" ? img : ((img as unknown as { url?: string }).url ?? "");
      return resolveAbsoluteMediaUrl(rawUrl) ?? rawUrl;
    }).filter(Boolean),
    videos: normalizeListingVideos(listing.videos),
  };
}

/** Normalise listing media URLs (images + videos) for client display. */
export function normalizeListingItem(listing: ListingItem): ListingItem {
  return normaliseListingImages(listing);
}

/** Keep richer media from cache when a stale detail fetch omits videos/images. */
export function mergeListingItems(
  prev: ListingItem | null | undefined,
  next: ListingItem,
): ListingItem {
  const normalized = normalizeListingItem(next);
  if (!prev) return normalized;

  const prevCount =
    (prev.images?.length ?? 0) + (prev.videos?.length ?? 0);
  const nextCount =
    (normalized.images?.length ?? 0) + (normalized.videos?.length ?? 0);

  if (nextCount >= prevCount) return normalized;

  return {
    ...normalized,
    images: prev.images?.length ? prev.images : normalized.images,
    videos: prev.videos?.length ? prev.videos : normalized.videos,
  };
}

function normaliseFeedResponse(data: FeedResponse): FeedResponse {
  const normalised: FeedResponse = {
    ...data,
    categories: Object.fromEntries(
      Object.entries(data.categories ?? {}).map(([category, categoryData]) => [
        category,
        {
          ...categoryData,
          listings: (categoryData.listings ?? []).map(normaliseListingImages),
        },
      ]),
    ),
  };

  // Promote every listing into the detail cache so tapping a card opens an
  // already-warm detail screen. Detail screen still revalidates in background.
  const seedPairs: Array<{ category: string; listing: ListingItem }> = [];
  for (const [category, bucket] of Object.entries(normalised.categories ?? {})) {
    for (const item of bucket?.listings ?? []) {
      seedPairs.push({ category, listing: item });
    }
  }
  if (seedPairs.length > 0) {
    seedListingsBatch(seedPairs, 120_000);
  }

  return normalised;
}

const HOME_FEED_CACHE_KEY = "@listify/home_feed_cache";

// ── Feed API (aggregated home feed) ────────────────────────────────────────────

export async function fetchHomeFeed(params?: {
  limit?: number;
  page?: number;
  search?: string;
  location?: string;
  lat?: number;
  lng?: number;
  radius?: number;
  countryCode?: string;
}): Promise<FeedResponse> {
  const query = new URLSearchParams();
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.page) query.set("page", String(params.page));
  if (params?.search) query.set("search", params.search);
  if (params?.location) query.set("location", params.location);
  if (params?.lat != null) query.set("lat", String(params.lat));
  if (params?.lng != null) query.set("lng", String(params.lng));
  if (params?.radius != null) query.set("radius", String(params.radius));
  if (params?.countryCode) query.set("countryCode", params.countryCode);

  const qs = query.toString();
  const feedCacheKey = [
    cacheKeys.feed(params?.page),
    `limit:${params?.limit ?? "default"}`,
    `search:${encodeURIComponent(params?.search ?? "")}`,
    `lat:${params?.lat ?? ""}`,
    `lng:${params?.lng ?? ""}`,
    `loc:${encodeURIComponent(params?.location ?? "")}`,
    `radius:${params?.radius ?? ""}`,
    `cc:${params?.countryCode ?? ""}`,
  ].join(":");

  return withCache(
    feedCacheKey,
    async () => {
      const data = normaliseFeedResponse(
        await apiRequest<FeedResponse>(`/api/feed${qs ? `?${qs}` : ""}`),
      );

      if ((!params?.page || params.page === 1) && !params?.search) {
        try {
          await AsyncStorage.setItem(
            HOME_FEED_CACHE_KEY,
            JSON.stringify({
              savedAt: Date.now(),
              data,
            } satisfies CachedHomeFeed),
          );
        } catch {
          // silently fail cache writes
        }
      }

      return data;
    },
    60_000,
  );
}

function countFeedListings(feed: FeedResponse): number {
  if (!feed?.categories) return 0;
  return Object.values(feed.categories).reduce(
    (sum, bucket) => sum + (bucket?.listings?.length ?? 0),
    0,
  );
}

function hasGeoOrLocationParams(params?: {
  location?: string;
  lat?: number;
  lng?: number;
}): boolean {
  return Boolean(
    params?.location ||
      params?.lat != null ||
      params?.lng != null,
  );
}

/** Primary feed fetch with automatic global fallback when geo/location filters return empty. */
export async function fetchHomeFeedReliable(
  params?: Parameters<typeof fetchHomeFeed>[0],
): Promise<FeedResponse> {
  const limit = params?.limit ?? 12;
  const page = params?.page;

  try {
    const primary = await fetchHomeFeed(params);
    if (countFeedListings(primary) > 0 || !hasGeoOrLocationParams(params)) {
      return primary;
    }
  } catch {
    if (!hasGeoOrLocationParams(params) && !params?.countryCode) {
      throw new Error("home_feed_unavailable");
    }
  }

  if (params?.countryCode) {
    try {
      const countryScoped = await fetchHomeFeed({ limit, page, countryCode: params.countryCode });
      if (countFeedListings(countryScoped) > 0) {
        return countryScoped;
      }
    } catch {
      // fall through to fully global
    }
  }

  return fetchHomeFeed({ limit, page });
}

export async function getCachedHomeFeed(): Promise<CachedHomeFeed | null> {
  try {
    const raw = await AsyncStorage.getItem(HOME_FEED_CACHE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<CachedHomeFeed> | null;
    if (!parsed || typeof parsed.savedAt !== "number" || !parsed.data) {
      return null;
    }

    return {
      savedAt: parsed.savedAt,
      data: normaliseFeedResponse(parsed.data),
    };
  } catch {
    return null;
  }
}

// ── Nearby Listings ────────────────────────────────────────────────────────────

export type NearbyListingsResponse = {
  success: boolean;
  listings: (ListingItem & { distance: number | null; _entity: string; _detailPath: string })[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasMore: boolean;
  };
  location: { lat: number; lng: number; radius: number };
  source?: string;
};

export async function fetchNearbyListings(params: {
  lat: number;
  lng: number;
  radius?: number;
  search?: string;
  category?: string;
  sort?: string;
  page?: number;
  limit?: number;
  countryCode?: string | null;
}): Promise<NearbyListingsResponse> {
  const query = new URLSearchParams({
    lat: String(params.lat),
    lng: String(params.lng),
    radius: String(params.radius ?? 50),
  });
  if (params.search) query.set("search", params.search);
  if (params.category) query.set("category", params.category);
  if (params.sort) query.set("sort", params.sort);
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  if (params.countryCode) query.set("countryCode", params.countryCode);

  const data = await apiRequest<NearbyListingsResponse>(`/api/nearby?${query.toString()}`);
  const listings = (data.listings ?? []).map((item) => normaliseListingImages(item as ListingItem) as typeof item);
  return { ...data, listings };
}

// ── Category Listings ──────────────────────────────────────────────────────────

export async function fetchCategoryListings(
  categorySlug: CategorySlug,
  params?: {
    page?: number;
    limit?: number;
    search?: string;
    subcategory?: string;
    condition?: string;
    minPrice?: number;
    maxPrice?: number;
    sort?: string;
    location?: string;
    lat?: number;
    lng?: number;
    radius?: number;
    countryCode?: string | null;
    workMode?: string;
    jobType?: string;
  },
): Promise<ListingsResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.search) query.set("search", params.search);
  if (params?.subcategory) query.set("category", params.subcategory);
  if (params?.condition) query.set("condition", params.condition);
  if (params?.minPrice) query.set("minPrice", String(params.minPrice));
  if (params?.maxPrice) query.set("maxPrice", String(params.maxPrice));
  if (params?.sort) query.set("sort", params.sort);
  if (params?.location) query.set("location", params.location);
  if (params?.lat != null) query.set("lat", String(params.lat));
  if (params?.lng != null) query.set("lng", String(params.lng));
  if (params?.radius != null) query.set("radius", String(params.radius));
  if (params?.countryCode) query.set("countryCode", params.countryCode);
  if (params?.workMode) query.set("workMode", params.workMode);
  if (params?.jobType) query.set("jobType", params.jobType);

  const qs = query.toString();

  const cacheKey = [
    "list",
    categorySlug,
    params?.page ?? 1,
    `limit:${params?.limit ?? ""}`,
    params?.subcategory ?? "",
    params?.search ?? "",
    params?.condition ?? "",
    `min:${params?.minPrice ?? ""}`,
    `max:${params?.maxPrice ?? ""}`,
    params?.sort ?? "",
    `loc:${encodeURIComponent(params?.location ?? "")}`,
    `lat:${params?.lat ?? ""}`,
    `lng:${params?.lng ?? ""}`,
    `radius:${params?.radius ?? ""}`,
    `cc:${params?.countryCode ?? ""}`,
    `wm:${params?.workMode ?? ""}`,
    `jt:${params?.jobType ?? ""}`,
  ].join(":");

  return withCache(
    cacheKey,
    async () => {
      const data = await apiRequest<ListingsResponse>(
        `${categoryApiBase(categorySlug)}${qs ? `?${qs}` : ""}`,
      );
      data.listings = (data.listings || []).map(normaliseListingImages);
      // Seed detail cache for every card in the category list.
      seedListingsBatch(
        (data.listings ?? []).map((listing) => ({ category: categorySlug, listing })),
        120_000,
      );
      return data;
    },
    60_000,
  );
}

// ── Category API base path helper ─────────────────────────────────────────────
// Services listings live under /api/services/listings (not /api/services).

function categoryApiBase(categorySlug: CategorySlug): string {
  if (categorySlug === "services") return "/api/services/listings";
  return `/api/${categorySlug}`;
}

// ── Single Listing Detail ──────────────────────────────────────────────────────

async function fetchListingByIdFromNetwork(
  categorySlug: CategorySlug,
  id: string,
): Promise<SingleListingResponse> {
  const raw = await apiRequest<{ success: boolean; listing?: ListingItem; data?: ListingItem }>(
    `${categoryApiBase(categorySlug)}/${id}`,
  );
  const found = raw.listing ?? raw.data;
  const normalised = found ? normaliseListingImages(found) : undefined;
  return { ...raw, listing: normalised } as SingleListingResponse;
}

export async function fetchListingById(
  categorySlug: CategorySlug,
  id: string,
  options?: { fresh?: boolean },
): Promise<SingleListingResponse> {
  if (options?.fresh) {
    return fetchListingByIdFromNetwork(categorySlug, id);
  }

  return withCache(
    cacheKeys.listingDetail(categorySlug, id),
    () => fetchListingByIdFromNetwork(categorySlug, id),
    120_000, // 2 minutes TTL
  );
}

// ── Create Listing ─────────────────────────────────────────────────────────────

export async function createListing(
  categorySlug: CategorySlug,
  body: Record<string, unknown>,
): Promise<CreateListingResponse> {
  const result = await apiRequest<CreateListingResponse>(categoryApiBase(categorySlug), {
    method: "POST",
    body: JSON.stringify(body),
  });
  // Invalidate feed and category caches
  invalidateCache("feed:");
  invalidateCache(`list:${categorySlug}`);
  invalidateCache("my-listings");
  if (categorySlug === "events") {
    invalidateCache("events:");
  }
  return result;
}

// ── Update Listing ─────────────────────────────────────────────────────────────

export async function updateListing(
  categorySlug: CategorySlug,
  id: string,
  body: Record<string, unknown>,
): Promise<CreateListingResponse> {
  const result = await apiRequest<CreateListingResponse>(`${categoryApiBase(categorySlug)}/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  invalidateCache(cacheKeys.listingDetail(categorySlug, id));
  invalidateCache(`list:${categorySlug}`);
  invalidateCache("feed:");
  invalidateCache("my-listings");
  return result;
}

// ── Delete Listing ─────────────────────────────────────────────────────────────

export async function deleteListing(
  categorySlug: CategorySlug,
  id: string,
): Promise<{ success: boolean; message: string }> {
  const result = await apiRequest<{ success: boolean; message: string }>(
    `/api/feed/listings/${categorySlug}/${id}`,
    { method: "DELETE" },
  );
  invalidateCache(cacheKeys.listingDetail(categorySlug, id));
  invalidateCache(`list:${categorySlug}`);
  invalidateCache("feed:");
  invalidateCache("my-listings");
  return result;
}

// ── Mark Listing Status (sold / inactive / active) ────────────────────────────
//
// Unified across every category. The server picks the closest status the
// underlying model supports (services → "inactive", everything else → "sold").
export async function markListingStatus(
  categorySlug: CategorySlug,
  id: string,
  status: "sold" | "inactive" | "active",
): Promise<{ success: boolean; message: string; listing?: { _id: string; status: string } }> {
  const result = await apiRequest<{
    success: boolean;
    message: string;
    listing?: { _id: string; status: string };
  }>(`/api/feed/listings/${categorySlug}/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  invalidateCache(cacheKeys.listingDetail(categorySlug, id));
  invalidateCache(`list:${categorySlug}`);
  invalidateCache("feed:");
  invalidateCache("my-listings");
  return result;
}

// ── Toggle Save (bookmark) ─────────────────────────────────────────────────────

export async function toggleSaveListing(
  categorySlug: CategorySlug,
  id: string,
): Promise<{ success: boolean; saved: boolean }> {
  const result = await apiRequest<{ success: boolean; saved: boolean }>(
    `${categoryApiBase(categorySlug)}/${id}/toggle-save`,
    { method: "POST" },
  );
  invalidateCache(cacheKeys.savedListings());
  return result;
}

export async function recordJobApply(jobId: string): Promise<{
  success: boolean;
  applied: boolean;
  applicantCount: number;
  applyLink?: string | null;
}> {
  return apiRequest(`/api/jobs/${jobId}/apply`, { method: "POST" });
}

// ── Service Listings (different route pattern: /api/services/listings) ─────────

export async function fetchServiceListings(params?: {
  subcategory?: string;
  search?: string;
  location?: string;
  lat?: number;
  lng?: number;
  radius?: number;
  countryCode?: string | null;
  page?: number;
  limit?: number;
  sort?: string;
}): Promise<{ listings: ListingItem[]; total: number }> {
  const query = new URLSearchParams();
  if (params?.subcategory) query.set("subcategory", params.subcategory);
  if (params?.search) query.set("search", params.search);
  if (params?.location) query.set("location", params.location);
  if (params?.lat != null) query.set("lat", String(params.lat));
  if (params?.lng != null) query.set("lng", String(params.lng));
  if (params?.radius != null) query.set("radius", String(params.radius));
  if (params?.countryCode) query.set("countryCode", params.countryCode);
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.sort) query.set("sort", params.sort);
  const qs = query.toString();
  const cacheKey = cacheKeys.serviceListings(
    [
      `sub:${params?.subcategory ?? ""}`,
      `search:${encodeURIComponent(params?.search ?? "")}`,
      `loc:${encodeURIComponent(params?.location ?? "")}`,
      `lat:${params?.lat ?? ""}`,
      `lng:${params?.lng ?? ""}`,
      `radius:${params?.radius ?? ""}`,
      `cc:${params?.countryCode ?? ""}`,
      `page:${params?.page ?? 1}`,
      `limit:${params?.limit ?? "default"}`,
      `sort:${params?.sort ?? ""}`,
    ].join(":"),
  );

  return withCache(
    cacheKey,
    async () => {
      const res = await apiRequest<{ success: boolean; data: ListingItem[]; pagination?: { total: number } }>(
        `/api/services/listings${qs ? `?${qs}` : ""}`,
      );
      const items = (res.data ?? []).map(normaliseListingImages);
      seedListingsBatch(
        items.map((listing) => ({ category: "services", listing })),
        120_000,
      );
      return { listings: items, total: res.pagination?.total ?? items.length };
    },
    60_000,
  );
}

// ── Image Moderation ──────────────────────────────────────────────────────────

export type ModerationResult = {
  filename: string;
  decision: "allow" | "review" | "block";
  block: boolean;
  category: string;
  confidence: number;
  requiresHumanReview: boolean;
  categories: Record<string, string>;
  error?: string;
};

export type ModerationResponse = {
  success: boolean;
  overallDecision: "allow" | "review" | "block";
  overallCategory: string;
  requiresHumanReview: boolean;
  results: ModerationResult[];
};

export async function checkImageModeration(
  imageUris: string[],
): Promise<ModerationResponse> {
  const buildFormData = () => {
    const formData = new FormData();
    for (const uri of imageUris) {
      const filename = uri.split("/").pop() || `image_${Date.now()}.jpg`;
      const match = /\.(\w+)$/.exec(filename);
      const ext = match ? match[1] : "jpg";
      const mimeType = `image/${ext === "jpg" ? "jpeg" : ext}`;

      formData.append("images", {
        uri: Platform.OS === "android" ? uri : uri.replace("file://", ""),
        name: filename,
        type: mimeType,
      } as unknown as Blob);
    }
    return formData;
  };

  const response = await authenticatedMultipartPost(
    `${AUTH_API_BASE_URL}/api/moderation/check-images`,
    buildFormData,
  );

  const data = await response.json().catch(() => ({
    success: false,
    overallDecision: "allow",
    results: [],
  }));

  if (!response.ok) {
    throw new AuthApiError(
      (data as { message?: string })?.message || "Image moderation check failed",
      response.status,
      data,
    );
  }

  return data as ModerationResponse;
}

// ── Upload Images to S3 ───────────────────────────────────────────────────────

export async function uploadListingImages(
  categorySlug: CategorySlug,
  imageUris: string[],
): Promise<ImageUploadResponse> {
  const buildFormData = () => {
    const formData = new FormData();
    for (const uri of imageUris) {
      const filename = uri.split("/").pop() || `image_${Date.now()}.jpg`;
      const match = /\.(\w+)$/.exec(filename);
      const ext = match ? match[1] : "jpg";
      const mimeType = `image/${ext === "jpg" ? "jpeg" : ext}`;

      formData.append("images", {
        uri: Platform.OS === "android" ? uri : uri.replace("file://", ""),
        name: filename,
        type: mimeType,
      } as unknown as Blob);
    }
    return formData;
  };

  const url = `${AUTH_API_BASE_URL}${categoryApiBase(categorySlug)}/upload-images`;

  const response = await authenticatedMultipartPost(url, buildFormData);

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      (data as { message?: string })?.message ||
      (response.status === 401
        ? "Your session expired. Please sign in again."
        : "Image upload failed");
    throw new AuthApiError(message, response.status, data);
  }

  // Server returns "imageUrls"; normalise to "images" for our type
  const rawUrls: string[] = data.images ?? data.imageUrls ?? [];
  const images = rawUrls.map(
    (url: string) => resolveAbsoluteMediaUrl(url) ?? url,
  );

  return { ...data, images } as ImageUploadResponse;
}

function normalizeUploadUri(uri: string): string {
  return Platform.OS === "android" ? uri : uri.replace("file://", "");
}

function guessVideoMimeType(filename: string, fallback = "video/mp4"): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "mov":
      return "video/quicktime";
    case "webm":
      return "video/webm";
    case "m4v":
      return "video/x-m4v";
    case "3gp":
    case "3gpp":
      return "video/3gpp";
    default:
      return fallback;
  }
}

export async function uploadListingVideos(
  categorySlug: CategorySlug,
  items: Array<{ uri: string; duration?: number; mimeType?: string; order?: number }>,
): Promise<VideoUploadResponse> {
  const buildFormData = () => {
    const formData = new FormData();
    const metadata: Array<{ duration?: number; order?: number }> = [];

    for (const item of items) {
      const filename = item.uri.split("/").pop() || `video_${Date.now()}.mp4`;
      const mimeType = item.mimeType || guessVideoMimeType(filename);

      formData.append("videos", {
        uri: normalizeUploadUri(item.uri),
        name: filename,
        type: mimeType,
      } as unknown as Blob);

      metadata.push({
        duration: normalizeVideoDurationSeconds(item.duration),
        order: item.order,
      });
    }

    formData.append("metadata", JSON.stringify(metadata));
    return formData;
  };

  const url = `${AUTH_API_BASE_URL}${categoryApiBase(categorySlug)}/upload-videos`;
  const response = await authenticatedMultipartPost(url, buildFormData, {
    timeoutMs: 180_000,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      (data as { message?: string })?.message ||
      (response.status === 401
        ? "Your session expired. Please sign in again."
        : "Video upload failed");
    throw new AuthApiError(message, response.status, data);
  }

  const rawVideos: ListingVideoEntry[] = (data as VideoUploadResponse).videos ?? [];
  const videos = rawVideos.map((video) => ({
    ...video,
    url: resolveAbsoluteMediaUrl(video.url) ?? video.url,
    thumbnailUrl: video.thumbnailUrl
      ? resolveAbsoluteMediaUrl(video.thumbnailUrl) ?? video.thumbnailUrl
      : undefined,
  }));

  return { ...(data as VideoUploadResponse), videos };
}

// ── My Listings (all categories unified) ───────────────────────────────────────

export async function fetchMyListings(): Promise<ListingsResponse> {
  return withStaleCache(
    cacheKeys.myListings(),
    async () => {
      const data = await apiRequest<ListingsResponse>("/api/feed/my-listings");
      data.listings = (data.listings || []).map(normaliseListingImages);
      return data;
    },
    30_000,
  );
}

// ── Saved Listings (all categories unified) ────────────────────────────────────

export async function fetchSavedListings(): Promise<ListingsResponse> {
  return withStaleCache(
    cacheKeys.savedListings(),
    async () => {
      const data = await apiRequest<ListingsResponse>("/api/feed/saved");
      data.listings = (data.listings || []).map(normaliseListingImages);
      return data;
    },
    30_000,
  );
}

// ── Recently Viewed (local AsyncStorage) ───────────────────────────────────────

const RECENTLY_VIEWED_KEY = "@listify/recently_viewed";
const MAX_RECENTLY_VIEWED = 20;

export type RecentlyViewedItem = {
  _id: string;
  title: string;
  price?: number;
  currency?: string;
  images: string[];
  category: string;
  countryCode?: string;
  createdAt?: string;
  sellerId?: string;
  viewedAt: number;
  /** The user's location label at the moment the item was viewed. */
  viewedLocation?: string;
  /** Listing ISO 3166-1 alpha-2 country code (e.g. "US", "IN"). */
  isoCountryCode?: string;
  /** GeoJSON point or { lat, lng } — used to show km/mi on home cards. */
  coordinates?: ListingItem["coordinates"];
};

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

export async function addToRecentlyViewed(
  item: ListingItem,
  locationLabel?: string,
  isoCountryCode?: string | null,
): Promise<void> {
  // ── 1. AsyncStorage (works for guests + offline) ────────────────────────
  try {
    const raw = await AsyncStorage.getItem(RECENTLY_VIEWED_KEY);
    const existing: RecentlyViewedItem[] = raw ? JSON.parse(raw) : [];
    // Remove duplicate and items older than 2 days
    const now = Date.now();
    const filtered = existing.filter((i) => i._id !== item._id && now - i.viewedAt < TWO_DAYS_MS);
    filtered.unshift({
      _id: item._id,
      title: item.title,
      price: item.price,
      currency: item.currency,
      images: item.images,
      category: item.category,
      createdAt: item.createdAt,
      sellerId: getListingSellerId(item) ?? undefined,
      viewedAt: Date.now(),
      viewedLocation: locationLabel || undefined,
      countryCode: item.countryCode ?? isoCountryCode ?? undefined,
      isoCountryCode: item.countryCode ?? isoCountryCode ?? undefined,
      coordinates: item.coordinates,
    });
    await AsyncStorage.setItem(
      RECENTLY_VIEWED_KEY,
      JSON.stringify(filtered.slice(0, MAX_RECENTLY_VIEWED)),
    );
  } catch {
    // silently fail
  }

  // ── 2. Server-side Redis (authenticated users — 2-day TTL) ─────────────
  // Fire-and-forget; never blocks the detail screen from loading.
  const token = getAccessToken();
  if (token) {
    const postView = async () => {
      try {
        await fetch(`${AUTH_API_BASE_URL}/api/search/view`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            _id: item._id,
            _entity: item.category,
            title: item.title,
            price: item.price,
            currency: (item as { currency?: string }).currency,
            image: item.images?.[0] ?? null,
            countryCode: isoCountryCode ?? undefined,
          }),
        });
      } catch {
        // Non-critical — ignore silently
      }
    };
    postView();
  }
}

export async function getRecentlyViewed(isoCountryCode?: string | null): Promise<RecentlyViewedItem[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENTLY_VIEWED_KEY);
    if (!raw) return [];
    const items: RecentlyViewedItem[] = JSON.parse(raw);
    const now = Date.now();
    // Filter out expired items, then filter strictly by country when set.
    // When the user has a country selected, only show items from that same country
    // (items with no isoCountryCode, i.e. recorded before this feature, are also
    // excluded so cross-country pollution does not surface).
    return items.filter((i) => {
      if (now - i.viewedAt >= TWO_DAYS_MS) return false;
      const itemCountryCode = i.countryCode ?? i.isoCountryCode;
      if (isoCountryCode && itemCountryCode !== isoCountryCode) return false;
      return true;
    });
  } catch {
    return [];
  }
}

/**
 * Splits recently-viewed items into two buckets:
 * - `nearYou`: items viewed while the user was in the same city as `currentLocationLabel`
 * - `others`: everything else, sorted by most recently viewed
 *
 * Matching is done on the first comma-segment (city) of both labels, case-insensitive.
 * If `currentLocationLabel` is empty/falsy all items fall into `others`.
 */
export function partitionRecentlyViewedByLocation(
  items: RecentlyViewedItem[],
  currentLocationLabel: string | null | undefined,
): { nearYou: RecentlyViewedItem[]; others: RecentlyViewedItem[] } {
  const normalise = (label: string) =>
    label.split(",")[0].trim().toLowerCase();

  const currentCity = currentLocationLabel ? normalise(currentLocationLabel) : null;

  const nearYou: RecentlyViewedItem[] = [];
  const others: RecentlyViewedItem[] = [];

  for (const item of items) {
    if (currentCity && item.viewedLocation) {
      const viewedCity = normalise(item.viewedLocation);
      if (viewedCity === currentCity || item.viewedLocation.toLowerCase().includes(currentCity)) {
        nearYou.push(item);
        continue;
      }
    }
    others.push(item);
  }

  return { nearYou, others };
}
