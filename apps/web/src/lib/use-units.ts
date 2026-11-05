import { useCallback, useState } from 'react';
import type { UnitSystem } from '@youngvista/core';

const KEY = 'youngvista.units';

function stored(): UnitSystem | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'imperial' || v === 'metric' ? v : null;
  } catch {
    return null;
  }
}

/** Feet and inches by default, with a metres switch remembered on this device. */
export function useUnits(): [UnitSystem, (units: UnitSystem) => void] {
  const [units, setUnits] = useState<UnitSystem>(() => stored() ?? 'imperial');
  const update = useCallback((next: UnitSystem) => {
    setUnits(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Storage can be unavailable (private windows); the choice then lasts for this page.
    }
  }, []);
  return [units, update];
}
