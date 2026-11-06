/**
 * The furniture in a room while the user arranges it: add, select, drag, rotate, duplicate,
 * delete and recolour items. Plain TypeScript, so the rules are unit tested; the plan editors and
 * the 3D views (phone and website) all dispatch these actions, so a room furnished in one place
 * comes out the same in the other.
 *
 * Ported from the phone's `apps/mobile/furnish/design-state.ts` (and `furnish/ids.ts`) without
 * changing its behaviour, so the website arranges furniture by exactly the phone's rules; the phone
 * can switch over to this copy.
 *
 * Placement rules come from `resolvePlacement` (wall snapping, staying inside the room, no
 * overlaps). While a finger or the mouse moves an item, the item shows where it would land, valid
 * or not; when the gesture ends somewhere invalid, the item goes back to the last valid spot of
 * that gesture.
 */
import type { DesignItem, Room } from './types';
import {
  placeNewItem,
  resolvePlacement,
  type PlacementContext,
  type PlacementIssue,
  type Pose,
  type ProductLookup,
  type ResolvedPlacement,
} from './placement';

export interface DesignContext {
  room: Room;
  /** Product sizes, e.g. `productLookup(catalog)`. */
  product: ProductLookup;
  /** A new, unique item id, e.g. `newItemId`. */
  newId: () => string;
}

/** Where an item stands: position (m), rotation about +Y (degrees), height of its base (m). */
export interface ItemPose {
  x: number;
  z: number;
  rotationY: number;
  /** Only for tabletop items resting on another item. */
  y?: number;
}

/** A drag or a turn in progress. */
export interface DesignGesture {
  kind: 'drag' | 'rotate';
  id: string;
  /** The item's pose when the gesture started. */
  start: ItemPose;
  /** The last valid pose seen during the gesture: where the item goes if it ends somewhere invalid. */
  lastValid: ItemPose;
  /** Where the item is shown now. May be invalid (drawn in red). */
  preview: ResolvedPlacement;
  /** False until the first move: a press that never moved changes nothing. */
  moved: boolean;
}

/** Something to tell the user after an action. */
export type DesignNotice =
  | { kind: 'refused'; id: string; reasons: PlacementIssue[]; overlaps: string[] }
  | { kind: 'no-space'; productId: string }
  | { kind: 'removed'; item: DesignItem; index: number };

export interface DesignState {
  /** The design as saved. */
  items: DesignItem[];
  selectedId: string | null;
  gesture: DesignGesture | null;
  notice: DesignNotice | null;
  /** Goes up with every change the user makes to `items`; autosave watches it. */
  version: number;
}

export type DesignAction =
  | { type: 'load'; items: DesignItem[] }
  /**
   * A new piece: at `at` when given (where the AR view's dot or the crosshair meets the floor, or
   * the nearest free spot to it), else in the nearest free spot to the room's centre.
   */
  | { type: 'add'; productId: string; variant?: string; at?: Pose }
  | { type: 'select'; id: string | null }
  | { type: 'drag-start'; id: string }
  /** The item's centre should go to (x, z) on the floor. */
  | { type: 'drag-move'; x: number; z: number }
  | { type: 'rotate-start'; id: string }
  /** The item should turn to this rotation (degrees); it snaps to 15° steps. */
  | { type: 'rotate-move'; rotationY: number }
  | { type: 'gesture-end' }
  /** The gesture was interrupted: put the item back where it started. */
  | { type: 'gesture-cancel' }
  | { type: 'rotate-by'; id: string; degrees: number }
  | { type: 'duplicate'; id: string }
  | { type: 'remove'; id: string }
  | { type: 'undo-remove' }
  | { type: 'set-variant'; id: string; variant: string | undefined }
  | { type: 'dismiss-notice' };

/** A new design item id: short, unique enough for one room, and safe in Firestore. */
export function newItemId(
  random: () => number = Math.random,
  now: () => number = Date.now,
): string {
  const rand = Math.floor(random() * 36 ** 6)
    .toString(36)
    .padStart(6, '0');
  return `i${now().toString(36)}${rand}`;
}

