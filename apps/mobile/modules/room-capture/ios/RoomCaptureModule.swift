import ARKit
import ExpoModulesCore
import UIKit

/// Posed ARKit keyframes for the turn-around scan (see ../index.ts). It reaches the ARSession
/// that ViroReact's AR view runs (RCSessionAccess), reports its video format and switches it to
/// 4:3 when asked, samples frames (KeyframeSampler) and writes the ones the app keeps.
public final class RoomCaptureModule: Module {
  private let sampler = KeyframeSampler()

  public func definition() -> ModuleDefinition {
    Name("RoomCapture")

    Events("onFrame")

    OnCreate { [weak self] in
      // Weak: the module keeps the sampler, which keeps this.
      self?.sampler.emit = { body in
        self?.sendEvent("onFrame", body)
      }
    }

    OnDestroy {
      let sampler = self.sampler
      DispatchQueue.main.async { sampler.stop() }
    }

    AsyncFunction("prepareAsync") {
      (viewTag: Int, options: PrepareOptions) async throws -> [String: Any] in
      guard let appContext = self.appContext else { throw ARViewNotFoundException() }
      return try await VideoFormats.prepare(
        appContext: appContext, viewTag: viewTag, prefer4x3: options.prefer4x3)
    }

    AsyncFunction("startAsync") { (viewTag: Int, options: StartOptions) throws in
      guard let root = self.appContext?.findView(withTag: viewTag, ofType: UIView.self) else {
        throw ARViewNotFoundException()
      }
      guard let session = RCSessionAccess.session(under: root) else {
        throw NoARSessionException()
      }
      self.sampler.start(session: session, rate: options.rate, slots: options.slots)
    }.runOnQueue(.main)

    AsyncFunction("keepAsync") { (frameId: Int, uri: String, quality: Double, promise: Promise) in
      guard let url = URL(string: uri), url.isFileURL else {
        promise.reject(NotAFileException())
        return
      }
      self.sampler.keep(id: frameId, to: url, quality: quality) { result in
        switch result {
        case .success(let info): promise.resolve(info)
        case .failure(let error): promise.reject(error)
        }
      }
    }

    AsyncFunction("stopAsync") {
      self.sampler.stop()
    }.runOnQueue(.main)
  }
}

internal struct PrepareOptions: Record {
  /// Switch a 16:9 session to ARKit's 4:3 format (1920 × 1440), if Viro keeps running on it.
  @Field
  var prefer4x3: Bool = true
}

internal struct StartOptions: Record {
  /// Samples per second.
  @Field
  var rate: Int = 15

  /// How many of the latest samples are kept for `keepAsync`.
  @Field
  var slots: Int = 8
}

/// The session's video format: what it is, and the switch to 4:3.
///
/// ViroKit's "High" video quality (ViroReact's default) runs the format with the tallest image,
/// which on recent iPhones is 16:9 4K: about 67° × 41° per frame in landscape, against 67° × 53°
/// for 4:3. The switch changes the configuration object ViroKit keeps, so its own re-runs (plane
/// detection, autofocus) keep the format, and runs it without reset options, so tracking, the
/// world origin and the anchors stay. It counts only once camera frames arrive in the new format;
/// otherwise the old format comes back. Viro's camera background is made from each frame's own
/// image and display transform, so it follows the new size by itself.
private enum VideoFormats {
  static func describe(_ format: ARConfiguration.VideoFormat) -> [String: Any] {
    [
      "width": Int(format.imageResolution.width),
      "height": Int(format.imageResolution.height),
      "fps": format.framesPerSecond,
    ]
  }

  static func label(_ format: ARConfiguration.VideoFormat) -> String {
    "\(Int(format.imageResolution.width))×\(Int(format.imageResolution.height)) at \(format.framesPerSecond) fps"
  }

  static func isFourByThree(_ format: ARConfiguration.VideoFormat) -> Bool {
    let size = format.imageResolution
    return size.height > 0 && abs(Double(size.width / size.height) - 4.0 / 3.0) < 0.02
  }

