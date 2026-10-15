import * as SQLite from 'expo-sqlite';
import { SpecialtyItem, ThemeItem } from './questionService';

let dbInstance: SQLite.SQLiteDatabase | null = null;

/**
 * Retorna a instância singleton do banco SQLite da AthenaMD.
 */
export function getDatabase(): SQLite.SQLiteDatabase {
  if (!dbInstance) {
    dbInstance = SQLite.openDatabaseSync('athena.db');
    initSchema(dbInstance);
  }
  return dbInstance;
}

/**
 * Cria a tabela e índices no SQLite caso não existam.
 */
function initSchema(database: SQLite.SQLiteDatabase): void {
  try {
    database.execSync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS questoes (
        id TEXT PRIMARY KEY,
        especialidade TEXT NOT NULL,
        tema TEXT NOT NULL,
        foco TEXT,
        micro_foco TEXT,
        banco TEXT,
        ano TEXT,
        banca TEXT,
        data_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_questoes_especialidade ON questoes (especialidade);
      CREATE INDEX IF NOT EXISTS idx_questoes_tema ON questoes (tema);
      CREATE INDEX IF NOT EXISTS idx_questoes_foco ON questoes (foco);
      CREATE INDEX IF NOT EXISTS idx_questoes_micro_foco ON questoes (micro_foco);
      CREATE INDEX IF NOT EXISTS idx_questoes_banco ON questoes (banco);

      CREATE TABLE IF NOT EXISTS progresso (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        id_questao TEXT NOT NULL,
        tema TEXT NOT NULL,
        especialidade TEXT NOT NULL,
        foco TEXT,
        micro_foco TEXT,
        correta INTEGER NOT NULL,
        resposta_usuario TEXT,
        gabarito TEXT,
        data TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_progresso_id_questao ON progresso (id_questao);
      CREATE INDEX IF NOT EXISTS idx_progresso_timestamp ON progresso (timestamp);
      CREATE INDEX IF NOT EXISTS idx_progresso_tema ON progresso (tema);
      CREATE INDEX IF NOT EXISTS idx_progresso_especialidade ON progresso (especialidade);
      CREATE INDEX IF NOT EXISTS idx_progresso_correta ON progresso (correta);

      -- Tabela de Atividades Únicas ou Instâncias Modificadas/Concluídas
      CREATE TABLE IF NOT EXISTS AtividadesAgenda (
        id TEXT PRIMARY KEY,
        id_recorrente TEXT, -- Se vier de uma rotina fixa
        titulo TEXT NOT NULL,
        tipo TEXT NOT NULL,
        data_agendada TEXT NOT NULL,
        hora_inicio TEXT,
        hora_fim TEXT,
        feedback_cansaco INTEGER DEFAULT 0,
        concluida INTEGER DEFAULT 0,
        timestamp INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_agenda_data ON AtividadesAgenda (data_agendada);

      -- Tabela de Atividades Fixas / Recorrentes
      CREATE TABLE IF NOT EXISTS AtividadesRecorrentes (
        id TEXT PRIMARY KEY,
        titulo TEXT NOT NULL,
        tipo TEXT NOT NULL,
        frequencia TEXT NOT NULL, -- 'diaria', 'dias_uteis', 'semanal'
        dias_semana TEXT, -- Ex: '[1,3,5]' (0=Dom, 1=Seg...)
        data_inicio TEXT NOT NULL,
        data_fim TEXT, -- Opcional: até quando se repete
        hora_inicio TEXT,
        hora_fim TEXT,
        feedback_cansaco INTEGER DEFAULT 0,
        timestamp INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_recorrentes_datas ON AtividadesRecorrentes (data_inicio, data_fim);
    `);

    // Migração transparente de coluna id_recorrente caso tabela já existisse
    try {
      database.execSync(`ALTER TABLE AtividadesAgenda ADD COLUMN id_recorrente TEXT;`);
    } catch {}
  } catch (err) {
    console.error('[database] Erro ao inicializar schema SQLite:', err);
  }
}

/**
 * Insere ou substitui uma lista de questões em lote dentro de transações atômicas de alta performance.
 */
export async function insertOrReplaceQuestions(
  questions: any[],
  batchSize: number = 250
): Promise<number> {
  if (!questions || questions.length === 0) return 0;
  const database = getDatabase();

  let totalInserted = 0;
  for (let i = 0; i < questions.length; i += batchSize) {
    const batch = questions.slice(i, i + batchSize);
    await database.withExclusiveTransactionAsync(async (txn) => {
      for (const q of batch) {
        if (!q || typeof q !== 'object') continue;
        const id = String(q.id ?? q.id_questao ?? '').trim();
        if (!id) continue;

        const especialidade = String(q.especialidade || 'Geral').trim();
        const tema = String(q.tema || q.tema_principal || 'Tema Geral').trim();
        const foco = q.foco || q.foco_da_questao ? String(q.foco || q.foco_da_questao).trim() : null;
        const microFoco = q.micro_foco || q.microfoco ? String(q.micro_foco || q.microfoco).trim() : null;
        const banco =
          q.banco || q.origem || q.origin || q.pacote
            ? String(q.banco || q.origem || q.origin || q.pacote).trim()
            : null;
        const ano = q.ano ? String(q.ano).trim() : null;
        const banca = q.banca ? String(q.banca).trim() : null;
        const dataJson = typeof q === 'string' ? q : JSON.stringify(q);

        await txn.runAsync(
          `INSERT OR REPLACE INTO questoes (id, especialidade, tema, foco, micro_foco, banco, ano, banca, data_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [id, especialidade, tema, foco, microFoco, banco, ano, banca, dataJson]
        );
        totalInserted++;
      }
    });
  }

  return totalInserted;
}

/**
 * Retorna o número total de questões gravadas no banco SQLite.
 */
export async function getQuestionsCount(): Promise<number> {
  try {
    const database = getDatabase();
    const result = await database.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM questoes;'
    );
    return result?.count ?? 0;
  } catch (err) {
    console.error('[database] Erro ao contar questões:', err);
    return 0;
  }
}

