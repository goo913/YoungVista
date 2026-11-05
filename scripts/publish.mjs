#!/usr/bin/env node
/**
 * YoungVista's iPhone app to App Store Connect, for TestFlight. The owner runs it; Claude Code
 * never uploads. docs/publishing/apple/testflight.md has every step around it.
 *
 *   npm run publish:iphone   raises the build number in apps/mobile/release.json, builds the App
 *                            Store version signed by Young Corporation of America, and uploads it
 *                            with the team's App Store Connect API key. TestFlight has it 10 to 30
 *                            minutes later.
 *
 * Options, after `--` (npm run publish:iphone -- --dry-run):
 *   --dry-run    build and sign, but upload nothing (the build number stays as it is). Ends with
 *                the upload command a real run would use.
 *   --no-bump    keep the build number as it is: after a run that stopped before the upload.
 *   --rebuild    make the native project again and build from scratch (as long as a first build).
 *   --unsigned   with --dry-run: build the archive without signing, then print the signing and
 *                upload commands. Contacts nobody and needs no Apple account (a check for Claude
 *                Code and engineers).
 *
 * What it needs once (testflight.md, "Once"): the app in App Store Connect, and in
 * apps/mobile/.publish/ (gitignored) appstore.json { "keyId", "issuerId", "appleId" } with the key
 * file AuthKey_<keyId>.p8 next to it, or in ~/.appstoreconnect/private_keys/.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  APP_ID,
  APP_NAME,
  COMPANY_TEAM_ID,
  capture,
  checkAppSettings,
  commandLine,
  explainXcodeProblem,
  help,
  logFile,
  main,
  nativeProject,
  note,
  ok,
  publishDir,
  readRelease,
  rel,
  releaseFile,
  signingTeam,
  stateDir,
  step,
  stop,
  tail,
  teamId,
  xcode,
  xcodeBuildDir,
  xcodebuild,
  xcodeProject,
} from './lib/mobile.mjs';

const args = process.argv.slice(2);
const command = args.find((a) => !a.startsWith('-')) ?? 'help';
const flags = new Set(args.filter((a) => a.startsWith('-')));
const dryRun = flags.has('--dry-run');
const unsigned = flags.has('--unsigned');
const keepNumber = flags.has('--no-bump') || dryRun;
const rebuild = flags.has('--rebuild');

/** YCACLOCK's Apple ID (its App Store link): appstore.json copied from YCACLOCK still has it. */
const YCACLOCK_APPLE_ID = '6817023135';
const GUIDE = 'docs/publishing/apple/testflight.md, "Once"';
const KEY_STEP = `${GUIDE}, step 3, says how: copy YCACLOCK's key, or make one. Then run this again.`;
const APP_STEPS = `${GUIDE}, steps 1 and 2: create YoungVista in App Store Connect and note its Apple ID. Then run this again.`;

/** The App Store Connect API key and the app's Apple ID from apps/mobile/.publish/; null parts on a dry run. */
function credentials() {
  const file = path.join(publishDir, 'appstore.json');
  const missing = (lines) => {
    if (!dryRun) stop(lines);
    note(`${[lines].flat()[0]} Fine for a dry run, which uploads nothing.`);
  };
  if (!fs.existsSync(file)) {
    missing([
      `The App Store Connect API key isn't set up for YoungVista: there is no ${rel(file)}.`,
      KEY_STEP,
    ]);
    return null;
  }
  let json;
  try {
    json = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    stop([
      `${rel(file)} isn't valid JSON. It should look like:`,
      '  { "keyId": "ABC123DEFG", "issuerId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", "appleId": "1234567890" }',
      KEY_STEP,
    ]);
  }
  const [keyId, issuerId, appleId] = ['keyId', 'issuerId', 'appleId'].map((k) =>
    String(json[k] ?? '').trim(),
  );
  if (!keyId || !issuerId) {
    missing([`${rel(file)} needs "keyId" and "issuerId".`, KEY_STEP]);
    return null;
  }
  const name = `AuthKey_${keyId}.p8`;
  const places = [publishDir, path.join(os.homedir(), '.appstoreconnect', 'private_keys')];
  const keyDir = places.find((dir) => fs.existsSync(path.join(dir, name)));
  if (!keyDir)
    missing([
      `The key file ${name} isn't in ${rel(publishDir)}/ or ~/.appstoreconnect/private_keys/.`,
      KEY_STEP,
    ]);
  if (!appleId)
    missing([
      `${rel(file)} needs "appleId": YoungVista's Apple ID, a number from App Store Connect.`,
      APP_STEPS,
    ]);
  else if (appleId === YCACLOCK_APPLE_ID) {
    stop([
      `${rel(file)} still has YCACLOCK's Apple ID (${appleId}): put YoungVista's there.`,
      APP_STEPS,
    ]);
  } else if (!/^\d+$/.test(appleId)) {
    stop([
      `"appleId" in ${rel(file)} should be the app's Apple ID, a number like 1234567890 (not "${appleId}").`,
      APP_STEPS,
    ]);
  }
  return { keyId, issuerId, appleId, keyDir };
}

