/**
 * What scripts/phone.mjs (npm run iphone, npm run android) and scripts/publish.mjs (npm run
 * publish:iphone) share: plain-English output and stops, the app's settings, Xcode and the Apple
 * team, and the native projects, made again only when what they are made from changed.
 */
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const mobile = path.join(root, 'apps', 'mobile');
export const iosDir = path.join(mobile, 'ios');
export const androidDir = path.join(mobile, 'android');
/** Build state, logs and outputs (gitignored, like all of .expo/). */
export const stateDir = path.join(mobile, '.expo');
/** Xcode's build folder, kept outside ios/ (which prebuild makes again) so builds stay quick. */
export const xcodeBuildDir = path.join(stateDir, 'xcode');
/** The App Store Connect key (gitignored): docs/publishing/apple/testflight.md. */
export const publishDir = path.join(mobile, '.publish');
export const releaseFile = path.join(mobile, 'release.json');

export const APP_ID = 'com.youngcorporation.youngvista';
export const APP_NAME = 'YoungVista';
/** Young Corporation of America, as in app.config.ts; APPLE_TEAM_ID overrides it there and here. */
export const COMPANY_TEAM_ID = 'L276BBUKFM';

export const step = (text) => console.log(`\n▸ ${text}`);
export const ok = (text) => console.log(`  ✓ ${text}`);
export const note = (text) => console.log(`  • ${text}`);
export const rel = (file) => path.relative(root, file);

/** A problem in plain words: printed as it is, then the command stops. */
export class Stop extends Error {}
export function stop(lines) {
  throw new Stop([lines].flat().join('\n'));
}

/** Runs a script's command with plain-English stops: ✗ and the message, exit code 1. */
export async function main(fn) {
  try {
    if (process.platform !== 'darwin') stop('The phone app commands run on a Mac.');
    await fn();
  } catch (e) {
    if (!(e instanceof Stop)) throw e;
    console.error(`\n✗ ${e.message}\n`);
    process.exit(1);
  }
}

/** Prints the comment at the top of a script, which is its help. */
export function help(scriptUrl) {
  const header = fs.readFileSync(fileURLToPath(scriptUrl), 'utf8').split('*/')[0];
  console.log(
    `${header
      .replace(/^#!.*\n\/\*\*\n/, '')
      .replace(/^ \* ?/gm, '')
      .trimEnd()}\n`,
  );
}

const interrupted = (r) => r.signal === 'SIGINT' || r.status === 130;

/** A command's output, or null when it fails (or does not exist). */
export function read(cmd, args, { cwd = root, env = process.env, input } = {}) {
  const r = spawnSync(cmd, args, {
    cwd,
    env,
    input,
    encoding: 'utf8',
    stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
  });
  return r.status === 0 ? r.stdout : null;
}

