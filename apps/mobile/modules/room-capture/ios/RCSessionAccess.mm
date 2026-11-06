#import "RCSessionAccess.h"

#import <ViroKit/VROARSessioniOS.h>
#import <ViroKit/VROViewAR.h>

#include <algorithm>
#include <memory>

/// The renderer's view, ViroKit's VROViewAR (a GLKView), somewhere under the navigator's view:
/// under Fabric the navigator itself sits inside React Native's interop wrapper.
static VROViewAR *RCFindViewAR(UIView *view) {
  if ([view isKindOfClass:[VROViewAR class]]) {
    return (VROViewAR *)view;
  }
  for (UIView *child in view.subviews) {
    VROViewAR *found = RCFindViewAR(child);
    if (found) {
      return found;
    }
  }
  return nil;
}

/// ViroKit's session behind the AR view under `root`. On a phone that runs ARKit it is always the
/// iOS class (VROARSessioniOS). ViroKit may be built without RTTI, so this is a static cast, as
/// in ViroReact; the ARKit check comes first because a phone without ARKit gets another class.
static std::shared_ptr<VROARSessioniOS> RCSessionOf(UIView *root) {
  if (![VROViewAR isARSupported]) {
    return nullptr;
  }
  VROViewAR *viewAR = RCFindViewAR(root);
  if (!viewAR) {
    return nullptr;
  }
  std::shared_ptr<VROARSession> session = [viewAR getARSession];
  if (!session) {
    return nullptr;
  }
  return std::static_pointer_cast<VROARSessioniOS>(session);
}

@implementation RCSessionAccess

+ (ARSession *)sessionUnderView:(UIView *)root {
  std::shared_ptr<VROARSessioniOS> session = RCSessionOf(root);
  if (!session) {
    return nil;
  }
  ARSession *native = session->getARSession();
  return [native isKindOfClass:[ARSession class]] ? native : nil;
}

+ (ARConfiguration *)configurationUnderView:(UIView *)root {
  std::shared_ptr<VROARSessioniOS> session = RCSessionOf(root);
  if (!session) {
    return nil;
  }
  ARConfiguration *configuration = session->getSessionConfiguration();
  return [configuration isKindOfClass:[ARConfiguration class]] ? configuration : nil;
}

+ (NSString *)runSession:(ARSession *)session configuration:(ARConfiguration *)configuration {
  @try {
    [session runWithConfiguration:configuration];
    return nil;
  } @catch (NSException *exception) {
    return exception.reason ?: exception.name;
  }
}

@end

double RCLumaSharpness(CVPixelBufferRef buffer) {
  if (!buffer || CVPixelBufferGetPlaneCount(buffer) < 1) {
    return 0;
  }
  if (CVPixelBufferLockBaseAddress(buffer, kCVPixelBufferLock_ReadOnly) != kCVReturnSuccess) {
    return 0;
  }
  const uint8_t *luma = (const uint8_t *)CVPixelBufferGetBaseAddressOfPlane(buffer, 0);
  const size_t stride = CVPixelBufferGetBytesPerRowOfPlane(buffer, 0);
  const size_t width = CVPixelBufferGetWidthOfPlane(buffer, 0);
  const size_t height = CVPixelBufferGetHeightOfPlane(buffer, 0);
  double sum = 0;
  double sumSquares = 0;
  size_t count = 0;
  if (luma && width > 16 && height > 16) {
    // The middle 80%, and never the outermost pixels (the Laplacian reads its neighbours).
    const size_t x0 = std::max<size_t>(1, width / 10);
    const size_t x1 = std::min<size_t>(width - 1, width - width / 10);
    const size_t y0 = std::max<size_t>(1, height / 10);
    const size_t y1 = std::min<size_t>(height - 1, height - height / 10);
    for (size_t y = y0; y < y1; y += 4) {
      const uint8_t *row = luma + y * stride;
      for (size_t x = x0; x < x1; x += 4) {
        const int laplacian =
            4 * row[x] - row[x - 1] - row[x + 1] - row[(ptrdiff_t)x - (ptrdiff_t)stride] -
            row[x + stride];
        sum += laplacian;
        sumSquares += (double)laplacian * laplacian;
        count++;
      }
    }
  }
  CVPixelBufferUnlockBaseAddress(buffer, kCVPixelBufferLock_ReadOnly);
  if (count == 0) {
    return 0;
  }
  const double mean = sum / count;
  return sumSquares / count - mean * mean;
}
