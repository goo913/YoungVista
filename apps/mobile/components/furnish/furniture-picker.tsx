/**
 * Choosing a piece of furniture to add: categories, pictures, names and real sizes. Opens as a
 * sheet over the furniture screen.
 */
import type { CatalogItem, UnitSystem } from '@youngvista/core';
import { useMemo, useState } from 'react';
import { FlatList, Image, Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LuArmchair, LuX } from 'react-icons/lu';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { formatSize } from '@/furnish/describe';
import { categoryGroups, thumbUrl, type CatalogIndex } from '@/lib/catalog-data';
import { cn } from '@/lib/utils';

export function FurniturePicker({
  visible,
  catalog,
  units,
  onPick,
  onClose,
  onCredits,
}: {
  visible: boolean;
  catalog: CatalogIndex;
  units: UnitSystem;
  onPick: (item: CatalogItem) => void;
  onClose: () => void;
  onCredits: () => void;
}) {
  const groups = useMemo(() => categoryGroups(catalog.catalog), [catalog]);
  const [category, setCategory] = useState<string | null>(null);
  // An odd count gets an empty cell at the end, so the last card keeps the width of the others.
  const items = useMemo<(CatalogItem | null)[]>(() => {
    const list = category
      ? (groups.find((g) => g.id === category)?.items ?? [])
      : catalog.catalog.items;
    return list.length % 2 ? [...list, null] : list;
  }, [category, groups, catalog]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="bg-background flex-1" edges={['top', 'bottom']}>
        <View className="flex-row items-center justify-between px-4 pb-2 pt-3">
          <Text className="text-lg font-semibold">Add furniture</Text>
          <Button variant="ghost" size="icon" onPress={onClose} accessibilityLabel="Close">
            <Icon as={LuX} size={20} />
          </Button>
        </View>
        <View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2 px-4 pb-3"
          >
            <Chip label="All" active={category === null} onPress={() => setCategory(null)} />
            {groups.map((g) => (
              <Chip
                key={g.id}
                label={g.label}
                active={category === g.id}
                onPress={() => setCategory(g.id)}
              />
            ))}
          </ScrollView>
        </View>
        <FlatList
          data={items}
          keyExtractor={(item) => item?.id ?? 'empty'}
          numColumns={2}
          columnWrapperClassName="gap-3"
          contentContainerClassName="gap-3 px-4 pb-6"
          renderItem={({ item }) =>
            item ? (
              <PickerCard item={item} units={units} onPress={() => onPick(item)} />
            ) : (
              <View className="flex-1" />
            )
          }
          ListFooterComponent={
            <Pressable onPress={onCredits} accessibilityRole="link" className="py-4">
              <Text className="text-muted-foreground text-center text-xs underline">
                3D model credits and licences
              </Text>
            </Pressable>
          }
        />
      </SafeAreaView>
    </Modal>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={cn(
        'border-border h-8 justify-center rounded-full border px-3',
        active ? 'bg-primary border-primary' : 'bg-background',
      )}
    >
      <Text className={cn('text-sm', active ? 'text-primary-foreground' : 'text-foreground')}>
        {label}
      </Text>
    </Pressable>
  );
}

function PickerCard({
  item,
  units,
  onPress,
}: {
  item: CatalogItem;
  units: UnitSystem;
  onPress: () => void;
}) {
  const [broken, setBroken] = useState(false);
  const thumb = thumbUrl(item);
  const colours = item.variants.length;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Add ${item.name}, ${formatSize(item.dimensions, units)}`}
      className="border-border bg-card flex-1 overflow-hidden rounded-xl border active:opacity-80"
    >
      <View className="bg-muted/40 aspect-square items-center justify-center">
        {thumb && !broken ? (
          <Image
            source={{ uri: thumb }}
            resizeMode="contain"
            style={{ width: '88%', height: '88%' }}
            onError={() => setBroken(true)}
          />
        ) : (
          <Icon as={LuArmchair} size={32} className="text-muted-foreground" />
        )}
      </View>
      <View className="gap-0.5 p-2.5">
        <Text className="text-sm font-medium" numberOfLines={2}>
          {item.name}
        </Text>
        <Text className="text-muted-foreground text-xs">{formatSize(item.dimensions, units)}</Text>
        {colours > 1 ? (
          <Text className="text-muted-foreground text-xs">{colours} colours</Text>
        ) : null}
      </View>
    </Pressable>
  );
}
