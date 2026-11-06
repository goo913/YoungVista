/**
 * HOW TO MOVE: the 3D view's "?". Ported from the team's closet designer (TAKEOFFPRIME, branch
 * avena/closet-ux, `ClosetMoveHelp.jsx`): nothing about moving round is written over the room;
 * it is here, for the way of moving that is on (3D, or Fly / Walk with the keys or the mouse
 * alone), and only when asked for. The rows are the closet's, worded for furniture.
 */
import type { MoveControls } from '@/lib/move-prefs';
import type { NavMode } from './types';

type Rows = [string, string][];
interface Guide {
  title: string;
  lead?: string;
  rows: Rows;
  /** The rows for a view-only room (a shared link): nothing to pick up or add. */
  show: Rows;
  /** The rows on a touch screen, when they differ. */
  touch?: Rows;
}

const GUIDES: Record<'orbit' | 'fly:keys' | 'fly:mouse' | 'walk:keys' | 'walk:mouse', Guide> = {
  orbit: {
    title: '3D — round the room',
    rows: [
      ['Drag', 'turn round the room'],
      ['Scroll', 'zoom in and out'],
      ['Right-drag', 'move the view'],
      ['Click a piece', 'select it: its panel turns, copies, recolours or removes it'],
      ['Drag a piece', 'move it across the floor; it snaps to walls'],
      ['Drag the dot', 'turn the selected piece'],
      ['[  ]  or  R', 'turn the selected piece 15° (⇧R the other way)'],
      ['Delete', 'remove the selected piece'],
      ['Esc', 'done with the piece'],
    ],
    show: [
      ['Drag', 'turn round the room'],
      ['Scroll', 'zoom in and out'],
      ['Right-drag', 'move the view'],
    ],
    touch: [
      ['Drag', 'turn round the room'],
      ['Pinch', 'zoom in and out'],
      ['Two fingers', 'move the view'],
      ['Tap a piece', 'select it'],
      ['Drag a piece', 'move it across the floor'],
    ],
  },
  'fly:keys': {
    title: 'Flying — keyboard & mouse',
    lead: 'Click the room to start; Esc gives the mouse back.',
    rows: [
      ['Mouse', 'look around'],
      ['W A S D', 'fly ahead, back and to the sides'],
      ['Space', 'up'],
      ['Shift', 'down'],
      ['W W', 'tap twice to fly faster'],
      ['Scroll', 'flying speed'],
      ['Click', 'pick up a piece · put it down'],
      ['Carrying', 'it follows the crosshair across the floor'],
      ['[  ]', 'turn the piece at the crosshair 15°'],
      ['E', 'add a piece'],
      ['X', 'take the piece away'],
      ['Right-click', 'put back what you carry'],
    ],
    show: [
      ['Mouse', 'look around'],
      ['W A S D', 'fly ahead, back and to the sides'],
      ['Space', 'up'],
      ['Shift', 'down'],
      ['W W', 'tap twice to fly faster'],
      ['Scroll', 'flying speed'],
    ],
  },
  'fly:mouse': {
    title: 'Flying — mouse only',
    rows: [
      ['Drag', 'turn round the room'],
      ['Scroll', 'move the view'],
      ['⌘/Ctrl + scroll', 'zoom in and out'],
      ['Click a piece', 'select it'],
      ['Drag a piece', 'move it across the floor'],
      ['Middle-drag', 'move the view'],
    ],
    show: [
      ['Drag', 'turn round the room'],
      ['Scroll', 'move the view'],
      ['⌘/Ctrl + scroll', 'zoom in and out'],
    ],
    touch: [
      ['Drag', 'turn round the room'],
      ['Pinch', 'zoom in and out'],
      ['Tap a piece', 'select it'],
      ['Drag a piece', 'move it across the floor'],
    ],
  },
  'walk:keys': {
    title: 'Walking — keyboard & mouse',
    lead: 'Click the room to start; Esc gives the mouse back.',
    rows: [
      ['Mouse', 'look around'],
      ['W A S D', 'walk (↑ ↓ too; ← → turn)'],
      ['Shift', 'hurry'],
      ['Space', 'jump'],
      ['C', 'crouch'],
      ['Click', 'pick up a piece · put it down'],
      ['Carrying', 'it follows the crosshair across the floor'],
      ['[  ]', 'turn the piece at the crosshair 15°'],
      ['E', 'add a piece'],
      ['X', 'take the piece away'],
      ['H', 'hide or show the hand'],
      ['Right-click', 'put back what you carry'],
    ],
    show: [
      ['Mouse', 'look around'],
      ['W A S D', 'walk (↑ ↓ too; ← → turn)'],
      ['Shift', 'hurry'],
      ['Space', 'jump'],
      ['C', 'crouch'],
      ['H', 'hide or show the hand'],
    ],
  },
  'walk:mouse': {
    title: 'Walking — mouse only',
    rows: [
      ['Drag', 'look around'],
      ['Scroll', 'step ahead or back'],
      ['Double-click', 'walk to that spot on the floor'],
      ['Click a piece', 'select it'],
      ['Drag the selected piece', 'move it across the floor'],
      ['W A S D', 'walk, as with the keys'],
    ],
    show: [
      ['Drag', 'look around'],
      ['Scroll', 'step ahead or back'],
      ['Double-click', 'walk to that spot on the floor'],
    ],
    touch: [
      ['Drag', 'look around'],
      ['Pinch', 'step ahead or back'],
      ['Double-tap the floor', 'walk there'],
      ['Tap a piece', 'select it'],
      ['Drag the selected piece', 'move it across the floor'],
    ],
  },
};

/** The guide for a view: "orbit" (round the room), or "<fly|walk>:<keys|mouse>". */
const moveGuideOf = (mode: NavMode, controls: MoveControls) =>
  mode === 'orbit' ? 'orbit' : (`${mode}:${controls}` as const);

export function MoveHelp({
  mode,
  controls,
  viewOnly,
  touch,
}: {
  mode: NavMode;
  controls: MoveControls;
  viewOnly: boolean;
  touch: boolean;
}) {
  const g = GUIDES[moveGuideOf(mode, controls)];
  const rows = touch && g.touch ? g.touch : viewOnly ? g.show : g.rows;
  const shown = viewOnly && touch ? rows.filter(([k]) => !/piece/i.test(k)) : rows;
  return (
    <div className="grid gap-2" aria-label="How to move round">
      <p className="font-medium">{g.title}</p>
      {g.lead && !touch ? <p className="text-muted-foreground">{g.lead}</p> : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
        {shown.map(([k, v]) => (
          <div key={k} className="contents">
            <dt>
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-sans text-xs whitespace-nowrap">
                {k}
              </kbd>
            </dt>
            <dd className="text-muted-foreground">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="border-t pt-2 text-xs text-muted-foreground">
        {mode === 'orbit'
          ? `To go inside: ${controls === 'keys' ? 'Fly or Walk' : 'Walk'} on the toolbar.`
          : `${controls === 'keys' ? 'Rather use the mouse alone?' : 'Rather move as in a game?'} ⚙ → Moving around.`}
      </p>
    </div>
  );
}