/**
 * Retorna a lista de especialidades agrupadas com sua quantidade de questões.
 */
export async function getSpecialtiesWithCounts(): Promise<SpecialtyItem[]> {
  try {
    const database = getDatabase();
    const rows = await database.getAllAsync<{ nome: string; count: number }>(
      `SELECT especialidade as nome, COUNT(*) as count
       FROM questoes
       GROUP BY especialidade
       HAVING count > 0
       ORDER BY especialidade COLLATE NOCASE ASC;`
    );
    return rows ?? [];
  } catch (err) {
    console.error('[database] Erro ao buscar especialidades:', err);
    return [];
  }
}

/**
 * Retorna os temas de uma especialidade com suas respectivas contagens.
 */
export async function getThemesBySpecialty(especialidade: string): Promise<ThemeItem[]> {
  try {
    const database = getDatabase();
    const rows = await database.getAllAsync<{ nome: string; count: number }>(
      `SELECT tema as nome, COUNT(*) as count
       FROM questoes
       WHERE LOWER(especialidade) = LOWER(?)
       GROUP BY tema
       HAVING count > 0
       ORDER BY tema COLLATE NOCASE ASC;`,
      [especialidade.trim()]
    );
    return rows ?? [];
  } catch (err) {
    console.error('[database] Erro ao buscar temas por especialidade:', err);
    return [];
  }
}

/**
 * Retorna as questões completas de uma especialidade específica.
 */
export async function getQuestionsBySpecialty(especialidade: string): Promise<any[]> {
  try {
    const database = getDatabase();
    const rows = await database.getAllAsync<{ data_json: string }>(
      `SELECT data_json FROM questoes WHERE LOWER(especialidade) = LOWER(?);`,
      [especialidade.trim()]
    );
    return rows.map((r) => JSON.parse(r.data_json));
  } catch (err) {
    console.error('[database] Erro ao buscar questões por especialidade:', err);
    return [];
  }
}

