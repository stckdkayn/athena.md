import React, { createContext, useContext, useState, useMemo } from 'react';
import { useColorScheme as useDeviceColorScheme } from 'react-native';
import { storage } from '@/services/storage';
import {
  ThemeMode,
  AccentColorKey,
  AccentOption,
  ACCENT_PALETTE,
  BASE_THEMES,
  ActiveThemeColors,
} from '@/constants/Colors';

const THEME_MODE_STORAGE_KEY = '@athena_theme_mode';
const ACCENT_COLOR_STORAGE_KEY = '@athena_accent_color';

export interface ThemeContextData {
  mode: ThemeMode;
  accentKey: AccentColorKey;
  isDark: boolean;
  colors: ActiveThemeColors;
  theme: ActiveThemeColors; // alias para compatibilidade com código antigo
  accentColor: string;      // alias para compatibilidade com código antigo
  accentOption: AccentOption;
  setMode: (newMode: ThemeMode) => void;
  setAccent: (newKey: AccentColorKey) => void;
  toggleTheme: () => void;
  availableAccents: AccentOption[];
}

const ThemeContext = createContext<ThemeContextData | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const deviceColorScheme = useDeviceColorScheme();

  // Leitura síncrona do MMKV (sem piscar tela)
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const saved = storage.getString(THEME_MODE_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved as ThemeMode;
    }
    return 'dark'; // Padrão Notion Dark
  });

  const [accentKey, setAccentKeyState] = useState<AccentColorKey>(() => {
    const saved = storage.getString(ACCENT_COLOR_STORAGE_KEY) as AccentColorKey;
    if (saved && ACCENT_PALETTE[saved]) {
      return saved;
    }
    return 'amarelo'; // Padrão Athena Dourado
  });

  const isDark = useMemo(() => {
    if (mode === 'system') {
      return deviceColorScheme !== 'light';
    }
    return mode === 'dark';
  }, [mode, deviceColorScheme]);

  const accentOption = useMemo(() => {
    return ACCENT_PALETTE[accentKey] || ACCENT_PALETTE.amarelo;
  }, [accentKey]);

  const colors = useMemo<ActiveThemeColors>(() => {
    const base = isDark ? BASE_THEMES.dark : BASE_THEMES.light;
    return {
      ...base,
      primary: accentOption.color,
      primarySubtle: accentOption.subtle,
      primaryBorder: accentOption.border,
    };
  }, [isDark, accentOption]);

  const setMode = (newMode: ThemeMode) => {
    setModeState(newMode);
    storage.set(THEME_MODE_STORAGE_KEY, newMode);
  };

  const setAccent = (newKey: AccentColorKey) => {
    if (ACCENT_PALETTE[newKey]) {
      setAccentKeyState(newKey);
      storage.set(ACCENT_COLOR_STORAGE_KEY, newKey);
    }
  };

  const toggleTheme = () => {
    const next: ThemeMode = isDark ? 'light' : 'dark';
    setMode(next);
  };

  const availableAccents = useMemo(() => Object.values(ACCENT_PALETTE), []);

  const value = useMemo<ThemeContextData>(
    () => ({
      mode,
      accentKey,
      isDark,
      colors,
      theme: colors,
      accentColor: accentOption.color,
      accentOption,
      setMode,
      setAccent,
      toggleTheme,
      availableAccents,
    }),
    [mode, accentKey, isDark, colors, accentOption, availableAccents]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): ThemeContextData {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Fallback gracioso caso chamado fora do Provider
    const fallbackBase = BASE_THEMES.dark;
    const fallbackAccent = ACCENT_PALETTE.amarelo;
    const fallbackColors: ActiveThemeColors = {
      ...fallbackBase,
      primary: fallbackAccent.color,
      primarySubtle: fallbackAccent.subtle,
      primaryBorder: fallbackAccent.border,
    };
    return {
      mode: 'dark',
      accentKey: 'amarelo',
      isDark: true,
      colors: fallbackColors,
      theme: fallbackColors,
      accentColor: fallbackAccent.color,
      accentOption: fallbackAccent,
      setMode: () => {},
      setAccent: () => {},
      toggleTheme: () => {},
      availableAccents: Object.values(ACCENT_PALETTE),
    };
  }
  return ctx;
}

export const useTheme = useAppTheme;
export default ThemeContext;
