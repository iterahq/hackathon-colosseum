#!/usr/bin/env node
// Provenance: devfellowship/dfl-lesson-studio, apps/ios/scripts/check-expo-go-sdk.mjs, commit e90a642c4f7a7f4b9651895270a3f489cffc84a7.
// Changed: messages name apps/mobile instead of apps/ios; nothing else.
/**
 * The shell SDK must be the SDK that the current Expo Go ships (plan
 * 20261002-lesson-studio-native-migration, T22, ADR-6 / section 8).
 *
 * Expo Go runs ONE SDK. When the store version of Expo Go moves to SDK N+1 the
 * phone cannot open an SDK N shell, and the old preview setup broke twice this way.
 * This check reads the `expo` range of apps/mobile/package.json and the public
 * Expo versions endpoint (`expoGoSdkVersion`, the SDK of the Expo Go on the App
 * Store), and fails when the two majors differ.
 *
 * Exit codes: 0 same SDK, 1 different SDK, 2 could not read one of the two
 * (never a pass: an unread value is not a match).
 * Test seam: `--expo-go-sdk <x.y.z>` replaces the network read.
 */
import { readFileSync } from 'node:fs';

const URL_VERSIONS = 'https://api.expo.dev/v2/versions/latest';
const args = process.argv.slice(2);
const flag = args.indexOf('--expo-go-sdk');
const fail = (code, msg) => {
  console.error(`check-expo-go-sdk: ${msg}`);
  process.exit(code);
};

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const range = pkg.dependencies?.expo;
const shell = /(\d+)\.\d+\.\d+/.exec(range ?? '')?.[1];
if (!shell) fail(2, `no readable "expo" range in apps/mobile/package.json (got ${JSON.stringify(range)})`);

let goSdk;
if (flag !== -1) goSdk = args[flag + 1];
else {
  try {
    const res = await fetch(URL_VERSIONS, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) fail(2, `${URL_VERSIONS} answered ${res.status}`);
    goSdk = (await res.json())?.data?.expoGoSdkVersion;
  } catch (e) {
    fail(2, `cannot read ${URL_VERSIONS}: ${e.message}`);
  }
}
const go = /^(\d+)\./.exec(goSdk ?? '')?.[1];
if (!go) fail(2, `no readable expoGoSdkVersion (got ${JSON.stringify(goSdk)})`);

console.log(`shell SDK ${shell} (expo ${range}); Expo Go on the App Store runs SDK ${go} (${goSdk})`);
if (shell !== go) {
  fail(1, `SDK drift: the shell is SDK ${shell}, Expo Go runs SDK ${go}. Move apps/mobile to SDK ${go} (npx expo install expo@^${go} --fix), or pin the phone to Expo Go for SDK ${shell}.`);
}
console.log('OK: same SDK');
