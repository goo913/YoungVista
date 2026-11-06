/* eslint-disable @typescript-eslint/no-require-imports */
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

/**
 * An app built with the iOS 27 SDK (Xcode 27) stops at launch unless it uses the scene life cycle,
 * and Expo SDK 57's template does not yet. This makes the generated app do what the next template
 * does: the app delegate keeps React Native's factory, and Expo's own scene delegate
 * (ExpoAppSceneDelegate, in the expo package) makes the window and starts React Native in it.
 * The same change YCACLOCK ships with. Remove this part once Expo's template does it.
 *
 * It also tells the AR view when the screen turns (ORIENTATION_RELAY below), which the scene life
 * cycle stopped doing; keep that part even when the template has its own scene delegate.
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

const ORIENTATION_MARKER = '// YoungVista: AR orientation relay';

/**
 * ViroKit, the AR view's renderer, turns its camera picture and its projection to the screen only
 * when UIApplicationDidChangeStatusBarOrientationNotification arrives (VROViewAR's
 * orientationDidChange:, which reads the window scene's orientation), and under the scene life
 * cycle UIKit no longer posts it: on the iOS 27 simulator it never came, not when a landscape
 * screen opened, not when the phone turned from one landscape side to the other. Without it the
 * camera screens (landscape, see app/(app)/_layout.tsx) would draw the camera with the turn the
 * AR view had when it was made. So the scene delegate posts it each time the scene turns, as
 * UIKit used to. Checked on the iOS 27 simulator: one notice per turn, after the scene has turned.
 * Raw names: UIKit's constants for them are deprecated.
 */
const ORIENTATION_RELAY = `
${ORIENTATION_MARKER} (plugins/with-scene-lifecycle.js): ViroKit only follows the screen's turns
// on UIApplicationDidChangeStatusBarOrientationNotification, which the scene life cycle no longer
// posts. Post it whenever the scene turns.
private let didChangeStatusBarOrientation = Notification.Name(
  "UIApplicationDidChangeStatusBarOrientationNotification")
private let statusBarOrientationKey = "UIApplicationStatusBarOrientationUserInfoKey"

extension SceneDelegate {
  @available(iOS 26.0, *)
  @objc(windowScene:didUpdateEffectiveGeometry:)
  func windowScene(
    _ windowScene: UIWindowScene,
    didUpdateEffectiveGeometry previousEffectiveGeometry: UIWindowScene.Geometry
  ) {
    postTurn(
      from: previousEffectiveGeometry.interfaceOrientation,
      to: windowScene.effectiveGeometry.interfaceOrientation)
  }

  // What UIKit calls before iOS 26. It still calls it later too, where the method above answers.
  @objc(windowScene:didUpdateCoordinateSpace:interfaceOrientation:traitCollection:)
  func windowScene(
    _ windowScene: UIWindowScene,
    didUpdate previousCoordinateSpace: UICoordinateSpace,
    interfaceOrientation previousInterfaceOrientation: UIInterfaceOrientation,
    traitCollection previousTraitCollection: UITraitCollection
  ) {
    if #available(iOS 26.0, *) { return }
    postTurn(from: previousInterfaceOrientation, to: windowScene.effectiveGeometry.interfaceOrientation)
  }

  private func postTurn(from previous: UIInterfaceOrientation, to current: UIInterfaceOrientation) {
    guard previous != current, current != .unknown else { return }
    NotificationCenter.default.post(
      name: didChangeStatusBarOrientation, object: UIApplication.shared,
      userInfo: [statusBarOrientationKey: NSNumber(value: previous.rawValue)])
  }
}
`;

module.exports = function withSceneLifecycle(config) {
  config = withAppDelegate(config, (c) => {
    let src = c.modResults.contents;
    // A template that already has a scene delegate (named SceneDelegate) keeps its own.
    if (!src.includes('SceneDelegate')) {
      for (const [pattern, replacement] of STEPS) {
        if (!pattern.test(src)) {
          throw new Error(
            `with-scene-lifecycle: AppDelegate.swift no longer has ${pattern}; update apps/mobile/plugins/with-scene-lifecycle.js.`,
          );
        }
        src = src.replace(pattern, replacement);
      }
      src += SCENE_DELEGATE;
    }
    if (!src.includes(ORIENTATION_MARKER)) src += ORIENTATION_RELAY;
    c.modResults.contents = src;
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
