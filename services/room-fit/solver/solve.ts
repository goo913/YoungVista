/**
 * The room-fit job's bridge to the shared room solver (packages/core): reads a fit's marks as JSON
 * on stdin and prints the room the phone would build from them (`fitMarks`, `groupWallMarks`,
 * `solveRoomLeavingOut`), so the server's panoramas and checks use the same outline as the app.
 * Bundled with esbuild into dist/solve.mjs (services/room-fit/deploy.sh); run with plain Node.
 */
import {
  axesAngle,
  fitMarks,
  groupWallMarks,
  roomArea,
  solveRoomLeavingOut,
  wallLengths,
  type FittedMark,
} from '../../../packages/core/src/index';

interface SolveInput {
  axesAngle: number;
  floorY: number;
  ceilingHeight: number | null;
  marks: FittedMark[];
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function solve(input: SolveInput) {
  const { axes, marks } = fitMarks({
    axesAngle: input.axesAngle,
    floorY: input.floorY,
    ceilingHeight: input.ceilingHeight,
    marks: input.marks,
    openings: [],
    spots: [],
  });
  const grouped = groupWallMarks(marks, axes);
  const solved = solveRoomLeavingOut(grouped.walls, grouped.axes, {
    ...(input.ceilingHeight ? { ceilingHeight: input.ceilingHeight } : {}),
  });
  const groups = grouped.walls.map((w) => ({
    axis: w.axis,
    facing: w.facing,
    offset: w.offset,
    markIds: w.markIds,
  }));
  if (!solved.ok) {
    return {
      ok: false,
      error: solved.error,
      reason: solved.reason,
      conflicting: solved.conflicting,
      groups,
      axesAngle: axesAngle(grouped.axes),
    };
  }
  const lengths = wallLengths(solved.room);
  return {
    ok: true,
    axesAngle: axesAngle(grouped.axes),
    points: solved.room.points,
    walls: solved.room.walls.map((w, i) => ({
      a: solved.room.points[w.a],
      b: solved.room.points[w.b],
      length: lengths[i],
      markIds: grouped.walls[solved.wallSource[i]!]?.markIds ?? [],
      inferred: solved.inferredWalls.includes(i),
    })),
    area: roomArea(solved.room),
    leftOut: solved.leftOut.map((i) => grouped.walls[i]?.markIds ?? []),
    groups,
  };
}

const input = JSON.parse(await readStdin()) as SolveInput;
process.stdout.write(JSON.stringify(solve(input)));
