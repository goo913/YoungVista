import type { CatalogItem } from '@youngvista/core';
import { useMemo } from 'react';
import { ActivityIndicator, Linking, Pressable, SectionList, View } from 'react-native';
import { LuExternalLink, LuTriangleAlert } from 'react-icons/lu';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { retryCatalog, useCatalog } from '@/lib/catalog';
import { creditGroups, LICENSES } from '@/lib/catalog-data';

const open = (url: string) => void Linking.openURL(url).catch(() => {});

/** Who made each furniture model and under which licence (CC BY models must be credited). */
export default function CreditsScreen() {
  const catalog = useCatalog();
  const sections = useMemo(
    () =>
      catalog.status === 'ready'
        ? creditGroups(catalog.data.catalog).map((g) => ({ license: g.license, data: g.items }))
        : [],
    [catalog],
  );

  if (catalog.status === 'loading') {
    return (
      <View className="bg-background flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }
  if (catalog.status === 'error') {
    return (
      <View className="bg-background flex-1 gap-4 p-4">
        <Alert variant="destructive" icon={LuTriangleAlert}>
          <AlertDescription>{catalog.message}</AlertDescription>
        </Alert>
        <Button onPress={retryCatalog}>
          <Text>Try again</Text>
        </Button>
      </View>
    );
  }

  return (
    <SectionList
      className="bg-background flex-1"
      contentContainerClassName="gap-1 p-4 pb-10"
      sections={sections}
      keyExtractor={(item) => item.id}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={
        <Text className="text-muted-foreground pb-2 text-sm">
          The furniture models come from Amazon Berkeley Objects, Poly Haven and the Khronos glTF
          samples. Each was resized to its real size and optimised for phones.
        </Text>
      }
      renderSectionHeader={({ section }) => {
        const license = LICENSES[section.license];
        return (
          <View className="gap-1 pb-1 pt-4">
            <Text className="font-semibold">{license.name}</Text>
            <Pressable onPress={() => open(license.url)} accessibilityRole="link">
              <Text className="text-muted-foreground text-xs underline">
                {license.label}: {license.url}
              </Text>
            </Pressable>
          </View>
        );
      }}
      renderItem={({ item }) => <CreditRow item={item} />}
    />
  );
}

function CreditRow({ item }: { item: CatalogItem }) {
  const license = LICENSES[item.license];
  return (
    <View className="border-border gap-0.5 border-b py-3">
      <Text className="text-sm font-medium">{item.name}</Text>
      <Text className="text-muted-foreground text-xs">
        {item.credit ? `By ${item.credit}` : 'Author not recorded'} · {license.label} · resized and
        optimised
      </Text>
      {item.sourceUrl ? (
        <Pressable
          onPress={() => open(item.sourceUrl)}
          accessibilityRole="link"
          accessibilityLabel={`Source of ${item.name}`}
          className="flex-row items-center gap-1 pt-0.5"
        >
          <Text className="text-xs underline" numberOfLines={1} style={{ flexShrink: 1 }}>
            {item.sourceUrl}
          </Text>
          <Icon as={LuExternalLink} size={12} className="text-muted-foreground" />
        </Pressable>
      ) : null}
    </View>
  );
}