/**
 * Retorna as questões de uma lista de temas específicos (ideal para o Quiz/Simulado sob demanda).
 */
export async function getQuestionsByThemes(temas: string[]): Promise<any[]> {
  if (!temas || temas.length === 0) return [];
  try {
    const database = getDatabase();
    const placeholders = temas.map(() => '?').join(',');
    const lowerTemas = temas.map((t) => t.trim().toLowerCase());
    const rows = await database.getAllAsync<{ data_json: string }>(
      `SELECT data_json FROM questoes WHERE LOWER(tema) IN (${placeholders});`,
      lowerTemas
    );
    return rows.map((r) => JSON.parse(r.data_json));
  } catch (err) {
    console.error('[database] Erro ao buscar questões por temas:', err);
    return [];
  }
}

/**
 * Retorna questões por uma lista de IDs estáveis.
 */
export async function getQuestionsByIds(ids: string[]): Promise<any[]> {
  if (!ids || ids.length === 0) return [];
  try {
    const database = getDatabase();
    const results: any[] = [];
    const CHUNK_SIZE = 500;

    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE);
      const placeholders = chunk.map(() => '?').join(',');
      const rows = await database.getAllAsync<{ data_json: string }>(
        `SELECT data_json FROM questoes WHERE id IN (${placeholders});`,
        chunk
      );
      for (const r of rows) {
        results.push(JSON.parse(r.data_json));
      }
    }
    return results;
  } catch (err) {
    console.error('[database] Erro ao buscar questões por IDs:', err);
    return [];
  }
}

/**
 * Retorna mapa de { id: micro_foco } para um tema, sem carregar o enunciado e as alternativas em RAM.
 */
export async function getMicroFocoMapByTema(tema: string): Promise<Record<string, string>> {
  try {
    const database = getDatabase();
    const rows = await database.getAllAsync<{ id: string; micro_foco: string }>(
      `SELECT id, micro_foco FROM questoes
       WHERE LOWER(tema) = LOWER(?) AND micro_foco IS NOT NULL AND micro_foco != '';`,
      [tema.trim()]
    );
    const map: Record<string, string> = {};
    for (const r of rows) {
      map[r.id] = r.micro_foco;
    }
    return map;
  } catch (err) {
    console.error('[database] Erro ao buscar microfocos do tema:', err);
    return {};
  }
}

/**
 * Retorna o índice de busca com termos, focos e microfocos por especialidade.
 */
export async function getSpecialtyThemesIndex(): Promise<Record<string, string[]>> {
  try {
    const database = getDatabase();
    const rows = await database.getAllAsync<{
      especialidade: string;
      tema: string;
      foco: string | null;
      micro_foco: string | null;
    }>(
      `SELECT DISTINCT especialidade, tema, foco, micro_foco FROM questoes;`
    );

    const indexSets: Record<string, Set<string>> = {};
    for (const r of rows) {
      const espNorm = (r.especialidade || 'geral').trim().toLowerCase();
      if (!indexSets[espNorm]) {
        indexSets[espNorm] = new Set();
      }
      if (r.tema) indexSets[espNorm].add(r.tema);
      if (r.foco && r.foco.toLowerCase() !== 'geral') indexSets[espNorm].add(r.foco);
      if (r.micro_foco) indexSets[espNorm].add(r.micro_foco);
    }

    const result: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(indexSets)) {
      result[k] = Array.from(v);
    }
    return result;
  } catch (err) {
    console.error('[database] Erro ao construir índice de busca:', err);
    return {};
  }
}

/**
 * Retorna o mapa de tema normalizado -> especialidade.
 */
