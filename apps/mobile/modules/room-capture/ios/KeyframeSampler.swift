import ARKit
import CoreImage
import Foundation
import ImageIO
import QuartzCore

/// Samples the AR session's latest frame a few times a second (see ../index.ts). Each sample's
/// camera image is copied out of ARKit's own buffers at once, so ARKit never runs short of them
/// and Viro's drawing is untouched; the last few copies are kept until the app says which to
/// keep, and those are written as JPEGs at full size, in the sensor's own orientation (as stored,
/// so the pose and intrinsics stay exact).
///
/// The session's delegate stays ViroKit's: this only reads `currentFrame`, as ViroReact's own
/// object detector does.
final class KeyframeSampler {
  /// Sends one sampled frame to JavaScript (`onFrame`).
  var emit: (([String: Any?]) -> Void)?

  // Main thread.
  private weak var session: ARSession?
  private var link: CADisplayLink?
  private var busy = false
  private var nextId = 1
  private var lastTimestamp: TimeInterval = -1

  // Work queue.
  private let queue = DispatchQueue(
    label: "com.youngcorporation.youngvista.room-capture", qos: .userInitiated)
  private var slots: [(id: Int, image: CVPixelBuffer)] = []
  private var slotCount = 8
  private var pool: CVPixelBufferPool?
  private var poolKey: PoolKey?
  private lazy var context = CIContext(options: [.cacheIntermediates: false])

  private struct PoolKey: Equatable {
    let format: OSType
    let width: Int
    let height: Int
  }

  var running: Bool { link != nil }

