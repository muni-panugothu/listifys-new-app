/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Verifies google-services.json matches Listifys signing keys.
 * Run from app/: node scripts/verify-firebase-android-config.js
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const projectRoot = path.join(__dirname, "..");
const googleServicesPath = path.join(projectRoot, "google-services.json");

const EXPECTED = {
  packageName: "com.listifys.app",
  projectId: "listifys",
  projectNumber: "582870381419",
  // From signing/README.md — update if keystores rotate
  documentedSha1: [
    "C76EC1CB3F6B0DF8B2DCDFE3780D04A04872D35F", // debug
    "33F2F519E2E0DE9277F90A2C62C567C0CDD81279", // release
  ],
};

function normalizeSha1(value) {
  return String(value || "")
    .replace(/:/g, "")
    .toUpperCase();
}

function readGoogleServices() {
  if (!fs.existsSync(googleServicesPath)) {
    console.error("MISSING: app/google-services.json");
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(googleServicesPath, "utf8"));
}

function extractCertificateHashes(config) {
  const hashes = [];
  for (const client of config.client || []) {
    const pkg = client?.client_info?.android_client_info?.package_name;
    if (pkg !== EXPECTED.packageName) continue;
    for (const oauth of client.oauth_client || []) {
      const hash = oauth?.android_info?.certificate_hash;
      if (hash) hashes.push(normalizeSha1(hash));
    }
  }
  return [...new Set(hashes)];
}

function tryKeytoolSha1(keystorePath, alias, storepass) {
  if (!fs.existsSync(keystorePath)) return null;
  try {
    const keytool = process.env.KEYTOOL_PATH || "keytool";
    const output = execSync(
      `"${keytool}" -list -v -keystore "${keystorePath}" -alias ${alias} -storepass ${storepass}`,
      { encoding: "utf8" },
    );
    const sha1 = output.match(/SHA1:\s*(.+)/i)?.[1]?.trim();
    return sha1 ? normalizeSha1(sha1) : null;
  } catch {
    return null;
  }
}

function main() {
  const config = readGoogleServices();
  const hashes = extractCertificateHashes(config);

  console.log("Listifys Firebase Android verification\n");
  console.log("Package:", EXPECTED.packageName);
  console.log("Project:", config.project_info?.project_id);
  console.log("Project number:", config.project_info?.project_number);

  if (config.project_info?.project_id !== EXPECTED.projectId) {
    console.error("\nFAIL: project_id mismatch — server uses listifys");
  }
  if (String(config.project_info?.project_number) !== EXPECTED.projectNumber) {
    console.error("\nFAIL: project_number mismatch — expected", EXPECTED.projectNumber);
  }

  console.log("\ngoogle-services.json certificate_hash entries:");
  if (!hashes.length) {
    console.error("  (none) — download a fresh google-services.json from Firebase Console");
  } else {
    for (const h of hashes) console.log(" ", h);
  }

  const signingDir = path.join(projectRoot, "signing");
  const debugSha1 = tryKeytoolSha1(
    path.join(signingDir, "debug.keystore"),
    "androiddebugkey",
    "android",
  );
  const releasePass = fs.existsSync(path.join(signingDir, "release-password.txt"))
    ? fs.readFileSync(path.join(signingDir, "release-password.txt"), "utf8").trim()
    : process.env.LISTIFYS_RELEASE_KEYSTORE_PASSWORD || "";
  const releaseSha1 = releasePass
    ? tryKeytoolSha1(
        path.join(signingDir, "release.keystore"),
        "listifys-release",
        releasePass,
      )
    : null;

  const localSha1 = [debugSha1, releaseSha1].filter(Boolean);
  if (localSha1.length) {
    console.log("\nLocal keystore SHA-1:");
    for (const h of localSha1) console.log(" ", h);
  } else {
    console.log("\nLocal keystores not found (gitignored) — see signing/README.md");
  }

  const allExpected = [...EXPECTED.documentedSha1, ...localSha1];
  const missing = allExpected.filter((h) => h && !hashes.includes(h));

  if (missing.length) {
    console.error("\nFAIL: google-services.json is missing SHA-1 fingerprints for:");
    for (const h of missing) console.error(" ", h);
    console.error(
      "\nFix:",
      "\n  1. Firebase Console → Project settings → Your apps → com.listifys.app",
      "\n  2. Add ALL SHA-1 (debug + release + Play App Signing if on Play Store)",
      "\n  3. Download fresh google-services.json → app/google-services.json",
      "\n  4. Rebuild: eas build --profile preview --platform android",
    );
    process.exit(1);
  }

  console.log("\nOK: google-services.json includes required signing certificate hashes.");
  console.log(
    "If release pushes still fail, also add Play App Signing SHA-1 from Play Console.",
  );
}

main();
