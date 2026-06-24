const {
  withAndroidManifest,
  withDangerousMod,
  AndroidConfig,
} = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const DEFAULT_CHANNEL_ID = "general";
const DEFAULT_ICON = "@drawable/ic_notification";
const NOTIFICATION_COLOR_NAME = "listifys_notification_color";
const NOTIFICATION_COLOR = "#27BB97";

function ensureToolsNamespace(manifestDocument) {
  const androidManifest = manifestDocument.manifest;
  if (!androidManifest) return;
  if (!androidManifest.$) androidManifest.$ = {};
  androidManifest.$["xmlns:tools"] = "http://schemas.android.com/tools";
}

/**
 * Upsert a <meta-data> entry on <application> with tools:replace so we win over
 * @react-native-firebase/messaging's library manifest placeholders.
 */
function upsertMetaDataWithReplace(app, { name, attr, value }) {
  if (!app["meta-data"]) app["meta-data"] = [];

  const existing = app["meta-data"].find((item) => item.$?.["android:name"] === name);
  const attrs = {
    "android:name": name,
    [attr]: value,
    "tools:replace": attr,
  };

  if (existing) {
    existing.$ = { ...existing.$, ...attrs };
  } else {
    app["meta-data"].push({ $: attrs });
  }
}

/**
 * Ensures FCM + Notifee work in release APK/AAB:
 * - Default notification icon + color (required when system shows a fallback tray notification)
 * - Default notification channel (Android 8+)
 * - Copies google-services.json into android/app during prebuild
 */
function withFcmAndroid(config) {
  config = withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    ensureToolsNamespace(manifest);
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);

    upsertMetaDataWithReplace(app, {
      name: "com.google.firebase.messaging.default_notification_icon",
      attr: "android:resource",
      value: DEFAULT_ICON,
    });
    upsertMetaDataWithReplace(app, {
      name: "com.google.firebase.messaging.default_notification_color",
      attr: "android:resource",
      value: `@color/${NOTIFICATION_COLOR_NAME}`,
    });
    upsertMetaDataWithReplace(app, {
      name: "com.google.firebase.messaging.default_notification_channel_id",
      attr: "android:value",
      value: DEFAULT_CHANNEL_ID,
    });

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

      const valuesDir = path.join(androidAppDir, "src", "main", "res", "values");
      fs.mkdirSync(valuesDir, { recursive: true });
      const colorsPath = path.join(valuesDir, "colors.xml");
      const colorEntry = `  <color name="${NOTIFICATION_COLOR_NAME}">${NOTIFICATION_COLOR}</color>`;
      if (fs.existsSync(colorsPath)) {
        let colorsXml = fs.readFileSync(colorsPath, "utf8");
        if (!colorsXml.includes(`name="${NOTIFICATION_COLOR_NAME}"`)) {
          colorsXml = colorsXml.replace(
            "</resources>",
            `${colorEntry}\n</resources>`,
          );
          fs.writeFileSync(colorsPath, colorsXml, "utf8");
        }
      } else {
        fs.writeFileSync(
          colorsPath,
          `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n${colorEntry}\n</resources>\n`,
          "utf8",
        );
      }

      const notificationIconSource = path.join(
        projectRoot,
        "assets",
        "android",
        "ic_notification.xml",
      );
      const drawableDir = path.join(androidAppDir, "src", "main", "res", "drawable");
      if (fs.existsSync(notificationIconSource)) {
        fs.mkdirSync(drawableDir, { recursive: true });
        fs.copyFileSync(
          notificationIconSource,
          path.join(drawableDir, "ic_notification.xml"),
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