/** A command with its output and result together (an install, a launch). */
export function capture(cmd, args, { cwd = root, env = process.env } = {}) {
  const r = spawnSync(cmd, args, { cwd, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (interrupted(r)) process.exit(130);
  return { ok: r.status === 0, output: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
}

export const has = (cmd) =>
  spawnSync('/bin/sh', ['-c', `command -v ${cmd}`], { stdio: 'ignore' }).status === 0;

export function tail(file, lines = 25) {
  try {
    return fs.readFileSync(file, 'utf8').trimEnd().split('\n').slice(-lines).join('\n');
  } catch {
    return '';
  }
}

export function logFile(name) {
  const dir = path.join(stateDir, 'logs');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, name);
}

/**
 * A long step whose hundreds of lines go to `log`, not the screen (prebuild, Gradle). When it
 * fails: the end of the log, where the rest is, then the stop.
 */
export function quietly(cmd, args, { cwd = root, env = process.env, log, problem }) {
  const out = fs.openSync(log, 'w');
  const r = spawnSync(cmd, args, { cwd, env, stdio: ['ignore', out, out] });
  fs.closeSync(out);
  if (interrupted(r)) process.exit(130);
  if (r.status === 0) return;
  console.log(`\n${tail(log, 30)}\n`);
  stop([...[problem].flat(), `The whole log: ${rel(log)}`]);
}

/** xcodebuild, shown on screen through Expo's formatter and kept whole in `log`. True when it built. */
export function xcodebuild(args, { env, log }) {
  return new Promise((resolve) => {
    const file = fs.createWriteStream(log);
    const build = spawn('xcodebuild', args, {
      cwd: iosDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    // Expo's formatter; it also keeps a copy of the log in apps/mobile/.expo/.
    const formatter = path.join(root, 'node_modules', '.bin', 'excpretty');
    const pretty = fs.existsSync(formatter)
      ? spawn(formatter, [mobile], { stdio: ['pipe', 'inherit', 'inherit'] })
      : null;
    let status = null;
    let shown = !pretty;
    const done = () => status !== null && shown && file.end(() => resolve(status === 0));
    for (const stream of [build.stdout, build.stderr]) {
      stream.on('data', (chunk) => {
        file.write(chunk);
        if (pretty) pretty.stdin.write(chunk);
      });
    }
    pretty?.on('close', () => {
      shown = true;
      done();
    });
    build.on('close', (code) => {
      status = code ?? 1;
      pretty?.stdin.end();
      done();
    });
  });
}

/** A command line as it can be pasted into Terminal. */
export function commandLine(cmd, args, env = {}) {
  const quote = (s) => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);
  const vars = Object.entries(env).map(([k, v]) => `${k}=${quote(v)}`);
  return [...vars, cmd, ...args].map((s, i) => (i < vars.length ? s : quote(s))).join(' ');
}

// ---------------------------------------------------------------------------------------------
// The app's settings (apps/mobile/.env) and its version (apps/mobile/release.json).

function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '');
    values[m[1]] = value;
  }
  return values;
}

const envFile = (name) => {
  const file = path.join(mobile, name);
  return fs.existsSync(file) ? parseEnv(fs.readFileSync(file, 'utf8')) : {};
};

/** apps/mobile/.env and .env.local as Expo reads them; the shell's own variables win. */
export function appEnv() {
  return { ...envFile('.env'), ...envFile('.env.local'), ...process.env };
}

/**
 * Stops unless apps/mobile/.env has every setting .env.example lists (by name; values are never
 * shown). Expo writes them into the app when it is built, so a build without them can't sign in.
 */
export function checkAppSettings(platform) {
  const example = Object.keys(envFile('.env.example')).filter(
    (k) => k !== 'APPLE_TEAM_ID' && (platform === 'ios' || !k.includes('IOS')),
  );
  const how =
    "Copy the team's copy (from the YoungVista folder): cp .secrets/mobile.env apps/mobile/.env";
  if (!fs.existsSync(path.join(mobile, '.env'))) {
    stop([
      `The app's settings file, apps/mobile/.env, isn't there yet.`,
      how,
      'Then run this again.',
    ]);
  }
  const env = appEnv();
  const missing = example.filter((k) => !env[k]?.trim());
  if (missing.length) {
    stop([
      `apps/mobile/.env has no value for ${missing.join(', ')}.`,
      `${how} (or fill them in: apps/mobile/.env.example says where each comes from). Then run this again.`,
    ]);
  }
}

export function readRelease() {
  let release;
  try {
    release = JSON.parse(fs.readFileSync(releaseFile, 'utf8'));
  } catch {
    release = null;
  }
  if (
    !/^\d+\.\d+\.\d+$/.test(release?.version ?? '') ||
    !Number.isInteger(release?.build) ||
    release.build < 1
  ) {
    stop(
      'apps/mobile/release.json should say the version and build number, like { "version": "0.1.0", "build": 1 }.',
    );
  }
  return release;
}

// ---------------------------------------------------------------------------------------------
// Xcode and the Apple team.