export const initialDesignState = (items: DesignItem[] = []): DesignState => ({
  items,
  selectedId: null,
  gesture: null,
  notice: null,
  version: 0,
});

const poseOf = (p: ItemPose): ItemPose => ({
  x: p.x,
  z: p.z,
  rotationY: p.rotationY,
  ...(p.y ? { y: p.y } : {}),
});

const samePose = (a: ItemPose, b: ItemPose): boolean =>
  Math.abs(a.x - b.x) < 1e-9 &&
  Math.abs(a.z - b.z) < 1e-9 &&
  Math.abs(a.rotationY - b.rotationY) < 1e-9 &&
  Math.abs((a.y ?? 0) - (b.y ?? 0)) < 1e-9;

/** The item moved to `pose`, with `y` only when it rests on something. */
export function withPose(item: DesignItem, pose: ItemPose): DesignItem {
  const { y: _y, ...rest } = item;
  const moved: DesignItem = { ...rest, x: pose.x, z: pose.z, rotationY: pose.rotationY };
  if (pose.y) moved.y = pose.y;
  return moved;
}

const placement = (items: readonly DesignItem[], ctx: DesignContext): PlacementContext => ({
  room: ctx.room,
  items,
  product: ctx.product,
});

/** How far from the asked-for spot `placeAt` looks for a free one (m), and in what steps. */
const NEAR_SEARCH = 2;
const NEAR_STEP = 0.1;

/**
 * A spot for a new piece of `productId` as close to `at` as it fits: `at` itself (snapped to a
 * wall within 15 cm, turned in 15° steps, pushed back inside the room), else the nearest free spot
 * within 2 m, else the nearest free spot anywhere in the room. Null when nothing fits.
 */
export function placeAt(
  productId: string,
  at: Pose,
  ctx: PlacementContext,
): ResolvedPlacement | null {
  if (!ctx.product(productId)) return null;
  const there = resolvePlacement({ productId, ...at }, ctx);
  if (there.valid) return there;
  for (let r = NEAR_STEP; r <= NEAR_SEARCH + 1e-9; r += NEAR_STEP) {
    const count = Math.max(8, Math.ceil((2 * Math.PI * r) / NEAR_STEP));
    for (let k = 0; k < count; k++) {
      const a = (2 * Math.PI * k) / count;
      const spot = resolvePlacement(
        {
          productId,
          x: at.x + r * Math.cos(a),
          z: at.z + r * Math.sin(a),
          rotationY: at.rotationY,
        },
        ctx,
        { snapDistance: 0, clamp: false },
      );
      if (spot.valid) return spot;
    }
  }
  return placeNewItem(productId, ctx, { start: { x: at.x, z: at.z }, rotationY: at.rotationY });
}

/**
 * Whether an item may stand exactly where it is (no snapping or pushing): inside the room and clear
 * of the other items.
 */
export function checkItem(
  item: DesignItem,
  items: readonly DesignItem[],
  ctx: Pick<DesignContext, 'room' | 'product'>,
): ResolvedPlacement {
  return resolvePlacement(
    item,
    { room: ctx.room, items, product: ctx.product },
    { snapDistance: 0, rotationStep: 0, clamp: false },
  );
}

const replaceItem = (items: readonly DesignItem[], next: DesignItem): DesignItem[] =>
  items.map((it) => (it.id === next.id ? next : it));

function finishGesture(state: DesignState, g: DesignGesture): DesignState {
  const item = state.items.find((it) => it.id === g.id);
  if (!item) return { ...state, gesture: null };
  const target = g.preview.valid ? poseOf(g.preview) : g.lastValid;
  const changed = g.moved && !samePose(target, item);
  const refused: DesignNotice | null =
    g.moved && !g.preview.valid
      ? { kind: 'refused', id: g.id, reasons: g.preview.reasons, overlaps: g.preview.overlaps }
      : null;
  return {
    ...state,
    gesture: null,
    items: changed ? replaceItem(state.items, withPose(item, target)) : state.items,
    version: changed ? state.version + 1 : state.version,
    notice: refused,
  };
}

