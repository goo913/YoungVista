import type { UnitSystem } from '@youngvista/core';
import { Text } from '@/components/ui/text';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export function UnitsToggle({
  value,
  onChange,
}: {
  value: UnitSystem;
  onChange: (units: UnitSystem) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={value}
      onValueChange={(v) => {
        if (v === 'imperial' || v === 'metric') onChange(v);
      }}
      accessibilityLabel="Units"
    >
      <ToggleGroupItem
        value="imperial"
        accessibilityLabel="Feet and inches"
        isFirst
        className="px-3"
      >
        <Text>ft</Text>
      </ToggleGroupItem>
      <ToggleGroupItem value="metric" accessibilityLabel="Metres" isLast className="px-3">
        <Text>m</Text>
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
