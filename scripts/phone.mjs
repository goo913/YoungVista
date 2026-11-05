#!/usr/bin/env node
/**
 * YoungVista's phone app on a phone plugged into this Mac, with one command each. Each is a
 * Release build: the finished app with its code inside, as TestFlight's will be, so it runs
 * without the Mac and the scan's debug overlay (the bug button) is there. Every step that only a
 * person can do (unlock the phone, tap Trust) is said in plain words. docs/running-the-apps.md
 * explains it all.
 *
 *   npm run iphone     builds the app, signed by Young Corporation of America (the company's Apple
 *                      team), installs it on the iPhone plugged in by cable and opens it. Ends
 *                      with the day this copy stops opening.
 *   npm run android    builds the app, signed with the debug key (the one Firebase knows for
 *                      Google sign-in), installs it on the Android phone plugged in by cable
 *                      (USB debugging on) and opens it.
 *
 * Option, after `--` (npm run iphone -- --rebuild): --rebuild makes the native project again and
 * builds everything from scratch, for when a build is broken (as long as a first build).
 *
 * The native projects (apps/mobile/ios, apps/mobile/android) are made again only when what they
 * are made from changed. Logs go to apps/mobile/.expo/logs/.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  APP_ID,
  APP_NAME,
  androidDir,
  capture,
  checkAppSettings,
  explainXcodeProblem,
  help,
  logFile,
  main,
  nativeProject,
  note,
  ok,
  quietly,
  read,
  rel,
  step,
  stop,
  tail,
  xcode,
  xcodeBuildDir,
  xcodebuild,
  xcodeProject,
  signingTeam,
} from './lib/mobile.mjs';

const args = process.argv.slice(2);
const command = args.find((a) => !a.startsWith('-')) ?? 'help';
const flags = new Set(args.filter((a) => a.startsWith('-')));
const rebuild = flags.has('--rebuild');

// ---------------------------------------------------------------------------------------------
// iPhone

/** The iPhone plugged into this Mac and ready for an app from it, or a stop that says what to do. */
function connectedIphone(env) {
  const out = path.join(os.tmpdir(), `youngvista-devices-${process.pid}.json`);
  read('xcrun', ['devicectl', 'list', 'devices', '--json-output', out], { env });
  let devices = [];
  try {
    devices = JSON.parse(fs.readFileSync(out, 'utf8')).result.devices;
  } catch {
    /* none */
  }
  fs.rmSync(out, { force: true });
  // Real iPhones only: devicectl lists this Mac's simulators too.
  const iphones = devices.filter(
    (d) =>
      d.hardwareProperties?.deviceType === 'iPhone' &&
      !['virtual', 'simulated'].includes(d.hardwareProperties?.reality) &&
      d.connectionProperties?.transportType !== 'sameMachine',
  );
  const reachable = (d) =>
    d.connectionProperties?.tunnelState === 'connected' ||
    d.connectionProperties?.transportType === 'wired';
  const phone =
    iphones.find(reachable) ?? iphones.find((d) => d.connectionProperties?.transportType);
  if (!phone) {
    const known = iphones.map((d) => d.deviceProperties?.name).filter(Boolean);
    stop([
      `No iPhone is plugged in${known.length ? ` (this Mac knows ${known.join(', ')}, but it isn't connected now)` : ''}.`,
      'Plug the iPhone into this Mac with its cable and unlock it. If it asks "Trust This Computer?", tap Trust and enter',
      'its passcode; if the Mac asks to allow the accessory, click Allow. Then run this again.',
    ]);
  }
  const name = phone.deviceProperties?.name ?? 'your iPhone';
  if (
    phone.connectionProperties?.pairingState &&
    phone.connectionProperties.pairingState !== 'paired'
  ) {
    stop([
      `${name} doesn't trust this Mac yet. Unlock it, and when it asks "Trust This Computer?", tap Trust and enter its passcode.`,
      'Then run this again.',
    ]);
  }
  if (phone.deviceProperties?.developerModeStatus === 'disabled') {
    stop([
      `Developer Mode is off on ${name}. On the iPhone: Settings → Privacy & Security → Developer Mode (at the very bottom) →`,
      'turn it on → Restart. After the restart, unlock it, tap Turn On and enter the passcode. Then run this again.',
    ]);
  }
  return { name, udid: phone.hardwareProperties?.udid ?? phone.identifier };
}

/** The signing profile inside a built app: when it stops opening, and for which team. */
function readProfile(app) {
  const file = path.join(app, 'embedded.mobileprovision');
  const plist = fs.existsSync(file) ? read('security', ['cms', '-D', '-i', file]) : null;
  const value = (key, tag) =>
    new RegExp(`<key>${key}</key>\\s*<${tag}>([^<]+)</${tag}>`).exec(plist ?? '')?.[1];
  const expires = value('ExpirationDate', 'date');
  return { expires: expires ? new Date(expires) : null, team: value('TeamName', 'string') };
}

const TRUST_STEPS = [
  '  On the iPhone: Settings → General → VPN & Device Management → under "Developer App", tap',
  `  Young Corporation of America → Trust. Then open ${APP_NAME}.`,
];

async function iphone() {
  checkAppSettings('ios');
  const env = xcode();
  const team = signingTeam();
  const phone = connectedIphone(env);
  nativeProject('ios', env, { rebuild });
  if (rebuild) fs.rmSync(xcodeBuildDir, { recursive: true, force: true });
  const { workspace, scheme } = xcodeProject();

  step(
    `Building ${APP_NAME} for ${phone.name}, signed by ${team.name} (10 to 20 minutes the first time)`,
  );
  // -allowProvisioningUpdates lets Xcode do the signing set-up the first time: register the app's
  // ID and this iPhone with the team, and make the profile.
  const log = logFile('iphone-build.log');
  const built = await xcodebuild(
    [
      '-workspace',
      workspace,
      '-scheme',
      scheme,
      '-configuration',
      'Release',
      '-destination',
      `id=${phone.udid}`,
      '-derivedDataPath',
      xcodeBuildDir,
      '-allowProvisioningUpdates',
      '-allowProvisioningDeviceRegistration',
      `DEVELOPMENT_TEAM=${team.id}`,
      'CODE_SIGN_STYLE=Automatic',
      'COMPILER_INDEX_STORE_ENABLE=NO',
      'build',
    ],
    { env, log },
  );
  if (!built) stop([`The app didn't build for ${phone.name}.`, ...explainXcodeProblem(log)]);
  const app = path.join(xcodeBuildDir, 'Build', 'Products', 'Release-iphoneos', `${scheme}.app`);

  step(`Installing it on ${phone.name} (keep the iPhone unlocked)`);
  const installLog = logFile('iphone-install.log');
  const installed = capture(
    'xcrun',
    ['devicectl', 'device', 'install', 'app', '--device', phone.udid, app],
    { env },
  );
  fs.writeFileSync(installLog, installed.output);
  if (!installed.ok) {
    stop([
      `The app built but didn't install on ${phone.name}:`,
      tail(installLog, 6),
      ...explainXcodeProblem(installLog),
    ]);
  }
  const launched = capture(
    'xcrun',
    [
      'devicectl',
      'device',
      'process',
      'launch',
      '--terminate-existing',
      '--device',
      phone.udid,
      APP_ID,
    ],
    { env },
  );

  const profile = readProfile(app);
  console.log(
    `\n✓ ${APP_NAME} is on ${phone.name}, signed by ${profile.team ?? team.name}, and runs without the Mac.`,
  );
  if (!launched.ok) {
    if (/trust|profile|security|denied|invalid code signature/i.test(launched.output)) {
      console.log(
        "  It didn't open: the iPhone doesn't trust the company's apps yet (once per iPhone).",
      );
      TRUST_STEPS.forEach((line) => console.log(line));
    } else if (/locked/i.test(launched.output)) {
      console.log(`  Unlock the iPhone and open ${APP_NAME}.`);
    } else {
      console.log(`  Open ${APP_NAME} on the iPhone (it didn't open by itself).`);
    }
  }
  if (profile.expires) {
    const when = profile.expires.toLocaleString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    console.log(
      `  This copy keeps opening until ${when}. Before then, plug the iPhone in and run npm run iphone again.`,
    );
  }
  console.log(
    '  After a change to the app, run npm run iphone again: only what changed is built again.\n',
  );
}

// ---------------------------------------------------------------------------------------------
// Android

/** The Android SDK's tools and Java 17, which builds the Android app. */
function androidTools() {
  const sdk = process.env.ANDROID_HOME || path.join(os.homedir(), 'Library', 'Android', 'sdk');
  const adb = path.join(sdk, 'platform-tools', 'adb');
  if (!fs.existsSync(adb)) {
    stop([
      "Android Studio (with its Android SDK) isn't installed. Download it from https://developer.android.com/studio,",
      'open it once and click through its Standard setup. Then run this again.',
    ]);
  }
  const java = [
    '/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home',
    process.env.JAVA_HOME,
    '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
  ].find((j) => j && fs.existsSync(path.join(j, 'bin', 'java')));
  if (!java)
    stop(
      'The Android app needs Java 17. In Terminal: brew install openjdk@17. Then run this again.',
    );
  const env = {
    ...process.env,
    ANDROID_HOME: sdk,
    JAVA_HOME: java,
    PATH: `${sdk}/platform-tools:${process.env.PATH}`,
  };
  return { env, adb };
}

/** The Android phone plugged in with USB debugging allowed for this Mac (ANDROID_SERIAL picks one). */
function connectedAndroid({ env, adb }) {
  const chosen = process.env.ANDROID_SERIAL?.trim();
  const phones = (read(adb, ['devices', '-l'], { env }) ?? '')
    .split('\n')
    .slice(1)
    .map((l) => l.trim().split(/\s+/))
    .filter(
      ([serial, state]) =>
        serial && state && (chosen ? serial === chosen : !serial.startsWith('emulator-')),
    )
    .map(([serial, state, ...more]) => ({
      serial,
      state,
      model:
        more
          .find((m) => m.startsWith('model:'))
          ?.slice(6)
          .replace(/_/g, ' ') ?? 'your Android phone',
    }));
  const phone = phones.find((p) => p.state === 'device');
  if (phone) return phone;
  if (phones.some((p) => p.state === 'unauthorized')) {
    stop([
      'The phone is plugged in but hasn\'t allowed this Mac yet. Unlock it: on "Allow USB debugging?", tick "Always allow',
      'from this computer" and tap Allow. Then run this again.',
    ]);
  }
  stop([
    'No Android phone is plugged in with USB debugging on. The first time, on the phone:',
    '  1. Settings → About phone → tap Build number 7 times (it says you are now a developer).',
    '  2. Settings → System → Developer options → USB debugging: on.',
    '  3. Plug it into this Mac. On "Allow USB debugging?", tick "Always allow from this computer" and tap Allow.',
    'Then run this again.',
  ]);
}

async function android() {
  checkAppSettings('android');
  const tools = androidTools();
  const phone = connectedAndroid(tools);
  nativeProject('android', tools.env, { rebuild });

  step(`Building ${APP_NAME} for ${phone.model} (10 to 20 minutes the first time)`);
  // Gradle bundles the app's code again only when a file inside apps/mobile changed: not for
  // packages/core, nor for .env. Without its last bundle, it makes it afresh (a minute).
  for (const dir of ['assets', 'res']) {
    fs.rmSync(path.join(androidDir, 'app', 'build', 'generated', dir, 'react', 'release'), {
      recursive: true,
      force: true,
    });
  }
  quietly(
    './gradlew',
    ['app:assembleRelease', '--console=plain', ...(rebuild ? ['--rerun-tasks'] : [])],
    {
      cwd: androidDir,
      env: tools.env,
      log: logFile('android-build.log'),
      problem:
        "The Android app didn't build; the lines above say why. Run this again (or with -- --rebuild), or ask Claude Code.",
    },
  );
  const apk = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
  ok(`Built ${rel(apk)}`);

  step(`Installing it on ${phone.model} (keep the phone unlocked)`);
  const installed = capture(tools.adb, ['-s', phone.serial, 'install', '-r', apk], {
    env: tools.env,
  });
  if (!installed.ok) {
    stop([
      `The app built but didn't install on ${phone.model}:`,
      installed.output.split('\n').slice(-3).join('\n'),
      /UPDATE_INCOMPATIBLE|signatures do not match/i.test(installed.output)
        ? `The phone has a ${APP_NAME} signed differently: delete ${APP_NAME} from the phone, then run this again.`
        : 'Unlock the phone, check it still allows USB debugging for this Mac, then run this again.',
    ]);
  }
  read(
    tools.adb,
    [
      '-s',
      phone.serial,
      'shell',
      'monkey',
      '-p',
      APP_ID,
      '-c',
      'android.intent.category.LAUNCHER',
      '1',
    ],
    { env: tools.env },
  );
  console.log(
    `\n✓ ${APP_NAME} is on ${phone.model}, and runs without the Mac. It keeps opening until a newer copy replaces it.`,
  );
  console.log('  After a change to the app, run npm run android again.\n');
}

await main(async () => {
  if (flags.has('--help') || flags.has('-h')) return help(import.meta.url);
  if (command === 'iphone') return iphone();
  if (command === 'android') return android();
  if (command !== 'help') note(`There is no "${command}" here.`);
  help(import.meta.url);
});
