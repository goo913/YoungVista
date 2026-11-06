import { LuCopy, LuRotateCcw, LuRotateCw, LuTrash2, LuX } from 'react-icons/lu';
import {
  catalogVariant,
  type CatalogItem,
  type DesignItem,
  type UnitSystem,
} from '@youngvista/core';
import { Button } from '@/components/ui/button';
import { formatDimensions } from '@/lib/furniture';
import { cn } from '@/lib/utils';

/** The colour an item shows: its saved variant, else the first (the item's own look). */
const activeVariant = (product: CatalogItem, variant?: string) =>
  catalogVariant(product, variant) ?? product.variants[0] ?? null;

/**
 * The selected piece, as the phone's item panel: its name and real size, turn it 15° either way,
 * copy or remove it, and its colours when it has some.
 */
export function ItemPanel({
  item,
  product,
  units,
  problem,
  onRotate,
  onDuplicate,
  onRemove,
  onVariant,
  onClose,
}: {
  item: DesignItem;
  product: CatalogItem | null;
  units: UnitSystem;
  /** Why it cannot stay where it is ("Overlaps the sofa"), or null. */
  problem: string | null;
  onRotate: (degrees: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onVariant: (variant: string) => void;
  onClose: () => void;
}) {
  const variant = product ? activeVariant(product, item.variant) : null;
  return (
    <section aria-label="Selected piece" className="grid gap-3 rounded-lg border bg-background p-3">
      <div className="flex items-start gap-3">
        <div className="grid min-w-0 flex-1 gap-0.5">
          <p className="truncate font-medium">
            {product?.name ?? 'Unknown piece'}
            {variant ? (
              <span className="font-normal text-muted-foreground"> · {variant.name}</span>
            ) : null}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {product ? formatDimensions(product.dimensions, units) : 'Not in the catalog any more'}
          </p>
          {problem ? <p className="text-xs text-destructive">{problem}</p> : null}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="-mt-1 -mr-1"
          onClick={onClose}
          aria-label="Done with this piece"
          title="Done (Esc)"
        >
          <LuX aria-hidden />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Button
          variant="outline"
          onClick={() => onRotate(15)}
          aria-label="Turn 15 degrees counter-clockwise"
          title="Turn 15° counter-clockwise ( [ )"
        >
          <LuRotateCcw aria-hidden />
          15°
        </Button>
        <Button
          variant="outline"
          onClick={() => onRotate(-15)}
          aria-label="Turn 15 degrees clockwise"
          title="Turn 15° clockwise ( ] or R )"
        >
          <LuRotateCw aria-hidden />
          15°
        </Button>
        <Button variant="outline" onClick={onDuplicate} title="Add another one">
          <LuCopy aria-hidden />
          Copy
        </Button>
        <Button
          variant="outline"
          onClick={onRemove}
          title="Remove (Delete)"
          className="text-destructive"
        >
          <LuTrash2 aria-hidden />
          Remove
        </Button>
      </div>
      {product && product.variants.length > 1 ? (
        <div role="group" aria-label="Colour" className="flex flex-wrap gap-3">
          {product.variants.map((v) => {
            const active = v.id === variant?.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => onVariant(v.id)}
                aria-label={`Colour: ${v.name}`}
                aria-pressed={active}
                className="group flex flex-col items-center gap-1 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span
                  className={cn(
                    'flex size-9 items-center justify-center rounded-full border-2',
                    active ? 'border-primary' : 'border-transparent group-hover:border-border',
                  )}
                >
                  <span
                    className="size-7 rounded-full border"
                    style={{ backgroundColor: v.swatch ?? '#cccccc' }}
                  />
                </span>
                <span className={cn('text-xs', active ? 'font-medium' : 'text-muted-foreground')}>
                  {v.name}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