export async function getTemaParaEspMap(): Promise<Record<string, string>> {
  try {
    const database = getDatabase();
    const rows = await database.getAllAsync<{ tema_lower: string; especialidade: string }>(
      `SELECT DISTINCT LOWER(tema) as tema_lower, especialidade FROM questoes;`
    );
    const map: Record<string, string> = {};
    for (const r of rows) {
      map[r.tema_lower] = r.especialidade;
    }
    return map;
  } catch (err) {
    console.error('[database] Erro ao buscar temaParaEspMap:', err);
    return {};
  }
}

/**
 * Retorna todas as questões do banco SQLite (para exportação, merge ou compatibilidade).
 */
export async function getAllQuestions(): Promise<any[]> {
  try {
    const database = getDatabase();
    const rows = await database.getAllAsync<{ data_json: string }>(
      `SELECT data_json FROM questoes;`
    );
    return rows.map((r) => JSON.parse(r.data_json));
  } catch (err) {
    console.error('[database] Erro ao carregar todas as questões:', err);
    return [];
  }
}

/**
 * Deleta questões por IDs.
 */
export async function deleteQuestionsByIds(ids: string[]): Promise<void> {
  if (!ids || ids.length === 0) return;
  try {
    const database = getDatabase();
    const CHUNK_SIZE = 500;
    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE);
      const placeholders = chunk.map(() => '?').join(',');
      await database.runAsync(
        `DELETE FROM questoes WHERE id IN (${placeholders});`,
        chunk
      );
    }
  } catch (err) {
    console.error('[database] Erro ao deletar questões por IDs:', err);
  }
}

/**
 * Deleta questões associadas a um banco / pacote de origem específico.
 */
export async function deleteQuestionsByBanco(banco: string): Promise<void> {
  try {
    const database = getDatabase();
    await database.runAsync(
      `DELETE FROM questoes WHERE LOWER(banco) = LOWER(?);`,
      [banco.trim()]
    );
  } catch (err) {
    console.error('[database] Erro ao deletar questões por banco:', err);
  }
}

/**
 * Limpa completamente todas as questões do banco SQLite.
 */
export async function clearAllQuestions(): Promise<void> {
  try {
    const database = getDatabase();
    await database.runAsync('DELETE FROM questoes;');
  } catch (err) {
    console.error('[database] Erro ao zerar questões no SQLite:', err);
  }
}

/* =========================================================================
   OPERAÇÕES DE ALTA PERFORMANCE DE HISTÓRICO E PROGRESSO (TABELA progresso)
   ========================================================================= */

export interface DbProgressRecord {
  id?: number;
  id_questao: string;
  tema: string;
  especialidade: string;
  foco?: string | null;
  micro_foco?: string | null;
  correta: boolean;
  resposta_usuario?: string | null;
  gabarito?: string | null;
  data: string;
  timestamp: number;
}

/**
 * Insere um registro de progresso no SQLite.
 */
