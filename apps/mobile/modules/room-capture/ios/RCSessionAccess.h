// The ARKit session behind ViroReact's AR view, reached through ViroKit's shipped headers the way
// ViroReact itself does it (VRTARSceneNavigator.mm, `_detectorTick:`): the navigator's VROViewAR
// gives `getARSession()`, a C++ VROARSession, whose iOS class VROARSessioniOS holds the ARSession
// and the configuration it runs. Plain Objective-C here so that Swift can import it; the C++ stays
// in RCSessionAccess.mm.

#import <ARKit/ARKit.h>
#import <CoreVideo/CoreVideo.h>
#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

@interface RCSessionAccess : NSObject

/// The ARKit session of the first ViroReact AR view (ViroKit's VROViewAR) under `root`, or nil
/// when there is none yet or the phone cannot run ARKit.
+ (nullable ARSession *)sessionUnderView:(UIView *)root NS_SWIFT_NAME(session(under:));

/// The configuration that session runs with. It is the very object ViroKit keeps and runs again
/// on each change it makes (plane detection, autofocus), so a change made to it lasts.
+ (nullable ARConfiguration *)configurationUnderView:(UIView *)root
    NS_SWIFT_NAME(configuration(under:));

/// Runs `session` with `configuration`, without reset options: tracking, the world origin and
/// the anchors all stay. Returns nil once it runs, or why ARKit refused: it throws an
/// Objective-C exception for a video format it will not take, which Swift cannot catch.
+ (nullable NSString *)runSession:(ARSession *)session
                    configuration:(ARConfiguration *)configuration
    NS_SWIFT_NAME(run(_:configuration:));

@end

/// How sharp a camera image is: the variance of a Laplacian over the middle 80% of its luma (Y)
/// plane, sampled every 4 pixels. Higher is sharper; only comparable between similar views.
FOUNDATION_EXTERN double RCLumaSharpness(CVPixelBufferRef buffer);

NS_ASSUME_NONNULL_END