/** Xcode, ready to build (licence agreed, first launch done): the environment Apple's tools run in. */
export function xcode() {
  const selected = read('xcode-select', ['-p'])?.trim();
  const dir =
    process.env.DEVELOPER_DIR ||
    (selected?.includes('.app/') ? selected : '/Applications/Xcode.app/Contents/Developer');
  if (!fs.existsSync(dir)) {
    stop([
      "Xcode isn't installed. It comes from the Mac App Store: search for Xcode, click Get, then Install.",
      'When it has finished, open Xcode once and click Agree. Then run this again.',
    ]);
  }
  const env = { ...process.env, DEVELOPER_DIR: dir };
  const version = spawnSync('xcodebuild', ['-version'], { env, encoding: 'utf8' });
  if (version.status !== 0) {
    stop(
      /licen[cs]e/i.test(`${version.stdout}${version.stderr}`)
        ? 'Xcode needs you to agree to its licence once: open Xcode, click Agree and enter your Mac password. Then run this again.'
        : "Xcode doesn't run yet. Open it once, let it finish setting up, then run this again.",
    );
  }
  if (spawnSync('xcodebuild', ['-checkFirstLaunchStatus'], { env, stdio: 'ignore' }).status !== 0) {
    stop(
      'Xcode still needs to finish setting up: open Xcode once and click Install if it asks. Then run this again.',
    );
  }
  if (!has('pod')) {
    stop(
      'The iPhone app needs CocoaPods. In Terminal: brew install cocoapods. Then run this again.',
    );
  }
  return env;
}

/** The team that signs the iPhone app: APPLE_TEAM_ID (shell or apps/mobile/.env), else the company's. */
export const teamId = () => appEnv().APPLE_TEAM_ID?.trim() || COMPANY_TEAM_ID;

/** The teams Xcode is signed in to (Xcode → Settings… → Accounts), each paid or free (personal). */
function xcodeTeams() {
  const exported = path.join(os.tmpdir(), `youngvista-xcode-${process.pid}.plist`);
  const teams = [];
  if (read('defaults', ['export', 'com.apple.dt.Xcode', exported]) !== null) {
    for (const key of ['IDEProvisioningTeamByIdentifier', 'IDEProvisioningTeams']) {
      const json = read('plutil', ['-extract', key, 'json', '-o', '-', exported]);
      for (const list of Object.values(json ? JSON.parse(json) : {})) {
        for (const t of [list].flat()) {
          if (t?.teamID) {
            const name = t.teamName ?? t.teamID;
            teams.push({
              id: t.teamID,
              name,
              free: !!t.isFreeProvisioningTeam || /personal team/i.test(name),
            });
          }
        }
      }
      if (teams.length) break;
    }
  }
  fs.rmSync(exported, { force: true });
  return teams;
}

/**
 * The teams of the Apple Development certificates in the keychain (the team ID is the
 * certificate's OU, its name the O). Xcode's own list lags: it is saved when Xcode quits, while
 * "Manage Certificates…" makes a team's certificate at once.
 */
function certificateTeams() {
  const pems = (read('security', ['find-certificate', '-a', '-c', 'Apple Development', '-p']) ?? '')
    .split(/(?=-----BEGIN CERTIFICATE-----)/)
    .filter((p) => p.includes('BEGIN'));
  return pems
    .map(
      (pem) =>
        read('openssl', ['x509', '-noout', '-subject', '-nameopt', 'multiline'], { input: pem }) ??
        '',
    )
    .map((s) => ({
      id: /organizationalUnitName\s*=\s*(\S+)/.exec(s)?.[1],
      name: /organizationName\s*=\s*(.+)/.exec(s)?.[1]?.trim(),
      free: false,
    }))
    .filter((t) => t.id);
}

export const XCODE_ACCOUNT_STEPS = [
  '  1. Open Xcode. In the menu bar: Xcode → Settings… → Accounts.',
  "  2. If the Apple ID that is on the company's team isn't listed: + (bottom left) → Apple Account → Continue, and sign in.",
  '  3. Click that Apple ID, then the "Young Corporation of America" line → Manage Certificates… → + → Apple Development → Done.',
];

/**
 * The Apple team that signs the iPhone app, when Xcode on this Mac can sign for it. Otherwise a
 * stop that says why: Xcode signed in to no account, only to a personal (free) team, or to other
 * teams. YoungVista's ID belongs to the company's team, so a personal team can't sign it.
 */
