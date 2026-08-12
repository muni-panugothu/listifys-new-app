/**
 * Starts Expo with the best dev-server host for the current setup:
 * - USB Android device → localhost + adb reverse (most reliable on Windows)
 * - Otherwise → LAN IP (physical device on same Wi-Fi) or Expo default
 */
const os = require("os");
const { execSync, spawn } = require("child_process");

const VIRTUAL_INTERFACE_PATTERN =
  /vEthernet|WSL|Hyper-V|VirtualBox|VMware|Loopback|Tailscale|ZeroTier/i;
const PREFERRED_INTERFACE_PATTERN = /wi-?fi|wlan|wireless|ethernet/i;

function hasUsbAndroidDevice() {
  try {
    const output = execSync("adb devices", { encoding: "utf8" });
    return /\n\s*\S+\s+device\s*$/m.test(output);
  } catch {
    return false;
  }
}

function runAdbReverse() {
  try {
    execSync("adb reverse tcp:5000 tcp:5000", { stdio: "inherit" });
    execSync("adb reverse tcp:8081 tcp:8081", { stdio: "inherit" });
    console.log(
      "[adb] reverse tcp:5000 and tcp:8081 — device can use 127.0.0.1 for API + Metro",
    );
    return true;
  } catch {
    console.warn("[adb] reverse failed — connect phone via USB or use same Wi-Fi as your PC");
    return false;
  }
}

function getIpv4Candidates() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const [name, addresses] of Object.entries(interfaces)) {
    if (!Array.isArray(addresses)) continue;

    for (const address of addresses) {
      const family =
        typeof address.family === "string"
          ? address.family
          : String(address.family);
      if (family !== "IPv4" || address.internal) continue;

      candidates.push({
        name,
        address: address.address,
        preferred: PREFERRED_INTERFACE_PATTERN.test(name),
        virtual: VIRTUAL_INTERFACE_PATTERN.test(name),
      });
    }
  }

  return candidates;
}

function resolveLanIp() {
  const candidates = getIpv4Candidates().filter((entry) => !entry.virtual);
  const preferred = candidates.find((entry) => entry.preferred);
  if (preferred) return preferred.address;
  if (candidates[0]) return candidates[0].address;
  return null;
}

const extraArgs = process.argv.slice(2);
const usbDevice = hasUsbAndroidDevice();
const env = { ...process.env };
let hostFlag = "lan";

if (usbDevice) {
  runAdbReverse();
  env.REACT_NATIVE_PACKAGER_HOSTNAME = "localhost";
  hostFlag = "localhost";
  console.log("USB device detected — Metro host: localhost (via adb reverse)");
} else {
  const lanIp = resolveLanIp();
  if (lanIp) {
    env.REACT_NATIVE_PACKAGER_HOSTNAME = lanIp;
    console.log(`No USB device — Metro host: ${lanIp} (same Wi-Fi required)`);
  } else {
    console.warn("Could not determine LAN IP. Phone must reach your PC over the network.");
  }
}

const expoCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const child = spawn(
  expoCommand,
  ["expo", "start", "--host", hostFlag, ...extraArgs],
  {
    stdio: "inherit",
    env,
    shell: process.platform === "win32",
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
