import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UnitSystem } from '@youngvista/core';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/** Same key as the website's localStorage setting. */
const KEY = 'youngvista.units';

type UnitsValue = [UnitSystem, (units: UnitSystem) => void];

const UnitsContext = createContext<UnitsValue>(['imperial', () => {}]);

/** Feet and inches by default, with a metres switch remembered on this phone. */
export function UnitsProvider({ children }: { children: ReactNode }) {
  const [units, setUnits] = useState<UnitSystem>('imperial');
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(KEY)
      .then((stored) => {
        if (active && (stored === 'imperial' || stored === 'metric')) setUnits(stored);
      })
      .catch(() => {
        // Unreadable storage: keep feet and inches.
      });
    return () => {
      active = false;
    };
  }, []);
  const update = useCallback((next: UnitSystem) => {
    setUnits(next);
    AsyncStorage.setItem(KEY, next).catch(() => {
      // The choice then lasts until the app closes.
    });
  }, []);
  const value = useMemo<UnitsValue>(() => [units, update], [units, update]);
  return <UnitsContext.Provider value={value}>{children}</UnitsContext.Provider>;
}

export const useUnits = (): UnitsValue => useContext(UnitsContext);
