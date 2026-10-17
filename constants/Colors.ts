export type ThemeMode = 'dark' | 'light' | 'system';

export type AccentColorKey = 'monocromatico' | 'amarelo' | 'azul' | 'verde' | 'roxo' | 'coral';

export interface AccentOption {
  key: AccentColorKey;
  label: string;
  color: string;
  subtle: string;
  border: string;
}

export const ACCENT_PALETTE: Record<AccentColorKey, AccentOption> = {
  monocromatico: {
    key: 'monocromatico',
    label: 'Notion Padrão',
    color: '#2383E2',
    subtle: 'rgba(35, 131, 226, 0.10)',
    border: 'rgba(35, 131, 226, 0.25)',
  },
  amarelo: {
    key: 'amarelo',
    label: 'Athena Dourado',
    color: '#EAE115',
    subtle: 'rgba(234, 225, 21, 0.12)',
    border: 'rgba(234, 225, 21, 0.35)',
  },
  azul: {
    key: 'azul',
    label: 'Azul Notion',
    color: '#2383E2',
    subtle: 'rgba(35, 131, 226, 0.10)',
    border: 'rgba(35, 131, 226, 0.25)',
  },
  verde: {
    key: 'verde',
    label: 'Verde Cirúrgico',
    color: '#10B981',
    subtle: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.35)',
  },
  roxo: {
    key: 'roxo',
    label: 'Índigo Noturno',
    color: '#8B5CF6',
    subtle: 'rgba(139, 92, 246, 0.12)',
    border: 'rgba(139, 92, 246, 0.35)',
  },
  coral: {
    key: 'coral',
    label: 'Coral Plantão',
    color: '#EF4444',
    subtle: 'rgba(239, 68, 68, 0.12)',
    border: 'rgba(239, 68, 68, 0.35)',
  },
};

export interface ThemeTokens {
  background: string;
  backgroundSecondary: string;
  surface: string;
  surfaceCard: string;
  border: string;
  borderSubtle: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  error: string;
  errorSubtle: string;
  success: string;
  successSubtle: string;
  warning: string;
  warningSubtle: string;
}

export const BASE_THEMES: Record<'dark' | 'light', ThemeTokens> = {
  dark: {
    background: '#191919',
    backgroundSecondary: '#141414',
    surface: '#202020',
    surfaceCard: '#242424',
    border: '#2E2E2E',
    borderSubtle: '#262626',
    text: '#EBEBEB',
    textSecondary: '#9B9A97',
    textMuted: '#73726E',
    error: '#FF4C4C',
    errorSubtle: 'rgba(255, 76, 76, 0.15)',
    success: '#4CAF50',
    successSubtle: 'rgba(76, 175, 80, 0.15)',
    warning: '#F59E0B',
    warningSubtle: 'rgba(245, 158, 11, 0.15)',
  },
  light: {
    background: '#F7F7F5',
    backgroundSecondary: '#EFEFED',
    surface: '#FFFFFF',
    surfaceCard: '#FFFFFF',
    border: 'rgba(0, 0, 0, 0.08)',
    borderSubtle: 'rgba(0, 0, 0, 0.05)',
    text: '#37352F',
    textSecondary: '#787774',
    textMuted: '#9B9A97',
    error: '#EB5757',
    errorSubtle: 'rgba(235, 87, 87, 0.10)',
    success: '#27AE60',
    successSubtle: 'rgba(39, 174, 96, 0.10)',
    warning: '#D97706',
    warningSubtle: 'rgba(217, 119, 6, 0.10)',
  },
};

export interface ActiveThemeColors extends ThemeTokens {
  primary: string;
  primarySubtle: string;
  primaryBorder: string;
}

/**
 * Objeto legado para retrocompatibilidade imediata com telas existentes
 * Padronizado agora com os valores Notion Light (Fundo #F7F7F5, Cards #FFFFFF)
 */
