import { useMemo, useState } from 'react';
import { LuArmchair, LuSearchX } from 'react-icons/lu';
import { CATALOG_CATEGORIES, type CatalogItem, type UnitSystem } from '@youngvista/core';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { thumbUrl, type CatalogIndex } from '@/lib/catalog';
import { formatDimensions } from '@/lib/furniture';

/**
 * Choosing a piece of furniture to add: categories, pictures, names and real sizes. The same
 * catalog as the phone (`/catalog/catalog.json`), the same categories in the same order.
 */
export function FurniturePicker({
  open,
  onOpenChange,
  catalog,
  units,
  onPick,
  hint,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: CatalogIndex;
  units: UnitSystem;
  onPick: (item: CatalogItem) => void;
  /** Where the piece will go, e.g. "It goes in a free spot; drag it where you want it." */
  hint: string;
}) {
  const groups = useMemo(
    () =>
      CATALOG_CATEGORIES.map((c) => ({
        ...c,
        items: catalog.catalog.items.filter((item) => item.category === c.id),
      })).filter((g) => g.items.length > 0),
    [catalog],
  );
  const [category, setCategory] = useState('all');
  const items =
    category === 'all'
      ? catalog.catalog.items
      : (groups.find((g) => g.id === category)?.items ?? []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(44rem,calc(100svh-2rem))] flex-col gap-3 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add furniture</DialogTitle>
          <DialogDescription>Real-size pieces. {hint}</DialogDescription>
        </DialogHeader>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={category}
          onValueChange={(v) => v && setCategory(v)}
          aria-label="Category"
          className="w-full flex-wrap justify-start"
          spacing={1}
        >
          <ToggleGroupItem value="all" className="rounded-full px-3">
            All
          </ToggleGroupItem>
          {groups.map((g) => (
            <ToggleGroupItem key={g.id} value={g.id} className="rounded-full px-3">
              {g.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-1">
          {items.length ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((item) => (
                <li key={item.id}>
                  <PickerCard item={item} units={units} onPick={() => onPick(item)} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center text-sm text-muted-foreground">
              <LuSearchX className="size-7" aria-hidden />
              Nothing in this category yet.
              <Button variant="outline" size="sm" onClick={() => setCategory('all')}>
                Show all furniture
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PickerCard({
  item,
  units,
  onPick,
}: {
  item: CatalogItem;
  units: UnitSystem;
  onPick: () => void;
}) {
  const [broken, setBroken] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const thumb = thumbUrl(item);
  const colours = item.variants.length;
  const size = formatDimensions(item.dimensions, units);
  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={`Add ${item.name}, ${size}`}
      className="group flex h-full w-full flex-col overflow-hidden rounded-xl border bg-card text-left outline-none transition-shadow hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="relative flex aspect-square items-center justify-center bg-muted/40">
        {thumb && !broken ? (
          <>
            {loaded ? null : <Skeleton className="absolute inset-4 rounded-lg" />}
            <img
              src={thumb}
              alt=""
              loading="lazy"
              onLoad={() => setLoaded(true)}
              onError={() => setBroken(true)}
              className="size-[88%] object-contain transition-transform group-hover:scale-[1.03]"
            />
          </>
        ) : (
          <LuArmchair className="size-8 text-muted-foreground" aria-hidden />
        )}
      </span>
      <span className="grid gap-0.5 p-2.5">
        <span className="line-clamp-2 text-sm font-medium">{item.name}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{size}</span>
        {colours > 1 ? (
          <span className="text-xs text-muted-foreground">{colours} colours</span>
        ) : null}
      </span>
    </button>
  );
}
