export type * from './types';

export {
  vec2,
  add,
  sub,
  scale,
  dot,
  length,
  distance,
  midpoint,
  normalize,
  angleAbove,
  angleAboveDeg,
  toDegrees,
  toRadians,
  intersectLines,
} from './vec';

export {
  signedArea,
  polygonArea,
  polygonPerimeter,
  isCounterClockwise,
  ensureCounterClockwise,
  bounds,
  inwardNormal,
  segmentsIntersect,
  isSimplePolygon,
  validateRoomShape,
  describeRoomShapeError,
  DEFAULT_MIN_AREA,
  DEFAULT_MIN_WALL_LENGTH,
} from './polygon';
export type {
  Point,
  Bounds,
  RoomShapeError,
  RoomShapeLimits,
  RoomShapeValidation,
} from './polygon';

export {
  DEFAULT_CEILING_HEIGHT,
  roomFromPoints,
  wallEndpoints,
  wallLengths,
  roomArea,
  roomPerimeter,
  isRoom,
  roomToFirestore,
  roomFromFirestore,
} from './room';
export type { RoomFromPointsOptions } from './room';

export { buildRoomFromWalls, isBuildRoomFailure, mergeWallObservations, coverage } from './scan';
export type {
  ScanOptions,
  BuildRoomResult,
  BuildRoomSuccess,
  BuildRoomFailure,
  MergedWall,
  CoverageGap,
  CoverageResult,
} from './scan';

export {
  rotationMatrixFromEuler,
  eulerFromRotationMatrix,
  multiplyMat3,
  applyMat3,
  describePlane,
  wallFromPlane,
  wallFromTaps,
} from './plane';
export type {
  Vec3,
  Vec3Tuple,
  Mat3,
  EulerOrder,
  PlaneAnchor,
  PlaneDescription,
  PlaneRejection,
  WallFromPlaneOptions,
} from './plane';

export {
  METERS_PER_FOOT,
  METERS_PER_INCH,
  SQUARE_FEET_PER_SQUARE_METER,
  formatFeetInches,
  formatMeters,
  formatLength,
  formatArea,
  parseLength,
} from './units';

export { CATALOG_CATEGORIES } from './catalog';
export type {
  Catalog,
  CatalogItem,
  CatalogVariant,
  CatalogCategory,
  CatalogPlacement,
  CatalogLicense,
  CatalogDimensions,
} from './catalog';
