import type { UnitSystem } from '@youngvista/core';
import { LuPlus } from 'react-icons/lu';
import { ItemPanel } from '@/components/furnish/item-panel';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { ArController } from '@/ar/controller';
import { ArCard } from './ar-hud';
import type { useArFurniture } from './use-ar-furniture';

/**
 * The bottom card once the room is lined up (or the floor found, placing freely): the selected
 * piece's name, size, 15° turns, copy, remove and colours; else what to do and "Add furniture",
 * which puts the chosen piece where the dot is.
 */
export function ArFurnitureCard({
  ar,
  controller,
  units,
  hint,
  onAddError,
}: {
  ar: ReturnType<typeof useArFurniture>;
  controller: ArController;
  units: UnitSystem;
  hint: string;
  onAddError: (message: string) => void;
}) {
  const { selected, product, dispatch } = ar;
  if (selected) {
    return (
      <ArCard>
        <ItemPanel
          item={selected}
          product={product(selected.productId)}
          units={units}
          onRotate={(degrees) => dispatch({ type: 'rotate-by', id: selected.id, degrees })}
          onDuplicate={() => dispatch({ type: 'duplicate', id: selected.id })}
          onRemove={() => dispatch({ type: 'remove', id: selected.id })}
          onVariant={(variant) => dispatch({ type: 'set-variant', id: selected.id, variant })}
          onClose={() => dispatch({ type: 'select', id: null })}
        />
      </ArCard>
    );
  }
  return (
    <ArCard>
      <Text className="text-muted-foreground text-center text-xs">{hint}</Text>
      <Button
        size="lg"
        // The spot is the dot just before the finger touched (pressing shakes the phone).
        onPressIn={() => controller.holdAim()}
        onPress={() => {
          const error = ar.startAdd();
          if (error) onAddError(error);
        }}
        accessibilityHint="Puts the piece you choose where the dot in the middle of the screen is."
      >
        <Icon as={LuPlus} size={18} />
        <Text>Add furniture</Text>
      </Button>
    </ArCard>
  );
}
