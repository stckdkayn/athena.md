import { storage } from './storage';
import * as FileSystem from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import {
  isTagMaior,
  formatarNomeBanco,
  resolverEspecialidadeDoBanco,
} from './specialtyResolver';
import {
  insertOrReplaceQuestions,
  getQuestionsCount,
  getSpecialtiesWithCounts as dbGetSpecialtiesWithCounts,
  getThemesBySpecialty as dbGetThemesBySpecialty,
  getQuestionsBySpecialty as dbGetQuestionsBySpecialty,
  getQuestionsByThemes as dbGetQuestionsByThemes,
  getQuestionsByIds as dbGetQuestionsByIds,
  getAllQuestions as dbGetAllQuestions,
  getMicroFocoMapByTema as dbGetMicroFocoMapByTema,
  getSpecialtyThemesIndex as dbGetSpecialtyThemesIndex,
  getTemaParaEspMap as dbGetTemaParaEspMap,
  clearAllQuestions,
} from './database';

export {
  dbGetQuestionsByThemes as getQuestionsByThemes,
  dbGetQuestionsByIds as getQuestionsByIds,
  dbGetMicroFocoMapByTema as getMicroFocoMapByTema,
  dbGetAllQuestions as getAllQuestions,
};

export type GrandeAreaSimulado =
  | 'clinica_medica'
  | 'cirurgia'
  | 'pediatria'
  | 'ginecologia_obstetricia'
  | 'medicina_preventiva';

/**
 * Classifica uma questão médica em uma das 5 Grandes Áreas das provas de residência:
 * - 20% Clínica Médica
 * - 20% Cirurgia
 * - 20% Pediatria
 * - 20% Ginecologia e Obstetrícia
 * - 20% Medicina Preventiva
 */
