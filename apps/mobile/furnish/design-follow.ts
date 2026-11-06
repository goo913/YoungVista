/**
 * Following design changes made elsewhere (the website, another phone) on a screen that arranges
 * the furniture (the furnish screen, the AR view). The rule, the same as the website's:
 *
 * adopt the server's design when all of these hold
 * - a snapshot arrives from the server, not our own pending write (lib/rooms.ts `ServerDesign`);
 * - its design differs from the last design this screen loaded or saved;
 * - the user has no unsaved edit or gesture in progress.
 *
 * Otherwise the last write wins: an edit in progress is saved over it. A snapshot that arrives
 * mid-gesture is kept, and adopted once the gesture ends without a change; an edit saved since
 * replaces it. No Firestore fields are added: designs are compared by their stored form.
 *
 * Plain TypeScript, unit tested. A screen makes one with `useDesignFollower`, hands its `saved`
 * to its autosave, and runs `useFollowServerDesign` with the autosave's status.
 */
import { designToFirestore, type Design, type DesignItem } from '@youngvista/core';
import { useEffect, useRef, useState } from 'react';
import type { ServerDesign } from '@/lib/rooms';

/** A design's stored form as text, to compare two designs. */
export const designKey = (design: Design | readonly DesignItem[]): string =>
  JSON.stringify(
    designToFirestore(
      Array.isArray(design) ? { items: design as DesignItem[] } : (design as Design),
    ),
  );

export class DesignFollower {
  /** The last design this screen loaded or saved. */
  private known: string;
  /** The last server revision looked at. */
  private seen: number;
  /** A server design that arrived while the user was busy. */
  private missed: ServerDesign | null = null;

  /**
   * `initial`: the design the screen opened with; `server`: the server's design then (already
   * taken into account: the screen showed it, or a newer copy with this phone's edits).
   */
  constructor(initial: Design, server: ServerDesign | null) {
    this.known = designKey(initial);
    this.seen = server?.revision ?? -1;
  }

  /**
   * This screen's save of `design` reached the server: it is the last write this screen knows.
   * (A property, so the autosave can be handed it as it is.)
   */
  saved = (design: Design): void => {
    this.known = designKey(design);
    this.missed = null;
  };

  /**
   * Called with the newest server design, the screen's items now, and whether the user is in the
   * middle of something (a gesture, a save on its way, an edit kept on the phone). Returns the
   * design to load, or null.
   */
  check(server: ServerDesign | null, items: readonly DesignItem[], busy: boolean): Design | null {
    // Items that differ from the last design loaded or saved are an unsaved edit.
    const idle = !busy && designKey(items) === this.known;
    // Revisions only grow (lib/rooms.ts); an older one is never news.
    if (server && server.revision > this.seen) {
      this.seen = server.revision;
      const key = designKey(server.design);
      if (key === this.known) {
        this.missed = null;
        return null;
      }
      if (!idle) {
        this.missed = server;
        return null;
      }
      return this.adopt(server.design, key);
    }
    if (idle && this.missed) {
      const missed = this.missed;
      this.missed = null;
      const key = designKey(missed.design);
      return key === this.known ? null : this.adopt(missed.design, key);
    }
    return null;
  }

  private adopt(design: Design, key: string): Design {
    this.known = key;
    this.missed = null;
    return design;
  }
}

/** One follower for a screen, made from the design it opened with and the server's then. */
export function useDesignFollower(initial: Design, server: ServerDesign | null): DesignFollower {
  const [follower] = useState(() => new DesignFollower(initial, server));
  return follower;
}

/**
 * Loads the server's design into a screen's design state when the rule above says so
 * (`onAdopt`). `busy`: a gesture is in progress, a save is on its way (the autosave is not
 * "saved"), or an edit is kept on the phone for the server.
 */
export function useFollowServerDesign(
  follower: DesignFollower,
  {
    server,
    items,
    busy,
    onAdopt,
  }: {
    server: ServerDesign | null;
    items: readonly DesignItem[];
    busy: boolean;
    onAdopt: (design: Design) => void;
  },
): void {
  const adopt = useRef(onAdopt);
  useEffect(() => {
    adopt.current = onAdopt;
  });
  useEffect(() => {
    const next = follower.check(server, items, busy);
    if (next) adopt.current(next);
  }, [follower, server, items, busy]);
}
