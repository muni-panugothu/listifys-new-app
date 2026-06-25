const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("expo/config-plugins");

const NOTIFICATION_COLOR_NAME = "listifys_notification_color";
const NOTIFICATION_COLOR = "#27BB97";

function ensureNotificationColor(valuesDir) {
  fs.mkdirSync(valuesDir, { recursive: true });
  const colorsPath = path.join(valuesDir, "colors.xml");
  const colorEntry = `  <color name="${NOTIFICATION_COLOR_NAME}">${NOTIFICATION_COLOR}</color>`;
  if (fs.existsSync(colorsPath)) {
    let colorsXml = fs.readFileSync(colorsPath, "utf8");
    if (!colorsXml.includes(`name="${NOTIFICATION_COLOR_NAME}"`)) {
      colorsXml = colorsXml.replace("</resources>", `${colorEntry}\n</resources>`);
      fs.writeFileSync(colorsPath, colorsXml, "utf8");
    }
  } else {
    fs.writeFileSync(
      colorsPath,
      `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n${colorEntry}\n</resources>\n`,
      "utf8",
    );
  }
}

/**
 * Copies Listifys project keystores into the generated Android project during prebuild.
 * Debug: used by `expo run:android` and local APK installs.
 */
function withListifysAndroidSigning(config) {
  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const androidAppDir = path.join(cfg.modRequest.platformProjectRoot, "app");
      const debugSource = path.join(projectRoot, "signing", "debug.keystore");
      const googleServicesSource = path.join(projectRoot, "google-services.json");

      if (fs.existsSync(debugSource)) {
        fs.mkdirSync(androidAppDir, { recursive: true });
        fs.copyFileSync(debugSource, path.join(androidAppDir, "debug.keystore"));
      }

      if (fs.existsSync(googleServicesSource)) {
        fs.mkdirSync(androidAppDir, { recursive: true });
        fs.copyFileSync(googleServicesSource, path.join(androidAppDir, "google-services.json"));
      }

      const androidAssetsDir = path.join(projectRoot, "assets", "android");
      const drawableDir = path.join(
        cfg.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
        "drawable",
      );
      if (fs.existsSync(androidAssetsDir)) {
        fs.mkdirSync(drawableDir, { recursive: true });
        for (const file of fs.readdirSync(androidAssetsDir)) {
          if (file.endsWith(".xml")) {
            fs.copyFileSync(
              path.join(androidAssetsDir, file),
              path.join(drawableDir, file),
            );
          }
        }
      }

      ensureNotificationColor(
        path.join(cfg.modRequest.platformProjectRoot, "app", "src", "main", "res", "values"),
      );

      return cfg;
    },
  ]);
}

module.exports = withListifysAndroidSigning;
