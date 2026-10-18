import React, { createContext, useContext, useState, useMemo } from 'react';
import { useColorScheme as useDeviceColorScheme } from 'react-native';
import { storage } from '@/services/storage';
import {
  ThemeMode,
  BASE_THEMES,
  ActiveThemeColors,
} from '@/constants/Colors';

const THEME_MODE_STORAGE_KEY = '@athena_theme_mode';

export interface ThemeContextData {
  mode: ThemeMode;
  isDark: boolean;
  colors: ActiveThemeColors;
  theme: ActiveThemeColors; // alias para compatibilidade com código antigo
  accentColor: string;      // alias para compatibilidade com código antigo
  setMode: (newMode: ThemeMode) => void;
  toggleTheme: () => void;
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
    return 'light'; // Padrão Notion Light
  });

  const isDark = useMemo(() => {
    if (mode === 'system') {
      return deviceColorScheme !== 'light';
    }
    return mode === 'dark';
  }, [mode, deviceColorScheme]);

  const colors = useMemo<ActiveThemeColors>(() => {
    const base = isDark ? BASE_THEMES.dark : BASE_THEMES.light;

    if (isDark) {
      // No modo escuro: padrão Athena clássico com Dourado (#EAE115)
      return {
        ...base,
        primary: '#EAE115',
        primarySubtle: 'rgba(234, 225, 21, 0.14)',
        primaryBorder: 'rgba(234, 225, 21, 0.35)',
      };
    }

    // No modo claro: Notion Light com Azul Notion (#2383E2) para botões e ações
    return {
      ...base,
      primary: '#2383E2',
      primarySubtle: 'rgba(35, 131, 226, 0.10)',
      primaryBorder: 'rgba(35, 131, 226, 0.25)',
    };
  }, [isDark]);

  const setMode = (newMode: ThemeMode) => {
    setModeState(newMode);
    storage.set(THEME_MODE_STORAGE_KEY, newMode);
  };

  const toggleTheme = () => {
    const next: ThemeMode = isDark ? 'light' : 'dark';
    setMode(next);
  };

  const value = useMemo<ThemeContextData>(
    () => ({
      mode,
      isDark,
      colors,
      theme: colors,
      accentColor: colors.primary,
      setMode,
      toggleTheme,
    }),
    [mode, isDark, colors]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): ThemeContextData {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Fallback gracioso caso chamado fora do Provider
    const fallbackBase = BASE_THEMES.light;
    const fallbackColors: ActiveThemeColors = {
      ...fallbackBase,
      primary: '#2383E2',
      primarySubtle: 'rgba(35, 131, 226, 0.10)',
      primaryBorder: 'rgba(35, 131, 226, 0.25)',
    };
    return {
      mode: 'light',
      isDark: false,
      colors: fallbackColors,
      theme: fallbackColors,
      accentColor: '#2383E2',
      setMode: () => {},
      toggleTheme: () => {},
    };
  }
  return ctx;
}

export const useTheme = useAppTheme;
export default ThemeContext;
