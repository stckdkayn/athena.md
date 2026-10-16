import { storage } from './storage';
import {
  insertProgressRecord,
  insertProgressRecordsBatch,
  getAllProgressRecords,
  getProgressRecordsSince,
  getProgressCountSince,
  getProgressTotalCount,
  getErroredQuestionIds as dbGetErroredQuestionIds,
  getDistinctProgressThemes as dbGetDistinctProgressThemes,
  deleteProgressByThemes as dbDeleteProgressByThemes,
  clearAllProgressRecords,
  logQuestionAnswer,
  getAllQuestionHistory,
  getQuestionHistoryBySession,
  QuestionHistoryRecord,
  getDiagnosticSummary,
  DiagnosticSummary,
} from './database';

export const PROGRESS_STORAGE_KEY = '@athena_progress';
const PROGRESS_MIGRATED_KEY = '@athena_progress_migrated_v2';

export interface ProgressRecord {
  id?: number;
  id_questao?: string | number;
  tema?: string;
  especialidade?: string;
  foco?: string | null;
  foco_da_questao?: string | null;
  micro_foco?: string | null;
  microfoco?: string | null;
  subfoco?: string | null;
  correta?: boolean;
  resposta_usuario?: string | null;
  gabarito?: string | null;
  data?: string;
  timestamp?: number;
}

/**
 * Migra o histórico legado do AsyncStorage/MMKV (@athena_progress) para o SQLite.
 * Executada automaticamente na inicialização sem perda de dados.
 */
export async function migrateStorageProgressToSQLite(): Promise<number> {
  try {
    const totalInDb = await getProgressTotalCount();
    const rawStorage = storage.getString(PROGRESS_STORAGE_KEY);

    if (!rawStorage) {
      storage.set(PROGRESS_MIGRATED_KEY, true);
      return totalInDb;
    }

    const parsed = JSON.parse(rawStorage);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      storage.set(PROGRESS_MIGRATED_KEY, true);
      return totalInDb;
    }

    if (totalInDb === 0) {
      console.log(`[progressService] Migrando ${parsed.length} respostas legadas para a tabela SQLite progresso...`);
      const inserted = await insertProgressRecordsBatch(parsed);
      storage.set(PROGRESS_MIGRATED_KEY, true);
      console.log(`[progressService] Migração concluída com sucesso! ${inserted} registros inseridos.`);
      return inserted;
    }

    storage.set(PROGRESS_MIGRATED_KEY, true);
    return totalInDb;
  } catch (err) {
    console.warn('[progressService] Erro ao auto-migrar progresso para SQLite:', err);
    return 0;
  }
}

/**
 * Salva um novo registro de resposta diretamente no SQLite e mantém espelho no storage.
 */
export async function saveProgressRecord(record: ProgressRecord): Promise<void> {
  const qId = String(record.id_questao ?? '').trim();
  if (!qId) return;

  const dataIso = record.data || new Date().toISOString();
  const ts = typeof record.timestamp === 'number' && !isNaN(record.timestamp)
    ? record.timestamp
    : new Date(dataIso).getTime() || Date.now();

  const normalizedRecord: ProgressRecord = {
    ...record,
    id_questao: qId,
    data: dataIso,
    timestamp: ts,
    correta: !!record.correta,
  };

  // 1. Grava no SQLite nativo indexado
  try {
    await insertProgressRecord({
      ...normalizedRecord,
      id_questao: qId,
      correta: !!record.correta,
    });
  } catch (sqlErr) {
    console.error('[progressService] Erro ao gravar progresso no SQLite:', sqlErr);
  }

  // 2. Mantém espelho no storage para fallback resiliente
  try {
    const raw = storage.getString(PROGRESS_STORAGE_KEY);
    let list: ProgressRecord[] = [];
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) list = parsed;
      } catch {}
    }
    list.push(normalizedRecord);
    // Limita o espelho de storage para os últimos 500 registros para evitar sobrecarga no JSON
    if (list.length > 500) {
      list = list.slice(list.length - 500);
    }
    storage.set(PROGRESS_STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

/**
 * Retorna todo o histórico de progresso ordenado por data decrescente.
 */
export async function getAllProgress(): Promise<ProgressRecord[]> {
  try {
    const dbRecords = await getAllProgressRecords();
    if (dbRecords && dbRecords.length > 0) {
      return dbRecords;
    }
  } catch (err) {
    console.warn('[progressService] Falha ao ler SQLite, tentando storage:', err);
  }

  // Fallback no storage
  try {
    const raw = storage.getString(PROGRESS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Dispara migração em background
        migrateStorageProgressToSQLite().catch(() => {});
        return parsed;
      }
    }
  } catch {}

  return [];
}

