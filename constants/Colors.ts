export const Colors = {
  background: '#141617',
  surface: '#232628',
  primary: '#EAE115',
  text: '#FFFFFF',
  textSecondary: '#A0A0A0',
  error: '#FF4C4C',
  success: '#4CAF50',
  light: {
    text: '#FFFFFF',
    background: '#141617',
    tint: '#EAE115',
    tabIconDefault: '#A0A0A0',
    tabIconSelected: '#EAE115',
  },
  dark: {
    text: '#FFFFFF',
    background: '#141617',
    tint: '#EAE115',
    tabIconDefault: '#A0A0A0',
    tabIconSelected: '#EAE115',
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

export default Colors;
