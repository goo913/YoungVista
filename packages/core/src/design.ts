import type { Design, DesignItem } from './types';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** One design item as stored, without `undefined` fields (Firestore rejects them). */
function cleanItem(item: DesignItem): DesignItem {
  const out: DesignItem = {
    id: item.id,
    productId: item.productId,
    x: item.x,
    z: item.z,
    rotationY: item.rotationY,
  };
  if (typeof item.variant === 'string' && item.variant) out.variant = item.variant;
  if (isNum(item.y) && item.y !== 0) out.y = item.y;
  return out;
}

/**
 * Reads `RoomDoc.design` (or `ShareDoc.design`) from Firestore data. Items that are not usable
 * (missing ids or positions) are left out; a missing design is an empty one.
 */
export function designFromFirestore(data: unknown): Design {
  if (!isObj(data) || !Array.isArray(data.items)) return { items: [] };
  const items: DesignItem[] = [];
  for (const v of data.items) {
    if (!isObj(v)) continue;
    const { id, productId, x, z, rotationY, variant, y } = v;
    if (typeof id !== 'string' || !id || typeof productId !== 'string' || !productId) continue;
    if (!isNum(x) || !isNum(z)) continue;
    items.push(
      cleanItem({
        id,
        productId,
        x,
        z,
        rotationY: isNum(rotationY) ? rotationY : 0,
        variant: typeof variant === 'string' ? variant : undefined,
        y: isNum(y) ? y : undefined,
      }),
    );
  }
  return { items };
}

/** A copy of a design that Firestore can store: no `undefined` fields, `y` only when set. */
export function designToFirestore(design: Design): Design {
  return { items: design.items.map(cleanItem) };
}
