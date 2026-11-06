import { DarkTheme, DefaultTheme, type Theme } from 'expo-router';

/** The colours of global.css as plain values, for navigation bars and SVG drawings. */
export const THEME = {
  light: {
    background: 'hsl(0 0% 100%)',
    foreground: 'hsl(0 0% 3.9%)',
    card: 'hsl(0 0% 100%)',
    primary: 'hsl(0 0% 9%)',
    muted: 'hsl(0 0% 96.1%)',
    mutedForeground: 'hsl(0 0% 45.1%)',
    destructive: 'hsl(0 84.2% 60.2%)',
    border: 'hsl(0 0% 89.8%)',
    /** Plan drawing. */
    planFill: 'hsla(0, 0%, 9%, 0.05)',
    planInferred: 'hsl(0 0% 63%)',
    planGlass: 'hsl(205 70% 80%)',
    planItem: 'hsla(30, 25%, 45%, 0.16)',
    planItemStroke: 'hsl(30 12% 40%)',
    planRug: 'hsla(30, 25%, 45%, 0.07)',
    planSelected: 'hsl(217 91% 50%)',
    planSelectedFill: 'hsla(217, 91%, 50%, 0.18)',
    planInvalid: 'hsl(0 84% 55%)',
    planInvalidFill: 'hsla(0, 84%, 55%, 0.22)',
  },
  dark: {
    background: 'hsl(0 0% 3.9%)',
    foreground: 'hsl(0 0% 98%)',
    card: 'hsl(0 0% 3.9%)',
    primary: 'hsl(0 0% 98%)',
    muted: 'hsl(0 0% 14.9%)',
    mutedForeground: 'hsl(0 0% 63.9%)',
    destructive: 'hsl(0 70.9% 59.4%)',
    border: 'hsl(0 0% 14.9%)',
    planFill: 'hsla(0, 0%, 98%, 0.06)',
    planInferred: 'hsl(0 0% 45%)',
    planGlass: 'hsl(205 45% 40%)',
    planItem: 'hsla(30, 25%, 70%, 0.18)',
    planItemStroke: 'hsl(30 15% 70%)',
    planRug: 'hsla(30, 25%, 70%, 0.08)',
    planSelected: 'hsl(213 94% 68%)',
    planSelectedFill: 'hsla(213, 94%, 68%, 0.2)',
    planInvalid: 'hsl(0 80% 62%)',
    planInvalidFill: 'hsla(0, 80%, 62%, 0.25)',
  },
} as const;

export type ColorScheme = keyof typeof THEME;

export const NAV_THEME: Record<ColorScheme, Theme> = {
  light: {
    ...DefaultTheme,
    colors: {
      background: THEME.light.background,
      border: THEME.light.border,
      card: THEME.light.card,
      notification: THEME.light.destructive,
      primary: THEME.light.primary,
      text: THEME.light.foreground,
    },
  },
  dark: {
    ...DarkTheme,
    colors: {
      background: THEME.dark.background,
      border: THEME.dark.border,
      card: THEME.dark.card,
      notification: THEME.dark.destructive,
      primary: THEME.dark.primary,
      text: THEME.dark.foreground,
    },
  },
};
