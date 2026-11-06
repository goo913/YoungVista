/**
 * The furniture in a room while the user arranges it: add, select, drag, rotate, duplicate,
 * delete and recolour items. The reducer lives in core (packages/core/src/design-state.ts), shared
 * with the website, so a room furnished on the phone or on the website follows the same rules.
 */
export {
  checkItem,
  displayedItems,
  initialDesignState,
  itemChecks,
  placeAt,
  reduceDesign,
  selectedItem,
  withPose,
  type DesignAction,
  type DesignContext,
  type DesignGesture,
  type DesignNotice,
  type DesignState,
  type ItemCheck,
  type ItemPose,
} from '@youngvista/core';
