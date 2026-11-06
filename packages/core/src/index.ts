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
  RoomShapeContext,
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

export * from './wall-marks';
export * from './turn-scan';
export * from './tour';

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

export { triangulatePolygon } from './triangulate';

export {
  emptyMesh,
  isEmptyMesh,
  meshVertexCount,
  meshTriangleCount,
  meshArea,
  meshBounds,
  mergeMeshes,
  toViroGeometry,
  toViroGeometryParts,
} from './mesh';
export type {
  MeshData,
  MeshVec3,
  ViroGeometryData,
  ViroGeometryOptions,
  ViroGeometryPart,
} from './mesh';

export {
  buildRoomMeshes,
  wallFacesCamera,
  DEFAULT_WALL_THICKNESS,
  DEFAULT_FRAME_WIDTH,
  DEFAULT_FRAME_DEPTH,
} from './room-mesh';
export type { RoomMeshes, RoomMeshOptions, WallMesh } from './room-mesh';

export {
  WALL_SNAP_DISTANCE,
  ROTATION_STEP,
  PLACEMENT_TOLERANCE,
  productLookup,
  normalizeDegrees,
  snapRotation,
  facingRotation,
  frontDirection,
  itemFootprint,
  pointInRoom,
  footprintInRoom,
  footprintsOverlap,
  snapToWall,
  clampInsideRoom,
  roomRotationBase,
  roomCenter,
  findFreeSpot,
  isFlatProduct,
  resolvePlacement,
  placeNewItem,
} from './placement';
export type {
  PlacementProduct,
  ProductLookup,
  Pose,
  Footprint,
  WallSnap,
  FreeSpotOptions,
  PlacementCandidate,
  PlacementContext,
  ResolveOptions,
  PlacementIssue,
  ResolvedPlacement,
} from './placement';

export {
  MIN_OPENING_SIZE,
  MIN_CEILING_HEIGHT,
  MAX_CEILING_HEIGHT,
  DEFAULT_OPENINGS,
  describeRoomEditError,
  wallIndexOf,
  wallLength,
  openingSegment,
  projectOntoWall,
  findOpening,
  validateOpening,
  fitOpenings,
  moveCorner,
  setWallLength,
  setCeilingHeight,
  newOpeningId,
  addOpening,
  updateOpening,
  moveOpening,
  removeOpening,
} from './editor';
export type {
  RoomEditError,
  RoomEditResult,
  OpeningChange,
  OpeningSpec,
  SetWallLengthOptions,
} from './editor';

export {
  LINE_UP_MIN_SPACING,
  lineUpFromCorners,
  lineUpFromPairs,
  lineUpFromRoomCorners,
  lineUpCorners,
  lineUpAt,
  shiftLineUp,
  turnLineUp,
  applyLineUp,
  applyLineUpInverse,
  invertLineUp,
  lineUpPose,
  lineUpPoseInverse,
} from './lineup';
export type {
  LineUp,
  LineUpResult,
  LineUpQuality,
  LineUpIssue,
  FloorTap,
  RoomCornersLineUp,
} from './lineup';

export { designFromFirestore, designToFirestore } from './design';

export {
  SHARE_ID_LENGTH,
  SHARE_ID_MIN_LENGTH,
  SHARE_BASE_URL,
  generateShareId,
  isShareId,
  shareUrl,
  buildShareDoc,
} from './share';
export type { RandomBytes } from './share';

export { picturePath, buildPictureDoc, pictureFromFirestore } from './picture';
export * from './ai-picture';

export { parseCatalog } from './catalog-parse';

export {
  CATALOG_BASE_URL,
  catalogUrl,
  catalogVariant,
  catalogModelUrl,
  catalogThumbUrl,
} from './catalog-url';

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

export {
  newItemId,
  initialDesignState,
  withPose,
  placeAt,
  checkItem,
  reduceDesign,
  displayedItems,
  itemChecks,
  selectedItem,
} from './design-state';
export type {
  DesignContext,
  ItemPose,
  DesignGesture,
  DesignNotice,
  DesignState,
  DesignAction,
  ItemCheck,
} from './design-state';

export { inSentence, formatSize, placementProblem, noticeText } from './design-words';
export type { PlacementProblem } from './design-words';

export { designsEqual, shouldAdoptServerDesign, DesignFollower } from './design-sync';
export type { SnapshotSource, DesignActivity } from './design-sync';

export { Autosave, SAVE_STATUS_TEXT } from './autosave';
export type { SaveStatus, AutosaveOptions } from './autosave';

export {
  WALK,
  WALK_HEIGHT_CM,
  WALK_FOV,
  WALK_LOOK,
  SKIN_TONES,
  DEFAULT_SKIN,
  normalizeHeightCm,
  normalizeFov,
  normalizeLookSpeed,
  normalizeSkin,
  skinOf,
  feetInches,
  walkModel,
  roomWalkWalls,
  roomWalkModel,
  settle,
  step,
  startPose,
  innerPoint,
  roomOpenDir,
  roomStartPose,
  leavesHit,
  eyeStand,
  eyeCrouch,
  eyeHeightOf,
  newBody,
  advanceBody,
  headOffset,
  bodyBusy,
  turnHead,
  walkBy,
  steerTo,
} from './walk';
export type {
  WalkBob,
  WalkConfig,
  WalkWall,
  WalkLeaf,
  WalkModel,
  WalkPose,
  WalkBody,
  WalkInput,
  BodyConfig,
  SkinTone,
} from './walk';

export {
  FLY,
  flyBox,
  flyClamp,
  advanceFlight,
  flyBy,
  nextFlySpeed,
  flyWheel,
  flightFromCamera,
  orbitFromFlight,
  lookTarget,
} from './fly';
export type { FlyConfig, Flight, FlyBox, FlyInput } from './fly';
