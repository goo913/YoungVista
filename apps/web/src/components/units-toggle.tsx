import type { UnitSystem } from '@youngvista/core';
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
      aria-label="Units"
    >
      <ToggleGroupItem value="imperial" aria-label="Feet and inches" className="px-3">
        ft
      </ToggleGroupItem>
      <ToggleGroupItem value="metric" aria-label="Metres" className="px-3">
        m
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
