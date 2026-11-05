/* eslint-disable @typescript-eslint/no-require-imports */
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

/**
 * An app built with the iOS 27 SDK (Xcode 27) stops at launch unless it uses the scene life cycle,
 * and Expo SDK 57's template does not yet. This makes the generated app do what the next template
 * does: the app delegate keeps React Native's factory, and Expo's own scene delegate
 * (ExpoAppSceneDelegate, in the expo package) makes the window and starts React Native in it.
 * The same change YCACLOCK ships with. Remove this plugin once Expo's template does it.
 */
const STEPS = [
  [
    /class AppDelegate: ExpoAppDelegate \{/,
    'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {',
  ],
  [/\n[ \t]*window = UIWindow\(frame: UIScreen\.main\.bounds\)/, ''],
  [
    /\n[ \t]*factory\.startReactNative\(\s*withModuleName: "main",\s*in: window,\s*launchOptions: launchOptions\)/,
    '',
  ],
];

const SCENE_DELEGATE = `
// The window, and React Native in it, under the scene life cycle (plugins/with-scene-lifecycle.js).
@objc(SceneDelegate)
class SceneDelegate: ExpoAppSceneDelegate {}
`;

module.exports = function withSceneLifecycle(config) {
  config = withAppDelegate(config, (c) => {
    let src = c.modResults.contents;
    if (src.includes('SceneDelegate')) return c; // a template that already does it
    for (const [pattern, replacement] of STEPS) {
      if (!pattern.test(src)) {
        throw new Error(
          `with-scene-lifecycle: AppDelegate.swift no longer has ${pattern}; update apps/mobile/plugins/with-scene-lifecycle.js.`,
        );
      }
      src = src.replace(pattern, replacement);
    }
    c.modResults.contents = src + SCENE_DELEGATE;
    return c;
  });
  return withInfoPlist(config, (c) => {
    c.modResults.UIApplicationSceneManifest ??= {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };
    return c;
  });
};
