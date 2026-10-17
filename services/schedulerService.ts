import { getDatabase, getAtividadesPorData, getPassosPorDiaSemana, getPassosAtrasadosPendentes } from './database';
import type { DbEventoFixo, DbBlocoEstudo, BlocoEstudoType, PassoComTopicoDB } from './database';
import { 
  getSemanaDoCronogramaPorData, 
  getCronograma, 
  getCronogramaDays, 
  getCronogramaProgresso, 
  getRevisoesDaSemana, 
  getStepUniqueId, 
  isStepConcluido 
} from './scheduleService';
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

  // B. Busca atividades já cadastradas na agenda para este dia
  // Importante: TODAS as atividades da agenda do usuário (mesmo com tipo Estudos/Pessoal/Faculdade)
  // representam compromissos explícitos e DEVEM bloquear os horários de estudo automático.
  try {
    const atividadesAgenda = await getAtividadesPorData(dataYYYYMMDD);
    for (const atv of atividadesAgenda) {
      if (atv.hora_inicio) {
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

  // C. Blocos de estudo já concluídos para o dia (não devem ser sobrepostos nem alterados)
  try {
    const blocosConcluidos = await database.getAllAsync<any>(
      `SELECT hora_inicio, hora_fim FROM blocos_estudo WHERE data_agendada = ? AND status = 'concluido';`,
      [dataYYYYMMDD]
    );
    for (const b of blocosConcluidos) {
      if (b.hora_inicio && b.hora_fim) {
        intervalosOcupados.push({
          inicio: timeToMinutes(b.hora_inicio),
          fim: timeToMinutes(b.hora_fim),
        });
      }
    }
  } catch (err) {
    console.warn('[scheduler] Erro ao ler blocos concluídos:', err);
  }

  // D. Bloqueio de Sono Fixo / Limite de Horário Útil (00:00 às 07:00 e 22:00 às 24:00)
  intervalosOcupados.push({ inicio: 0, fim: 420 });       // 00:00 - 07:00 (sono / fora do horário útil)
  intervalosOcupados.push({ inicio: 1320, fim: 1440 });   // 22:00 - 24:00 (sono / fora do horário útil)

  // Proteção Sagrada do Horário de Almoço (12:00 às 13:15 / 720 a 795 min):
  // Garante que nenhum bloco de estudo seja sobreposto durante o intervalo de refeição do meio-dia
  intervalosOcupados.push({ inicio: 720, fim: 795 });

  // E. Se for o dia de HOJE e já passou das 07:00, bloqueia o tempo decorrido até o "próximo gancho"
  // de 30 minutos ou hora cheia (ex: 13:07 -> 13:30, 14:14 -> 14:30), para que o replanejamento
  // aloque sempre no próximo horário redondo
  const hoje = new Date();
  const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  if (dataYYYYMMDD === hojeStr) {
    const minutoAtual = hoje.getHours() * 60 + hoje.getMinutes();
    if (minutoAtual > 420) {
      const proximoGancho = Math.ceil(minutoAtual / 30) * 30;
      intervalosOcupados.push({ inicio: 0, fim: proximoGancho });
    }
  }

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
      WHERE tema IS NOT NULL AND tema != ''
      GROUP BY tema
      HAVING total_questoes >= 3 AND taxa_acerto < 0.8
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
  } catch (err) {
    console.warn('[scheduler] Erro ao obter gargalos do banco:', err);
  }

  // Se o usuário não tem histórico com erros suficientes (ou acabou de resetar), NÃO inventa gargalos artificiais
  return [];
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

  // Semana do cronograma para esta data (baseada no calendário contínuo de 45 semanas, sem loops de segunda-feira)
  const semanaDaData = getSemanaDoCronogramaPorData(dataYYYYMMDD);

  const hoje = new Date();
  const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;

  // 1. Busca os passos oficiais da residência médica para o dia desta data
  const passosResidencia = await getPassosPorDiaSemana(diaSemanaStr, semanaDaData);
  const passosDoDia = (passosResidencia || []).filter((p) => p.concluido !== 1);

  // 2. Rollover: Se for o dia de HOJE, busca passos pendentes acumulados de dias/semanas anteriores
  // Assim, se o usuário não fizer nada, o dia de hoje repetirá as pendências da Semana 1!
  let passosAtrasados: PassoComTopicoDB[] = [];
  if (dataYYYYMMDD === hojeStr) {
    passosAtrasados = await getPassosAtrasadosPendentes(semanaDaData, diaSemanaStr);
  }

  // Combina passos atrasados (prioridade máxima) + passos regulares do dia
  const idsAtrasados = new Set(passosAtrasados.map((p) => p.id));
  const passosPendentes = [
    ...passosAtrasados,
    ...passosDoDia.filter((p) => !idsAtrasados.has(p.id)),
  ];

  // 3. Busca os gargalos de acertos
  const gargalos = await obterGargalos();

  // 4. Monta a fila de tarefas priorizadas
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

    const isAtrasado = idsAtrasados.has(p.id);
    const labelCompleto = p.label ? ` • ${p.label}` : '';
    return {
      tipo: tipoBloco,
      tema_id: p.tema_questoes || p.topico_titulo,
      titulo: `${p.topico_titulo}${labelCompleto}`,
      passo_id: p.id,
      prioridade: isAtrasado ? 9.2 : 8.5,
      duracaoSugerida: duracao,
    };
  });

  // 4.1 Inclui as revisões espaçadas de ciclo longo (1, 3, 6, 12 semanas) alocadas para este dia (Sexta e Sábado por padrão)
  try {
    const cronogramaData = getCronograma();
    const daysMap = getCronogramaDays();
    const progressoCronograma = getCronogramaProgresso();
    const revisoesDaSemana = getRevisoesDaSemana(semanaDaData, cronogramaData);

    revisoesDaSemana.forEach((rev, rIdx) => {
      const assignedRevDay = daysMap[rev.id]
        ? daysMap[rev.id]
        : (rIdx % 2 === 0 ? 'sexta' : 'sabado');

      if (assignedRevDay === diaSemanaStr) {
        rev.passos.forEach((p, pIdx) => {
          const stepUniqueId = getStepUniqueId(p, pIdx);
          const isDone = isStepConcluido(progressoCronograma, rev.id, stepUniqueId, p.tipo);
          if (!isDone) {
            const isQuestoes = p.tipo === 'questoes';
            const duracao = isQuestoes ? 35 : 20;
            const temaNome = Array.isArray(p.temaQuestoes)
              ? p.temaQuestoes[0]
              : (p.temaQuestoes || rev.topicoOriginal.titulo);

            filaTarefas.push({
              tipo: isQuestoes ? 'questoes' : 'flashcards',
              tema_id: temaNome,
              titulo: `${rev.topicoOriginal.titulo} • ${rev.intervaloLabel} (${p.label})`,
              passo_id: null,
              prioridade: 8.8,
              duracaoSugerida: duracao,
            });
          }
        });
      }
    });
  } catch (err) {
    console.warn('[scheduler] Erro ao carregar revisões espaçadas para o dia:', err);
  }

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
      titulo: `Revisão de Tema Crítico: ${g.tema}`,
      passo_id: null,
      prioridade: g.prioridade,
      duracaoSugerida: duracao,
    };
  };

  const ts = Date.now();
  let totalGerados = 0;

  // Separa as tarefas do dia por perfil cognitivo:
  // - Teoria: leitura (apostila), videoaula (aulas)
  // - Prática: questoes, flashcards
  const tarefasTeoria: TarefaPlanejada[] = filaTarefas.filter(
    (t) => t.tipo === 'leitura' || t.tipo === 'videoaula'
  );
  const tarefasPratica: TarefaPlanejada[] = filaTarefas.filter(
    (t) => t.tipo === 'questoes' || t.tipo === 'flashcards'
  );

  // Intervalo de descanso saudável entre blocos consecutivos (15 minutos)
  const PAUSA_ENTRE_BLOCOS_MIN = 15;

  const temJanelaManha = janelasLivres.some((j) => j.inicio < 720);
  const temJanelaTardeNoite = janelasLivres.some((j) => j.inicio >= 795 || j.fim > 795);

  /**
   * Extrai a próxima tarefa de teoria:
   * - Quando o tempo livre for grande (>= 45 min), prioriza videoaulas.
   * - Quando a janela for menor (< 45 min), prioriza pela correspondência entre tempo disponível x duração da atividade.
   */
  const extrairProximaTeoria = (minutosDisponiveis: number): TarefaPlanejada | null => {
    if (tarefasTeoria.length === 0) return null;

    // Se o tempo livre for amplo (>= 45 min), prioriza videoaulas primeiro
    if (minutosDisponiveis >= 45) {
      const idxVideo = tarefasTeoria.findIndex((t) => t.tipo === 'videoaula');
      if (idxVideo !== -1) {
        return tarefasTeoria.splice(idxVideo, 1)[0];
      }
      return tarefasTeoria.shift()!;
    }

    // Se o tempo livre for menor (< 45 min), respeita tempo disponível x tempo gasto
    // Prioriza tarefas cuja duração sugerida caiba no tempo disponível
    const idxQueCabe = tarefasTeoria.findIndex((t) => t.duracaoSugerida <= minutosDisponiveis);
    if (idxQueCabe !== -1) {
      return tarefasTeoria.splice(idxQueCabe, 1)[0];
    }

    // Se nenhuma cabe sem ajuste, pega a de menor duração para minimizar estouro
    let menorIdx = 0;
    for (let i = 1; i < tarefasTeoria.length; i++) {
      if (tarefasTeoria[i].duracaoSugerida < tarefasTeoria[menorIdx].duracaoSugerida) {
        menorIdx = i;
      }
    }
    return tarefasTeoria.splice(menorIdx, 1)[0];
  };

  const obterProximaTarefa = (minutosDisponiveis: number, isManha: boolean): TarefaPlanejada | null => {
    // 1. Se a janela for muito curta (< 30 min), prioriza flashcard
    if (minutosDisponiveis < 30) {
      const idxPraticaFlash = tarefasPratica.findIndex((t) => t.tipo === 'flashcards');
      if (idxPraticaFlash >= 0) {
        return tarefasPratica.splice(idxPraticaFlash, 1)[0];
      }
      if (gargalos.length > 0) {
        const g = proximoGargalo();
        return {
          ...g,
          tipo: 'flashcards',
          titulo: `Flashcards Rápidos: ${g.tema_id}`,
          duracaoSugerida: minutosDisponiveis,
        };
      }
    }

    // 2. Se for de MANHÃ e temos janelas também à tarde/noite:
    // Prioriza alocar TEORIA de manhã!
    if (isManha && temJanelaTardeNoite) {
      const tarefaTeoria = extrairProximaTeoria(minutosDisponiveis);
      if (tarefaTeoria) {
        return tarefaTeoria;
      }
      // Se não há mais teoria para a manhã e a tarde/noite já tem janelas livres,
      // reserva as práticas para a tarde/noite para manter o equilíbrio cognitivo
      return null;
    }

    // 3. Se for à TARDE / NOITE:
    // Prioriza alocar PRÁTICA (Questões / Flashcards)
    if (!isManha) {
      if (tarefasPratica.length > 0) {
        return tarefasPratica.shift()!;
      }
      const tarefaTeoria = extrairProximaTeoria(minutosDisponiveis);
      if (tarefaTeoria) {
        return tarefaTeoria;
      }
      if (gargalos.length > 0) {
        return proximoGargalo();
      }
      return null;
    }

    // 4. Caso geral (ex: só tem janela de manhã, ou só janela de tarde):
    const tarefaTeoria = extrairProximaTeoria(minutosDisponiveis);
    if (tarefaTeoria) {
      return tarefaTeoria;
    }
    if (tarefasPratica.length > 0) {
      return tarefasPratica.shift()!;
    }
    if (gargalos.length > 0) {
      return proximoGargalo();
    }
    return null;
  };

  const blocosParaInserir: {
    id: string;
    tipo: string;
    tema_id: string;
    titulo: string;
    passo_id: number | null;
    data_agendada: string;
    hora_inicio: string;
    hora_fim: string;
    duracao_minutos: number;
    prioridade: number;
    status: string;
    timestamp_geracao: number;
  }[] = [];

  const janelasEstado: { inicio: number; fim: number; tempoAtual: number }[] = [];

  for (const janela of janelasLivres) {
    const isManha = janela.inicio < 720;
    // Alinha o início da janela ao próximo gancho de 30 minutos (ex: 13:15 pós almoço -> 13:30, 08:00 -> 08:00)
    let tempoAtual = Math.ceil(janela.inicio / 30) * 30;

    // Se a janela da manhã começar às 07:00 (420) e tiver ampla folga (>= 4h),
    // inicia confortavelmente às 08:00 (480) em vez de forçar às 07:00
    if (isManha && janela.inicio === 420 && janela.fim - janela.inicio >= 240) {
      tempoAtual = 480;
    }

    let minutosDisponiveis = janela.fim - tempoAtual;

    while (minutosDisponiveis >= 15) {
      const tarefa = obterProximaTarefa(minutosDisponiveis, isManha);
      if (!tarefa) {
        break;
      }

      let duracaoBloco = Math.min(tarefa.duracaoSugerida, minutosDisponiveis);
      const sobra = minutosDisponiveis - duracaoBloco;
      if (sobra > 0 && sobra < 15) {
        duracaoBloco += sobra;
      }

      const novoId = Math.random().toString(36).substring(2, 15);

      blocosParaInserir.push({
        id: novoId,
        tipo: tarefa.tipo,
        tema_id: tarefa.tema_id,
        titulo: tarefa.titulo,
        passo_id: tarefa.passo_id ?? null,
        data_agendada: dataYYYYMMDD,
        hora_inicio: minutesToTime(tempoAtual),
        hora_fim: minutesToTime(tempoAtual + duracaoBloco),
        duracao_minutos: duracaoBloco,
        prioridade: tarefa.prioridade,
        status: 'pendente',
        timestamp_geracao: ts,
      });

      totalGerados++;
      // Avança o horário com o bloco + intervalo de descanso de 15 minutos
      const tempoAvanco = duracaoBloco + PAUSA_ENTRE_BLOCOS_MIN;
      tempoAtual += tempoAvanco;
      minutosDisponiveis = janela.fim - tempoAtual;
    }

    janelasEstado.push({ inicio: janela.inicio, fim: janela.fim, tempoAtual });
  }

  // Se sobrou alguma tarefa não alocada por falta de turno específico,
  // faz uma segunda passada nas janelas restantes
  const tarefasRestantes = [...tarefasTeoria, ...tarefasPratica];
  if (tarefasRestantes.length > 0) {
    for (const jState of janelasEstado) {
      let tempoAtual = jState.tempoAtual;
      let minutosDisponiveis = jState.fim - tempoAtual;

      while (minutosDisponiveis >= 15 && tarefasRestantes.length > 0) {
        const tarefa = tarefasRestantes.shift()!;
        let duracaoBloco = Math.min(tarefa.duracaoSugerida, minutosDisponiveis);
        const novoId = Math.random().toString(36).substring(2, 15);

        blocosParaInserir.push({
          id: novoId,
          tipo: tarefa.tipo,
          tema_id: tarefa.tema_id,
          titulo: tarefa.titulo,
          passo_id: tarefa.passo_id ?? null,
          data_agendada: dataYYYYMMDD,
          hora_inicio: minutesToTime(tempoAtual),
          hora_fim: minutesToTime(tempoAtual + duracaoBloco),
          duracao_minutos: duracaoBloco,
          prioridade: tarefa.prioridade,
          status: 'pendente',
          timestamp_geracao: ts,
        });

        totalGerados++;
        const tempoAvanco = duracaoBloco + PAUSA_ENTRE_BLOCOS_MIN;
        tempoAtual += tempoAvanco;
        minutosDisponiveis = jState.fim - tempoAtual;
      }
    }
  }

  // Insere em lote em uma única instrução SQL atômica (eliminando contenções de transação)
  if (blocosParaInserir.length > 0) {
    const placeholders = blocosParaInserir.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
    const params: any[] = [];
    for (const b of blocosParaInserir) {
      params.push(
        b.id,
        b.tipo,
        b.tema_id,
        b.titulo,
        b.passo_id,
        b.data_agendada,
        b.hora_inicio,
        b.hora_fim,
        b.duracao_minutos,
        b.prioridade,
        b.status,
        b.timestamp_geracao
      );
    }
    await database.runAsync(
      `INSERT INTO blocos_estudo (
        id, tipo, tema_id, titulo, passo_id, data_agendada, hora_inicio, hora_fim, duracao_minutos, prioridade, status, timestamp_geracao
      ) VALUES ${placeholders};`,
      params
    );
  }

  return totalGerados;
}