export function signingTeam() {
  const id = teamId();
  const listed = xcodeTeams();
  const teams = [
    ...listed,
    ...certificateTeams().filter((t) => !listed.some((u) => u.id === t.id)),
  ];
  const team = teams.find((t) => t.id === id);
  if (team && !team.free) return { id, name: team.name ?? id };
  const company = "the company's Apple team, Young Corporation of America";
  const personal = `A personal team can't sign YoungVista: the app's ID belongs to ${company} (and a personal team's copies stop opening after 7 days).`;
  if (team?.free) {
    stop([
      `APPLE_TEAM_ID is ${id}, a personal team (${team.name}). ${personal}`,
      "Take APPLE_TEAM_ID out of apps/mobile/.env (or the shell), so the company's team signs it. Then run this again.",
    ]);
  }
  const wanted = id === COMPANY_TEAM_ID ? company : `the Apple team ${id} (APPLE_TEAM_ID)`;
  if (!teams.length) {
    stop([
      `Xcode isn't signed in to an Apple account yet, and YoungVista is signed by ${wanted}:`,
      ...XCODE_ACCOUNT_STEPS,
      'Then run this again.',
    ]);
  }
  if (teams.every((t) => t.free)) {
    stop([
      `Xcode on this Mac is signed in with a personal Apple ID only (${teams.map((t) => t.name).join(', ')}).`,
      personal,
      "Sign Xcode in with the Apple ID that is on the company's team:",
      ...XCODE_ACCOUNT_STEPS,
      'Then run this again. (Not on the team? The owner adds your Apple ID: App Store Connect → Users and Access.)',
    ]);
  }
  stop([
    `Xcode on this Mac isn't signed in to ${wanted}; it has ${teams.map((t) => t.name).join(', ')}.`,
    ...XCODE_ACCOUNT_STEPS,
    'Then run this again.',
  ]);
}

/** What a failed iPhone build, archive or export most likely needs, from Xcode's words. */
export function explainXcodeProblem(log) {
  const text = fs.existsSync(log)
    ? fs
        .readFileSync(log, 'utf8')
        .split('\n')
        .filter((l) => /error|fail|denied|unable|invalid|requires/i.test(l))
        .join('\n')
    : '';
  const known = [
    [
      /PLA Update|Program License Agreement|agreement.*(accept|updated)/i,
      "Apple wants the team's Account Holder to accept an updated agreement first, at https://developer.apple.com/account. Then run this again.",
    ],
    [
      /No Accounts?\b|No account for team|not signed in|sign in with your Apple ID/i,
      `Xcode isn't signed in to the company's Apple team: Xcode → Settings… → Accounts (docs/running-the-apps.md, "The first time", step 1). Then run this again.`,
    ],
    [
      /Developer Mode/i,
      'Turn on Developer Mode on the iPhone: Settings → Privacy & Security → Developer Mode. Then run this again.',
    ],
    [
      /device is locked|passcode protected|unlock/i,
      'Unlock the iPhone and keep it unlocked while the app builds and installs. Then run this again.',
    ],
    [
      /Unable to find a destination|is busy|for development/i,
      'Xcode is still getting the iPhone ready (the first time takes a few minutes). Keep it plugged in and unlocked, wait a few minutes, then run this again.',
    ],
    [
      /cannot be registered to your development team|is not available|identifier .* is not available/i,
      `The app's ID ${APP_ID} belongs to another Apple team. Check that APPLE_TEAM_ID isn't set (unset means the company's team), or ask Claude Code: "the app ID is taken".`,
    ],
    [
      /Cloud signing permission|cloud-managed distribution/i,
      "Apple refused to sign with the team's App Store certificate: the Apple ID in Xcode must be an Admin on the team (App Store Connect → Users and Access). Then run this again.",
    ],
    [
      /maximum number of .*certificates/i,
      'Your Apple ID has too many certificates: revoke an old one at https://developer.apple.com/account/resources/certificates, then run this again.',
    ],
    [
      /No profiles for|requires a provisioning profile|provisioning profile/i,
      "Xcode couldn't set up the app's signing. Check that Xcode → Settings… → Accounts lists the Apple ID with Young Corporation of America, then run this again.",
    ],
    [
      /SDK is not supported by the compiler|module compiled with Swift/i,
      'Xcode was updated and part of the app was built for the old Xcode. Run the command again with -- --rebuild; if it still fails, ask Claude Code.',
    ],
  ];
  const match = known.find(([pattern]) => pattern.test(text));
  return [
    match ? match[1] : 'The lines above say what went wrong.',
    `The whole log: ${rel(log)}. docs/running-the-apps.md, "When it doesn't work", has more; or ask Claude Code, with that file.`,
  ];
}

