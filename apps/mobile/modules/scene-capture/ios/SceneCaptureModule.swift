import ExpoModulesCore
import GLKit
import UIKit

/// Captures YoungVista's 3D view as a JPEG (see ../index.ts). ViroReact draws the 3D view into a
/// GLKView (ViroKit's VROViewScene); `GLKView.snapshot` draws a fresh frame off screen, which is
/// what ViroKit's own screenshot (VROViewRecorder) does for the AR view.
public final class SceneCaptureModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SceneCapture")

    AsyncFunction("captureAsync") { (viewTag: Int, options: CaptureOptions) async throws -> [String: Any] in
      let frame = try await MainActor.run { () throws -> UIImage in
        guard let root = self.appContext?.findView(withTag: viewTag, ofType: UIView.self) else {
          throw SceneViewNotFoundException()
        }
        guard let glView = firstGLKView(in: root),
          glView.bounds.width > 0, glView.bounds.height > 0
        else {
          throw NoSceneRendererException()
        }
        return glView.snapshot
      }
      return try writeJpeg(frame, options: options)
    }
  }
}

internal struct CaptureOptions: Record {
  @Field
  var quality: Double = 0.92

  @Field
  var background: String = "#ffffff"
}

internal final class SceneViewNotFoundException: Exception, @unchecked Sendable {
  override var reason: String {
    "The 3D view is not on screen"
  }
}

internal final class NoSceneRendererException: Exception, @unchecked Sendable {
  override var reason: String {
    "The 3D view has not started drawing yet"
  }
}

internal final class CaptureFailedException: Exception, @unchecked Sendable {
  override var reason: String {
    "The 3D view could not be captured"
  }
}

/// The renderer's view: ViroKit's VROViewScene, a GLKView, somewhere under the navigator's view
/// (under Fabric the navigator itself sits inside React Native's interop wrapper).
private func firstGLKView(in view: UIView) -> GLKView? {
  if let glView = view as? GLKView {
    return glView
  }
  for child in view.subviews {
    if let found = firstGLKView(in: child) {
      return found
    }
  }
  return nil
}

/// The frame, flattened onto an opaque background at its full pixel size, as a JPEG in Caches.
private func writeJpeg(_ frame: UIImage, options: CaptureOptions) throws -> [String: Any] {
  guard let cgImage = frame.cgImage, cgImage.width > 0, cgImage.height > 0 else {
    throw CaptureFailedException()
  }
  let size = CGSize(width: cgImage.width, height: cgImage.height)
  let format = UIGraphicsImageRendererFormat()
  format.scale = 1
  format.opaque = true
  let flat = UIGraphicsImageRenderer(size: size, format: format).image { context in
    color(fromHex: options.background).setFill()
    context.fill(CGRect(origin: .zero, size: size))
    frame.draw(in: CGRect(origin: .zero, size: size))
  }
  let quality = CGFloat(min(max(options.quality, 0.1), 1))
  guard let data = flat.jpegData(compressionQuality: quality) else {
    throw CaptureFailedException()
  }
  guard let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else {
    throw CaptureFailedException()
  }
  let directory = caches.appendingPathComponent("scene-capture", isDirectory: true)
  try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
  let file = directory.appendingPathComponent("\(UUID().uuidString).jpg")
  try data.write(to: file, options: .atomic)
  return ["uri": file.absoluteString, "width": cgImage.width, "height": cgImage.height]
}

private func color(fromHex hex: String) -> UIColor {
  var digits = hex.trimmingCharacters(in: .whitespacesAndNewlines)
  if digits.hasPrefix("#") {
    digits.removeFirst()
  }
  guard digits.count == 6, let value = UInt32(digits, radix: 16) else {
    return .white
  }
  return UIColor(
    red: CGFloat((value >> 16) & 0xff) / 255,
    green: CGFloat((value >> 8) & 0xff) / 255,
    blue: CGFloat(value & 0xff) / 255,
    alpha: 1
  )
}