export function classificarGrandeArea(q: any): GrandeAreaSimulado {
  const normalize = (val?: string) =>
    (val || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

  const esp = normalize(q?.especialidade || q?.specialty);
  const area = normalize(q?.area || q?.grandeArea);
  const tema = normalize(q?.tema || q?.tema_principal || q?.topic);
  const banco = normalize(q?.banco || q?.origem || q?.origin || q?.pacote);
  const str = `${esp} ${area} ${tema} ${banco}`;

  // Ginecologia e Obstetrícia
  if (str.includes('gineco') || str.includes('obstetr') || /\bgo\b/.test(str)) {
    return 'ginecologia_obstetricia';
  }

  // Pediatria
  if (str.includes('pediatr') || str.includes('puericult') || str.includes('neonat')) {
    return 'pediatria';
  }

  // Medicina Preventiva
  if (
    str.includes('preventiv') ||
    str.includes('epidemiolog') ||
    str.includes('saude coletiva') ||
    str.includes('saude publica') ||
    str.includes('estatistic') ||
    str.includes('bioetic') ||
    str.includes('sus')
  ) {
    return 'medicina_preventiva';
  }

  // Cirurgia Geral
  if (
    str.includes('cirurg') ||
    str.includes('trauma') ||
    str.includes('urolog') ||
    str.includes('anestesio') ||
    str.includes('ortoped')
  ) {
    return 'cirurgia';
  }

  // Clínica Médica (default)
  return 'clinica_medica';
}


export interface SpecialtyItem {
  nome: string;
  count: number;
}

export interface ThemeItem {
  nome: string;
  count: number;
}

export interface CartItem {
  especialidade?: string;
  tema: string;
  allowedQuestionIds?: string[];
  focos?: string[];
  microFocos?: string[];
  filterCount?: number;
}

export interface QuestionData {
  id?: string | number;
  id_questao?: string | number;
  _id?: string | number;
  especialidade?: string;
  specialty?: string;
  area?: string;
  grandeArea?: string;
  tema?: string;
  tema_principal?: string;
  subtema?: string;
  topic?: string;
  assunto?: string;
  foco?: string;
  foco_da_questao?: string;
  tipo?: string;
  micro_foco?: string;
  microfoco?: string;
  subfoco?: string;
  origem?: string;
  origin?: string;
  pacote?: string;
  banco?: string;
  tags?: string[];
  enunciado?: string;
  question?: string;
  texto?: string;
  descricao?: string;
  corpo?: string;
  pergunta?: string;
  statement?: string;
  alternativas?: any;
  options?: any;
  choices?: any;
  [key: string]: any;
}

/* =========================================================================
   FUNÇÕES DETERMINÍSTICAS DE EXTRAÇÃO DE DADOS (SINGLE SOURCE OF TRUTH)
   ========================================================================= */

export const getQuestionEspecialidade = (q: any): string => {
  if (!q) return 'Geral';
  const hasBagagem =
    q.especialidade === 'Bagagem' ||
    q.specialty === 'Bagagem' ||
    q.area === 'Bagagem' ||
    q.grandeArea === 'Bagagem' ||
    (Array.isArray(q.tags) && q.tags.some((t: any) => typeof t === 'string' && t.trim().toLowerCase() === 'bagagem'));

  if (hasBagagem) return 'Bagagem';

  const rawEsp =
    q.tagMaior ||
    q.tag_maior ||
    q.especialidade ||
    q.specialty ||
    q.area ||
    q.grandeArea ||
    (Array.isArray(q.tags) && q.tags.length > 0 ? q.tags[0] : undefined) ||
    'Geral';

  const esp = typeof rawEsp === 'string' ? rawEsp.trim() : String(rawEsp);
  if (esp.toLowerCase() === 'bagagem') return 'Bagagem';

  // 1. É diretamente uma Tag Maior canônica?
  const tagDireta = isTagMaior(esp);
  if (tagDireta) return tagDireta;

  // 2. Fallback no nome do banco de origem (ex: "avaliacao_da_vitalidade_fetal.json")
  const rawOrigem = (q.origem || q.origin || q.pacote || q.banco || '').toString().trim();
  if (rawOrigem && rawOrigem !== 'banco_geral') {
    const tagOrigem = resolverEspecialidadeDoBanco(rawOrigem);
    if (tagOrigem && tagOrigem !== 'Geral') return tagOrigem;
  }

  return esp;
};

export const getQuestionTema = (q: any, fallbackSpecialty?: string): string => {
  if (!q) return 'Tema Geral';

  const esp = fallbackSpecialty || getQuestionEspecialidade(q);
  const espNorm = typeof esp === 'string' ? esp.trim().toLowerCase() : '';

  const explicitTema =
    q.tema_principal ||
    q.tema ||
    q.subtema ||
    q.topic ||
    q.assunto;

  const explicitStr = explicitTema && String(explicitTema).trim() !== '' ? String(explicitTema).trim() : '';

  // Se o tema explícito existe e NÃO é idêntico à própria especialidade mãe, nem é outra Tag Maior, é válido
  if (explicitStr && explicitStr.toLowerCase() !== espNorm && !isTagMaior(explicitStr)) {
    return explicitStr;
  }

  // Se a propriedade q.especialidade original era na verdade um tema (ex: "Avaliação da Vitalidade Fetal")
  if (q.especialidade && typeof q.especialidade === 'string') {
    const origEsp = q.especialidade.trim();
    if (origEsp.toLowerCase() !== espNorm && !isTagMaior(origEsp)) {
      return origEsp;
    }
  }

  // Se o tema explícito for idêntico à especialidade ou inexistente, busca nas tags uma tag diferente
  const tags = Array.isArray(q.tags) ? q.tags : [];
  if (tags.length > 0) {
    const nonBagagem = tags.filter((t: any) => typeof t === 'string' && t.trim().toLowerCase() !== 'bagagem');
    const tagTema = nonBagagem.find((t: any) => {
      const s = String(t).trim();
      return s !== '' && s.toLowerCase() !== espNorm && !isTagMaior(s);
    });
    if (tagTema) {
      return String(tagTema).trim();
    }
    if (nonBagagem.length > 1) {
      return String(nonBagagem[1]).trim();
    }
  }

  // Fallback no nome do arquivo / pacote de origem
  const rawOrigem = (q.origem || q.origin || q.pacote || q.banco || '').toString().trim();
  if (rawOrigem && rawOrigem !== 'banco_geral') {
    let cleanOrigem = formatarNomeBanco(rawOrigem);
    if (cleanOrigem.toLowerCase().startsWith(espNorm)) {
      cleanOrigem = cleanOrigem.slice(espNorm.length).replace(/^[\s\-_:]+/, '').trim();
    }
    if (cleanOrigem && cleanOrigem.toLowerCase() !== espNorm && !isTagMaior(cleanOrigem)) {
      return cleanOrigem;
    }
  }

  if (explicitStr && !isTagMaior(explicitStr)) return explicitStr;
  if (tags.length > 0 && !isTagMaior(String(tags[0]))) return String(tags[0]).trim();

  return 'Tema Geral';
};

export const getQuestionFoco = (q: any): string => {
  if (!q) return 'Geral';
  const foco =
    q.foco_da_questao ||
    q.foco ||
    q.tipo ||
    (Array.isArray(q.tags) && q.tags.length > 2 ? q.tags[2] : undefined) ||
    'Geral';
  return typeof foco === 'string' ? foco.trim() : String(foco);
};

export const getQuestionMicroFoco = (q: any): string => {
  if (!q) return '';
  const microFoco =
    q.micro_foco ||
    q.microfoco ||
    q.subfoco ||
    (Array.isArray(q.tags) && q.tags.length > 3 ? q.tags[3] : undefined) ||
    '';
  return typeof microFoco === 'string' ? microFoco.trim() : String(microFoco || '').trim();
};

export const getQuestionContentHash = (q: any): string => {
  if (!q) return '0';
  const qEsp = getQuestionEspecialidade(q);
  const qTema = getQuestionTema(q);
  const text = (
    q.enunciado ||
    q.question ||
    q.texto ||
    q.descricao ||
    q.corpo ||
    q.pergunta ||
    q.statement ||
    ''
  ).toString().replace(/\s+/g, ' ').trim().toLowerCase();

  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }

  let altHash = 0;
  const alts = q.alternativas || q.options || q.choices || [];
  if (Array.isArray(alts) && alts.length > 0) {
    const firstAlt = String(typeof alts[0] === 'object' ? (alts[0].texto || alts[0].text || '') : alts[0]).trim();
    for (let i = 0; i < firstAlt.length; i++) {
      altHash = ((altHash << 5) - altHash + firstAlt.charCodeAt(i)) | 0;
    }
  }

  return `${qEsp}_${qTema}_${Math.abs(hash)}_${Math.abs(altHash)}`;
};

