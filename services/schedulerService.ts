import { getDatabase, getAtividadesPorData, getPassosPorDiaSemana, getPassosAtrasadosPendentes } from './database';
import type { DbEventoFixo, DbBlocoEstudo, BlocoEstudoType, PassoComTopicoDB } from './database';
import { getSemanaDoCronogramaPorData } from './scheduleService';
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
  intervalosOcupados.push({ inicio: 0, fim: 420 });       // 00:00 - 07:00 (fora do horário útil)
  intervalosOcupados.push({ inicio: 1320, fim: 1440 });   // 22:00 - 24:00 (fora do horário útil)

  // E. Se for o dia de HOJE e já passou das 07:00, bloqueia o tempo decorrido
  // para que o replanejamento não tente agendar tarefas no passado
  const hoje = new Date();
  const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  if (dataYYYYMMDD === hojeStr) {
    const minutoAtual = hoje.getHours() * 60 + hoje.getMinutes();
    if (minutoAtual > 420) {
      intervalosOcupados.push({ inicio: 0, fim: minutoAtual });
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

  await database.withExclusiveTransactionAsync(async (txn) => {
    for (const janela of janelasLivres) {
      let minutosDisponiveis = janela.fim - janela.inicio;
      let tempoAtual = janela.inicio;

      while (minutosDisponiveis >= 15) {
        let tarefa: TarefaPlanejada | null = null;

        // Se a janela restante for curta (< 30 min), prioriza flashcards
        if (minutosDisponiveis < 30) {
          const idxFlash = filaTarefas.findIndex((t) => t.tipo === 'flashcards');
          if (idxFlash >= 0) {
            tarefa = filaTarefas.splice(idxFlash, 1)[0];
          } else if (gargalos.length > 0) {
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
          } else if (gargalos.length > 0) {
            tarefa = proximoGargalo();
          }
        }

        if (!tarefa) {
          // Não há mais tarefas oficiais nem gargalos reais para alocar nesta janela
          break;
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

/**
 * 4. AUTO-PLANEJAMENTO INVISÍVEL
 * Executado silenciosamente na inicialização da agenda.
 * Se já passou das 05:00 da manhã e a data não possui blocos gerados,
 * ou se os blocos pendentes estão fora dos limites úteis (07:00 - 22:00),
 * aciona o agendador autônomo em segundo plano.
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

    // Se for o dia de hoje, verifica se há passos atrasados que ainda não foram integrados nos blocos de hoje
    let temAtrasadoFaltando = false;
    if (dataYYYYMMDD === hojeStr) {
      const [ano, mes, dia] = dataYYYYMMDD.split('-').map(Number);
      const dayIdx = new Date(ano, mes - 1, dia).getDay();
      const DIAS_SEMANA_MAP = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
      const diaSemanaStr = DIAS_SEMANA_MAP[dayIdx] || 'segunda';

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

    // Verifica se existem blocos de gargalo / temas críticos obsoletos (ex: após reset de progresso)
    const gargalosAtuais = await obterGargalos();
    const temasGargaloSet = new Set(gargalosAtuais.map((g) => g.tema));
    const blocosGargaloRow = await database.getAllAsync<{ id: string; tema_id: string }>(
      `SELECT id, tema_id FROM blocos_estudo 
       WHERE data_agendada = ? 
         AND status = 'pendente' 
         AND (passo_id IS NULL OR titulo LIKE '%Gargalo%' OR titulo LIKE '%Tema Crítico%');`,
      [dataYYYYMMDD]
    );
    const temGargaloInvalido = blocosGargaloRow.some((b) => !temasGargaloSet.has(b.tema_id));

    if (
      !countRow || 
      countRow.count === 0 || 
      (foraDosLimitesRow && foraDosLimitesRow.count > 0) ||
      (blocosOutraSemanaRow && blocosOutraSemanaRow.count > 0) ||
      temAtrasadoFaltando ||
      temGargaloInvalido
    ) {
      await gerarPlanoDiario(dataYYYYMMDD);
      return true;
    }
  } catch (err) {
    console.warn('[scheduler] Erro no auto-planejamento:', err);
  }

  return false;
}

/**
 * 5. SINCRONIZAÇÃO GLOBAL DE LIMITES, SEMANAS E TEMAS CRÍTICOS
 * Replaneja todas as datas que contenham blocos pendentes fora dos limites de 07:00 às 22:00,
 * que contenham blocos de semanas antigas/loopadas ou blocos de temas críticos resetados.
 */
export async function sincronizarLimitesHorarioUtil(): Promise<void> {
  const database = getDatabase();
  try {
    // Migração transparente: renomeia qualquer bloco antigo que ainda tenha 'Revisão de Gargalo:' para 'Revisão de Tema Crítico:'
    await database.runAsync(
      `UPDATE blocos_estudo 
       SET titulo = REPLACE(titulo, 'Revisão de Gargalo:', 'Revisão de Tema Crítico:')
       WHERE titulo LIKE '%Revisão de Gargalo:%';`
    );

    const rowsLimites = await database.getAllAsync<{ data_agendada: string }>(
      `SELECT DISTINCT data_agendada FROM blocos_estudo 
       WHERE status = 'pendente' 
         AND (hora_inicio < '07:00' OR hora_fim > '22:00');`
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
         AND (passo_id IS NULL OR titulo LIKE '%Gargalo%' OR titulo LIKE '%Tema Crítico%');`
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
           AND (passo_id IS NULL OR titulo LIKE '%Gargalo%' OR titulo LIKE '%Tema Crítico%') 
           AND (tema_id IN (${placeholders}) OR LOWER(tema_id) IN (${placeholders}));`,
        [...temas, ...temas.map((t) => t.toLowerCase())]
      );
    } else {
      await database.runAsync(
        `DELETE FROM blocos_estudo 
         WHERE status = 'pendente' 
           AND (passo_id IS NULL OR titulo LIKE '%Gargalo%' OR titulo LIKE '%Tema Crítico%');`
      );
    }

    // Validação extra: qualquer bloco de tema crítico pendente que não esteja na lista atual de gargalos reais é excluído
    const gargalosAtuais = await obterGargalos();
    const temasGargaloSet = new Set(gargalosAtuais.map((g) => g.tema.toLowerCase()));
    const todosGargalosPendentes = await database.getAllAsync<{ id: string; data_agendada: string; tema_id: string }>(
      `SELECT id, data_agendada, tema_id FROM blocos_estudo 
       WHERE status = 'pendente' 
         AND (passo_id IS NULL OR titulo LIKE '%Gargalo%' OR titulo LIKE '%Tema Crítico%');`
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

