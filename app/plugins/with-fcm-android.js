const {
  withAndroidManifest,
  withDangerousMod,
  AndroidConfig,
} = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const DEFAULT_CHANNEL_ID = "general";
const DEFAULT_ICON = "@drawable/ic_notification";
const DEFAULT_COLOR = "#27BB97";

/**
 * Ensures FCM + Notifee work in release APK/AAB:
 * - Default notification icon + color (required when system shows a fallback tray notification)
 * - Default notification channel (Android 8+)
 * - Copies google-services.json into android/app during prebuild
 */
function withFcmAndroid(config) {
  config = withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);

    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      app,
      "com.google.firebase.messaging.default_notification_icon",
      DEFAULT_ICON,
      "resource",
    );
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      app,
      "com.google.firebase.messaging.default_notification_color",
      DEFAULT_COLOR,
      "resource",
    );
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      app,
      "com.google.firebase.messaging.default_notification_channel_id",
      DEFAULT_CHANNEL_ID,
      "value",
    );

    return cfg;
  });

  config = withDangerousMod(config, [
    "android",
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const androidAppDir = path.join(cfg.modRequest.platformProjectRoot, "app");
      const googleServicesSource = path.join(projectRoot, "google-services.json");

      if (fs.existsSync(googleServicesSource)) {
        fs.mkdirSync(androidAppDir, { recursive: true });
        fs.copyFileSync(
          googleServicesSource,
          path.join(androidAppDir, "google-services.json"),
        );
      }

      const proguardDir = path.join(androidAppDir, "proguard-rules");
      fs.mkdirSync(proguardDir, { recursive: true });
      const proguardPath = path.join(proguardDir, "fcm-notifee.pro");
      if (!fs.existsSync(proguardPath)) {
        fs.writeFileSync(
          proguardPath,
          `# FCM + Notifee — keep rules for release R8/minify
-keep class com.google.firebase.** { *; }
-keep class io.invertase.firebase.** { *; }
-dontwarn com.google.firebase.**
-keep class app.notifee.** { *; }
-keep class com.facebook.react.bridge.** { *; }
`,
          "utf8",
        );
      }

      return cfg;
    },
  ]);

  return config;
}

module.exports = withFcmAndroid;