  /// The back camera's 4:3 format: 1920 × 1440 when offered, at the highest frame rate.
  static func best4x3(_ formats: [ARConfiguration.VideoFormat]) -> ARConfiguration.VideoFormat? {
    let candidates = formats.filter { isFourByThree($0) && $0.captureDevicePosition == .back }
    return candidates.max { a, b in rank(a) < rank(b) }
  }

  private static func rank(_ format: ARConfiguration.VideoFormat) -> (Int, Int, Int) {
    let width = Int(format.imageResolution.width)
    return (width == 1920 ? 1 : 0, format.framesPerSecond, width)
  }

  @MainActor
  static func prepare(appContext: AppContext, viewTag: Int, prefer4x3: Bool) async throws
    -> [String: Any]
  {
    guard let root = appContext.findView(withTag: viewTag, ofType: UIView.self) else {
      throw ARViewNotFoundException()
    }
    guard let session = RCSessionAccess.session(under: root),
      let configuration = RCSessionAccess.configuration(under: root)
    else {
      throw NoARSessionException()
    }
    let supported =
      configuration is ARWorldTrackingConfiguration
      ? ARWorldTrackingConfiguration.supportedVideoFormats
      : type(of: configuration).supportedVideoFormats
    let before = configuration.videoFormat
    var note: String?
    var switched = false
    if prefer4x3, !isFourByThree(before) {
      if let target = best4x3(supported) {
        configuration.videoFormat = target
        if let refused = RCSessionAccess.run(session, configuration: configuration) {
          configuration.videoFormat = before
          _ = RCSessionAccess.run(session, configuration: configuration)
          note = "ARKit refused \(label(target)): \(refused)"
        } else if await framesArrive(session, size: target.imageResolution) {
          switched = true
        } else {
          configuration.videoFormat = before
          _ = RCSessionAccess.run(session, configuration: configuration)
          note = "No camera frames came in \(label(target)) within 3 s; back to \(label(before))"
        }
      } else {
        note = "This phone offers no 4:3 format for world tracking"
      }
    }
    var result: [String: Any] = [
      "before": describe(before),
      "format": describe(configuration.videoFormat),
      "switched": switched,
      "supported": supported.map(describe),
      "model": machine(),
      "os": UIDevice.current.systemVersion,
    ]
    if let note { result["note"] = note }
    return result
  }

  /// True once the session delivers a new frame of `size` (within 3 s).
  @MainActor
  private static func framesArrive(_ session: ARSession, size: CGSize) async -> Bool {
    let start = session.currentFrame?.timestamp ?? 0
    for _ in 0..<30 {
      try? await Task.sleep(nanoseconds: 100_000_000)
      if let frame = session.currentFrame, frame.timestamp > start,
        frame.camera.imageResolution == size
      {
        return true
      }
    }
    return false
  }

  /// The phone's model identifier, e.g. "iPhone15,4" for an iPhone 15.
  private static func machine() -> String {
    var info = utsname()
    uname(&info)
    return Mirror(reflecting: info.machine).children.reduce(into: "") { text, element in
      if let value = element.value as? Int8, value != 0 {
        text.append(Character(UnicodeScalar(UInt8(bitPattern: value))))
      }
    }
  }
}

internal final class ARViewNotFoundException: Exception, @unchecked Sendable {
  override var reason: String {
    "The camera view is not on screen"
  }
}

internal final class NoARSessionException: Exception, @unchecked Sendable {
  override var reason: String {
    "The camera has not started yet"
  }
}

internal final class FrameGoneException: Exception, @unchecked Sendable {
  override var reason: String {
    "That camera frame is no longer kept"
  }
}

internal final class JpegFailedException: Exception, @unchecked Sendable {
  override var reason: String {
    "The camera frame could not be saved as a picture"
  }
}

internal final class NotAFileException: Exception, @unchecked Sendable {
  override var reason: String {
    "Pictures can only be saved to a file on the phone"
  }
}
