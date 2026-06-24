/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("path");
const appJson = require("./app.json");

require("dotenv").config({ path: path.join(__dirname, ".env") });

/** Must match Google Cloud Console project "Listifys" (582870381419). Not Firebase. */
const GOOGLE_OAUTH_FALLBACK = {
  webClientId:
    "582870381419-m26s615uhqhcf6scj9rrov3s5qm8nb7n.apps.googleusercontent.com",
  androidClientId:
    "582870381419-mkv03be59hu8camecqif5cg7btkaesko.apps.googleusercontent.com",
  packageName: "com.listifys.app",
};

const webClientId =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() ||
  GOOGLE_OAUTH_FALLBACK.webClientId;
const androidClientId =
  process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim() ||
  GOOGLE_OAUTH_FALLBACK.androidClientId;
const iosClientId =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() || null;

const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || undefined;

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  ...appJson.expo,
  extra: {
    ...appJson.expo.extra,
    googleOAuth: {
      webClientId,
      androidClientId,
      iosClientId,
      packageName: GOOGLE_OAUTH_FALLBACK.packageName,
    },
    ...(apiBaseUrl ? { apiBaseUrl } : {}),
  },
  plugins: [
    "@react-native-firebase/app",
    "@react-native-firebase/messaging",
    "./plugins/with-fcm-android.js",
    ...((appJson.expo.plugins || []).map((plugin) => {
    if (plugin === "@react-native-google-signin/google-signin") {
      const clientIdForScheme = iosClientId || webClientId;
      const clientNumeric = clientIdForScheme?.replace(
        /\.apps\.googleusercontent\.com$/,
        "",
      );
      return [
        "@react-native-google-signin/google-signin",
        {
          iosUrlScheme: `com.googleusercontent.apps.${clientNumeric}`,
        },
      ];
    }
    return plugin;
  })),
    ["./plugins/with-google-sign-in-android.js", { webClientId }],
    "./plugins/with-listifys-android-signing.js",
  ],
};
