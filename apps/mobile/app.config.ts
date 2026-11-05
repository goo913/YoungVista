import type { ConfigContext, ExpoConfig } from 'expo/config';
import { withGradleProperties, type ConfigPlugin } from 'expo/config-plugins';

/** iOS bundle ID and Android package (decisions.md). */
const APP_ID = 'com.youngcorporation.youngvista';

/** Young Corporation of America. Team IDs are not secret; APPLE_TEAM_ID overrides it. */
const DEFAULT_APPLE_TEAM_ID = 'L276BBUKFM';

const CAMERA_USE = 'YoungVista uses the camera to find the floor and walls of your room.';

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
    version: '0.1.0',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    // The website's mark (apps/web/public/favicon.svg). Final icon and splash come in Build 4.
    icon: './assets/icon.png',
    ios: {
      bundleIdentifier: APP_ID,
      appleTeamId: process.env.APPLE_TEAM_ID || DEFAULT_APPLE_TEAM_ID,
      supportsTablet: false,
      infoPlist: {
        NSCameraUsageDescription: CAMERA_USE,
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      package: APP_ID,
    },
    plugins: [
      'expo-router',
      'expo-dev-client',
      'expo-system-ui',
      [
        'expo-splash-screen',
        {
          image: './assets/splash-icon.png',
          imageWidth: 120,
          backgroundColor: '#ffffff',
          dark: { image: './assets/splash-icon.png', backgroundColor: '#0a0a0a' },
        },
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
            savePhotosPermission: 'YoungVista saves pictures of your rooms to Photos.',
          },
          android: { xRMode: ['AR'] },
        },
      ],
      ...(iosUrlScheme
        ? [['@react-native-google-signin/google-signin', { iosUrlScheme }] as [string, unknown]]
        : []),
    ],
  });
};