let isPlanningLock = false;
let hasSyncedLimitesSession = false;

/**
 * 4. AUTO-PLANEJAMENTO INVISÍVEL
 * Executado silenciosamente na inicialização da agenda.
 * Se já passou das 05:00 da manhã e a data não possui blocos gerados,
 * ou se os blocos pendentes estão fora dos limites úteis (07:00 - 22:00),
 * colidem com horários ocupados (ex: Almoço ou novos compromissos)
 * ou pertencem a passos desatualizados, aciona o agendador autônomo em segundo plano.
 */
export async function verificarEPlanejarAutomaticamente(dataYYYYMMDD: string): Promise<boolean> {
  const database = getDatabase();
  const hoje = new Date();
  const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;

  // Dias passados não são auto-gerados
  if (dataYYYYMMDD < hojeStr) {
    return false;
  }

  // Se for o dia de hoje, dispara a partir das 05h da manhã
  if (dataYYYYMMDD === hojeStr) {
    const horaAtual = hoje.getHours();
    if (horaAtual < 5) {
      return false;
    }
  }

  if (isPlanningLock) {
    return false;
  }
  isPlanningLock = true;

  try {
    const semanaEsperada = getSemanaDoCronogramaPorData(dataYYYYMMDD);

    const countRow = await database.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM blocos_estudo WHERE data_agendada = ?;`,
      [dataYYYYMMDD]
    );

    // Verifica se existem blocos pendentes fora dos limites úteis (antes das 07:00 ou após 22:00)
    const foraDosLimitesRow = await database.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM blocos_estudo 
       WHERE data_agendada = ? 
         AND status = 'pendente' 
         AND (hora_inicio < '07:00' OR hora_fim > '22:00');`,
      [dataYYYYMMDD]
    );

    // Verifica se os blocos pendentes existentes para esta data pertencem a uma semana errada (loop de herança antiga)
    const blocosOutraSemanaRow = await database.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count 
       FROM blocos_estudo b
       JOIN Passos p ON b.passo_id = p.id
       JOIN Topicos t ON p.topico_id = t.id
       WHERE b.data_agendada = ? 
         AND b.status = 'pendente' 
         AND t.semana_id != ?;`,
      [dataYYYYMMDD, semanaEsperada]
    );

    const [ano, mes, dia] = dataYYYYMMDD.split('-').map(Number);
    const dayIdx = new Date(ano, mes - 1, dia).getDay();
    const DIAS_SEMANA_MAP = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
    const diaSemanaStr = DIAS_SEMANA_MAP[dayIdx] || 'segunda';

    // Se for o dia de hoje, verifica se há passos atrasados que ainda não foram integrados nos blocos de hoje
    let temAtrasadoFaltando = false;
    if (dataYYYYMMDD === hojeStr) {
      const atrasados = await getPassosAtrasadosPendentes(semanaEsperada, diaSemanaStr);
      if (atrasados.length > 0) {
        const blocosHoje = await database.getAllAsync<{ passo_id: number }>(
          `SELECT passo_id FROM blocos_estudo WHERE data_agendada = ? AND passo_id IS NOT NULL;`,
          [dataYYYYMMDD]
        );
        const idsHoje = new Set(blocosHoje.map((b) => b.passo_id));
        temAtrasadoFaltando = atrasados.some((a) => !idsHoje.has(a.id));
      }
    }

    // Verifica se existem blocos de temas críticos obsoletos (ex: após reset de progresso)
    const gargalosAtuais = await obterGargalos();
    const temasGargaloSet = new Set(gargalosAtuais.map((g) => g.tema));
    const blocosGargaloRow = await database.getAllAsync<{ id: string; tema_id: string }>(
      `SELECT id, tema_id FROM blocos_estudo 
       WHERE data_agendada = ? 
         AND status = 'pendente' 
         AND (titulo LIKE '%Tema Crítico%' OR titulo LIKE '%Gargalo%' OR titulo LIKE 'Flashcards Rápidos%');`,
      [dataYYYYMMDD]
    );
    const temGargaloInvalido = blocosGargaloRow.some((b) => !temasGargaloSet.has(b.tema_id));

    // 5. Verifica se algum bloco pendente colide com horários ocupados (ex: Almoço ou novo evento da agenda)
    let temColisaoComAgenda = false;
    let temPassoIncompativel = false;

    const blocosPendentesExistentes = await database.getAllAsync<{ id: string; passo_id: number | null; hora_inicio: string; hora_fim: string }>(
      `SELECT id, passo_id, hora_inicio, hora_fim FROM blocos_estudo 
       WHERE data_agendada = ? AND status = 'pendente';`,
      [dataYYYYMMDD]
    );

    if (blocosPendentesExistentes.length > 0) {
      const janelasLivresAtuais = await calcularTempoLivreLiquido(dataYYYYMMDD);
      for (const b of blocosPendentesExistentes) {
        if (!b.hora_inicio || !b.hora_fim) continue;
        const bIni = timeToMinutes(b.hora_inicio);
        const bFim = timeToMinutes(b.hora_fim);
        const cabeEmJanela = janelasLivresAtuais.some(
          (j) => bIni >= j.inicio && bFim <= j.fim
        );
        if (!cabeEmJanela) {
          temColisaoComAgenda = true;
          break;
        }
      }

      // Verifica se os blocos pendentes vinculados a passos oficiais ainda pertencem ao dia de hoje
      const passosEsperados = await getPassosPorDiaSemana(diaSemanaStr, semanaEsperada);
      const idsPassosEsperados = new Set(passosEsperados.map((p) => p.id));
      temPassoIncompativel = blocosPendentesExistentes.some(
        (b) => b.passo_id !== null && !idsPassosEsperados.has(b.passo_id)
      );
    }

    if (
      !countRow || 
      countRow.count === 0 || 
      (foraDosLimitesRow && foraDosLimitesRow.count > 0) ||
      (blocosOutraSemanaRow && blocosOutraSemanaRow.count > 0) ||
      temAtrasadoFaltando ||
      temGargaloInvalido ||
      temColisaoComAgenda ||
      temPassoIncompativel
    ) {
      await gerarPlanoDiario(dataYYYYMMDD);
      return true;
    }
  } catch (err) {
    console.warn('[scheduler] Erro no auto-planejamento:', err);
  } finally {
    isPlanningLock = false;
  }

  return false;
}

/**
 * 5. SINCRONIZAÇÃO GLOBAL DE LIMITES, SEMANAS E TEMAS CRÍTICOS
 * Replaneja todas as datas que contenham blocos pendentes fora dos limites de 07:00 às 22:00,
 * que contenham blocos de semanas antigas/loopadas ou blocos de temas críticos resetados.
 */
export async function sincronizarLimitesHorarioUtil(force: boolean = false): Promise<void> {
  if (hasSyncedLimitesSession && !force) {
    return;
  }
  if (isPlanningLock) {
    return;
  }
  isPlanningLock = true;

  const database = getDatabase();
  try {
    hasSyncedLimitesSession = true;
    // Migração transparente: renomeia qualquer bloco antigo que ainda tenha 'Revisão de Gargalo:' para 'Revisão de Tema Crítico:'
    await database.runAsync(
      `UPDATE blocos_estudo 
       SET titulo = REPLACE(titulo, 'Revisão de Gargalo:', 'Revisão de Tema Crítico:')
       WHERE titulo LIKE '%Revisão de Gargalo:%';`
    );

    const rowsLimites = await database.getAllAsync<{ data_agendada: string }>(
      `SELECT DISTINCT data_agendada FROM blocos_estudo 
       WHERE status = 'pendente' 
         AND (hora_inicio < '07:00' OR hora_fim > '22:00' OR (hora_inicio < '13:15' AND hora_fim > '12:00'));`
    );

    for (const r of rowsLimites) {
      if (r.data_agendada) {
        await gerarPlanoDiario(r.data_agendada);
      }
    }

    // Limpa e replaneja blocos pendentes em datas que pertençam à semana errada (loop legado)
    const datasComBlocos = await database.getAllAsync<{ data_agendada: string }>(
      `SELECT DISTINCT data_agendada FROM blocos_estudo WHERE status = 'pendente';`
    );

    for (const row of datasComBlocos) {
      const dataStr = row.data_agendada;
      if (!dataStr) continue;
      const semanaEsperada = getSemanaDoCronogramaPorData(dataStr);
      const blocoErrado = await database.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count 
         FROM blocos_estudo b
         JOIN Passos p ON b.passo_id = p.id
         JOIN Topicos t ON p.topico_id = t.id
         WHERE b.data_agendada = ? 
           AND b.status = 'pendente' 
           AND t.semana_id != ?;`,
        [dataStr, semanaEsperada]
      );
      if (blocoErrado && blocoErrado.count > 0) {
        await gerarPlanoDiario(dataStr);
      }
    }

    // Limpa blocos de temas críticos obsoletos (quando o usuário resetou o progresso de questões)
    const gargalosAtuais = await obterGargalos();
    const temasGargaloSet = new Set(gargalosAtuais.map((g) => g.tema));
    const todosGargalosPendentes = await database.getAllAsync<{ id: string; data_agendada: string; tema_id: string }>(
      `SELECT id, data_agendada, tema_id FROM blocos_estudo 
       WHERE status = 'pendente' 
         AND (titulo LIKE '%Tema Crítico%' OR titulo LIKE '%Gargalo%' OR titulo LIKE 'Flashcards Rápidos%');`
    );

    const datasReplanejarGargalo = new Set<string>();
    for (const bg of todosGargalosPendentes) {
      if (!temasGargaloSet.has(bg.tema_id)) {
        await database.runAsync(`DELETE FROM blocos_estudo WHERE id = ?;`, [bg.id]);
        if (bg.data_agendada) {
          datasReplanejarGargalo.add(bg.data_agendada);
        }
      }
    }

    for (const d of datasReplanejarGargalo) {
      await gerarPlanoDiario(d);
    }
  } catch (err) {
    console.warn('[scheduler] Erro ao sincronizar limites de horário útil e semanas:', err);
  } finally {
    isPlanningLock = false;
  }
}

