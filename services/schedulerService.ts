import { getDatabase, getAtividadesPorData, getPassosPorDiaSemana } from './database';
import type { DbEventoFixo, DbBlocoEstudo, BlocoEstudoType } from './database';
import { storage } from './storage';

// Helpers de tempo para facilitar o cálculo do algoritmo
export function timeToMinutes(time: string): number {
  if (!time) return 0;
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minutesToTime(mins: number): string {
  const clamped = Math.max(0, Math.min(1440, mins));
  const h = Math.floor(clamped / 60).toString().padStart(2, '0');
  const m = (clamped % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

export interface JanelaLivre {
  inicio: number; // minutos a partir de 00:00 (ex: 480 = 08:00)
  fim: number;    // minutos a partir de 00:00
}

/**
 * 1. O CÁLCULO DE TEMPO LÍQUIDO
 * Lê o seu dia, remove os plantões, aulas, sono e compromissos fixos ou da agenda,
 * e cospe as "janelas" livres reais que sobraram.
 */
export async function calcularTempoLivreLiquido(dataYYYYMMDD: string): Promise<JanelaLivre[]> {
  const database = getDatabase();
  const [ano, mes, dia] = dataYYYYMMDD.split('-').map(Number);
  const dateObj = new Date(ano, mes - 1, dia);
  const diaSemana = dateObj.getDay(); // 0 = Dom, 1 = Seg, etc.

  const intervalosOcupados: { inicio: number; fim: number }[] = [];

  // A. Busca rotina fixa da tabela eventos_fixos
  try {
    const rows = await database.getAllAsync<any>(`SELECT * FROM eventos_fixos WHERE ativo = 1;`);
    const eventosFixos: DbEventoFixo[] = rows.map((r) => ({
      ...r,
      dias_semana: JSON.parse(r.dias_semana),
    }));
    const eventosHoje = eventosFixos.filter((e) => e.dias_semana.includes(diaSemana));

    for (const e of eventosHoje) {
      intervalosOcupados.push({
        inicio: timeToMinutes(e.hora_inicio),
        fim: timeToMinutes(e.hora_fim),
      });
    }
  } catch (err) {
    console.warn('[scheduler] Erro ao ler eventos_fixos:', err);
  }

  // B. Busca atividades já cadastradas na agenda para este dia (que não sejam estudos)
  try {
    const atividadesAgenda = await getAtividadesPorData(dataYYYYMMDD);
    for (const atv of atividadesAgenda) {
      if (atv.tipo !== 'Estudos' && atv.tipo !== 'Estudo' && atv.hora_inicio) {
        const ini = timeToMinutes(atv.hora_inicio);
        const fim = atv.hora_fim ? timeToMinutes(atv.hora_fim) : Math.min(1440, ini + 60);
        if (fim > ini) {
          intervalosOcupados.push({ inicio: ini, fim });
        }
      }
    }
  } catch (err) {
    console.warn('[scheduler] Erro ao ler atividades da agenda:', err);
  }

  // C. Bloqueio de Sono Fixo (00:00 às 06:00 e 23:00 às 24:00)
  intervalosOcupados.push({ inicio: 0, fim: 360 });       // 00:00 - 06:00
  intervalosOcupados.push({ inicio: 1380, fim: 1440 });   // 23:00 - 24:00

  // Organiza e mescla os horários que se sobrepõem
  intervalosOcupados.sort((a, b) => a.inicio - b.inicio);
  const ocupadosMesclados: { inicio: number; fim: number }[] = [];
  let atual = { ...intervalosOcupados[0] };

  for (let i = 1; i < intervalosOcupados.length; i++) {
    const prox = intervalosOcupados[i];
    if (prox.inicio <= atual.fim) {
      atual.fim = Math.max(atual.fim, prox.fim);
    } else {
      ocupadosMesclados.push(atual);
      atual = { ...prox };
    }
  }
  ocupadosMesclados.push(atual);

  // Inverte a lógica para achar o tempo livre
  const tempoLivre: JanelaLivre[] = [];
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

  // Retorna janelas livres que tenham pelo menos 15 minutos de fôlego
  return tempoLivre.filter((t) => t.fim - t.inicio >= 15);
}

/**
 * 2. DESCOBERTA DE GARGALOS
 * Analisa as questões que você já fez e calcula onde sua taxa de acerto é pior.
 * Se ainda não houver histórico suficiente, utiliza tópicos da base de dados como recomendação inicial.
 */
export async function obterGargalos(): Promise<{ tema: string; prioridade: number }[]> {
  const database = getDatabase();

  try {
    const rows = await database.getAllAsync<any>(`
      SELECT tema, 
             CAST(SUM(correta) AS REAL) / COUNT(*) as taxa_acerto,
             COUNT(*) as total_questoes
      FROM progresso
      GROUP BY tema
      HAVING total_questoes >= 3
      ORDER BY taxa_acerto ASC
      LIMIT 5;
    `);

    if (rows && rows.length > 0) {
      return rows.map((r) => {
        const taxa = r.taxa_acerto; // 0.0 a 1.0
        const prioridade = 10 - taxa * 10;
        return { tema: r.tema, prioridade: parseFloat(prioridade.toFixed(2)) };
      });
    }

    // Se o usuário ainda não respondeu 3 questões por tema, busca da base de questões
    const sampleTopics = await database.getAllAsync<{ tema: string }>(
      `SELECT DISTINCT tema FROM questoes WHERE tema IS NOT NULL AND tema != '' ORDER BY RANDOM() LIMIT 5;`
    );

    if (sampleTopics && sampleTopics.length > 0) {
      return sampleTopics.map((s) => ({ tema: s.tema, prioridade: 5.0 }));
    }
  } catch (err) {
    console.warn('[scheduler] Erro ao obter gargalos do banco:', err);
  }

  // Fallback padrão de grandes áreas da residência médica
  return [
    { tema: 'Cardiologia - Hipertensão e Síndrome Coronariana', prioridade: 6.0 },
    { tema: 'Pediatria - Neonatologia e Aleitamento', prioridade: 5.5 },
    { tema: 'Cirurgia Geral - Abdome Agudo e Trauma', prioridade: 5.0 },
    { tema: 'Obstetrícia - Pré-natal e Hemorragias da Gestação', prioridade: 5.0 },
    { tema: 'Medicina Preventiva - Epidemiologia e SUS', prioridade: 4.5 },
  ];
}

interface TarefaPlanejada {
  tipo: BlocoEstudoType;
  tema_id: string;
  titulo: string;
  passo_id?: number | null;
  prioridade: number;
  duracaoSugerida: number;
}

/**
 * 3. O AGENDADOR INTELIGENTE DINÂMICO
 * Cruza a rotina e compromissos do dia com o cronograma oficial de 45 semanas
 * e as fraquezas de desempenho para montar a agenda de estudos cirúrgica.
 */
export async function gerarPlanoDiario(dataYYYYMMDD: string): Promise<number> {
  const database = getDatabase();

  // Limpa os blocos pendentes gerados anteriormente para esta data (replanejamento sem apagar o que já foi concluído)
  await database.runAsync(
    `DELETE FROM blocos_estudo WHERE data_agendada = ? AND status = 'pendente';`,
    [dataYYYYMMDD]
  );

  const janelasLivres = await calcularTempoLivreLiquido(dataYYYYMMDD);
  if (janelasLivres.length === 0) return 0;

  // Determina o dia da semana atual
  const [ano, mes, dia] = dataYYYYMMDD.split('-').map(Number);
  const dateObj = new Date(ano, mes - 1, dia);
  const dayIdx = dateObj.getDay();
  const DIAS_SEMANA_MAP = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
  const diaSemanaStr = DIAS_SEMANA_MAP[dayIdx] || 'segunda';

  // Semana ativa do cronograma
  const semStr = storage.getString('@athena_semana_ativa');
  const semanaAtiva = semStr ? parseInt(semStr, 10) : 1;

  // 1. Busca os passos oficiais da residência médica para o dia de hoje
  const passosResidencia = await getPassosPorDiaSemana(diaSemanaStr, semanaAtiva);
  const passosPendentes = (passosResidencia || []).filter((p) => p.concluido !== 1);

  // 2. Busca os gargalos de acertos
  const gargalos = await obterGargalos();

  // 3. Monta a fila de tarefas priorizadas
  const filaTarefas: TarefaPlanejada[] = passosPendentes.map((p) => {
    let tipoBloco: BlocoEstudoType = 'questoes';
    let duracao = 45;

    if (p.tipo === 'flashcards') {
      tipoBloco = 'flashcards';
      duracao = 25;
    } else if (p.tipo === 'aulas' || p.tipo === 'aulas_bonus') {
      tipoBloco = 'videoaula';
      duracao = 50;
    } else if (p.tipo === 'apostila') {
      tipoBloco = 'leitura';
      duracao = 40;
    } else {
      tipoBloco = 'questoes';
      duracao = 45;
    }

    const labelCompleto = p.label ? ` • ${p.label}` : '';
    return {
      tipo: tipoBloco,
      tema_id: p.tema_questoes || p.topico_titulo,
      titulo: `${p.topico_titulo}${labelCompleto}`,
      passo_id: p.id,
      prioridade: 8.5,
      duracaoSugerida: duracao,
    };
  });

  let gargaloIndex = 0;
  const proximoGargalo = (): TarefaPlanejada => {
    const g = gargalos[gargaloIndex % gargalos.length];
    gargaloIndex++;
    let tipo: BlocoEstudoType = 'questoes';
    let duracao = 45;

    if (g.prioridade >= 5.0) {
      tipo = 'videoaula';
      duracao = 50;
    } else if (g.prioridade >= 2.5) {
      tipo = 'questoes';
      duracao = 45;
    } else {
      tipo = 'flashcards';
      duracao = 25;
    }

    return {
      tipo,
      tema_id: g.tema,
      titulo: `Revisão de Gargalo: ${g.tema}`,
      passo_id: null,
      prioridade: g.prioridade,
      duracaoSugerida: duracao,
    };
  };

  const ts = Date.now();
  let totalGerados = 0;

  await database.withExclusiveTransactionAsync(async (txn) => {
    for (const janela of janelasLivres) {
      let minutosDisponiveis = janela.fim - janela.inicio;
      let tempoAtual = janela.inicio;

      while (minutosDisponiveis >= 15) {
        let tarefa: TarefaPlanejada;

        // Se a janela restante for curta (< 30 min), prioriza flashcards
        if (minutosDisponiveis < 30) {
          const idxFlash = filaTarefas.findIndex((t) => t.tipo === 'flashcards');
          if (idxFlash >= 0) {
            tarefa = filaTarefas.splice(idxFlash, 1)[0];
          } else {
            const g = proximoGargalo();
            tarefa = {
              ...g,
              tipo: 'flashcards',
              titulo: `Flashcards Rápidos: ${g.tema_id}`,
              duracaoSugerida: minutosDisponiveis,
            };
          }
        } else {
          if (filaTarefas.length > 0) {
            tarefa = filaTarefas.shift()!;
          } else {
            tarefa = proximoGargalo();
          }
        }

        let duracaoBloco = Math.min(tarefa.duracaoSugerida, minutosDisponiveis);
        const sobra = minutosDisponiveis - duracaoBloco;
        if (sobra > 0 && sobra < 15) {
          duracaoBloco += sobra; // Absorve a sobra para não deixar vácuos curtos
        }

        const novoId = Math.random().toString(36).substring(2, 15);

        await txn.runAsync(
          `INSERT INTO blocos_estudo (
            id, tipo, tema_id, titulo, passo_id, data_agendada, hora_inicio, hora_fim, duracao_minutos, prioridade, status, timestamp_geracao
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            novoId,
            tarefa.tipo,
            tarefa.tema_id,
            tarefa.titulo,
            tarefa.passo_id ?? null,
            dataYYYYMMDD,
            minutesToTime(tempoAtual),
            minutesToTime(tempoAtual + duracaoBloco),
            duracaoBloco,
            tarefa.prioridade,
            'pendente',
            ts,
          ]
        );

        totalGerados++;
        tempoAtual += duracaoBloco;
        minutosDisponiveis -= duracaoBloco;
      }
    }
  });

  return totalGerados;
}
