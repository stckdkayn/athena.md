import { getDatabase } from './database';

export interface StreakInfo {
  streak: number;
  bestStreak: number;
  lastDate: string | null;
  activeToday: boolean;
  historyLast7Days: { date: string; dayLabel: string; active: boolean }[];
}

/**
 * Converte um timestamp ou Date para a string local 'YYYY-MM-DD'
 */
function toLocalDateStr(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const DIAS_SEMANA_ABREV = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/**
 * Calcula a ofensiva atual do usuário analisando as datas no SQLite de forma 100% determinística.
 * A ofensiva é baseada em dias consecutivos em que pelo menos 1 questão foi respondida.
 */
export async function getStreakInfo(): Promise<StreakInfo> {
  try {
    const database = getDatabase();

    // Busca todas as datas distintas registradas em progresso
    const rows = await database.getAllAsync<{ data: string }>(
      `SELECT DISTINCT data FROM progresso ORDER BY data DESC;`
    );

    const distinctDatesSet = new Set<string>();
    for (const r of rows) {
      if (!r.data) continue;
      const d = new Date(r.data);
      if (isNaN(d.getTime())) continue;
      distinctDatesSet.add(toLocalDateStr(d));
    }

    const today = new Date();
    const todayStr = toLocalDateStr(today);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = toLocalDateStr(yesterday);

    const activeToday = distinctDatesSet.has(todayStr);

    // Contagem da streak atual
    let currentStreak = 0;
    // Ponto de partida: se fez hoje, começa de hoje; se não fez hoje mas fez ontem, a streak ainda está viva!
    let checkDate = new Date(today);
    if (!activeToday) {
      if (distinctDatesSet.has(yesterdayStr)) {
        checkDate = yesterday;
      } else {
        checkDate = null as any;
      }
    }

    if (checkDate) {
      while (true) {
        const dateStr = toLocalDateStr(checkDate);
        if (distinctDatesSet.has(dateStr)) {
          currentStreak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }
    }

    // Histórico dos últimos 7 dias (da semana atual / últimos 7 dias corridos)
    const historyLast7Days: { date: string; dayLabel: string; active: boolean }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dStr = toLocalDateStr(d);
      historyLast7Days.push({
        date: dStr,
        dayLabel: DIAS_SEMANA_ABREV[d.getDay()],
        active: distinctDatesSet.has(dStr),
      });
    }

    // Última data ativa
    const sortedDates = Array.from(distinctDatesSet).sort().reverse();
    const lastDate = sortedDates.length > 0 ? sortedDates[0] : null;

    return {
      streak: currentStreak,
      bestStreak: currentStreak, // Pode ser expandido com histórico global se desejado
      lastDate,
      activeToday,
      historyLast7Days,
    };
  } catch (err) {
    console.error('[streakService] Erro ao calcular streak:', err);
    return {
      streak: 0,
      bestStreak: 0,
      lastDate: null,
      activeToday: false,
      historyLast7Days: [],
    };
  }
}