/**
 * 6. LIMPEZA MANUAL IMEDIATA DE TEMAS CRÍTICOS E REPLANEJAMENTO
 * Disparado quando o usuário reseta o progresso de um ou mais temas nas Configurações.
 */
export async function limparGargalosEReplanejar(temas?: string[]): Promise<void> {
  const database = getDatabase();
  try {
    if (temas && temas.length > 0) {
      const placeholders = temas.map(() => '?').join(',');
      await database.runAsync(
        `DELETE FROM blocos_estudo 
         WHERE status = 'pendente' 
           AND (titulo LIKE '%Tema Crítico%' OR titulo LIKE '%Gargalo%' OR titulo LIKE 'Flashcards Rápidos%') 
           AND (tema_id IN (${placeholders}) OR LOWER(tema_id) IN (${placeholders}));`,
        [...temas, ...temas.map((t) => t.toLowerCase())]
      );
    } else {
      await database.runAsync(
        `DELETE FROM blocos_estudo 
         WHERE status = 'pendente' 
           AND (titulo LIKE '%Tema Crítico%' OR titulo LIKE '%Gargalo%' OR titulo LIKE 'Flashcards Rápidos%');`
      );
    }

    // Validação extra: qualquer bloco de tema crítico pendente que não esteja na lista atual de gargalos reais é excluído
    const gargalosAtuais = await obterGargalos();
    const temasGargaloSet = new Set(gargalosAtuais.map((g) => g.tema.toLowerCase()));
    const todosGargalosPendentes = await database.getAllAsync<{ id: string; data_agendada: string; tema_id: string }>(
      `SELECT id, data_agendada, tema_id FROM blocos_estudo 
       WHERE status = 'pendente' 
         AND (titulo LIKE '%Tema Crítico%' OR titulo LIKE '%Gargalo%' OR titulo LIKE 'Flashcards Rápidos%');`
    );

    const datasReplanejar = new Set<string>();
    const hoje = new Date();
    const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    datasReplanejar.add(hojeStr);

    for (const bg of todosGargalosPendentes) {
      if (!temasGargaloSet.has((bg.tema_id || '').toLowerCase())) {
        await database.runAsync(`DELETE FROM blocos_estudo WHERE id = ?;`, [bg.id]);
        if (bg.data_agendada) {
          datasReplanejar.add(bg.data_agendada);
        }
      }
    }

    for (const d of datasReplanejar) {
      await gerarPlanoDiario(d);
    }
  } catch (err) {
    console.error('[scheduler] Erro ao limpar gargalos e replanejar:', err);
  }
}