export async function insertProgressRecord(record: {
  id_questao: string | number;
  tema?: string | null;
  especialidade?: string | null;
  foco?: string | null;
  micro_foco?: string | null;
  correta: boolean;
  resposta_usuario?: string | null;
  gabarito?: string | null;
  data?: string;
  timestamp?: number;
}): Promise<void> {
  try {
    const database = getDatabase();
    const idQuestao = String(record.id_questao ?? '').trim();
    if (!idQuestao) return;

    const dataIso = record.data || new Date().toISOString();
    const ts = typeof record.timestamp === 'number' && !isNaN(record.timestamp)
      ? record.timestamp
      : new Date(dataIso).getTime() || Date.now();

    await database.runAsync(
      `INSERT INTO progresso (
        id_questao, tema, especialidade, foco, micro_foco,
        correta, resposta_usuario, gabarito, data, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        idQuestao,
        String(record.tema || 'Tema Geral').trim(),
        String(record.especialidade || 'Geral').trim(),
        record.foco ? String(record.foco).trim() : null,
        record.micro_foco ? String(record.micro_foco).trim() : null,
        record.correta ? 1 : 0,
        record.resposta_usuario ? String(record.resposta_usuario).trim() : null,
        record.gabarito ? String(record.gabarito).trim() : null,
        dataIso,
        ts,
      ]
    );
  } catch (err) {
    console.error('[database] Erro ao inserir registro de progresso:', err);
  }
}

/**
 * Insere múltiplos registros de progresso em uma transação atômica única (para migrações).
 */
export async function insertProgressRecordsBatch(
  records: any[],
  batchSize: number = 300
): Promise<number> {
  if (!records || records.length === 0) return 0;
  const database = getDatabase();
  let inserted = 0;

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    await database.withExclusiveTransactionAsync(async (txn) => {
      for (const r of batch) {
        if (!r || typeof r !== 'object') continue;
        const idQuestao = String(r.id_questao ?? r.id ?? '').trim();
        if (!idQuestao) continue;

        const dataIso = r.data || new Date().toISOString();
        const ts = typeof r.timestamp === 'number' && !isNaN(r.timestamp)
          ? r.timestamp
          : new Date(dataIso).getTime() || Date.now();

        await txn.runAsync(
          `INSERT INTO progresso (
            id_questao, tema, especialidade, foco, micro_foco,
            correta, resposta_usuario, gabarito, data, timestamp
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            idQuestao,
            String(r.tema || 'Tema Geral').trim(),
            String(r.especialidade || 'Geral').trim(),
            r.foco ? String(r.foco).trim() : null,
            r.micro_foco ? String(r.micro_foco).trim() : null,
            r.correta ? 1 : 0,
            r.resposta_usuario ? String(r.resposta_usuario).trim() : null,
            r.gabarito ? String(r.gabarito).trim() : null,
            dataIso,
            ts,
          ]
        );
        inserted++;
      }
    });
  }

  return inserted;
}

/**
 * Retorna todos os registros de progresso ordenados por timestamp descrescente.
 */
export async function getAllProgressRecords(): Promise<DbProgressRecord[]> {
  try {
    const database = getDatabase();
    const rows = await database.getAllAsync<any>(
      `SELECT * FROM progresso ORDER BY timestamp DESC;`
    );
    return rows.map((r) => ({
      ...r,
      correta: !!r.correta,
    }));
  } catch (err) {
    console.error('[database] Erro ao carregar registros de progresso:', err);
    return [];
  }
}

/**
 * Retorna registros de progresso a partir de um timestamp específico (ex: hoje, 7 dias, 30 dias).
 */
export async function getProgressRecordsSince(sinceTimestamp: number): Promise<DbProgressRecord[]> {
  try {
    const database = getDatabase();
    const rows = await database.getAllAsync<any>(
      `SELECT * FROM progresso WHERE timestamp >= ? ORDER BY timestamp DESC;`,
      [sinceTimestamp]
    );
    return rows.map((r) => ({
      ...r,
      correta: !!r.correta,
    }));
  } catch (err) {
    console.error('[database] Erro ao carregar progresso por período:', err);
    return [];
  }
}

/**
 * Retorna a contagem de questões respondidas a partir de um timestamp específico (ex: hoje).
 */
export async function getProgressCountSince(sinceTimestamp: number): Promise<number> {
  try {
    const database = getDatabase();
    const row = await database.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM progresso WHERE timestamp >= ?;`,
      [sinceTimestamp]
    );
    return row?.count || 0;
  } catch (err) {
    console.error('[database] Erro ao contar progresso recente:', err);
    return 0;
  }
}

/**
 * Retorna a contagem total de registros de progresso.
 */
export async function getProgressTotalCount(): Promise<number> {
  try {
    const database = getDatabase();
    const row = await database.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM progresso;`
    );
    return row?.count || 0;
  } catch (err) {
    console.error('[database] Erro ao contar total de progresso:', err);
    return 0;
  }
}

/**
 * Retorna o conjunto de IDs de questões que o usuário errou (para filtro do simulado).
 */