// ---------------------------------------------------------------------------------------------
// The native projects (apps/mobile/ios, apps/mobile/android: made by prebuild, gitignored).

function filesIn(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name !== '.DS_Store')
    .map((e) => path.join(e.parentPath, e.name))
    .sort();
}

/** Folders that builds write inside the app's own native modules. */
const BUILD_DIRS = new Set(['build', '.gradle', '.cxx']);

/** The files under `dir` without what builds write there. */
function sourcesIn(dir) {
  const built = (file) =>
    path
      .relative(dir, file)
      .split(path.sep)
      .some((p) => BUILD_DIRS.has(p));
  return filesIn(dir).filter((file) => !built(file));
}

/**
 * A fingerprint of what prebuild makes a native project from: app.config.ts and the settings it
 * reads (release.json, the URL scheme and team in .env), the packages, the images, plugins and
 * the app's own native modules (apps/mobile/modules), and where the folder is. The app's own
 * JavaScript isn't in it: every build bundles that afresh.
 */
function fingerprint(platform) {
  const hash = crypto.createHash('sha256').update(`${platform}\n${mobile}\n`);
  const files = ['app.config.ts', 'release.json', 'package.json'].map((f) => path.join(mobile, f));
  files.push(path.join(root, 'package-lock.json'));
  files.push(...filesIn(path.join(mobile, 'assets')), ...filesIn(path.join(mobile, 'plugins')));
  files.push(...sourcesIn(path.join(mobile, 'modules')));
  for (const file of files) {
    if (fs.existsSync(file)) hash.update(`${rel(file)}\n`).update(fs.readFileSync(file));
  }
  const env = appEnv();
  for (const key of ['GOOGLE_IOS_URL_SCHEME', 'APPLE_TEAM_ID'])
    hash.update(`${key}=${env[key] ?? ''}\n`);
  return hash.digest('hex').slice(0, 16);
}

const stateFile = path.join(stateDir, 'phone.json');

/** Makes the native project again (prebuild) when what it is made from changed, or with --rebuild. */
export function nativeProject(platform, env, { rebuild = false } = {}) {
  const label = platform === 'ios' ? 'iPhone' : 'Android';
  const now = fingerprint(platform);
  let state = {};
  try {
    state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch {
    /* first run */
  }
  if (!rebuild && state[platform] === now && fs.existsSync(path.join(mobile, platform))) return;
  step(
    `Making the ${label} project${state[platform] ? ' again (something native changed)' : ''} (a few minutes)`,
  );
  quietly(
    path.join(root, 'node_modules', '.bin', 'expo'),
    ['prebuild', '--platform', platform, '--clean'],
    {
      cwd: mobile,
      env: { ...env, CI: '1' },
      log: logFile(`prebuild-${platform}.log`),
      problem: `Making the ${label} project didn't work; the lines above say why. Run this again, or ask Claude Code.`,
    },
  );
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(stateFile, `${JSON.stringify({ ...state, [platform]: now }, null, 2)}\n`);
}

/** The Xcode workspace and scheme prebuild made (named after the app). */
export function xcodeProject() {
  const workspace = fs.readdirSync(iosDir).find((f) => f.endsWith('.xcworkspace'));
  if (!workspace) stop(`apps/mobile/ios has no Xcode workspace. Run this again with -- --rebuild.`);
  return { workspace, scheme: workspace.replace(/\.xcworkspace$/, '') };
}
