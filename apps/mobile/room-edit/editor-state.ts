/**
 * The room editor: drag corners, type wall lengths, add, move and remove doors and windows, set
 * the ceiling height, and undo. Every edit goes through core's editor functions; their `reason`
 * (why an edit is not possible) and `changes` (doors and windows moved or shrunk to fit) are shown
 * in plain words. Plain TypeScript, so it is unit tested.
 */
import {
  addOpening,
  findOpening,
  moveCorner,
  moveOpening,
  openingSegment,
  projectOntoWall,
  removeOpening,
  setCeilingHeight,
  setWallLength,
  updateOpening,
  wallEndpoints,
  type Opening,
  type OpeningChange,
  type OpeningType,
  type Room,
  type RoomEditResult,
  type Vec2,
} from '@youngvista/core';
import { distanceToSegment } from '@/lib/plan-transform';

export type EditorSelection =
  | { kind: 'corner'; index: number }
  | { kind: 'wall'; id: string }
  | { kind: 'opening'; id: string }
  | null;

export interface EditorMessage {
  tone: 'info' | 'error';
  text: string;
}

type EditorDrag =
  | { kind: 'corner'; index: number; start: Room; changes: OpeningChange[] }
  | { kind: 'opening'; id: string; start: Room; grab: number };

export interface RoomEditorState {
  /** The room as shown (during a drag, the room being dragged). */
  room: Room;
  /** Earlier rooms, newest last, for Undo. */
  history: Room[];
  selection: EditorSelection;
  message: EditorMessage | null;
  drag: EditorDrag | null;
  /** Goes up with every change the user makes; autosave watches it. */
  version: number;
}

export type RoomEditorAction =
  | { type: 'load'; room: Room }
  | { type: 'select'; selection: EditorSelection }
  | { type: 'corner-drag-start'; index: number }
  /** The finger is at `point`; corners within `snap` metres of lining up with a neighbour do. */
  | { type: 'corner-drag-move'; point: Vec2; snap?: number }
  | { type: 'opening-drag-start'; id: string; point: Vec2 }
  | { type: 'opening-drag-move'; point: Vec2 }
  | { type: 'drag-end' }
  | { type: 'set-wall-length'; wallId: string; meters: number }
  | { type: 'add-opening'; wallId: string; openingType: OpeningType }
  | {
      type: 'update-opening';
      id: string;
      changes: Partial<Pick<Opening, 'type' | 'width' | 'height' | 'sill'>>;
    }
  | { type: 'remove-opening'; id: string }
  | { type: 'set-ceiling'; meters: number }
  | { type: 'undo' }
  | { type: 'dismiss-message' };

const MAX_HISTORY = 50;

export const initialEditorState = (room: Room): RoomEditorState => ({
  room,
  history: [],
  selection: null,
  message: null,
  drag: null,
  version: 0,
});

const TYPE_NAMES: Record<OpeningType, string> = {
  door: 'Door',
  window: 'Window',
  opening: 'Opening',
};

/** "Door 1", "Window 2": the opening's type and the number in its id. */
export function openingName(opening: Pick<Opening, 'id' | 'type'>): string {
  const n = /-(\d+)$/.exec(opening.id)?.[1];
  return n ? `${TYPE_NAMES[opening.type]} ${n}` : TYPE_NAMES[opening.type];
}

/** What an edit did to doors and windows to keep them on their walls, in plain words. */
export function describeChanges(changes: readonly OpeningChange[], before: Room): string | null {
  if (!changes.length) return null;
  return changes
    .map((c) => {
      const found = findOpening(before, c.openingId);
      const name = found ? openingName(found.opening) : 'A door or window';
      switch (c.change) {
        case 'moved':
          return `${name} was moved along its wall to fit.`;
        case 'resized':
          return `${name} was made smaller to fit.`;
        case 'removed':
          return `${name} was removed: it no longer fits on its wall.`;
      }
    })
    .join(' ');
}

/**
 * Snaps a dragged corner so that the walls to its neighbours run straight across or down the
 * plan when they are within `tolerance` metres of it. Keeps square rooms square.
 */
export function snapCorner(room: Room, index: number, p: Vec2, tolerance: number): Vec2 {
  const n = room.points.length;
  const prev = room.points[(index - 1 + n) % n];
  const next = room.points[(index + 1) % n];
  if (!prev || !next || !(tolerance > 0)) return p;
  const snap = (v: number, options: number[]) => {
    let best = v;
    let gap = tolerance;
    for (const o of options) {
      if (Math.abs(v - o) <= gap) {
        best = o;
        gap = Math.abs(v - o);
      }
    }
    return best;
  };
  return { x: snap(p.x, [prev[0], next[0]]), z: snap(p.z, [prev[1], next[1]]) };
}

/** What a touch at `p` is on: a corner, then a door or window, then a wall (within `slop` m). */
export function editorHit(room: Room, p: Vec2, slop: number): EditorSelection {
  let corner: { index: number; d: number } | null = null;
  room.points.forEach(([x, z], index) => {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d <= slop && (!corner || d < corner.d)) corner = { index, d };
  });
  if (corner) return { kind: 'corner', index: (corner as { index: number }).index };
  let best: { selection: EditorSelection; d: number } | null = null;
  for (const wall of room.walls) {
    for (const o of wall.openings) {
      const seg = openingSegment(room, wall.id, o);
      if (!seg) continue;
      const d = distanceToSegment(p, seg.a, seg.b);
      if (d <= slop && (!best || d < best.d))
        best = { selection: { kind: 'opening', id: o.id }, d };
    }
  }
  if (best) return best.selection;
  for (const wall of room.walls) {
    const { a, b } = wallEndpoints(room, wall);
    const d = distanceToSegment(p, a, b);
    if (d <= slop && (!best || d < best.d)) best = { selection: { kind: 'wall', id: wall.id }, d };
  }
  return best?.selection ?? null;
}

