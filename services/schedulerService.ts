import { getDatabase } from './database';
import type { DbEventoFixo, DbBlocoEstudo, BlocoEstudoType } from './database';

// Helpers de tempo para facilitar o cálculo do algoritmo
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60).toString().padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * 1. O CÁLCULO DE TEMPO LÍQUIDO
 * Lê o seu dia, remove os plantões, aulas e o sono, e cospe as "janelas" que sobraram.
 */
export async function calcularTempoLivreLiquido(dataYYYYMMDD: string): Promise<{ inicio: number; fim: number }[]> {
  const database = getDatabase();
  const dateObj = new Date(dataYYYYMMDD + 'T12:00:00Z');
  const diaSemana = dateObj.getUTCDay(); // 0 = Dom, 1 = Seg, etc.

  // Busca sua rotina fixa
  const rows = await database.getAllAsync<any>(`SELECT * FROM eventos_fixos WHERE ativo = 1;`);
  const eventosFixos: DbEventoFixo[] = rows.map((r) => ({ ...r, dias_semana: JSON.parse(r.dias_semana) }));

  // Filtra apenas os eventos que caem no dia de hoje
  const eventosHoje = eventosFixos.filter((e) => e.dias_semana.includes(diaSemana));

  // Inicializa os bloqueios do dia (em minutos: 0 a 1440)
  const intervalosOcupados: { inicio: number; fim: number }[] = eventosHoje.map((e) => ({
    inicio: timeToMinutes(e.hora_inicio),
    fim: timeToMinutes(e.hora_fim),
  }));

  // Bloqueio de Sono Fixo (ex: 00:00 às 06:00 e 23:00 às 00:00)
  // Futuramente você pode puxar isso de uma tela de configurações
  intervalosOcupados.push({ inicio: 0, fim: 360 });
  intervalosOcupados.push({ inicio: 1380, fim: 1440 });

  // Organiza e mescla os horários que se sobrepõem
  intervalosOcupados.sort((a, b) => a.inicio - b.inicio);
  const ocupadosMesclados: { inicio: number; fim: number }[] = [];
  let atual = intervalosOcupados[0];

  for (let i = 1; i < intervalosOcupados.length; i++) {
    const prox = intervalosOcupados[i];
    if (prox.inicio <= atual.fim) {
      atual.fim = Math.max(atual.fim, prox.fim);
    } else {
      ocupadosMesclados.push(atual);
      atual = prox;
    }
  }
  ocupadosMesclados.push(atual);

  // Inverte a lógica para achar o tempo livre
  const tempoLivre: { inicio: number; fim: number }[] = [];
  let ultimoFim = 0;
  for (const o of ocupadosMesclados) {
    if (o.inicio > ultimoFim) {
      tempoLivre.push({ inicio: ultimoFim, fim: o.inicio });
    }
    ultimoFim = o.fim;
  }
  if (ultimoFim < 1440) {
    tempoLivre.push({ inicio: ultimoFim, fim: 1440 });
  }

  // Só retorna janelas que tenham pelo menos 30 minutos (menos que isso não rende)
  return tempoLivre.filter((t) => (t.fim - t.inicio) >= 30);
}

/**
 * 2. DESCOBERTA DE GARGALOS
 * Analisa as questões que você já fez e calcula onde sua taxa de acerto é pior.
 */
export async function obterGargalos(): Promise<{ tema: string; prioridade: number }[]> {
  const database = getDatabase();

  // Agrupa os temas, calcula a taxa de acerto e pega os 5 piores
  const rows = await database.getAllAsync<any>(`
    SELECT tema, 
           CAST(SUM(correta) AS REAL) / COUNT(*) as taxa_acerto,
           COUNT(*) as total_questoes
    FROM progresso
    GROUP BY tema
    HAVING total_questoes >= 5
    ORDER BY taxa_acerto ASC
    LIMIT 5;
  `);

  return rows.map((r) => {
    const taxa = r.taxa_acerto; // de 0.0 a 1.0
    // Lógica de Prioridade: Se acertou 20% (0.2), prioridade = 8.0. Se acertou 80% (0.8), prioridade = 2.0.
    const prioridade = 10 - (taxa * 10);
    return { tema: r.tema, prioridade: parseFloat(prioridade.toFixed(2)) };
  });
}

/**
 * 3. O AGENDADOR DINÂMICO
 * Roda no início do dia. Pega o tempo livre, os gargalos e gera a sua agenda.
 */
export async function gerarPlanoDiario(dataYYYYMMDD: string): Promise<void> {
  const database = getDatabase();

  // Primeiro, limpa os blocos não concluídos gerados anteriormente para esta data (replanejamento)
  await database.runAsync(
    `DELETE FROM blocos_estudo WHERE data_agendada = ? AND status = 'pendente';`,
    [dataYYYYMMDD]
  );

  const janelasLivres = await calcularTempoLivreLiquido(dataYYYYMMDD);
  const gargalos = await obterGargalos();

  if (janelasLivres.length === 0 || gargalos.length === 0) return;

  const ts = Date.now();
  let gargaloIndex = 0;

  // Usa transação exclusiva para alta performance no SQLite
  await database.withExclusiveTransactionAsync(async (txn) => {
    for (const janela of janelasLivres) {
      let minutosDisponiveis = janela.fim - janela.inicio;
      let tempoAtual = janela.inicio;

      // Enquanto houver pelo menos 40 minutos na janela, cria um bloco de estudo
      while (minutosDisponiveis >= 40) {
        // Tenta fazer blocos de 60 mins. Se sobrar menos (mas >40), usa o que sobrou.
        const duracaoBloco = minutosDisponiveis >= 60 ? 60 : minutosDisponiveis;

        // Fica rodando entre os 5 piores gargalos
        const gargaloAtual = gargalos[gargaloIndex % gargalos.length];

        // Se a taxa de acerto é terrível (< 50%), não force questões, force teoria
        let tipoBloco: BlocoEstudoType;

        // A "prioridade" que calculamos ia de 0 a 10. Prioridade 8 significa taxa de acerto de 20%.
        if (gargaloAtual.prioridade >= 5.0) { // Menos de 50% de acerto
          tipoBloco = 'videoaula'; // Ou 'leitura', dependendo do seu perfil
        } else if (gargaloAtual.prioridade >= 2.5) { // 50% a 75% de acerto
          tipoBloco = 'questoes';
        } else {
          tipoBloco = 'flashcards'; // Revisão rápida de manutenção
        }

        // Gerador de ID rápido nativo
        const novoId = Math.random().toString(36).substring(2, 15);

        await txn.runAsync(
          `INSERT INTO blocos_estudo (
            id, tipo, tema_id, data_agendada, hora_inicio, hora_fim, duracao_minutos, prioridade, status, timestamp_geracao
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            novoId,
            tipoBloco,
            gargaloAtual.tema,
            dataYYYYMMDD,
            minutesToTime(tempoAtual),
            minutesToTime(tempoAtual + duracaoBloco),
            duracaoBloco,
            gargaloAtual.prioridade,
            'pendente',
            ts,
          ]
        );

        tempoAtual += duracaoBloco;
        minutosDisponiveis -= duracaoBloco;
        gargaloIndex++;
      }
    }
  });
}
