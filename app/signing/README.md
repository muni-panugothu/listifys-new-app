# Listifys Android signing keys

Fresh keystores live in this folder (gitignored). Run from `app/`:

```bash
npm run android:sha1
```

## Firebase Cloud Messaging (push notifications)

Push uses **@react-native-firebase/messaging** + **Notifee** (not expo-notifications).

### Why dev works but release APK/AAB does not

Release builds are signed with a **different certificate** than debug. Firebase must know every SHA-1 used to sign the app.

1. Run verification (from `app/`):

```bash
npm run android:verify-firebase
```

2. In [Firebase Console](https://console.firebase.google.com/) → Project **listifys** → Project settings → Android app `com.listifys.app`:

| Certificate | SHA-1 |
|-------------|-------|
| Debug (`signing/debug.keystore`) | `C7:6E:C1:CB:3F:6B:0D:F8:B2:DC:DF:E3:78:0D:04:A0:48:72:D3:5F` |
| Release (`signing/release.keystore`) | `33:F2:F5:19:E2:E0:DE:92:77:F9:0A:2C:62:C5:67:C0:CD:D8:12:79` |
| **Play App Signing** (if on Play Store) | Play Console → Setup → App signing → **App signing key certificate** |

3. Download a fresh `google-services.json` and replace `app/google-services.json`.

4. Rebuild and reinstall (uninstall old app first):

```bash
eas build --profile preview --platform android
```

5. Sign in, allow notifications, then test from server:

```bash
cd ../server && node scripts/test-fcm-push.js <userId>
```

### Release logcat

Preview/production builds set `EXPO_PUBLIC_NOTIFICATION_DEBUG=1`. After install:

```bash
adb logcat | findstr Notifications
```

Look for `[Notifications:Token]`, `[Notifications:Sync]`, `[Notifications:Register]`.

## Google Cloud Console (project Listifys / 582870381419)

Open **APIs & Services → Credentials → Android client** for `com.listifys.app`.

Add these **SHA-1** fingerprints (you can remove the old ones):

| Build type | SHA-1 |
|------------|-------|
| Local debug (`expo run:android`) | `C7:6E:C1:CB:3F:6B:0D:F8:B2:DC:DF:E3:78:0D:04:A0:48:72:D3:5F` |
| Release / EAS APK | `33:F2:F5:19:E2:E0:DE:92:77:F9:0A:2C:62:C5:67:C0:CD:D8:12:79` |

After updating Console, **uninstall the app** from your phone and rebuild:

```bash
npx expo prebuild --platform android --clean
npx expo run:android
```

## Files

| File | Purpose |
|------|---------|
| `debug.keystore` | Local debug builds (password: `android`, alias: `androiddebugkey`) |
| `release.keystore` | EAS / Play Store (alias: `listifys-release`) |
| `release-password.txt` | Release keystore password (local only, gitignored) |
| `credentials.local.json` | EAS local credentials template (copy to `credentials.json` for EAS build) |

## EAS builds with the new release key

1. Copy `signing/credentials.local.json` → `app/credentials.json` (also gitignored).
2. Reset EAS Android credentials if an old upload key was used:
   ```bash
   eas credentials -p android
   ```
3. Build:
   ```bash
   eas build --profile preview --platform android
   ```
