import type { ConfigContext, ExpoConfig } from 'expo/config';
import { withGradleProperties, type ConfigPlugin } from 'expo/config-plugins';
// The version people see and the build number the stores count; npm run publish:iphone raises it.
import release from './release.json';

/** iOS bundle ID and Android package (decisions.md). */
const APP_ID = 'com.youngcorporation.youngvista';

/** Young Corporation of America. Team IDs are not secret; APPLE_TEAM_ID overrides it. */
const DEFAULT_APPLE_TEAM_ID = 'L276BBUKFM';

const CAMERA_USE = 'YoungVista uses the camera to find the floor and walls of your room.';

/**
 * Upright everywhere except the camera screens (scan, the room in the camera view, place
 * freely), which turn to landscape either way round, for a wider view. Each screen sets its own
 * (app/_layout.tsx and the stacks under it); the app as a whole allows these three. Never upside
 * down.
 */
const IOS_ORIENTATIONS = [
  'UIInterfaceOrientationPortrait',
  'UIInterfaceOrientationLandscapeLeft',
  'UIInterfaceOrientationLandscapeRight',
];

/** Shown once, the first time "Take picture" saves a picture (add-only access: no reading). */
const SAVE_PHOTOS_USE =
  'YoungVista saves the pictures you take of your rooms to your photo library. It does not read your photos.';

/**
 * Saving a picture to the gallery needs no permission on Android 11 and newer (MediaStore), and
 * the app never reads photos, videos or audio: expo-media-library's read permissions stay out.
 */
const UNUSED_ANDROID_PERMISSIONS = [
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.READ_MEDIA_AUDIO',
  'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
  'android.permission.ACCESS_MEDIA_LOCATION',
];

/**
 * The Android template gives Gradle a 2 GB heap and 512 MB of metaspace, which this app's
 * modules outgrow (the daemon dies while configuring the build).
 */
const withGradleMemory: ConfigPlugin = (config) =>
  withGradleProperties(config, (c) => {
    const key = 'org.gradle.jvmargs';
    const value = '-Xmx4096m -XX:MaxMetaspaceSize=1024m';
    const existing = c.modResults.find((item) => item.type === 'property' && item.key === key);
    if (existing && existing.type === 'property') existing.value = value;
    else c.modResults.push({ type: 'property', key, value });
    return c;
  });

/**
 * Settings come from apps/mobile/.env (copy .env.example, values from the Firebase console).
 * GOOGLE_IOS_URL_SCHEME is the iOS OAuth client ID reversed; it only goes into Info.plist.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const iosUrlScheme = process.env.GOOGLE_IOS_URL_SCHEME;
  // Some Expo commands read this file once before loading .env: only warn once .env is in.
  if (!iosUrlScheme && process.env.EXPO_PUBLIC_FIREBASE_API_KEY) {
    console.warn(
      'GOOGLE_IOS_URL_SCHEME is not set, so "Continue with Google" will not work on iPhone. ' +
        'Copy apps/mobile/.env.example to apps/mobile/.env and fill it in.',
    );
  }

  return withGradleMemory({
    ...config,
    name: 'YoungVista',
    slug: 'youngvista',
    scheme: 'youngvista',
    version: release.version,
    // No `orientation`: each screen chooses (IOS_ORIENTATIONS), and Expo's 'default' adds upside down.
    userInterfaceStyle: 'automatic',
    // The icon and splash images come from assets/brand/mark.svg (scripts/render-icons.mjs).
    icon: './assets/icon.png',
    ios: {
      bundleIdentifier: APP_ID,
      buildNumber: String(release.build),
      appleTeamId: process.env.APPLE_TEAM_ID || DEFAULT_APPLE_TEAM_ID,
      supportsTablet: false,
      infoPlist: {
        UISupportedInterfaceOrientations: IOS_ORIENTATIONS,
        NSCameraUsageDescription: CAMERA_USE,
        NSPhotoLibraryAddUsageDescription: SAVE_PHOTOS_USE,
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      package: APP_ID,
      versionCode: release.build,
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon-foreground.png',
        backgroundImage: './assets/adaptive-icon-background.png',
        monochromeImage: './assets/adaptive-icon-monochrome.png',
        backgroundColor: '#171717',
      },
      blockedPermissions: UNUSED_ANDROID_PERMISSIONS,
    },
    plugins: [
      'expo-router',
      // Development builds only: no floating "Tools" gear over the screens (it sat on top of the
      // headers). The developer menu stays one shake away (Ctrl+M or ⌘M on an Android emulator).
      ['expo-dev-client', { toolsButton: false }],
      'expo-system-ui',
      [
        'expo-splash-screen',
        {
          image: './assets/splash-icon.png',
          imageWidth: 150,
          backgroundColor: '#ffffff',
          dark: { image: './assets/splash-icon-dark.png', backgroundColor: '#0a0a0a' },
        },
      ],
      [
        'expo-media-library',
        { savePhotosPermission: SAVE_PHOTOS_USE, granularPermissions: ['photo'] },
      ],
      [
        '@reactvision/react-viro',
        {
          // No cloud or geospatial anchors: nothing leaves the phone during a scan.
          provider: 'none',
          ios: {
            cameraUsagePermission: CAMERA_USE,
            microphoneUsagePermission: 'YoungVista does not record sound.',
            photosPermission: 'YoungVista can show your photos when you ask it to.',
            savePhotosPermission: SAVE_PHOTOS_USE,
          },
          android: { xRMode: ['AR'] },
        },
      ],
      ...(iosUrlScheme
        ? [['@react-native-google-signin/google-signin', { iosUrlScheme }] as [string, unknown]]
        : []),
      // iOS 27 stops an app at launch unless it uses the scene life cycle (see the plugin).
      './plugins/with-scene-lifecycle',
    ],
  });
};
