/**
 * Choosing a piece of furniture to add: categories, pictures, names and real sizes. Opens as a
 * sheet over the furniture screen or the camera view (an AR session keeps running under it).
 */
import type { CatalogItem, UnitSystem } from '@youngvista/core';
import { useMemo, useState } from 'react';
import { FlatList, Image, Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LuArmchair, LuSearchX, LuView, LuX } from 'react-icons/lu';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
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
  onPlaceFreely,
}: {
  visible: boolean;
  catalog: CatalogIndex;
  units: UnitSystem;
  onPick: (item: CatalogItem) => void;
  onClose: () => void;
  /** The credits link at the bottom. Left out over the camera view: leaving it ends AR. */
  onCredits?: () => void;
  /** "Place freely": try pieces in the camera view, no room needed. */
  onPlaceFreely?: () => void;
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
        <View className="flex-row items-center justify-between gap-2 px-4 pb-2 pt-3">
          <Text className="flex-1 text-lg font-semibold">Add furniture</Text>
          {onPlaceFreely ? (
            <Button
              variant="outline"
              size="sm"
              onPress={onPlaceFreely}
              accessibilityHint="Opens the camera to try pieces in any room, without saving."
            >
              <Icon as={LuView} size={14} />
              <Text>Place freely</Text>
            </Button>
          ) : null}
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
          ListEmptyComponent={
            <View className="items-center gap-3 px-6 py-12">
              <Icon as={LuSearchX} size={28} className="text-muted-foreground" />
              <Text className="text-muted-foreground text-center text-sm">
                {category
                  ? 'Nothing in this category yet. Try another one.'
                  : 'The furniture list is empty. Check your connection and open it again.'}
              </Text>
              {category ? (
                <Button variant="outline" onPress={() => setCategory(null)}>
                  <Text>Show all furniture</Text>
                </Button>
              ) : null}
            </View>
          }
          ListFooterComponent={
            onCredits ? (
              <Pressable onPress={onCredits} accessibilityRole="link" className="py-4">
                <Text className="text-muted-foreground text-center text-xs underline">
                  3D model credits and licences
                </Text>
              </Pressable>
            ) : (
              <View className="py-4" />
            )
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
  const [loaded, setLoaded] = useState(false);
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
          <>
            {loaded ? null : <Skeleton className="absolute inset-4 rounded-lg" />}
            <Image
              source={{ uri: thumb }}
              resizeMode="contain"
              style={{ width: '88%', height: '88%' }}
              onLoad={() => setLoaded(true)}
              onError={() => setBroken(true)}
              accessible={false}
            />
          </>
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