/**
 * Retorna o progresso a partir de um timestamp de corte (ex: início do dia, semana, mês).
 */
export async function getProgressSince(sinceTimestamp: number): Promise<ProgressRecord[]> {
  try {
    const dbRecords = await getProgressRecordsSince(sinceTimestamp);
    if (dbRecords && dbRecords.length > 0) {
      return dbRecords;
    }
  } catch (err) {
    console.warn('[progressService] Falha ao consultar progresso por período no SQLite:', err);
  }

  const all = await getAllProgress();
  return all.filter((r) => {
    if (!r.data) return false;
    const t = typeof r.timestamp === 'number' ? r.timestamp : new Date(r.data).getTime();
    return !isNaN(t) && t >= sinceTimestamp;
  });
}

/**
 * Retorna a contagem de questões respondidas hoje (desde a meia-noite).
 */
export async function getQuestionsAnsweredTodayCount(): Promise<number> {
  const dataHoje = new Date();
  dataHoje.setHours(0, 0, 0, 0);
  const hojeLimit = dataHoje.getTime();

  try {
    const count = await getProgressCountSince(hojeLimit);
    if (count > 0) return count;
  } catch {}

  const recent = await getProgressSince(hojeLimit);
  return recent.length;
}

/**
 * Retorna o conjunto de IDs de questões que o usuário errou (para o filtro "Apenas Errei").
 */
export async function getErroredQuestionIds(): Promise<Set<string>> {
  try {
    const ids = await dbGetErroredQuestionIds();
    if (ids && ids.length > 0) {
      return new Set(ids.map((id) => String(id).trim()));
    }
  } catch (err) {
    console.warn('[progressService] Falha ao consultar questões erradas no SQLite:', err);
  }

  const all = await getAllProgress();
  const errored = new Set<string>();
  for (const p of all) {
    if (!p.correta && p.id_questao !== undefined && p.id_questao !== null) {
      errored.add(String(p.id_questao).trim());
    }
  }
  return errored;
}

/**
 * Retorna os temas distintos com respostas registradas no progresso.
 */
export async function getDistinctProgressThemes(): Promise<string[]> {
  try {
    const themes = await dbGetDistinctProgressThemes();
    if (themes && themes.length > 0) {
      return themes;
    }
  } catch {}

  const all = await getAllProgress();
  const themeSet = new Set<string>();
  for (const r of all) {
    if (r.tema && String(r.tema).trim()) {
      themeSet.add(String(r.tema).trim());
    }
  }
  return Array.from(themeSet).sort((a, b) => a.localeCompare(b));
}

/**
 * Deleta o histórico de respostas de temas específicos (Reset seletivo).
 */
export async function deleteProgressByThemes(themes: string[]): Promise<void> {
  if (!themes || themes.length === 0) return;

  try {
    await dbDeleteProgressByThemes(themes);
  } catch (err) {
    console.error('[progressService] Erro ao deletar no SQLite:', err);
  }

  try {
    const raw = storage.getString(PROGRESS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const deleteSet = new Set(themes.map((t) => t.trim().toLowerCase()));
        const filtered = parsed.filter((item: any) => {
          const t = String(item?.tema || '').trim().toLowerCase();
          return !deleteSet.has(t);
        });
        storage.set(PROGRESS_STORAGE_KEY, JSON.stringify(filtered));
      }
    }
  } catch {}
}

/**
 * Limpa completamente todo o histórico de progresso do usuário.
 */
export async function clearAllProgress(): Promise<void> {
  try {
    await clearAllProgressRecords();
  } catch (err) {
    console.error('[progressService] Erro ao zerar progresso no SQLite:', err);
  }

  try {
    storage.remove(PROGRESS_STORAGE_KEY);
  } catch {}
}

export {
  logQuestionAnswer,
  getAllQuestionHistory,
  getQuestionHistoryBySession,
  QuestionHistoryRecord,
  getDiagnosticSummary,
  DiagnosticSummary,
  getMemoryHealthSummary,
  MemoryHealthSummary,
  getQuestionTimeStats,
  QuestionTimeStats,
} from './database';

export { getHeatmapData, HeatmapData } from './streakService';