/** Raises the build number (Apple takes each number once), unless --no-bump or --dry-run. */
function nextRelease() {
  const release = readRelease();
  if (keepNumber) {
    note(
      `${dryRun ? 'A dry run keeps' : 'Keeping'} the build number: ${APP_NAME} ${release.version} (build ${release.build}).`,
    );
    return release;
  }
  release.build += 1;
  fs.writeFileSync(releaseFile, `${JSON.stringify(release, null, 2)}\n`);
  ok(
    `${APP_NAME} ${release.version} (build ${release.build}): the build number went up in ${rel(releaseFile)}`,
  );
  return release;
}

/** The altool upload, as a real run makes it (placeholders where a dry run has no key yet). */
function uploadCommand(ipa, release, creds) {
  const env = creds?.keyDir === publishDir ? { API_PRIVATE_KEYS_DIR: publishDir } : {};
  const args = [
    'altool',
    '--upload-package',
    ipa,
    '--type',
    'ios',
    '--apple-id',
    creds?.appleId || '<appleId>',
    '--bundle-id',
    APP_ID,
    '--bundle-version',
    String(release.build),
    '--bundle-short-version-string',
    release.version,
    '--api-key',
    creds?.keyId || '<keyId>',
    '--api-issuer',
    creds?.issuerId || '<issuerId>',
    '--output-format',
    'json',
  ];
  return { env, args };
}

/** Apple's answer to a refused upload, in plain words when it is a known one. */
function explainUpload(messages, creds) {
  const text = messages.join('\n');
  if (/already been used|bundle version must be higher|previously uploaded/i.test(text)) {
    return 'Apple already has a build with this number: run npm run publish:iphone again (without --no-bump), so the number goes up.';
  }
  if (/agreement|PLA|terms and conditions/i.test(text)) {
    return "Apple wants an updated agreement accepted first, by the team's Account Holder (App Store Connect shows a banner). Then run this again with -- --no-bump.";
  }
  if (/No suitable application records|could not find|not found/i.test(text)) {
    return `App Store Connect has no app with the Apple ID ${creds.appleId} and the bundle ID ${APP_ID}: check "appleId" in apps/mobile/.publish/appstore.json (${GUIDE}, steps 1 and 2).`;
  }
  if (/authentic|API key|issuer|unauthorized|forbidden|401|403/i.test(text)) {
    return `App Store Connect refused the API key: check "keyId" and "issuerId" in apps/mobile/.publish/appstore.json, and that the key has App Manager access (${GUIDE}, step 3).`;
  }
  return null;
}