export const getQuestionLegacyHash = (q: any): string => {
  if (!q) return '';
  const qEsp = getQuestionEspecialidade(q);
  const qTema = getQuestionTema(q);
  const text = (q.enunciado || q.question || q.texto || '').trim();
  if (text.length > 0) {
    let hash = 0;
    for (let i = 0; i < Math.min(text.length, 120); i++) {
      hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }
    return `${qEsp}_${qTema}_${Math.abs(hash)}`;
  }
  return '';
};

export const getQuestionId = (q: any, fallbackIdx: number = 0): string => {
  if (!q) return String(fallbackIdx);
  const rawId = q.id ?? q.id_questao ?? q._id;
  if (rawId !== undefined && rawId !== null && String(rawId).trim() !== '') {
    return String(rawId).trim();
  }
  return getQuestionContentHash(q);
};

export const getQuestionCategoryKey = (q: any): string => {
  const rawFoco = getQuestionFoco(q) || 'Abordagem Geral';
  const foco = rawFoco ? rawFoco.charAt(0).toUpperCase() + rawFoco.slice(1) : 'Abordagem Geral';
  const rawMicro = getQuestionMicroFoco(q);
  const micro = rawMicro ? rawMicro.charAt(0).toUpperCase() + rawMicro.slice(1) : '';
  return `${foco}::${micro || '__geral__'}`;
};

/* =========================================================================
   CACHE EM MEMÓRIA DE ALTA PERFORMANCE (IN-MEMORY SINGLETON)
   ========================================================================= */

const STORAGE_KEY = '@athena_questoes';
const QUESTIONS_FILENAME = 'athena_questoes.json';
const METADATA_FILENAME = 'athena_questoes_meta.json';

export function getQuestoesFilePath(): string {
  const baseDir =
    FileSystemLegacy.documentDirectory ||
    (FileSystem as any).documentDirectory ||
    (FileSystem.Paths?.document?.uri ? `${FileSystem.Paths.document.uri}/` : '');
  const cleanBase = baseDir.endsWith('/') ? baseDir : `${baseDir}/`;
  return `${cleanBase}${QUESTIONS_FILENAME}`;
}

export function getQuestoesMetaFilePath(): string {
  const baseDir =
    FileSystemLegacy.documentDirectory ||
    (FileSystem as any).documentDirectory ||
    (FileSystem.Paths?.document?.uri ? `${FileSystem.Paths.document.uri}/` : '');
  const cleanBase = baseDir.endsWith('/') ? baseDir : `${baseDir}/`;
  return `${cleanBase}${METADATA_FILENAME}`;
}

