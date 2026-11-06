/**
 * The design's pieces as the 3D view and the AR view draw and pick them: true size from the
 * catalog, the model's file, and a box for picking with a finger.
 */
import {
  itemFootprint,
  type CatalogDimensions,
  type CatalogItem,
  type DesignItem,
} from '@youngvista/core';
import type { SceneItem } from '@/components/furnish/room-scene';
import { modelUrl } from '@/lib/catalog-data';
import type { PickBox } from './orbit';

/** Size used for pieces whose product is not in the catalog any more. */
export const UNKNOWN_SIZE: CatalogDimensions = { w: 0.5, d: 0.5, h: 0.5 };

export function sceneItem(
  item: DesignItem,
  product: CatalogItem | null,
  highlight: SceneItem['highlight'],
): SceneItem {
  return {
    id: item.id,
    x: item.x,
    y: item.y ?? 0,
    z: item.z,
    rotationY: item.rotationY,
    size: product?.dimensions ?? UNKNOWN_SIZE,
    modelUrl: product ? modelUrl(product, item.variant) : null,
    label: product ? `${product.name} (model not available)` : 'Unknown piece',
    highlight,
  };
}

export function pickBoxFor(item: DesignItem, product: CatalogItem | null): PickBox {
  const size = product?.dimensions ?? UNKNOWN_SIZE;
  return { id: item.id, footprint: itemFootprint(item, size), y: item.y ?? 0, height: size.h };
}