export async function getErroredQuestionIds(): Promise<string[]> {
  try {
    const database = getDatabase();
    const rows = await database.getAllAsync<{ id_questao: string }>(
      `SELECT DISTINCT id_questao FROM progresso WHERE correta = 0;`
    );
    return rows.map((r) => r.id_questao);
  } catch (err) {
    console.error('[database] Erro ao buscar IDs de questões erradas:', err);
    return [];
  }
}

/**
 * Retorna a lista de temas distintos presentes no histórico de progresso.
 */
export async function getDistinctProgressThemes(): Promise<string[]> {
  try {
    const database = getDatabase();
    const rows = await database.getAllAsync<{ tema: string }>(
      `SELECT DISTINCT tema FROM progresso WHERE tema IS NOT NULL AND tema != '' ORDER BY tema ASC;`
    );
    return rows.map((r) => r.tema);
  } catch (err) {
    console.error('[database] Erro ao buscar temas do progresso:', err);
    return [];
  }
}

/**
 * Deleta o histórico de questões dos temas informados (para reset seletivo).
 */
export async function deleteProgressByThemes(themes: string[]): Promise<void> {
  if (!themes || themes.length === 0) return;
  try {
    const database = getDatabase();
    const CHUNK_SIZE = 100;
    for (let i = 0; i < themes.length; i += CHUNK_SIZE) {
      const chunk = themes.slice(i, i + CHUNK_SIZE);
      const placeholders = chunk.map(() => '?').join(',');
      await database.runAsync(
        `DELETE FROM progresso WHERE tema IN (${placeholders});`,
        chunk
      );
    }
  } catch (err) {
    console.error('[database] Erro ao deletar progresso por temas:', err);
  }
}

/**
 * Limpa completamente todo o histórico de progresso do usuário.
 */
export async function clearAllProgressRecords(): Promise<void> {
  try {
    const database = getDatabase();
    await database.runAsync('DELETE FROM progresso;');
  } catch (err) {
    console.error('[database] Erro ao limpar todo o progresso no SQLite:', err);
  }
}

export interface AtividadeAgenda {
  id: string;
  id_recorrente?: string | null;
  titulo: string;
  tipo: string;
  data_agendada: string;
  hora_inicio?: string | null;
  hora_fim?: string | null;
  feedback_cansaco?: number;
  concluida: boolean;
  timestamp?: number;
  isVirtual?: boolean; // Flag para UI saber se é um "molde" que ainda não foi alterado/concluído
}

export interface AtividadeRecorrente {
  id: string;
  titulo: string;
  tipo: string;
  frequencia: 'diaria' | 'dias_uteis' | 'semanal';
  dias_semana?: string | null; // JSON stringfied array
  data_inicio: string;
  data_fim?: string | null;
  hora_inicio?: string | null;
  hora_fim?: string | null;
  feedback_cansaco?: number;
  timestamp?: number;
}

/**
 * Insere ou atualiza uma atividade na agenda diária.
 */
export async function upsertAtividadeAgenda(atividade: AtividadeAgenda): Promise<void> {
  try {
    const database = getDatabase();
    const ts = atividade.timestamp || Date.now();
    await database.runAsync(
      `INSERT INTO AtividadesAgenda (
        id, id_recorrente, titulo, tipo, data_agendada, hora_inicio, hora_fim, feedback_cansaco, concluida, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        id_recorrente = excluded.id_recorrente,
        titulo = excluded.titulo,
        tipo = excluded.tipo,
        data_agendada = excluded.data_agendada,
        hora_inicio = excluded.hora_inicio,
        hora_fim = excluded.hora_fim,
        feedback_cansaco = excluded.feedback_cansaco,
        concluida = excluded.concluida,
        timestamp = excluded.timestamp;`,
      [
        atividade.id,
        atividade.id_recorrente || null,
        atividade.titulo.trim(),
        atividade.tipo.trim(),
        atividade.data_agendada,
        atividade.hora_inicio || null,
        atividade.hora_fim || null,
        atividade.feedback_cansaco || 0,
        atividade.concluida ? 1 : 0,
        ts,
      ]
    );
  } catch (err) {
    console.error('[database] Erro ao salvar atividade da agenda:', err);
  }
}