export interface QuestoesMetadata {
  totalCount: number;
  specialties: SpecialtyItem[];
  themesIndex: Record<string, string[]>;
  temaParaEspMap: Record<string, string>;
}

let memoryCacheQuestoes: any[] | null = null;
let memoryCacheTotalCount: number | null = null;
let memoryCacheSpecialties: SpecialtyItem[] | null = null;
let memoryCacheBySpecialty: Map<string, any[]> | null = null;
let memoryCacheThemesIndex: Record<string, string[]> | null = null;
let memoryCacheTemaParaEspMap: Record<string, string> | null = null;
let pendingLoadPromise: Promise<any[]> | null = null;

export async function saveQuestoesMetaStorage(meta: QuestoesMetadata): Promise<void> {
  const filePath = getQuestoesMetaFilePath();
  try {
    const jsonStr = JSON.stringify(meta);
    await FileSystemLegacy.writeAsStringAsync(filePath, jsonStr);
  } catch (err) {
    console.warn('[questionService] Falha ao gravar metadados leves no disco:', err);
  }
}

export async function loadQuestoesMetaStorage(): Promise<QuestoesMetadata | null> {
  const filePath = getQuestoesMetaFilePath();
  try {
    const info = await FileSystemLegacy.getInfoAsync(filePath);
    if (info.exists) {
      const content = await FileSystemLegacy.readAsStringAsync(filePath);
      if (content && content.trim()) {
        const parsed = JSON.parse(content);
        if (
          parsed &&
          typeof parsed.totalCount === 'number' &&
          Array.isArray(parsed.specialties) &&
          parsed.themesIndex &&
          parsed.temaParaEspMap
        ) {
          return parsed;
        }
      }
    }
  } catch (err) {
    console.warn('[questionService] Erro ao ler metadados leves:', err);
  }
  return null;
}

/* =========================================================================
   PERSISTÊNCIA RESILIENTE DA SESSÃO ATIVA DO SIMULADO (DUAL-TIER STORAGE)
   ========================================================================= */

const ACTIVE_SESSION_FILENAME = 'athena_active_quiz_session.json';
const ACTIVE_SESSION_KEY = '@athena_active_quiz_session';

export function getActiveSessionFilePath(): string {
  const baseDir =
    FileSystemLegacy.documentDirectory ||
    (FileSystem as any).documentDirectory ||
    (FileSystem.Paths?.document?.uri ? `${FileSystem.Paths.document.uri}/` : '');
  const cleanBase = baseDir.endsWith('/') ? baseDir : `${baseDir}/`;
  return `${cleanBase}${ACTIVE_SESSION_FILENAME}`;
}

export async function saveActiveQuizSession(session: any): Promise<void> {
  if (!session || !Array.isArray(session.questions) || session.questions.length === 0) {
    return;
  }
  const jsonStr = JSON.stringify(session);

  // 1. MMKV Storage (acesso instantâneo síncrono C++)
  try {
    storage.set(ACTIVE_SESSION_KEY, jsonStr);
  } catch (err) {
    console.warn('[questionService] Falha ao salvar sessão ativa no MMKV:', err);
  }

  // 2. Arquivo no disco (persistência garantida mesmo se o app for encerrado)
  try {
    const filePath = getActiveSessionFilePath();
    const tempPath = `${filePath}.tmp`;
    await FileSystemLegacy.writeAsStringAsync(tempPath, jsonStr);
    await FileSystemLegacy.deleteAsync(filePath, { idempotent: true });
    await FileSystemLegacy.moveAsync({ from: tempPath, to: filePath });
  } catch (fileErr) {
    console.warn('[questionService] Falha ao salvar sessão ativa no disco:', fileErr);
  }
}

