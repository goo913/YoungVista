"""room-fit: the server side of YoungVista's turn-around scan.

The phone uploads posed keyframes (packages/core/src/turn-scan.ts, `CaptureManifest`); this job
measures the room from them and writes `scanFits/{scanId}` (`ScanFitDoc`) plus one 360° panorama
per standing spot. See docs/server.md.
"""

__version__ = "1.0.0"