/** Applies an edit's result: the new room (with Undo), or the reason it is not possible. */
function apply(
  state: RoomEditorState,
  result: RoomEditResult,
  selection: EditorSelection = state.selection,
  done?: string,
): RoomEditorState {
  if (!result.ok) return { ...state, message: { tone: 'error', text: result.reason } };
  const text = describeChanges(result.changes, state.room) ?? done;
  return {
    ...state,
    room: result.room,
    history: [...state.history, state.room].slice(-MAX_HISTORY),
    selection,
    message: text ? { tone: 'info', text } : null,
    version: state.version + 1,
  };
}

/** The next state after `action`. Pure. */
export function reduceEditor(state: RoomEditorState, action: RoomEditorAction): RoomEditorState {
  switch (action.type) {
    case 'load':
      return initialEditorState(action.room);

    case 'select':
      return state.drag ? state : { ...state, selection: action.selection, message: null };

    case 'corner-drag-start': {
      if (state.drag || !state.room.points[action.index]) return state;
      return {
        ...state,
        selection: { kind: 'corner', index: action.index },
        message: null,
        drag: { kind: 'corner', index: action.index, start: state.room, changes: [] },
      };
    }

    case 'corner-drag-move': {
      const drag = state.drag;
      if (drag?.kind !== 'corner') return state;
      const point = snapCorner(drag.start, drag.index, action.point, action.snap ?? 0);
      const result = moveCorner(drag.start, drag.index, point);
      if (!result.ok) return { ...state, message: { tone: 'error', text: result.reason } };
      return {
        ...state,
        room: result.room,
        message: null,
        drag: { ...drag, changes: result.changes },
      };
    }

    case 'opening-drag-start': {
      if (state.drag) return state;
      const found = findOpening(state.room, action.id);
      const proj = found && projectOntoWall(state.room, found.wall.id, action.point);
      if (!found || !proj) return state;
      return {
        ...state,
        selection: { kind: 'opening', id: action.id },
        message: null,
        drag: {
          kind: 'opening',
          id: action.id,
          start: state.room,
          grab: proj.offset - found.opening.offset,
        },
      };
    }

    case 'opening-drag-move': {
      const drag = state.drag;
      if (drag?.kind !== 'opening') return state;
      const found = findOpening(drag.start, drag.id);
      const proj = found && projectOntoWall(drag.start, found.wall.id, action.point);
      if (!found || !proj) return state;
      const result = moveOpening(drag.start, drag.id, proj.offset - drag.grab);
      if (!result.ok) return { ...state, message: { tone: 'error', text: result.reason } };
      return { ...state, room: result.room, message: null };
    }

    case 'drag-end': {
      const drag = state.drag;
      if (!drag) return state;
      if (state.room === drag.start) return { ...state, drag: null };
      const changes = drag.kind === 'corner' ? describeChanges(drag.changes, drag.start) : null;
      return {
        ...state,
        drag: null,
        history: [...state.history, drag.start].slice(-MAX_HISTORY),
        version: state.version + 1,
        // Keep an error from the last move ("the walls would cross") so the user sees why the
        // corner stopped; otherwise say what happened to doors and windows.
        message: changes ? { tone: 'info', text: changes } : state.message,
      };
    }

    case 'set-wall-length':
      return apply(state, setWallLength(state.room, action.wallId, action.meters));

    case 'add-opening': {
      // Core's sizes: a 0.9 × 2.03 m door, a 1.2 × 1.2 m window 0.9 m up, a 1 m opening, made
      // to fit a short wall or a low ceiling, in the free space nearest the middle of the wall.
      const result = addOpening(state.room, action.wallId, { type: action.openingType });
      if (!result.ok) return apply(state, result);
      const wall = result.room.walls.find((w) => w.id === action.wallId);
      const before = new Set(state.room.walls.flatMap((w) => w.openings.map((o) => o.id)));
      const added = wall?.openings.find((o) => !before.has(o.id));
      return apply(
        state,
        result,
        added ? { kind: 'opening', id: added.id } : state.selection,
        added ? `${openingName(added)} added. Drag it along the wall to move it.` : undefined,
      );
    }

    case 'update-opening':
      return apply(state, updateOpening(state.room, action.id, action.changes));

    case 'remove-opening': {
      const found = findOpening(state.room, action.id);
      return apply(
        state,
        removeOpening(state.room, action.id),
        found ? { kind: 'wall', id: found.wall.id } : null,
        found ? `${openingName(found.opening)} removed.` : undefined,
      );
    }

    case 'set-ceiling':
      return apply(state, setCeilingHeight(state.room, action.meters));

    case 'undo': {
      if (state.drag || !state.history.length) return state;
      const room = state.history[state.history.length - 1]!;
      const selection = validSelection(room, state.selection);
      return {
        ...state,
        room,
        history: state.history.slice(0, -1),
        selection,
        message: { tone: 'info', text: 'Undone.' },
        version: state.version + 1,
      };
    }

    case 'dismiss-message':
      return state.message ? { ...state, message: null } : state;
  }
}

/** The selection if it still exists in `room`, else nothing. */
function validSelection(room: Room, selection: EditorSelection): EditorSelection {
  if (!selection) return null;
  switch (selection.kind) {
    case 'corner':
      return room.points[selection.index] ? selection : null;
    case 'wall':
      return room.walls.some((w) => w.id === selection.id) ? selection : null;
    case 'opening':
      return findOpening(room, selection.id) ? selection : null;
  }
}

export const canUndo = (state: RoomEditorState): boolean => state.history.length > 0 && !state.drag;