async function iphone() {
  if (unsigned && !dryRun)
    stop('--unsigned goes with --dry-run only: Apple takes signed builds only.');
  const creds = credentials();
  checkAppSettings('ios');
  const env = xcode();
  const team = unsigned
    ? {
        id: teamId(),
        name: teamId() === COMPANY_TEAM_ID ? 'Young Corporation of America' : teamId(),
      }
    : signingTeam();

  step('The version and build number');
  const release = nextRelease();
  const raised = !keepNumber;
  const tryAgain = raised
    ? [
        "Nothing reached App Store Connect. Once it is fixed, run npm run publish:iphone -- --no-bump, so the number this run raised isn't skipped.",
      ]
    : [];
  nativeProject('ios', env, { rebuild });
  if (rebuild) fs.rmSync(xcodeBuildDir, { recursive: true, force: true });
  const { workspace, scheme } = xcodeProject();

  const out = path.join(stateDir, 'publish');
  const archive = path.join(out, `${APP_NAME}.xcarchive`);
  const exportDir = path.join(out, 'ios');
  const options = path.join(out, 'ExportOptions.plist');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });

  step(
    `Building ${APP_NAME} ${release.version} (build ${release.build}) for the App Store, ${unsigned ? 'without signing' : `signed by ${team.name}`} (10 to 20 minutes the first time)`,
  );
  const signing = unsigned
    ? ['CODE_SIGNING_ALLOWED=NO']
    : ['-allowProvisioningUpdates', `DEVELOPMENT_TEAM=${team.id}`, 'CODE_SIGN_STYLE=Automatic'];
  const archiveLog = logFile('publish-archive.log');
  const archived = await xcodebuild(
    [
      '-workspace',
      workspace,
      '-scheme',
      scheme,
      '-configuration',
      'Release',
      '-destination',
      'generic/platform=iOS',
      '-archivePath',
      archive,
      '-derivedDataPath',
      xcodeBuildDir,
      ...signing,
      'COMPILER_INDEX_STORE_ENABLE=NO',
      'archive',
    ],
    { env, log: archiveLog },
  );
  if (!archived)
    stop(["The App Store build didn't finish.", ...explainXcodeProblem(archiveLog), ...tryAgain]);
  ok(`Archived: ${rel(archive)}`);

  // Signed for the App Store by Xcode's Apple ID, which may use the team's cloud-managed
  // distribution certificate (the owner is an Admin). Our build number, not Xcode's.
  fs.writeFileSync(
    options,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>export</string>
  <key>teamID</key><string>${team.id}</string>
  <key>signingStyle</key><string>automatic</string>
  <key>uploadSymbols</key><true/>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict></plist>
`,
  );
  const exportArgs = [
    '-exportArchive',
    '-archivePath',
    archive,
    '-exportPath',
    exportDir,
    '-exportOptionsPlist',
    options,
    '-allowProvisioningUpdates',
  ];
  if (unsigned) {
    // The .ipa the export makes is named after the app.
    const upload = uploadCommand(path.join(exportDir, `${APP_NAME}.ipa`), release, creds);
    console.log(
      `\n✓ Archived without signing: ${rel(archive)} (${APP_NAME} ${release.version}, build ${release.build}). Nothing was sent to Apple.`,
    );
    console.log('  A real run then signs it for the App Store:');
    console.log(`    ${commandLine('xcodebuild', exportArgs)}`);
    console.log('  and uploads it:');
    console.log(`    ${commandLine('xcrun', upload.args, upload.env)}\n`);
    return;
  }

  step('Signing it for the App Store (the .ipa Apple takes)');
  const exportLog = logFile('publish-export.log');
  const exported = await xcodebuild(exportArgs, { env, log: exportLog });
  const found = fs.existsSync(exportDir)
    ? fs.readdirSync(exportDir).find((f) => f.endsWith('.ipa'))
    : null;
  if (!exported || !found)
    stop([
      "The build didn't get signed for the App Store.",
      ...explainXcodeProblem(exportLog),
      ...tryAgain,
    ]);
  const ipa = path.join(exportDir, found);
  const upload = uploadCommand(ipa, release, creds);
  ok(`Signed: ${rel(ipa)}`);

  if (dryRun) {
    console.log(
      `\n✓ Ready to upload: ${rel(ipa)} (${APP_NAME} ${release.version}, build ${release.build}). Nothing was uploaded (--dry-run).`,
    );
    console.log('  A real run uploads it with:');
    console.log(`    ${commandLine('xcrun', upload.args, upload.env)}\n`);
    return;
  }

  step('Uploading it to App Store Connect (a few minutes)');
  const uploadLog = logFile('publish-upload.log');
  const sent = capture('xcrun', upload.args, { env: { ...env, ...upload.env } });
  fs.writeFileSync(uploadLog, sent.output);
  let answer = null;
  try {
    answer = JSON.parse(sent.output.slice(sent.output.indexOf('{')));
  } catch {
    /* not JSON: the log has it */
  }
  const errors = (answer?.['product-errors'] ?? []).map((e) => e.message ?? JSON.stringify(e));
  if (!sent.ok || errors.length) {
    const known = explainUpload(errors.length ? errors : [sent.output], creds);
    stop([
      "The upload to App Store Connect didn't go through:",
      ...errors.map((m) => `  ${m}`),
      ...(known ? [known] : [tail(uploadLog, 8)]),
      `Apple's whole answer: ${rel(uploadLog)}. Or ask Claude Code: "npm run publish:iphone fails", with that file.`,
    ]);
  }
  console.log(
    `\n✓ Uploaded ${APP_NAME} ${release.version} (build ${release.build}) to App Store Connect. TestFlight has it in 10 to 30 minutes;`,
  );
  console.log('  Apple emails when it is ready.');
  console.log(
    `  ${rel(releaseFile)} now says build ${release.build}: it goes into git with the next commit (ask Claude Code to`,
  );
  console.log('  "commit the build number"), so the next upload counts on from there.\n');
}

await main(async () => {
  if (flags.has('--help') || flags.has('-h')) return help(import.meta.url);
  if (command === 'iphone') return iphone();
  if (command !== 'help') note(`There is no "${command}" here.`);
  help(import.meta.url);
});