export async function loadActiveQuizSession(): Promise<any | null> {
  // 1. Tenta MMKV primeiro (instantâneo)
  try {
    const raw = storage.getString(ACTIVE_SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('[questionService] Erro ao ler sessão do MMKV:', err);
  }

  // 2. Fallback resiliente no disco
  try {
    const filePath = getActiveSessionFilePath();
    const info = await FileSystemLegacy.getInfoAsync(filePath);
    if (info.exists) {
      const content = await FileSystemLegacy.readAsStringAsync(filePath);
      if (content && content.trim()) {
        const parsed = JSON.parse(content);
        if (parsed && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
          storage.set(ACTIVE_SESSION_KEY, content);
          return parsed;
        }
      }
    }
  } catch (fileErr) {
    console.warn('[questionService] Erro ao ler sessão ativa do disco:', fileErr);
  }

  return null;
}

export async function clearActiveQuizSession(): Promise<void> {
  try {
    storage.remove(ACTIVE_SESSION_KEY);
  } catch {}

  try {
    const filePath = getActiveSessionFilePath();
    const tempPath = `${filePath}.tmp`;
    await FileSystemLegacy.deleteAsync(filePath, { idempotent: true });
    await FileSystemLegacy.deleteAsync(tempPath, { idempotent: true });
  } catch {}
}

/**
 * Salva a lista de questões diretamente no sistema de arquivos do dispositivo (JSON no disco).
 * Remove resquícios do AsyncStorage para liberar espaço no SQLite do Android e evitar SQLITE_FULL.
 */
export async function saveQuestoesStorage(questoes: any[], updateCache: boolean = true): Promise<void> {
  // 1. Grava no banco de dados SQLite nativo
  try {
    await clearAllQuestions();
    await insertOrReplaceQuestions(questoes);
  } catch (sqlErr) {
    console.error('[questionService] Erro ao persistir no SQLite:', sqlErr);
  }

  // 2. Mantém espelho de arquivo JSON como fallback resiliente
  const filePath = getQuestoesFilePath();
  const tempPath = `${filePath}.tmp`;

  try {
    const jsonStr = JSON.stringify(questoes);
    await FileSystemLegacy.writeAsStringAsync(tempPath, jsonStr);
    await FileSystemLegacy.deleteAsync(filePath, { idempotent: true });
    await FileSystemLegacy.moveAsync({ from: tempPath, to: filePath });
  } catch (fileErr) {
    try {
      const file = new FileSystem.File(filePath);
      file.write(JSON.stringify(questoes));
    } catch {}
  } finally {
    try {
      await FileSystemLegacy.deleteAsync(tempPath, { idempotent: true });
    } catch {}
  }

  // Limpa resquícios no storage
  try {
    storage.remove(STORAGE_KEY);
  } catch {}

  if (updateCache) {
    rebuildIndexes(questoes);
  }
}

/**
 * Garante que o banco SQLite esteja pronto e populado no boot do app,
 * SEM carregar todas as questões para a memória RAM (zero-overhead boot).
 */
export async function ensureQuestionsDatabaseReady(): Promise<number> {
  try {
    const count = await getQuestionsCount();
    if (count > 0) {
      memoryCacheTotalCount = count;
      return count;
    }
  } catch (sqlErr) {
    console.warn('[questionService] Erro ao verificar contagem no SQLite:', sqlErr);
  }

  // Se o SQLite estiver vazio, migra do JSON no disco ou storage legado
  const fallbackQuestoes = await loadQuestoesStorage();
  return fallbackQuestoes.length;
}

/**
 * Carrega a lista de questões do disco (ou migra do storage se for a primeira vez).
 */
export async function loadQuestoesStorage(): Promise<any[]> {
  // 1. Consulta primeiro o SQLite
  try {
    const count = await getQuestionsCount();
    if (count > 0) {
      const sqliteQuestions = await dbGetAllQuestions();
      if (sqliteQuestions.length > 0) {
        return sqliteQuestions;
      }
    }
  } catch (sqlErr) {
    console.warn('[questionService] Erro ao consultar SQLite:', sqlErr);
  }

  // 2. Se SQLite vazio, migra automaticamente do arquivo JSON no disco
  const filePath = getQuestoesFilePath();
  try {
    const info = await FileSystemLegacy.getInfoAsync(filePath);
    if (info.exists) {
      const content = await FileSystemLegacy.readAsStringAsync(filePath);
      if (content && content.trim()) {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed) && parsed.length > 0) {
          insertOrReplaceQuestions(parsed).catch((err) =>
            console.error('[questionService] Erro ao auto-migrar para SQLite:', err)
          );
          storage.remove(STORAGE_KEY);
          return parsed;
        }
      }
    }
  } catch (readErr) {
    console.warn('[questionService] Erro ao ler arquivo do disco:', readErr);
  }

  // 3. Fallback no storage legado
  try {
    const legacyRaw = storage.getString(STORAGE_KEY);
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        insertOrReplaceQuestions(parsed).catch(() => {});
        storage.remove(STORAGE_KEY);
        return parsed;
      }
    }
  } catch (asyncErr) {
    console.warn('[questionService] Erro ao ler do storage legado:', asyncErr);
  }

  return [];
}