function startGesture(
  state: DesignState,
  kind: DesignGesture['kind'],
  id: string,
  ctx: DesignContext,
): DesignState {
  if (state.gesture) return state;
  const item = state.items.find((it) => it.id === id);
  if (!item) return state;
  const start = poseOf(item);
  return {
    ...state,
    selectedId: id,
    notice: null,
    gesture: {
      kind,
      id,
      start,
      lastValid: start,
      preview: checkItem(item, state.items, ctx),
      moved: false,
    },
  };
}

function moveGesture(
  state: DesignState,
  kind: DesignGesture['kind'],
  pose: Pick<ItemPose, 'x' | 'z' | 'rotationY'>,
  ctx: DesignContext,
): DesignState {
  const g = state.gesture;
  if (!g || g.kind !== kind) return state;
  const item = state.items.find((it) => it.id === g.id);
  if (!item) return { ...state, gesture: null };
  const preview = resolvePlacement(
    { id: item.id, productId: item.productId, ...pose },
    placement(state.items, ctx),
    // Turning an item must be able to turn it away from a wall, so no wall snapping then.
    kind === 'rotate' ? { snapDistance: 0 } : {},
  );
  return {
    ...state,
    gesture: {
      ...g,
      preview,
      moved: true,
      lastValid: preview.valid ? poseOf(preview) : g.lastValid,
    },
  };
}

