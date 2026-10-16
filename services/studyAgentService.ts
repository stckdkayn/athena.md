import { getDatabase, getDueTopics } from './database';

export interface StudyQuestion {
  id: string | number;
  tema?: string;
  especialidade?: string;
  enunciado?: string;
  alternativas?: any;
  resposta_correta?: string;
  gabarito?: string;
  explicacao?: string;
  [key: string]: any;
}

/**
 * A Secretária de Estudos inteligente.
 * Gera uma sessão diária equilibrada:
 * 1. Puxa questões inéditas dos temas atrasados / pendentes de revisão no SM-2 (TopicProgress).
 * 2. Preenche os slots restantes com questões inéditas de qualquer matéria.
 * 3. Se as inéditas acabarem, preenche com questões gerais aleatórias.
 * 4. Embaralha para entregar um simulado imprevisível e personalizado.
 */
export async function generateDailySession(totalQuestions: number = 15): Promise<StudyQuestion[]> {
  try {
    const database = getDatabase();
    let sessionQuestions: StudyQuestion[] = [];
    const selectedIds = new Set<string>();

    // 1. Descobrir quais temas estão pedindo revisão no SM-2
    const dueTopics = await getDueTopics();

    // ETAPA A: Puxar questões INÉDITAS dos temas atrasados
    if (dueTopics.length > 0) {
      const questionsPerTopic = 3;
      for (const topic of dueTopics) {
        if (sessionQuestions.length >= totalQuestions) break;
        const slotsForTopic = Math.min(questionsPerTopic, totalQuestions - sessionQuestions.length);

        const rows = await database.getAllAsync<{ id: string; data_json: string }>(
          `SELECT id, data_json FROM questoes
           WHERE LOWER(tema) = LOWER(?)
           AND id NOT IN (SELECT questionId FROM QuestionHistory)
           ORDER BY RANDOM()
           LIMIT ?;`,
          [topic.trim(), slotsForTopic]
        );

        for (const row of rows) {
          if (!selectedIds.has(row.id)) {
            selectedIds.add(row.id);
            try {
              sessionQuestions.push(JSON.parse(row.data_json));
            } catch {
              sessionQuestions.push({ id: row.id });
            }
          }
        }
      }
    }

    // ETAPA B: Preencher as vagas restantes com questões inéditas de qualquer matéria
    const remainingSlots = totalQuestions - sessionQuestions.length;
    if (remainingSlots > 0) {
      const excludeIds = Array.from(selectedIds);
      let excludeClause = '';
      let params: any[] = [remainingSlots];

      if (excludeIds.length > 0) {
        const placeholders = excludeIds.map(() => '?').join(',');
        excludeClause = `AND id NOT IN (${placeholders})`;
        params = [...excludeIds, remainingSlots];
      }

      const rows = await database.getAllAsync<{ id: string; data_json: string }>(
        `SELECT id, data_json FROM questoes
         WHERE id NOT IN (SELECT questionId FROM QuestionHistory)
         ${excludeClause}
         ORDER BY RANDOM()
         LIMIT ?;`,
        params
      );

      for (const row of rows) {
        if (!selectedIds.has(row.id)) {
          selectedIds.add(row.id);
          try {
            sessionQuestions.push(JSON.parse(row.data_json));
          } catch {
            sessionQuestions.push({ id: row.id });
          }
        }
      }
    }

    // ETAPA C: Fallback para o caso de todas as questões inéditas já terem sido feitas
    if (sessionQuestions.length < totalQuestions) {
      const needed = totalQuestions - sessionQuestions.length;
      const excludeIds = Array.from(selectedIds);
      let excludeClause = '';
      let params: any[] = [needed];

      if (excludeIds.length > 0) {
        const placeholders = excludeIds.map(() => '?').join(',');
        excludeClause = `WHERE id NOT IN (${placeholders})`;
        params = [...excludeIds, needed];
      }

      const fallbackRows = await database.getAllAsync<{ id: string; data_json: string }>(
        `SELECT id, data_json FROM questoes
         ${excludeClause}
         ORDER BY RANDOM()
         LIMIT ?;`,
        params
      );

      for (const row of fallbackRows) {
        if (!selectedIds.has(row.id)) {
          selectedIds.add(row.id);
          try {
            sessionQuestions.push(JSON.parse(row.data_json));
          } catch {
            sessionQuestions.push({ id: row.id });
          }
        }
      }
    }

    // ETAPA D: Embaralha para entregar a prova variada
    const shuffled = sessionQuestions.sort(() => Math.random() - 0.5);
    return shuffled;
  } catch (err) {
    console.error('[studyAgentService] Erro ao gerar sessão diária:', err);
    return [];
  }
}

export { getDueTopics };