/**
 * Insere ou atualiza uma atividade recorrente fixa.
 */
export async function upsertAtividadeRecorrente(recorrente: AtividadeRecorrente): Promise<void> {
  try {
    const database = getDatabase();
    const ts = recorrente.timestamp || Date.now();
    await database.runAsync(
      `INSERT INTO AtividadesRecorrentes (
        id, titulo, tipo, frequencia, dias_semana, data_inicio, data_fim, hora_inicio, hora_fim, feedback_cansaco, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        titulo = excluded.titulo,
        tipo = excluded.tipo,
        frequencia = excluded.frequencia,
        dias_semana = excluded.dias_semana,
        data_inicio = excluded.data_inicio,
        data_fim = excluded.data_fim,
        hora_inicio = excluded.hora_inicio,
        hora_fim = excluded.hora_fim,
        feedback_cansaco = excluded.feedback_cansaco,
        timestamp = excluded.timestamp;`,
      [
        recorrente.id,
        recorrente.titulo.trim(),
        recorrente.tipo.trim(),
        recorrente.frequencia,
        recorrente.dias_semana || null,
        recorrente.data_inicio,
        recorrente.data_fim || null,
        recorrente.hora_inicio || null,
        recorrente.hora_fim || null,
        recorrente.feedback_cansaco || 0,
        ts,
      ]
    );
  } catch (err) {
    console.error('[database] Erro ao salvar atividade recorrente:', err);
  }
}

/**
 * Busca as atividades de um dia específico, mesclando eventos únicos
 * com as regras ativas de atividades recorrentes.
 */
export async function getAtividadesPorData(dataYYYYMMDD: string): Promise<AtividadeAgenda[]> {
  try {
    const database = getDatabase();

    // 1. Busca as atividades únicas ou instâncias já salvas/concluídas neste dia
    const rowsUnicas = await database.getAllAsync<any>(
      `SELECT * FROM AtividadesAgenda WHERE data_agendada = ?;`,
      [dataYYYYMMDD]
    );

    const unicas = rowsUnicas.map((r) => ({ ...r, concluida: !!r.concluida }));
    const idsRecorrentesProcessados = new Set(unicas.map((u) => u.id_recorrente).filter(Boolean));

    // 2. Busca as atividades recorrentes válidas para esta data
    const rowsRecorrentes = await database.getAllAsync<any>(
      `SELECT * FROM AtividadesRecorrentes 
       WHERE data_inicio <= ? AND (data_fim IS NULL OR data_fim >= ?);`,
      [dataYYYYMMDD, dataYYYYMMDD]
    );

    const targetDate = new Date(dataYYYYMMDD + 'T12:00:00Z');
    const dayOfWeek = targetDate.getUTCDay(); // 0 = Dom, 1 = Seg, 6 = Sáb

    const atividadesVirtuais: AtividadeAgenda[] = [];

    for (const rec of rowsRecorrentes) {
      // Se já existe um registro físico (ex: usuário marcou como concluído hoje), pula.
      if (idsRecorrentesProcessados.has(rec.id)) continue;

      let deveIncluir = false;
      if (rec.frequencia === 'diaria') {
        deveIncluir = true;
      } else if (rec.frequencia === 'dias_uteis') {
        deveIncluir = dayOfWeek >= 1 && dayOfWeek <= 5;
      } else if (rec.frequencia === 'semanal' && rec.dias_semana) {
        try {
          const dias = JSON.parse(rec.dias_semana) as number[];
          deveIncluir = dias.includes(dayOfWeek);
        } catch {
          deveIncluir = false;
        }
      }

      if (deveIncluir) {
        atividadesVirtuais.push({
          id: `virtual_${rec.id}_${dataYYYYMMDD}`,
          id_recorrente: rec.id,
          titulo: rec.titulo,
          tipo: rec.tipo,
          data_agendada: dataYYYYMMDD,
          hora_inicio: rec.hora_inicio,
          hora_fim: rec.hora_fim,
          feedback_cansaco: rec.feedback_cansaco,
          concluida: false,
          isVirtual: true,
        });
      }
    }

    // 3. Junta tudo e ordena pelo horário de início
    const resultadoFinal = [...unicas, ...atividadesVirtuais].sort((a, b) => {
      const horaA = a.hora_inicio || '24:00';
      const horaB = b.hora_inicio || '24:00';
      return horaA.localeCompare(horaB);
    });

    return resultadoFinal;
  } catch (err) {
    console.error('[database] Erro ao mesclar atividades por data:', err);
    return [];
  }
}

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Cria uma nova atividade, gravando como única em AtividadesAgenda
 * ou como molde recorrente em AtividadesRecorrentes.
 */