/**
 * Apaga completamente o arquivo de questões do disco e do storage.
 */
export async function clearQuestoesStorage(): Promise<void> {
  try {
    await clearAllQuestions();
  } catch (err) {
    console.warn('[questionService] Erro ao limpar SQLite:', err);
  }

  const filePath = getQuestoesFilePath();
  const metaPath = getQuestoesMetaFilePath();
  const tempPath = `${filePath}.tmp`;

  try {
    await FileSystemLegacy.deleteAsync(filePath, { idempotent: true });
    await FileSystemLegacy.deleteAsync(metaPath, { idempotent: true });
    await FileSystemLegacy.deleteAsync(tempPath, { idempotent: true });
  } catch {}

  try {
    storage.remove(STORAGE_KEY);
  } catch {}

  invalidateQuestoesCache();
}

/**
 * Reconstrói os índices em memória a partir do array de questões
 */
const rebuildIndexes = (questoes: any[]) => {
  const bySpec = new Map<string, any[]>();
  const counts: Record<string, number> = {};
  const themesMapSets: Record<string, Set<string>> = {};
  const temaParaEspMap: Record<string, string> = {};

  for (const q of questoes) {
    if (!q || typeof q !== 'object') continue;
    const esp = getQuestionEspecialidade(q);
    counts[esp] = (counts[esp] || 0) + 1;

    const norm = esp.toLowerCase();
    if (!bySpec.has(norm)) {
      bySpec.set(norm, []);
    }
    bySpec.get(norm)!.push(q);

    if (!themesMapSets[norm]) {
      themesMapSets[norm] = new Set<string>();
    }
    const tema = getQuestionTema(q, esp);
    if (tema) {
      themesMapSets[norm].add(tema);
      const temaLower = tema.toLowerCase();
      if (!temaParaEspMap[temaLower]) {
        temaParaEspMap[temaLower] = esp;
      }
    }
    const foco = getQuestionFoco(q);
    if (foco && foco.toLowerCase() !== 'geral') {
      themesMapSets[norm].add(foco);
    }
    const microFoco = getQuestionMicroFoco(q);
    if (microFoco) {
      themesMapSets[norm].add(microFoco);
    }
    if (Array.isArray(q.tags)) {
      for (const t of q.tags) {
        if (typeof t === 'string') {
          const cleanTag = t.trim();
          if (
            cleanTag &&
            cleanTag.toLowerCase() !== 'bagagem' &&
            cleanTag.toLowerCase() !== norm
          ) {
            themesMapSets[norm].add(cleanTag);
          }
        }
      }
    }
  }

  const specList: SpecialtyItem[] = Object.entries(counts)
    .map(([nome, count]) => ({ nome, count }))
    .filter((item) => item.count > 0)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));

  const themesIndexRecord: Record<string, string[]> = {};
  for (const [normEsp, set] of Object.entries(themesMapSets)) {
    themesIndexRecord[normEsp] = Array.from(set);
  }

  memoryCacheQuestoes = questoes;
  memoryCacheTotalCount = questoes.length;
  memoryCacheSpecialties = specList;
  memoryCacheBySpecialty = bySpec;
  memoryCacheThemesIndex = themesIndexRecord;
  memoryCacheTemaParaEspMap = temaParaEspMap;

  saveQuestoesMetaStorage({
    totalCount: questoes.length,
    specialties: specList,
    themesIndex: themesIndexRecord,
    temaParaEspMap,
  }).catch(() => {});
};

export function getQuestoesMemoryCache(): any[] | null {
  return memoryCacheQuestoes;
}

/**
 * Retorna todas as questões com cache em memória (latência 0 ms se já carregado).
 * Executa auto-healing automático de temas e IDs caso necessário.
 */