export const Colors = {
  background: '#F7F7F5',
  surface: '#FFFFFF',
  primary: '#2383E2',
  text: '#37352F',
  textSecondary: '#787774',
  textMuted: '#9B9A97',
  border: 'rgba(0, 0, 0, 0.08)',
  error: '#EB5757',
  success: '#27AE60',
  light: {
    text: '#37352F',
    background: '#F7F7F5',
    surface: '#FFFFFF',
    tint: '#37352F',
    tabIconDefault: '#787774',
    tabIconSelected: '#37352F',
    border: 'rgba(0, 0, 0, 0.08)',
  },
  dark: {
    text: '#EBEBEB',
    background: '#191919',
    surface: '#242424',
    tint: '#EAE115',
    tabIconDefault: '#9B9A97',
    tabIconSelected: '#EAE115',
    border: '#2E2E2E',
  },
};

export const CATEGORIA_CORES: Record<string, string> = {
  'Estudos': '#3B82F6',   // Azul
  'Estudo': '#3B82F6',    // Azul
  'Faculdade': '#8B5CF6', // Roxo
  'Saúde': '#10B981',     // Verde
  'Pessoal': '#10B981',   // Verde
  'Lazer': '#F59E0B',     // Amarelo
  'default': '#9CA3AF',   // Cinza
};

/**
 * Cores temáticas padronizadas por grande área médica da residência
 */
export function getTopicColor(area?: string, especialidade?: string, grandeArea?: string, titulo?: string): string {
  const normalize = (val?: string) =>
    (val || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

  const str = `${normalize(area)} ${normalize(especialidade)} ${normalize(grandeArea)} ${normalize(titulo)}`;

  // Ginecologia e Obstetrícia -> Rosa (#EC4899)
  if (str.includes('gineco') || str.includes('obstetr') || /\bgo\b/.test(str) || str.includes('amenorreia') || str.includes('policistico') || str.includes('parto')) {
    return '#EC4899';
  }

  // Cirurgia Geral -> Vermelho (#EF4444)
  if (str.includes('cirurg') || str.includes('trauma') || str.includes('urolog') || str.includes('anestesio') || str.includes('ortoped')) {
    return '#EF4444';
  }

  // Pediatria -> Verde (#10B981)
  if (str.includes('pediatr') || str.includes('puericult') || str.includes('neonat')) {
    return '#10B981';
  }

  // Medicina Preventiva / Saúde Coletiva -> Roxo (#8B5CF6)
  if (
    str.includes('preventiv') ||
    str.includes('epidemiolog') ||
    str.includes('saude coletiva') ||
    str.includes('saude publica') ||
    str.includes('estatistic') ||
    str.includes('bioetic') ||
    str.includes('sus')
  ) {
    return '#8B5CF6';
  }

  // Clínica Médica e suas subespecialidades -> Azul (#3B82F6)
  if (
    str.includes('clinic') ||
    str.includes('medica') ||
    str.includes('nefro') ||
    str.includes('glomerulo') ||
    str.includes('cardio') ||
    str.includes('gastro') ||
    str.includes('pneumo') ||
    str.includes('neuro') ||
    str.includes('hemato') ||
    str.includes('infecto') ||
    str.includes('endocrino') ||
    str.includes('reumato') ||
    str.includes('dermato') ||
    str.includes('psiquiatr') ||
    str.includes('oftalmo') ||
    str.includes('otorrino') ||
    str.includes('geriatr') ||
    str.includes('hematolog') ||
    str.includes('oncolog') ||
    str.includes('hepatolog') ||
    str.includes('alerg') ||
    str.includes('imuno')
  ) {
    return '#3B82F6';
  }

  return Colors.primary;
}

/**
 * Converte cor hex (#RGB ou #RRGGBB) para rgba com opacidade configurável
 */
export function hexToRgba(hex: string, alpha: number): string {
  if (!hex || typeof hex !== 'string') return 'transparent';
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex;
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length === 6) {
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (cleanHex.length === 3) {
    const r = parseInt(cleanHex.charAt(0) + cleanHex.charAt(0), 16);
    const g = parseInt(cleanHex.charAt(1) + cleanHex.charAt(1), 16);
    const b = parseInt(cleanHex.charAt(2) + cleanHex.charAt(2), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return hex;
}

export default Colors;