export async function criarNovaAtividade(dados: {
  titulo: string;
  tipo: string;
  frequencia: 'unica' | 'diaria' | 'dias_uteis' | 'semanal';
  data_inicio: string; // YYYY-MM-DD
  hora_inicio?: string;
  hora_fim?: string;
  feedback_cansaco: number;
  dias_semana?: number[]; // Para semanal ex: [1, 3, 5]
}): Promise<void> {
  const database = getDatabase();
  const id = generateUUID();
  const ts = Date.now();

  if (dados.frequencia === 'unica') {
    await database.runAsync(
      `INSERT INTO AtividadesAgenda (id, titulo, tipo, data_agendada, hora_inicio, hora_fim, feedback_cansaco, concluida, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?);`,
      [
        id,
        dados.titulo.trim(),
        dados.tipo.trim(),
        dados.data_inicio,
        dados.hora_inicio || null,
        dados.hora_fim || null,
        dados.feedback_cansaco || 0,
        ts,
      ]
    );
  } else {
    const diasStr = dados.dias_semana && dados.dias_semana.length > 0 ? JSON.stringify(dados.dias_semana) : null;
    await database.runAsync(
      `INSERT INTO AtividadesRecorrentes (id, titulo, tipo, frequencia, dias_semana, data_inicio, hora_inicio, hora_fim, feedback_cansaco, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        id,
        dados.titulo.trim(),
        dados.tipo.trim(),
        dados.frequencia,
        diasStr,
        dados.data_inicio,
        dados.hora_inicio || null,
        dados.hora_fim || null,
        dados.feedback_cansaco || 0,
        ts,
      ]
    );
  }
}

/**
 * Altera o status de conclusão de uma atividade.
 * Se for uma ocorrência virtual de uma rotina recorrente, materializa ela no banco para este dia.
 */
export async function toggleAtividadeStatus(atividade: AtividadeAgenda): Promise<void> {
  try {
    const database = getDatabase();
    const novoStatus = atividade.concluida ? 0 : 1;
    const ts = Date.now();

    if (atividade.isVirtual) {
      // Materializa a atividade recorrente para este dia específico
      const novoId = generateUUID();
      await database.runAsync(
        `INSERT INTO AtividadesAgenda (
          id, id_recorrente, titulo, tipo, data_agendada, hora_inicio, hora_fim, feedback_cansaco, concluida, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          novoId,
          atividade.id_recorrente || null,
          atividade.titulo,
          atividade.tipo,
          atividade.data_agendada,
          atividade.hora_inicio || null,
          atividade.hora_fim || null,
          atividade.feedback_cansaco || 0,
          novoStatus,
          ts,
        ]
      );
    } else {
      // Atualiza uma atividade que já existe fisicamente no dia
      await database.runAsync(
        `UPDATE AtividadesAgenda SET concluida = ?, timestamp = ? WHERE id = ?;`,
        [novoStatus, ts, atividade.id]
      );
    }
  } catch (err) {
    console.error('[database] Erro ao alternar status da atividade:', err);
  }
}





