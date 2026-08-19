import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const SECURE_TOKEN_KEY = "listify_auth_tokens";
const LEGACY_TOKEN_KEY = "@listify/auth_tokens";

export type StoredTokens = {
  accessToken: string | null;
  refreshToken: string | null;
};

export async function readStoredTokens(): Promise<StoredTokens | null> {
  try {
    let raw: string | null = null;

    try {
      raw = await SecureStore.getItemAsync(SECURE_TOKEN_KEY);
    } catch {
      raw = null;
    }

    if (!raw) {
      raw = await AsyncStorage.getItem(LEGACY_TOKEN_KEY);
      if (raw) {
        try {
          await SecureStore.setItemAsync(SECURE_TOKEN_KEY, raw);
          await AsyncStorage.removeItem(LEGACY_TOKEN_KEY);
        } catch {
          // SecureStore unavailable — keep legacy AsyncStorage copy.
        }
      }
    }

    if (!raw) return null;

    const parsed = JSON.parse(raw) as StoredTokens;
    return {
      accessToken: parsed.accessToken ?? null,
      refreshToken: parsed.refreshToken ?? null,
    };
  } catch {
    return null;
  }
}

export async function writeStoredTokens(tokens: StoredTokens | null) {
  if (!tokens?.accessToken && !tokens?.refreshToken) {
    await Promise.all([
      SecureStore.deleteItemAsync(SECURE_TOKEN_KEY).catch(() => {}),
      AsyncStorage.removeItem(LEGACY_TOKEN_KEY).catch(() => {}),
    ]);
    return;
  }

  const payload = JSON.stringify(tokens);

  try {
    await SecureStore.setItemAsync(SECURE_TOKEN_KEY, payload);
    await AsyncStorage.removeItem(LEGACY_TOKEN_KEY).catch(() => {});
  } catch {
    // SecureStore can fail on some dev builds — persist tokens so 7-day sessions survive restarts.
    await AsyncStorage.setItem(LEGACY_TOKEN_KEY, payload);
  }
}
