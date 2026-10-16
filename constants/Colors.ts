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
    label: 'Notion Monocromático',
    color: '#37352F',
    subtle: 'rgba(55, 53, 47, 0.08)',
    border: 'rgba(55, 53, 47, 0.16)',
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
    label: 'Azul Clínico',
    color: '#3B82F6',
    subtle: 'rgba(59, 130, 246, 0.12)',
    border: 'rgba(59, 130, 246, 0.35)',
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
    background: '#141617',
    backgroundSecondary: '#0E1011',
    surface: '#1E2124',
    surfaceCard: '#232628',
    border: '#2A2E33',
    borderSubtle: '#222528',
    text: '#FFFFFF',
    textSecondary: '#9CA3AF',
    textMuted: '#64748B',
    error: '#EF4444',
    errorSubtle: 'rgba(239, 68, 68, 0.15)',
    success: '#10B981',
    successSubtle: 'rgba(16, 185, 129, 0.15)',
    warning: '#F59E0B',
    warningSubtle: 'rgba(245, 158, 11, 0.15)',
  },
  light: {
    background: '#FFFFFF',
    backgroundSecondary: '#F7F7F5',
    surface: '#F7F7F5',
    surfaceCard: '#F7F7F5',
    border: 'rgba(0, 0, 0, 0.06)',
    borderSubtle: 'rgba(0, 0, 0, 0.04)',
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
 * Padronizado agora com os valores Notion Light
 */
export const Colors = {
  background: '#FFFFFF',
  surface: '#F7F7F5',
  primary: '#37352F',
  text: '#37352F',
  textSecondary: '#787774',
  textMuted: '#9B9A97',
  border: 'rgba(0, 0, 0, 0.06)',
  error: '#EB5757',
  success: '#27AE60',
  light: {
    text: '#37352F',
    background: '#FFFFFF',
    surface: '#F7F7F5',
    tint: '#37352F',
    tabIconDefault: '#787774',
    tabIconSelected: '#37352F',
    border: 'rgba(0, 0, 0, 0.06)',
  },
  dark: {
    text: '#FFFFFF',
    background: '#141617',
    surface: '#232628',
    tint: '#EAE115',
    tabIconDefault: '#A0A0A0',
    tabIconSelected: '#EAE115',
    border: '#2A2E33',
  },
};

export const CATEGORIA_CORES: Record<string, string> = {
  'Estudos': '#37352F',
  'Estudo': '#37352F',
  'Faculdade': '#5A5955',
  'Saúde': '#37352F',
  'Pessoal': '#5A5955',
  'Lazer': '#787774',
  'default': '#787774',
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

export default Colors;