/** The next state after `action`. Pure: `ctx` supplies the room, product sizes and new ids. */
export function reduceDesign(
  state: DesignState,
  action: DesignAction,
  ctx: DesignContext,
): DesignState {
  switch (action.type) {
    case 'load': {
      const ids = new Set(action.items.map((it) => it.id));
      return {
        ...state,
        items: action.items,
        gesture: null,
        selectedId: state.selectedId && ids.has(state.selectedId) ? state.selectedId : null,
      };
    }

    case 'add': {
      if (state.gesture || !ctx.product(action.productId)) return state;
      const spot = action.at
        ? placeAt(action.productId, action.at, placement(state.items, ctx))
        : placeNewItem(action.productId, placement(state.items, ctx));
      if (!spot || !spot.valid) {
        return { ...state, notice: { kind: 'no-space', productId: action.productId } };
      }
      const item = withPose(
        {
          id: ctx.newId(),
          productId: action.productId,
          ...(action.variant ? { variant: action.variant } : {}),
          x: 0,
          z: 0,
          rotationY: 0,
        },
        poseOf(spot),
      );
      return {
        ...state,
        items: [...state.items, item],
        selectedId: item.id,
        notice: null,
        version: state.version + 1,
      };
    }

    case 'select': {
      if (state.gesture) return state;
      const exists = action.id !== null && state.items.some((it) => it.id === action.id);
      const selectedId = exists ? action.id : null;
      const keepNotice = state.notice?.kind === 'removed' && selectedId === null;
      return { ...state, selectedId, notice: keepNotice ? state.notice : null };
    }

    case 'drag-start':
      return startGesture(state, 'drag', action.id, ctx);

    case 'drag-move': {
      const g = state.gesture;
      if (!g || g.kind !== 'drag') return state;
      return moveGesture(
        state,
        'drag',
        { x: action.x, z: action.z, rotationY: g.start.rotationY },
        ctx,
      );
    }

    case 'rotate-start':
      return startGesture(state, 'rotate', action.id, ctx);

    case 'rotate-move': {
      const g = state.gesture;
      if (!g || g.kind !== 'rotate') return state;
      return moveGesture(
        state,
        'rotate',
        { x: g.start.x, z: g.start.z, rotationY: action.rotationY },
        ctx,
      );
    }

    case 'gesture-end':
      return state.gesture ? finishGesture(state, state.gesture) : state;

    case 'gesture-cancel':
      return state.gesture ? { ...state, gesture: null } : state;

    case 'rotate-by': {
      if (state.gesture) return state;
      const item = state.items.find((it) => it.id === action.id);
      if (!item) return state;
      const r = resolvePlacement(
        { ...item, rotationY: item.rotationY + action.degrees },
        placement(state.items, ctx),
        { snapDistance: 0 },
      );
      if (!r.valid) {
        return {
          ...state,
          selectedId: item.id,
          notice: { kind: 'refused', id: item.id, reasons: r.reasons, overlaps: r.overlaps },
        };
      }
      if (samePose(r, item)) return { ...state, selectedId: item.id, notice: null };
      return {
        ...state,
        items: replaceItem(state.items, withPose(item, poseOf(r))),
        selectedId: item.id,
        notice: null,
        version: state.version + 1,
      };
    }

    case 'duplicate': {
      if (state.gesture) return state;
      const item = state.items.find((it) => it.id === action.id);
      if (!item) return state;
      // The free spot nearest the original, turned the same way.
      const spot = placeNewItem(item.productId, placement(state.items, ctx), {
        rotationY: item.rotationY,
        start: { x: item.x, z: item.z },
      });
      if (!spot || !spot.valid) {
        return { ...state, notice: { kind: 'no-space', productId: item.productId } };
      }
      const copy = withPose({ ...item, id: ctx.newId() }, poseOf(spot));
      return {
        ...state,
        items: [...state.items, copy],
        selectedId: copy.id,
        notice: null,
        version: state.version + 1,
      };
    }

    case 'remove': {
      if (state.gesture) return state;
      const index = state.items.findIndex((it) => it.id === action.id);
      if (index < 0) return state;
      const item = state.items[index]!;
      return {
        ...state,
        items: state.items.filter((it) => it.id !== action.id),
        selectedId: null,
        notice: { kind: 'removed', item, index },
        version: state.version + 1,
      };
    }

    case 'undo-remove': {
      const n = state.notice;
      if (n?.kind !== 'removed' || state.items.some((it) => it.id === n.item.id)) return state;
      const items = [...state.items];
      items.splice(Math.min(n.index, items.length), 0, n.item);
      return { ...state, items, selectedId: n.item.id, notice: null, version: state.version + 1 };
    }

    case 'set-variant': {
      const item = state.items.find((it) => it.id === action.id);
      if (!item || (item.variant ?? undefined) === action.variant) return state;
      const { variant: _old, ...rest } = item;
      const next: DesignItem = action.variant ? { ...rest, variant: action.variant } : rest;
      return {
        ...state,
        items: replaceItem(state.items, next),
        version: state.version + 1,
        notice: null,
      };
    }

    case 'dismiss-notice':
      return state.notice ? { ...state, notice: null } : state;
  }
}

/** The items as they should be drawn: the one being moved shows at its preview spot. */
export function displayedItems(state: DesignState): DesignItem[] {
  const g = state.gesture;
  if (!g) return state.items;
  return state.items.map((it) => (it.id === g.id ? withPose(it, poseOf(g.preview)) : it));
}

export interface ItemCheck {
  valid: boolean;
  reasons: PlacementIssue[];
  overlaps: string[];
}

/**
 * Whether each item can stand where it is drawn. The item being moved reports its preview; the
 * others are checked against the saved design, so they do not turn red while something passes
 * over them. Items can be invalid outside a gesture too, after the room's walls were edited.
 */
export function itemChecks(state: DesignState, ctx: DesignContext): Map<string, ItemCheck> {
  const out = new Map<string, ItemCheck>();
  for (const item of state.items) {
    const g = state.gesture;
    const r = g && g.id === item.id ? g.preview : checkItem(item, state.items, ctx);
    out.set(item.id, { valid: r.valid, reasons: r.reasons, overlaps: r.overlaps });
  }
  return out;
}

/** The selected item, if it still exists. */
export const selectedItem = (state: DesignState): DesignItem | null =>
  state.selectedId
    ? (displayedItems(state).find((it) => it.id === state.selectedId) ?? null)
    : null;
