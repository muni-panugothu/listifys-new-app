/**
 * Build/install Android dev client with adb reverse + localhost Metro host.
 * Use this instead of bare `npx expo run:android` on Windows USB devices.
 */
const { spawnSync, spawn } = require("child_process");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const npx = process.platform === "win32" ? "npx.cmd" : "npx";

run("node", ["./scripts/clean-android-native.js"]);
run("node", ["./scripts/adb-reverse-dev.js"]);

const env = {
  ...process.env,
  REACT_NATIVE_PACKAGER_HOSTNAME: "localhost",
};

console.log("Building Android dev client (Metro will use localhost + adb reverse)...");

const child = spawn(
  npx,
  ["expo", "run:android", "--all-arch", ...process.argv.slice(2)],
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
