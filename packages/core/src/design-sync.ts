/**
 * Live sync of a room's furniture between devices: when a page or a screen takes the design that
 * another device saved, so the phone and the website show the same room.
 *
 * The rule, the same on every device. Adopt the server's design when all of these hold:
 *   1. the snapshot comes from the server, not from this device's own pending write;
 *   2. its design differs from the last design this device loaded or saved;
 *   3. the user has no unsaved edit or drag in progress.
 *
 * A design that arrives while the user is busy waits, and is taken once they are done — unless
 * this device saves first: its save then overwrites it on the server, so it is dropped. Plain
 * TypeScript with no Firebase import: `DesignFollower` is fed each snapshot's design and metadata.
 */
import { designToFirestore } from './design';
import type { Design } from './types';

/** True when two designs hold the same items in the same order (as Firestore stores them). */
export function designsEqual(a: Design, b: Design): boolean {
  const x = designToFirestore(a).items;
  const y = designToFirestore(b).items;
  return x.length === y.length && JSON.stringify(x) === JSON.stringify(y);
}

/** Where a snapshot came from, as Firestore's `snapshot.metadata` says. */
export interface SnapshotSource {
  /** From the local cache (no connection), not from the server. */
  fromCache: boolean;
  /** It includes this device's own write that the server has not confirmed yet. */
  hasPendingWrites: boolean;
}

/** What the user is doing that a design from the server must not interrupt. */
export interface DesignActivity {
  /** A change the server does not have yet: waiting for the autosave pause, or being written. */
  unsaved: boolean;
  /** A drag or a turn in progress (or a piece carried through the 3D view). */
  gesture: boolean;
}

/** The rule above, for one snapshot. */
export function shouldAdoptServerDesign(
  server: Design,
  source: SnapshotSource,
  baseline: Design,
  activity: DesignActivity,
): boolean {
  return (
    !source.fromCache &&
    !source.hasPendingWrites &&
    !designsEqual(server, baseline) &&
    !activity.unsaved &&
    !activity.gesture
  );
}

const copy = (design: Design): Design => designToFirestore(design);

/**
 * Follows the server's design for one open room. Tell it about every snapshot (`snapshot`), every
 * edit the user makes (`edited`), every save the server confirmed (`saved`), and when the user
 * stops (`resume`, after a gesture ends or a save settles). `snapshot` and `resume` return the
 * design to show now, or null to keep what the user sees.
 */
export class DesignFollower {
  private base: Design;
  private waiting: Design | null = null;

  constructor(initial: Design) {
    this.base = copy(initial);
  }

  /** The last design this device loaded or saved. */
  get baseline(): Design {
    return this.base;
  }

  /** A server design that arrived while the user was busy, still to be taken. */
  get deferred(): Design | null {
    return this.waiting;
  }

  /** A snapshot of the room arrived. Returns the design to adopt, or null. */
  snapshot(design: Design, source: SnapshotSource, activity: DesignActivity): Design | null {
    if (source.fromCache || source.hasPendingWrites) return null;
    if (designsEqual(design, this.base)) {
      this.waiting = null;
      return null;
    }
    if (activity.unsaved || activity.gesture) {
      this.waiting = copy(design);
      return null;
    }
    this.base = copy(design);
    this.waiting = null;
    return this.base;
  }

  /** The user changed the design here: it will be saved over anything that waited. */
  edited(): void {
    this.waiting = null;
  }

  /** The server has `design`, written from this device. */
  saved(design: Design): void {
    this.base = copy(design);
    this.waiting = null;
  }

  /** The user is done (a gesture ended, nothing unsaved): the design that waited, if any. */
  resume(activity: DesignActivity): Design | null {
    const next = this.waiting;
    if (!next || activity.unsaved || activity.gesture) return null;
    this.waiting = null;
    if (designsEqual(next, this.base)) return null;
    this.base = next;
    return next;
  }
}
