/**
 * Resolvedor e formatador direto de especialidades médicas (Tags Maiores)
 * AthenaMD - Lê a Tag Maior diretamente dos metadados do GitHub index.json.
 */

export const TAGS_MAIORES_PADRAO = [
  'Bagagem',
  'Cardiologia',
  'Cirurgia Geral',
  'Dermatologia',
  'Endocrinologia',
  'Gastroenterologia',
  'Hepatologia',
  'Ginecologia',
  'Obstetrícia',
  'Hematologia',
  'Infectologia',
  'Medicina Preventiva',
  'Nefrologia',
  'Neurologia',
  'Oftalmologia',
  'Ortopedia',
  'Otorrinolaringologia',
  'Pediatria',
  'Pneumologia',
  'Psiquiatria',
  'Reumatologia',
  'Urologia',
] as const;

export type TagMaiorPadrao = (typeof TAGS_MAIORES_PADRAO)[number];

const MAPA_ALIASES: Record<string, string> = {
  'obtetricia': 'Obstetrícia',
  'obtetrico': 'Obstetrícia',
  'obtetrica': 'Obstetrícia',
  'obstetricia': 'Obstetrícia',
  'ginecologia': 'Ginecologia',
  'cardiologia': 'Cardiologia',
  'cirurgia': 'Cirurgia Geral',
  'cirurgia geral': 'Cirurgia Geral',
  'pediatria': 'Pediatria',
  'preventiva': 'Medicina Preventiva',
  'medicina preventiva': 'Medicina Preventiva',
  'saude coletiva': 'Medicina Preventiva',
};

for (const esp of TAGS_MAIORES_PADRAO) {
  MAPA_ALIASES[esp.toLowerCase()] = esp;
  MAPA_ALIASES[
    esp
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
  ] = esp;
}

export function isTagMaior(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const clean = raw.trim().toLowerCase();
  const cleanSemAcento = clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return MAPA_ALIASES[clean] || MAPA_ALIASES[cleanSemAcento] || null;
}

/**
 * Formata o nome de um banco de questões ou tema para exibição amigável em Title Case
 */
export function formatarNomeBanco(raw: string): string {
  if (!raw) return 'Geral';
  const clean = raw.replace(/\.json$/i, '').trim();
  if (/[A-Z]/.test(clean) && /\s/.test(clean)) {
    return clean;
  }
  if (/^[A-Z0-9_-]+$/.test(clean) && clean.length <= 5) {
    return clean.replace(/_/g, ' ');
  }
  const words = clean.replace(/_/g, ' ').split(/\s+/);
  return words
    .map((w) => {
      if (['de', 'da', 'do', 'dos', 'das', 'e', 'em', 'para', 'com', 'por'].includes(w.toLowerCase())) {
        return w.toLowerCase();
      }
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Formata e padroniza o nome de uma especialidade (Tag Maior).
 */
export function formatarNomeEspecialidade(raw: string): string {
  if (!raw) return 'Geral';
  const clean = raw.trim();
  const alias = isTagMaior(clean);
  if (alias) return alias;
  return formatarNomeBanco(clean);
}

/**
 * Resolve a especialidade mãe (Tag Maior) de um banco de questões,
 * lendo diretamente o metadado tagMaior enviado pelo index.json do GitHub.
 */
export function resolverEspecialidadeDoBanco(
  nomeBanco: string,
  item?: any,
  localQuestoes?: any[]
): string {
  // 1. Tag Maior explícita vinda do GitHub index.json (definida pelo publicar.py)
  const explicit =
    item?.tagMaior ||
    item?.tag_maior ||
    item?.especialidade ||
    item?.specialty ||
    item?.area ||
    item?.grandeArea;

  if (explicit && typeof explicit === 'string' && explicit.trim()) {
    return formatarNomeEspecialidade(explicit);
  }

  // 2. Histórico de questões locais já salvas no aparelho
  if (localQuestoes && localQuestoes.length > 0) {
    const cleanBank = (nomeBanco || '').replace(/\.json$/i, '').trim().toLowerCase();
    const match = localQuestoes.find((q) => {
      const orig = String(q?.origem || '').trim().toLowerCase();
      return orig === cleanBank || orig === (nomeBanco || '').toLowerCase();
    });
    const localEsp = match?.tagMaior || match?.especialidade;
    if (localEsp && typeof localEsp === 'string' && localEsp.trim()) {
      return formatarNomeEspecialidade(localEsp);
    }
  }

  // 3. Fallback: Separador estruturado no nome do arquivo (ex: "Obstetrícia - Pré-natal.json")
  const cleanName = (nomeBanco || '').replace(/\.json$/i, '').trim();
  if (cleanName.includes(' - ')) {
    return formatarNomeEspecialidade(cleanName.split(' - ')[0]);
  }

  return formatarNomeBanco(cleanName);
}
