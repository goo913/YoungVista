import type { Design, Room } from '@youngvista/core';
import { useMemo, useReducer } from 'react';
import { newItemId } from './ids';
import {
  initialDesignState,
  reduceDesign,
  type DesignAction,
  type DesignContext,
  type DesignState,
} from './design-state';
import type { CatalogIndex } from '@/lib/catalog-data';

/**
 * The design reducer for one room: the furniture screen and the AR view both arrange pieces with
 * it (design-state.ts), so the same rules apply in 3D, on the plan and in the camera view.
 */
export function useDesign(room: Room, catalog: CatalogIndex, initial: Design) {
  const ctx = useMemo<DesignContext>(
    () => ({ room, product: catalog.product, newId: () => newItemId() }),
    [room, catalog],
  );
  // The reducer reads this render's room and catalog (React runs the latest reducer).
  const [state, dispatch] = useReducer(
    (s: DesignState, action: DesignAction) => reduceDesign(s, action, ctx),
    initial.items,
    initialDesignState,
  );
  return { state, dispatch, ctx };
}