export async function getQuestoesCache(forceReload: boolean = false): Promise<any[]> {
  if (!forceReload && memoryCacheQuestoes !== null) {
    return memoryCacheQuestoes;
  }

  if (pendingLoadPromise) {
    return pendingLoadPromise;
  }

  pendingLoadPromise = (async () => {
    try {
      const parsed = await loadQuestoesStorage();
      if (!Array.isArray(parsed) || parsed.length === 0) {
        rebuildIndexes([]);
        return [];
      }

      // Checa necessidade de auto-healing
      const needsNorm = parsed.some((q: any) => {
        if (!q || typeof q !== 'object') return false;
        const esp = getQuestionEspecialidade(q);
        const espNorm = esp.toLowerCase();
        const tema = (q.tema || q.tema_principal || '').toString().trim().toLowerCase();
        const badTema = !tema || tema === espNorm;
        const badMicro = Array.isArray(q.tags) && q.tags.length > 3 && !q.micro_foco;
        const badEsp = !q.especialidade || q.especialidade !== esp;
        return !q.especialidade || !q.id || badTema || badMicro || badEsp;
      });

      let workingQuestoes = parsed;
      if (needsNorm) {
        workingQuestoes = parsed.map((item: any, idx: number) => {
          if (!item || typeof item !== 'object') return item;
          const esp = getQuestionEspecialidade(item);
          const espNorm = esp.toLowerCase();
          const tema = getQuestionTema(item, esp);
          const foco = getQuestionFoco(item);
          const microFoco = getQuestionMicroFoco(item);
          const rawId = item.id ?? item.id_questao ?? `${esp}_${tema}_${idx}`;

          return {
            ...item,
            id: String(rawId).trim(),
            tagMaior: esp,
            tag_maior: esp,
            especialidade: esp,
            tema: tema,
            tema_principal: tema,
            foco: item.foco || foco,
            foco_da_questao: item.foco_da_questao || foco,
            micro_foco: item.micro_foco || microFoco,
            microfoco: item.microfoco || microFoco,
          };
        });

        // Persiste silenciosamente em segundo plano no disco
        saveQuestoesStorage(workingQuestoes, false).catch((e) => {
          console.warn('[questionService] Falha ao persistir auto-healing:', e);
        });
      }

      rebuildIndexes(workingQuestoes);
      return workingQuestoes;
    } catch (err) {
      console.error('[questionService] Erro ao carregar questões do cache:', err);
      rebuildIndexes([]);
      return [];
    } finally {
      pendingLoadPromise = null;
    }
  })();

  return pendingLoadPromise;
}

/**
 * Atualiza o cache em memória e opcionalmente grava no sistema de arquivos
 */
export async function setQuestoesCache(questoes: any[], persistToStorage: boolean = true): Promise<void> {
  rebuildIndexes(questoes);
  if (persistToStorage) {
    try {
      await saveQuestoesStorage(questoes, false);
    } catch (err) {
      console.error('[questionService] Erro ao persistir questões no storage:', err);
    }
  }
}

/**
 * Invalida o cache em memória forçando releitura na próxima chamada
 */
export function invalidateQuestoesCache(): void {
  memoryCacheQuestoes = null;
  memoryCacheTotalCount = null;
  memoryCacheSpecialties = null;
  memoryCacheBySpecialty = null;
  memoryCacheThemesIndex = null;
  memoryCacheTemaParaEspMap = null;
  pendingLoadPromise = null;
}

/**
 * Retorna as especialidades com suas respectivas contagens diretamente do cache ou metadados leves
 */
export async function getSpecialtiesWithCounts(forceReload: boolean = false): Promise<SpecialtyItem[]> {
  if (!forceReload && memoryCacheSpecialties !== null) {
    return memoryCacheSpecialties;
  }
  try {
    const specs = await dbGetSpecialtiesWithCounts();
    if (specs && specs.length > 0) {
      memoryCacheSpecialties = specs;
      return specs;
    }
  } catch {}

  if (!forceReload) {
    const meta = await loadQuestoesMetaStorage();
    if (meta) {
      memoryCacheSpecialties = meta.specialties;
      memoryCacheTotalCount = meta.totalCount;
      memoryCacheThemesIndex = meta.themesIndex;
      memoryCacheTemaParaEspMap = meta.temaParaEspMap;
      return meta.specialties;
    }
  }
  await getQuestoesCache(forceReload);
  return memoryCacheSpecialties || [];
}

/**
 * Retorna o número total de questões disponíveis
 */
