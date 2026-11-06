import { useState } from 'react';
import { LuArmchair, LuExternalLink, LuTriangleAlert } from 'react-icons/lu';
import type { CatalogItem, UnitSystem } from '@youngvista/core';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { LICENSES, thumbUrl, type CatalogState } from '@/lib/catalog';
import { formatDimensions, type FurnitureEntry } from '@/lib/furniture';

interface FurnitureListProps {
  furniture: readonly FurnitureEntry[];
  units: UnitSystem;
  catalog: CatalogState['status'];
  /** The owner's page, where furniture can be added above. */
  editable?: boolean;
}

/** The room's furniture with real sizes, then the credits for the 3D models used. */
export function FurnitureList({ furniture, units, catalog, editable = false }: FurnitureListProps) {
  const products = [
    ...new Map(
      furniture.flatMap((f) => (f.product ? [[f.product.id, f.product] as const] : [])),
    ).values(),
  ];
  const count = furniture.length;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Furniture</CardTitle>
        <CardDescription>
          {count === 0
            ? 'Nothing placed yet.'
            : `${count} ${count === 1 ? 'piece' : 'pieces'}, shown at real size.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {catalog === 'error' ? (
          <Alert variant="destructive">
            <LuTriangleAlert aria-hidden />
            <AlertDescription>
              Furniture details could not be loaded. Check your connection and reload the page.
            </AlertDescription>
          </Alert>
        ) : null}

        {count === 0 ? (
          <p className="text-sm text-muted-foreground">
            {editable
              ? 'Add furniture with “Add furniture” above, or in the phone app. It shows in both.'
              : 'Add furniture to this room in the phone app and it will show up here.'}
          </p>
        ) : catalog === 'loading' ? (
          <div className="grid gap-3" aria-label="Loading furniture">
            {furniture.slice(0, 3).map((f) => (
              <div key={f.item.id} className="flex items-center gap-3">
                <Skeleton className="size-12 rounded-md" />
                <div className="grid flex-1 gap-1.5">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {furniture.map((f) => (
              <li key={f.item.id} className="flex min-w-0 items-center gap-3">
                <Thumb product={f.product} variant={f.item.variant} />
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {f.name}
                    {f.variantName ? (
                      <span className="font-normal text-muted-foreground"> · {f.variantName}</span>
                    ) : null}
                  </p>
                  <p className="text-sm text-muted-foreground tabular-nums">
                    {f.product
                      ? formatDimensions(f.product.dimensions, units)
                      : 'Not in the catalog any more'}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}

        {products.length > 0 ? (
          <div className="grid gap-2 border-t pt-4">
            <h3 className="text-sm font-medium">3D model credits</h3>
            <ul className="grid gap-1.5 text-xs text-muted-foreground">
              {products.map((p) => (
                <li key={p.id}>
                  <span className="text-foreground">{p.name}</span>
                  {p.credit ? ` by ${p.credit}` : ''}
                  {', '}
                  <a
                    href={LICENSES[p.license].url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    {LICENSES[p.license].label}
                  </a>
                  {p.sourceUrl ? (
                    <>
                      {', '}
                      <a
                        href={p.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-foreground"
                      >
                        source
                        <LuExternalLink className="size-3" aria-hidden />
                      </a>
                    </>
                  ) : null}
                  . Resized and optimised.
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Thumb({ product, variant }: { product: CatalogItem | null; variant?: string }) {
  const [broken, setBroken] = useState(false);
  const src = product ? thumbUrl(product, variant) : null;
  return (
    <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/50">
      {src && !broken ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          className="size-full object-contain"
          onError={() => setBroken(true)}
        />
      ) : (
        <LuArmchair className="size-5 text-muted-foreground" aria-hidden />
      )}
    </span>
  );
}
