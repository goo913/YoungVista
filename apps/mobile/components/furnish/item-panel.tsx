/**
 * The selected piece: its name and real size, turn it 15° either way, copy or remove it, and its
 * colours when it has some. The four buttons stand in one row, or in two (`buttonRows`) where
 * the panel is narrow (the camera view's side column in landscape).
 */
import type { CatalogItem, DesignItem, UnitSystem } from '@youngvista/core';
import { Pressable, ScrollView, View } from 'react-native';
import { LuCopy, LuRotateCcw, LuRotateCw, LuTrash2, LuX } from 'react-icons/lu';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { formatSize } from '@/furnish/describe';
import { activeVariant } from '@/lib/catalog-data';
import { cn } from '@/lib/utils';

export function ItemPanel({
  item,
  product,
  units,
  onRotate,
  onDuplicate,
  onRemove,
  onVariant,
  onClose,
  buttonRows = 1,
}: {
  item: DesignItem;
  product: CatalogItem | null;
  units: UnitSystem;
  onRotate: (degrees: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onVariant: (variant: string) => void;
  onClose: () => void;
  buttonRows?: 1 | 2;
}) {
  const variant = product ? activeVariant(product, item.variant) : null;
  // Two rows: each button half the width (minus half the gap), so two fit side by side.
  const button = cn('px-0', buttonRows === 2 ? 'basis-[47%] grow' : 'flex-1');
  return (
    <View className="gap-3">
      <View className="flex-row items-start gap-3">
        <View className="flex-1 gap-0.5">
          <Text className="font-semibold" numberOfLines={1}>
            {product?.name ?? 'Unknown piece'}
            {variant ? (
              <Text className="text-muted-foreground font-normal"> · {variant.name}</Text>
            ) : null}
          </Text>
          <Text className="text-muted-foreground text-xs">
            {product ? formatSize(product.dimensions, units) : 'Not in the catalog any more'}
          </Text>
        </View>
        <Button
          variant="ghost"
          size="icon"
          className="-mr-2 -mt-2"
          onPress={onClose}
          accessibilityLabel="Done with this piece"
        >
          <Icon as={LuX} size={18} />
        </Button>
      </View>
      <View className={cn('flex-row gap-2', buttonRows === 2 && 'flex-wrap')}>
        <Button
          variant="outline"
          className={button}
          onPress={() => onRotate(15)}
          accessibilityLabel="Turn 15 degrees counter-clockwise"
        >
          <Icon as={LuRotateCcw} size={16} />
          <Text>15°</Text>
        </Button>
        <Button
          variant="outline"
          className={button}
          onPress={() => onRotate(-15)}
          accessibilityLabel="Turn 15 degrees clockwise"
        >
          <Icon as={LuRotateCw} size={16} />
          <Text>15°</Text>
        </Button>
        <Button
          variant="outline"
          className={button}
          onPress={onDuplicate}
          accessibilityLabel="Add another one"
        >
          <Icon as={LuCopy} size={16} />
          <Text>Copy</Text>
        </Button>
        <Button
          variant="outline"
          className={button}
          onPress={onRemove}
          accessibilityLabel="Remove this piece"
        >
          <Icon as={LuTrash2} size={16} className="text-destructive" />
          <Text className="text-destructive">Remove</Text>
        </Button>
      </View>
      {product && product.variants.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-3"
        >
          {product.variants.map((v) => {
            const active = v.id === variant?.id;
            return (
              <Pressable
                key={v.id}
                onPress={() => onVariant(v.id)}
                accessibilityRole="button"
                accessibilityLabel={`Colour: ${v.name}`}
                accessibilityState={{ selected: active }}
                className="items-center gap-1"
              >
                <View
                  className={cn(
                    'size-9 items-center justify-center rounded-full border-2',
                    active ? 'border-primary' : 'border-transparent',
                  )}
                >
                  <View
                    className="border-border size-7 rounded-full border"
                    style={{ backgroundColor: v.swatch ?? '#cccccc' }}
                  />
                </View>
                <Text className={cn('text-xs', active ? 'font-medium' : 'text-muted-foreground')}>
                  {v.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}