export async function getTotalQuestoesCount(): Promise<number> {
  if (memoryCacheTotalCount !== null) {
    return memoryCacheTotalCount;
  }
  try {
    const count = await getQuestionsCount();
    if (count > 0) {
      memoryCacheTotalCount = count;
      return count;
    }
  } catch {}

  if (memoryCacheQuestoes !== null) {
    return (memoryCacheQuestoes as any[]).length;
  }
  const meta = await loadQuestoesMetaStorage();
  if (meta && typeof meta.totalCount === 'number') {
    memoryCacheSpecialties = meta.specialties;
    memoryCacheTotalCount = meta.totalCount;
    memoryCacheThemesIndex = meta.themesIndex;
    memoryCacheTemaParaEspMap = meta.temaParaEspMap;
    return meta.totalCount;
  }
  const questoes = await getQuestoesCache(false);
  return Array.isArray(questoes) ? questoes.length : 0;
}

/**
 * Retorna o índice mapeado de temas e termos por especialidade para busca rápida
 */
export async function getSpecialtyThemesIndex(): Promise<Record<string, string[]>> {
  if (memoryCacheThemesIndex !== null) {
    return memoryCacheThemesIndex;
  }
  try {
    const dbIndex = await dbGetSpecialtyThemesIndex();
    if (Object.keys(dbIndex).length > 0) {
      memoryCacheThemesIndex = dbIndex;
      return dbIndex;
    }
  } catch {}

  const meta = await loadQuestoesMetaStorage();
  if (meta && meta.themesIndex) {
    memoryCacheSpecialties = meta.specialties;
    memoryCacheTotalCount = meta.totalCount;
    memoryCacheThemesIndex = meta.themesIndex;
    memoryCacheTemaParaEspMap = meta.temaParaEspMap;
    return meta.themesIndex;
  }
  await getQuestoesCache(false);
  return memoryCacheThemesIndex || {};
}

/**
 * Retorna o mapa de tema -> especialidade correspondente
 */
export async function getTemaParaEspMap(): Promise<Record<string, string>> {
  if (memoryCacheTemaParaEspMap !== null) {
    return memoryCacheTemaParaEspMap;
  }
  try {
    const dbMap = await dbGetTemaParaEspMap();
    if (Object.keys(dbMap).length > 0) {
      memoryCacheTemaParaEspMap = dbMap;
      return dbMap;
    }
  } catch {}

  const meta = await loadQuestoesMetaStorage();
  if (meta && meta.temaParaEspMap) {
    memoryCacheSpecialties = meta.specialties;
    memoryCacheTotalCount = meta.totalCount;
    memoryCacheThemesIndex = meta.themesIndex;
    memoryCacheTemaParaEspMap = meta.temaParaEspMap;
    return meta.temaParaEspMap;
  }
  await getQuestoesCache(false);
  return memoryCacheTemaParaEspMap || {};
}

/**
 * Retorna as questões filtradas por especialidade diretamente do índice em memória O(1) ou SQLite
 */
export async function getQuestionsBySpecialty(especialidadeNome: string): Promise<any[]> {
  const norm = especialidadeNome.trim().toLowerCase();
  if (memoryCacheBySpecialty && memoryCacheBySpecialty.has(norm)) {
    return memoryCacheBySpecialty.get(norm)!;
  }

  try {
    const fromDb = await dbGetQuestionsBySpecialty(especialidadeNome);
    if (fromDb && fromDb.length > 0) {
      return fromDb;
    }
  } catch {}

  await getQuestoesCache(false);
  if (memoryCacheBySpecialty && memoryCacheBySpecialty.has(norm)) {
    return memoryCacheBySpecialty.get(norm)!;
  }
  if (memoryCacheQuestoes) {
    return memoryCacheQuestoes.filter((q) => getQuestionEspecialidade(q).toLowerCase() === norm);
  }
  return [];
}

/**
 * Retorna a lista de temas e contagens de uma especialidade via SQLite
 */
export async function getThemesBySpecialty(especialidadeNome: string): Promise<ThemeItem[]> {
  try {
    const dbThemes = await dbGetThemesBySpecialty(especialidadeNome);
    if (dbThemes && dbThemes.length > 0) {
      return dbThemes;
    }
  } catch {}

  const questions = await getQuestionsBySpecialty(especialidadeNome);
  const counts: Record<string, number> = {};

  for (const q of questions) {
    const tema = getQuestionTema(q, especialidadeNome);
    counts[tema] = (counts[tema] || 0) + 1;
  }

  return Object.entries(counts)
    .map(([nome, count]) => ({ nome, count }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
}