  /// Starts sampling `session` about `rate` times a second, keeping the last `slots` copies.
  func start(session: ARSession, rate: Int, slots: Int) {
    stop()
    self.session = session
    let count = max(2, min(slots, 16))
    queue.async { self.slotCount = count }
    let link = CADisplayLink(target: LinkTarget { [weak self] in self?.tick() }, selector: #selector(LinkTarget.fire))
    let fps = Float(max(1, min(rate, 30)))
    link.preferredFrameRateRange = CAFrameRateRange(minimum: fps / 2, maximum: fps, preferred: fps)
    link.add(to: .main, forMode: .common)
    self.link = link
  }

  /// Stops sampling and lets the copies go (once any JPEG already asked for is written).
  func stop() {
    link?.invalidate()
    link = nil
    session = nil
    busy = false
    queue.async {
      self.slots.removeAll()
      self.pool = nil
      self.poolKey = nil
    }
  }

  /// Writes the copy of frame `id` as a JPEG at `url`. Fails when that copy is gone (it is one
  /// of the last few only).
  func keep(
    id: Int, to url: URL, quality: Double,
    done: @escaping (Result<[String: Any], Error>) -> Void
  ) {
    queue.async {
      guard let slot = self.slots.first(where: { $0.id == id }) else {
        done(.failure(FrameGoneException()))
        return
      }
      do {
        let data = try self.jpeg(slot.image, quality: quality)
        try FileManager.default.createDirectory(
          at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: url, options: .atomic)
        done(
          .success([
            "uri": url.absoluteString,
            "bytes": data.count,
            "width": CVPixelBufferGetWidth(slot.image),
            "height": CVPixelBufferGetHeight(slot.image),
          ]))
      } catch {
        done(.failure(error))
      }
    }
  }

  // MARK: - Sampling (main thread)

  private func tick() {
    guard !busy, let session, let frame = session.currentFrame else { return }
    guard frame.timestamp != lastTimestamp else { return }
    lastTimestamp = frame.timestamp
    let id = nextId
    nextId += 1
    var body = Self.describe(frame, id: id)
    // Only the image goes along (not the ARFrame, which holds more of ARKit's buffers), and only
    // until it is copied.
    let image = frame.capturedImage
    busy = true
    queue.async {
      let sharpness = self.store(id: id, image: image)
      DispatchQueue.main.async {
        self.busy = false
        guard self.running, let sharpness else { return }
        body["sharpness"] = sharpness
        self.emit?(body)
      }
    }
  }

  /// What JavaScript needs of a frame: its pose, intrinsics and size exactly as ARKit gives them.
  private static func describe(_ frame: ARFrame, id: Int) -> [String: Any?] {
    let camera = frame.camera
    let m = camera.transform
    // Column-major, as ARKit's simd_float4x4 is.
    let transform: [Double] = [m.columns.0, m.columns.1, m.columns.2, m.columns.3].flatMap {
      [Double($0.x), Double($0.y), Double($0.z), Double($0.w)]
    }
    let k = camera.intrinsics
    return [
      "id": id,
      "timestamp": frame.timestamp,
      "transform": transform,
      "intrinsics": [
        Double(k.columns.0.x), Double(k.columns.1.y), Double(k.columns.2.x), Double(k.columns.2.y),
      ],
      "width": Int(camera.imageResolution.width),
      "height": Int(camera.imageResolution.height),
      "tracking": trackingName(camera.trackingState),
      "trackingReason": trackingReason(camera.trackingState),
      "exposureDuration": camera.exposureDuration,
      "exposureOffset": Double(camera.exposureOffset),
      "ambientIntensity": frame.lightEstimate.map { Double($0.ambientIntensity) },
    ]
  }

  private static func trackingName(_ state: ARCamera.TrackingState) -> String {
    switch state {
    case .normal: return "normal"
    case .limited: return "limited"
    case .notAvailable: return "unavailable"
    @unknown default: return "unavailable"
    }
  }

  private static func trackingReason(_ state: ARCamera.TrackingState) -> String? {
    guard case .limited(let reason) = state else { return nil }
    switch reason {
    case .initializing: return "initializing"
    case .excessiveMotion: return "excessive-motion"
    case .insufficientFeatures: return "insufficient-features"
    case .relocalizing: return "relocalizing"
    @unknown default: return "other"
    }
  }

  // MARK: - Copies and JPEGs (work queue)

  /// Copies `image` into a slot and measures its sharpness; nil when it could not be copied.
  private func store(id: Int, image: CVPixelBuffer) -> Double? {
    guard let copy = copyImage(image) else { return nil }
    let sharpness = RCLumaSharpness(copy)
    slots.append((id: id, image: copy))
    // A 4K frame is 12 MB: keep fewer of those (half a second's worth is still plenty).
    let large = CVPixelBufferGetWidth(copy) * CVPixelBufferGetHeight(copy) > 4_000_000
    let keep = large ? min(slotCount, 4) : slotCount
    if slots.count > keep { slots.removeFirst(slots.count - keep) }
    return sharpness
  }

  private func copyImage(_ source: CVPixelBuffer) -> CVPixelBuffer? {
    let key = PoolKey(
      format: CVPixelBufferGetPixelFormatType(source),
      width: CVPixelBufferGetWidth(source),
      height: CVPixelBufferGetHeight(source))
    if pool == nil || poolKey != key {
      // A new video format (or the first frame): copies of the old size are no use any more.
      slots.removeAll()
      let attributes: [String: Any] = [
        kCVPixelBufferPixelFormatTypeKey as String: key.format,
        kCVPixelBufferWidthKey as String: key.width,
        kCVPixelBufferHeightKey as String: key.height,
        kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
      ]
      let large = key.width * key.height > 4_000_000
      let poolAttributes: [String: Any] = [
        kCVPixelBufferPoolMinimumBufferCountKey as String: (large ? min(slotCount, 4) : slotCount) + 1
      ]
      var created: CVPixelBufferPool?
      CVPixelBufferPoolCreate(
        kCFAllocatorDefault, poolAttributes as CFDictionary, attributes as CFDictionary, &created)
      pool = created
      poolKey = created == nil ? nil : key
    }
    guard let pool else { return nil }
    var made: CVPixelBuffer?
    guard CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &made) == kCVReturnSuccess,
      let copy = made
    else { return nil }
    guard CVPixelBufferLockBaseAddress(source, .readOnly) == kCVReturnSuccess else { return nil }
    defer { CVPixelBufferUnlockBaseAddress(source, .readOnly) }
    guard CVPixelBufferLockBaseAddress(copy, []) == kCVReturnSuccess else { return nil }
    defer { CVPixelBufferUnlockBaseAddress(copy, []) }
    let planes = CVPixelBufferIsPlanar(source) ? CVPixelBufferGetPlaneCount(source) : 0
    if planes == 0 {
      guard let from = CVPixelBufferGetBaseAddress(source), let to = CVPixelBufferGetBaseAddress(copy)
      else { return nil }
      copyRows(
        from, CVPixelBufferGetBytesPerRow(source), to, CVPixelBufferGetBytesPerRow(copy),
        CVPixelBufferGetHeight(source))
    } else {
      for plane in 0..<planes {
        guard let from = CVPixelBufferGetBaseAddressOfPlane(source, plane),
          let to = CVPixelBufferGetBaseAddressOfPlane(copy, plane)
        else { return nil }
        copyRows(
          from, CVPixelBufferGetBytesPerRowOfPlane(source, plane), to,
          CVPixelBufferGetBytesPerRowOfPlane(copy, plane),
          CVPixelBufferGetHeightOfPlane(source, plane))
      }
    }
    // The colour attachments (YCbCr matrix, range) tell Core Image how to turn it into RGB.
    CVBufferPropagateAttachments(source, copy)
    return copy
  }

  private func copyRows(
    _ from: UnsafeMutableRawPointer, _ fromStride: Int, _ to: UnsafeMutableRawPointer,
    _ toStride: Int, _ rows: Int
  ) {
    if fromStride == toStride {
      memcpy(to, from, fromStride * rows)
      return
    }
    let width = min(fromStride, toStride)
    for row in 0..<rows {
      memcpy(to + row * toStride, from + row * fromStride, width)
    }
  }

  /// The image as a JPEG, YCbCr turned into sRGB by Core Image, not turned or scaled.
  private func jpeg(_ image: CVPixelBuffer, quality: Double) throws -> Data {
    let picture = CIImage(cvPixelBuffer: image)
    let level = CIImageRepresentationOption(rawValue: kCGImageDestinationLossyCompressionQuality as String)
    guard let space = CGColorSpace(name: CGColorSpace.sRGB),
      let data = context.jpegRepresentation(
        of: picture, colorSpace: space, options: [level: min(max(quality, 0.3), 1)])
    else {
      throw JpegFailedException()
    }
    return data
  }
}

/// CADisplayLink keeps its target: this small object keeps the sampler only weakly.
private final class LinkTarget: NSObject {
  private let action: () -> Void

  init(_ action: @escaping () -> Void) {
    self.action = action
  }

  @objc func fire() {
    action()
  }
}
