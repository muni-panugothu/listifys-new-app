import AsyncStorage from "@react-native-async-storage/async-storage";

import { clearAllCache, invalidateCache } from "@/lib/cache";

const HOME_FEED_CACHE_KEY = "@listify/home_feed_cache";
const RECENTLY_VIEWED_KEY = "@listify/recently_viewed";

/**
 * Clear user-scoped caches on logout / session invalidation.
 * Keeps onboarding flags and non-user prefs intact.
 */
export async function clearUserSessionCaches(): Promise<void> {
  clearAllCache();
  invalidateCache("feed:");
  invalidateCache("list:");
  invalidateCache("detail:");
  invalidateCache("events:");
  invalidateCache("my-listings");
  invalidateCache("saved-listings");
  invalidateCache("search:");

  await AsyncStorage.multiRemove([HOME_FEED_CACHE_KEY, RECENTLY_VIEWED_KEY]).catch(
    () => {},
  );
}
