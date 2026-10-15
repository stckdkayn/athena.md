import { storage } from './storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { z } from 'zod';
import {
  CronogramaJSONSchema,
  FlowStepSchema,
  CronogramaTopicoSchema,
  CronogramaSemanaSchema,
  ValidatedCronogramaData,
} from './schemaValidators';
import { getAtividadesPorData, AtividadeAgenda } from './database';

export * from './schemaValidators';

// --- CONSTANTES DO MMKV ---
export const CRONOGRAMA_KEY = '@athena_cronograma_data';
export const PROGRESSO_KEY = '@athena_cronograma_progresso';
export const DAYS_KEY = '@athena_cronograma_days';

// Chaves legadas para compatibilidade transparente
const LEGACY_CRONOGRAMA_KEY = '@athena_cronograma';
const LEGACY_PROGRESSO_KEY = '@athena_cronograma_progress';

// ============================================================================
// TIPAGENS (MANTIDAS EXATAMENTE IGUAIS PARA NÃO QUEBRAR O APP)
// ============================================================================

export type DiaSemana = 'segunda' | 'terca' | 'quarta' | 'quinta' | 'sexta' | 'sabado' | 'domingo';
export type FlowStepType = 'apostila' | 'aulas' | 'aulas_bonus' | 'questoes' | 'flashcards';

export interface DiaSemanaItem {
  id: DiaSemana;
  label: string;
  shortLabel: string;
}

export const DIAS_SEMANA_LISTA: DiaSemanaItem[] = [
  { id: 'segunda', label: 'Segunda-feira', shortLabel: 'Seg' },
  { id: 'terca', label: 'Terça-feira', shortLabel: 'Ter' },
  { id: 'quarta', label: 'Quarta-feira', shortLabel: 'Qua' },
  { id: 'quinta', label: 'Quinta-feira', shortLabel: 'Qui' },
  { id: 'sexta', label: 'Sexta-feira', shortLabel: 'Sex' },
  { id: 'sabado', label: 'Sábado', shortLabel: 'Sáb' },
  { id: 'domingo', label: 'Domingo', shortLabel: 'Dom' },
];

export const DIAS_DISTRIBUICAO_PADRAO: DiaSemana[] = [
  'segunda',
  'terca',
  'quarta',
  'quinta',
  'sexta',
  'sabado',
  'domingo',
];

export interface FlowStep {
  id?: string;
  tipo: FlowStepType;
  label?: string;
  detalhe?: string;
  dia?: DiaSemana;
  metaQuestoes?: number;
  temaQuestoes?: string | string[];
  focoQuestoes?: string;
}

export interface CronogramaRevisaoConfig {
  ativa?: boolean;
  intervalos?: number[];
  passos?: FlowStep[];
}

export interface CronogramaTopico {
  id: string;
  area: string;
  titulo: string;
  grandeArea?: string;
  especialidade?: string;
  topicosSecundarios?: string[];
  aulasBonus?: string | string[];
  ordem?: number;
  estimativaMinutos?: number;
  assignedDay?: DiaSemana;
  passos: FlowStep[];
  revisao?: boolean | CronogramaRevisaoConfig;

  // Propriedades sintéticas geradas em tempo de execução para as Revisões
  isRevisao?: boolean;
  revisaoIntervaloLabel?: string;
  revisaoOrigemSemana?: number;

  // Tarefas rápidas e lembretes de plantão
  isLembrete?: boolean;
  descricao?: string;
}

export interface CronogramaSemana {
  numero: number;
  titulo: string;
  subtitulo?: string;
  dataInicio?: string;
  dataFim?: string;
  topicos: CronogramaTopico[];
}

export interface CronogramaData {
  versao?: number | string;
  titulo: string;
  descricao?: string;
  dataAtualizacao?: string;
  semanas: CronogramaSemana[];
}

export type CronogramaProgresso = Record<string, Record<string, boolean>>;
export type CronogramaDaysMap = Record<string, DiaSemana>;

export const PASSOS_PADRAO: FlowStep[] = [
  { tipo: 'apostila', label: 'Apostila', detalhe: 'Leitura teórica' },
  { tipo: 'aulas', label: 'Aulas principais', detalhe: 'Videoaulas do tema' },
  { tipo: 'questoes', label: 'Questões', detalhe: 'Treino de fixação' },
  { tipo: 'flashcards', label: 'Flashcards', detalhe: 'Revisão espaçada' },
];

export const INTERVALOS_REVISAO_PADRAO: number[] = [1, 3, 6, 12];
export const LABELS_INTERVALO_REVISAO: Record<number, string> = {
  1: 'Rev 1 sem',
  3: 'Rev 3 sem',
  6: 'Rev 6 sem',
  12: 'Rev 12 sem',
};

// ============================================================================
// 1. LEITURA E GRAVAÇÃO SÍNCRONA VIA MMKV
// ============================================================================

export const getCronograma = (): CronogramaData | null => {
  try {
    const data = storage.getString(CRONOGRAMA_KEY) || storage.getString(LEGACY_CRONOGRAMA_KEY);
    if (data) return JSON.parse(data);
  } catch (err) {
    console.error('Erro ao ler cronograma do MMKV:', err);
  }
  return null;
};

export const saveCronograma = (data: CronogramaData): void => {
  try {
    const jsonStr = JSON.stringify(data);
    storage.set(CRONOGRAMA_KEY, jsonStr);
    storage.set(LEGACY_CRONOGRAMA_KEY, jsonStr);
  } catch (err) {
    console.error('Erro ao salvar cronograma no MMKV:', err);
  }
};

export const getCronogramaProgresso = (): CronogramaProgresso => {
  try {
    const data = storage.getString(PROGRESSO_KEY) || storage.getString(LEGACY_PROGRESSO_KEY);
    if (data) return JSON.parse(data);
  } catch (err) {
    console.error('Erro ao ler progresso do cronograma do MMKV:', err);
  }
  return {};
};

export const saveCronogramaProgresso = (data: CronogramaProgresso): void => {
  try {
    const jsonStr = JSON.stringify(data);
    storage.set(PROGRESSO_KEY, jsonStr);
    storage.set(LEGACY_PROGRESSO_KEY, jsonStr);
  } catch (err) {
    console.error('Erro ao salvar progresso do cronograma no MMKV:', err);
  }
};

export const getCronogramaDays = (): CronogramaDaysMap => {
  try {
    const data = storage.getString(DAYS_KEY);
    if (data) return JSON.parse(data);
  } catch (err) {
    console.error('Erro ao ler mapa de dias do cronograma do MMKV:', err);
  }
  return {};
};

export const saveCronogramaDays = (data: CronogramaDaysMap): void => {
  try {
    storage.set(DAYS_KEY, JSON.stringify(data));
  } catch (err) {
    console.error('Erro ao salvar mapa de dias do cronograma no MMKV:', err);
  }
};

export const clearCronograma = (): void => {
  try {
    storage.delete(CRONOGRAMA_KEY);
    storage.delete(LEGACY_CRONOGRAMA_KEY);
    storage.delete(PROGRESSO_KEY);
    storage.delete(LEGACY_PROGRESSO_KEY);
    storage.delete(DAYS_KEY);
  } catch (err) {
    console.error('Erro ao limpar cronograma do MMKV:', err);
  }
};

export const resetCronogramaProgresso = (): void => {
  try {
    storage.set(PROGRESSO_KEY, JSON.stringify({}));
    storage.set(LEGACY_PROGRESSO_KEY, JSON.stringify({}));
  } catch (err) {
    console.error('Erro ao resetar progresso do cronograma:', err);
  }
};

// ============================================================================
// 2. LÓGICA DE PROGRESSO (Agindo Sincronamente)
// ============================================================================

export const getStepUniqueId = (step: FlowStep, stepIndex: number = 0): string => {
  if (step.id) return step.id;
  const hashObj = {
    t: step.tipo,
    l: step.label || '',
    d: step.detalhe || '',
    dia: step.dia || '',
    idx: stepIndex,
  };
  return JSON.stringify(hashObj);
};

export const toggleStepProgress = (
  topicoId: string,
  stepUniqueId: string
): CronogramaProgresso => {
  try {
    const atual = getCronogramaProgresso();
    if (!atual[topicoId]) {
      atual[topicoId] = {};
    }
    atual[topicoId][stepUniqueId] = !atual[topicoId][stepUniqueId];

    saveCronogramaProgresso(atual);
    return atual;
  } catch (err) {
    console.error('Erro ao alternar progresso:', err);
    return getCronogramaProgresso();
  }
};

export const isStepConcluido = (
  progresso: CronogramaProgresso,
  topicoId: string,
  stepUniqueId: string,
  fallbackStepType?: FlowStepType
): boolean => {
  if (!progresso || !progresso[topicoId]) return false;
  const topicoProg = progresso[topicoId];

  if (topicoProg[stepUniqueId] === true) return true;

  // Compatibilidade com id em formato JSON vs legível antigo
  if (typeof stepUniqueId === 'string' && stepUniqueId.startsWith('{')) {
    try {
      const parsed = JSON.parse(stepUniqueId);
      const cleanD = parsed.d
        ? parsed.d
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9]/g, '_')
            .toLowerCase()
        : '';
      const legacyKey1 = cleanD
        ? `${parsed.t}_${parsed.dia || ''}_${cleanD}`
        : `${parsed.t}_${parsed.dia || ''}_${parsed.idx}`;
      if (topicoProg[legacyKey1] === true) return true;
    } catch {}
  } else if (typeof stepUniqueId === 'string') {
    // Compatibilidade reversa: se o progresso gravado foi salvo em JSON
    for (const [k, v] of Object.entries(topicoProg)) {
      if (v === true && k.startsWith('{')) {
        try {
          const parsed = JSON.parse(k);
          const cleanD = parsed.d
            ? parsed.d
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-zA-Z0-9]/g, '_')
                .toLowerCase()
            : '';
          const legacyKey1 = cleanD
            ? `${parsed.t}_${parsed.dia || ''}_${cleanD}`
            : `${parsed.t}_${parsed.dia || ''}_${parsed.idx}`;
          if (legacyKey1 === stepUniqueId) return true;
        } catch {}
      }
    }
  }

  // Compatibilidade com progresso antigo (versão pré-atomização)
  if (fallbackStepType && topicoProg[fallbackStepType] === true) {
    return true;
  }

  // Compatibilidade com chaves de revisão anteriores quando o título/detalhe foi encurtado
  if (topicoId.startsWith('rev_')) {
    if (fallbackStepType === 'flashcards' && (topicoProg['flashcards'] === true || Object.keys(topicoProg).some((k) => k.includes('"flashcards"') && topicoProg[k] === true))) {
      return true;
    }
    if (fallbackStepType === 'questoes' && (topicoProg['questoes'] === true || Object.keys(topicoProg).some((k) => k.includes('"questoes"') && topicoProg[k] === true))) {
      return true;
    }
  }

  return false;
};

// ============================================================================
// 3. ESTATÍSTICAS E CÁLCULOS PUROS (Não dependem de disco)
// ============================================================================

export const calcularProgressoTopico = (topico: CronogramaTopico, progresso: CronogramaProgresso) => {
  if (!topico.passos || topico.passos.length === 0) return 0;
  const concluidos = topico.passos.filter((p, pIdx) =>
    isStepConcluido(progresso, topico.id, getStepUniqueId(p, pIdx), p.tipo)
  ).length;
  return Math.round((concluidos / topico.passos.length) * 100);
};

export const calcularProgressoSemana = (semana: CronogramaSemana, progresso: CronogramaProgresso) => {
  if (!semana.topicos || semana.topicos.length === 0) {
    return { total: 0, concluidos: 0, porcentagem: 0 };
  }
  let totalSteps = 0;
  let concluidosSteps = 0;

  semana.topicos.forEach((t) => {
    if (t.passos && t.passos.length > 0) {
      totalSteps += t.passos.length;
      concluidosSteps += t.passos.filter((p, pIdx) =>
        isStepConcluido(progresso, t.id, getStepUniqueId(p, pIdx), p.tipo)
      ).length;
    }
  });

  return {
    total: totalSteps,
    concluidos: concluidosSteps,
    porcentagem: totalSteps > 0 ? Math.round((concluidosSteps / totalSteps) * 100) : 0,
  };
};

export const calcularProgressoGeral = (cronograma: CronogramaData, progresso: CronogramaProgresso) => {
  if (!cronograma.semanas) return { total: 0, concluidos: 0, porcentagem: 0 };

  let totalSteps = 0;
  let concluidosSteps = 0;

  cronograma.semanas.forEach((s) => {
    const stats = calcularProgressoSemana(s, progresso);
    totalSteps += stats.total;
    concluidosSteps += stats.concluidos;
  });

  return {
    total: totalSteps,
    concluidos: concluidosSteps,
    porcentagem: totalSteps > 0 ? Math.round((concluidosSteps / totalSteps) * 100) : 0,
  };
};

// ============================================================================
// 4. MAPEAMENTO DE DIAS E REVISÃO ESPAÇADA
// ============================================================================

export const getStepAssignedDay = (step: FlowStep, fallbackDay: DiaSemana): DiaSemana => {
  if (step.dia && DIAS_SEMANA_LISTA.some((d) => d.id === step.dia)) {
    return step.dia as DiaSemana;
  }
  return fallbackDay;
};

export const resolveAssignedDay = (topicoId: string, indexNaSemana: number, daysMap: CronogramaDaysMap): DiaSemana => {
  if (daysMap[topicoId]) {
    return daysMap[topicoId];
  }
  const assigned = indexNaSemana === 0 ? 'segunda' : indexNaSemana === 1 ? 'terca' : indexNaSemana === 2 ? 'quarta' : 'quinta';
  return assigned as DiaSemana;
};

export const setTopicAssignedDay = (topicoId: string, dia: DiaSemana): CronogramaDaysMap => {
  const currentMap = getCronogramaDays();
  const novoMap = { ...currentMap, [topicoId]: dia };
  saveCronogramaDays(novoMap);
  return novoMap;
};

export const moverPassosDoTopicoDeDia = (
  topicoId: string,
  diaOrigem: DiaSemana,
  diaDestino: DiaSemana
): { success: boolean; data?: CronogramaData; error?: string } => {
  const data = getCronograma();
  if (!data) return { success: false, error: 'Cronograma não encontrado.' };

  let topicoEncontrado = false;
  const newData = { ...data };

  newData.semanas = newData.semanas.map((s) => {
    if (topicoEncontrado) return s;
    const newTopicos = s.topicos.map((t) => {
      if (t.id === topicoId) {
        topicoEncontrado = true;
        const mappedDays = getCronogramaDays();
        const defaultDay = resolveAssignedDay(t.id, 0, mappedDays);

        const newPassos = (t.passos || []).map((p) => {
          const stepDay = getStepAssignedDay(p, defaultDay);
          if (stepDay === diaOrigem) {
            return { ...p, dia: diaDestino };
          }
          return p;
        });

        return { ...t, passos: newPassos, assignedDay: diaDestino };
      }
      return t;
    });
    return { ...s, topicos: newTopicos };
  });

  if (topicoEncontrado) {
    saveCronograma(newData);
    return { success: true, data: newData };
  }
  return { success: false, error: 'Tópico não encontrado.' };
};

// Interface auxiliar de revisão
export interface CronogramaRevisaoItem {
  id: string; // Ex: 'rev_7_clinica-glomerulopatias-1'
  topicoOriginal: CronogramaTopico;
  semanaOrigemNumero: number;
  intervaloLabel: string;
  passos: FlowStep[];
  topicoOrigemId?: string;
  intervalo?: number;
}

export const getRevisoesDaSemana = (semanaAtualNumero: number, cronograma: CronogramaData | null): CronogramaRevisaoItem[] => {
  if (!cronograma || !cronograma.semanas) return [];
  const revisoes: CronogramaRevisaoItem[] = [];
  const INTERVALOS_SEMANAS = [1, 3, 6, 12]; // O algoritmo clássico de spaced repetition para cronogramas

  for (const semana of cronograma.semanas) {
    if (!semana.topicos || semana.numero >= semanaAtualNumero) continue;

    const diferenca = semanaAtualNumero - semana.numero;
    if (INTERVALOS_SEMANAS.includes(diferenca)) {
      semana.topicos.forEach((t) => {
        // Ignora tópicos com revisão expressamente desativada
        if (t.revisao === false || (typeof t.revisao === 'object' && t.revisao.ativa === false)) return;
        // Ignora tópicos que são puramente "Semana de Revisão"
        if (t.id.includes('revisao-semana')) return;

        // Coleta todos os temas de questões associados a este tópico (passos originais + tópicos secundários + título)
        const temasSet = new Set<string>();
        if (t.passos && t.passos.length > 0) {
          t.passos.forEach((p) => {
            if (p.temaQuestoes) {
              if (Array.isArray(p.temaQuestoes)) {
                p.temaQuestoes.forEach((item) => {
                  if (item && item.trim()) temasSet.add(item.trim());
                });
              } else if (typeof p.temaQuestoes === 'string' && p.temaQuestoes.trim()) {
                p.temaQuestoes.split(/[,;]/).forEach((item) => {
                  if (item && item.trim()) temasSet.add(item.trim());
                });
              }
            }
          });
        }

        // Se houver tópicos secundários no cadastro do tópico, inclui também
        if (Array.isArray(t.topicosSecundarios) && t.topicosSecundarios.length > 0) {
          t.topicosSecundarios.forEach((ts) => {
            if (ts && ts.trim()) temasSet.add(ts.trim());
          });
        }

        // Se não tiver nenhum temaQuestoes específico definido nos passos ou tópicos secundários, usa o título do tópico
        if (temasSet.size === 0 && t.titulo && t.titulo.trim()) {
          temasSet.add(t.titulo.trim());
        }

        const listaTemas = Array.from(temasSet);
        const detalheTemas = listaTemas.join(', ');

        // Configura a bateria de revisão espaçada (Flashcards + Bateria Rápida de Questões)
        const passosRevisao: FlowStep[] = [
          {
            tipo: 'questoes',
            label: 'Questões de Revisão',
            metaQuestoes: 15,
            temaQuestoes: listaTemas,
            detalhe: detalheTemas,
          },
          {
            tipo: 'flashcards',
            label: 'Flashcards',
          },
        ];

        revisoes.push({
          id: `rev_${semanaAtualNumero}_${t.id}`,
          topicoOriginal: t,
          topicoOrigemId: t.id,
          semanaOrigemNumero: semana.numero,
          intervalo: diferenca,
          intervaloLabel: `Rev ${diferenca} sem`,
          passos: passosRevisao,
        });
      });
    }
  }
  return revisoes;
};

// ============================================================================
// 5. MÉTODOS DE ESTRUTURA (Adicionar, Remover e Mover Tópicos)
// ============================================================================

export const moverTopicoDeSemana = (topicoId: string, novaSemanaNumero: number) => {
  const data = getCronograma();
  if (!data) return { success: false, error: 'Cronograma não encontrado.' };

  let topicoMovido: CronogramaTopico | null = null;

  // Extrai o tópico
  const semanasProcessadas = data.semanas.map((s) => {
    const topicosFiltrados = s.topicos.filter((t) => {
      if (t.id === topicoId) {
        topicoMovido = t;
        return false;
      }
      return true;
    });
    return { ...s, topicos: topicosFiltrados };
  });

  if (!topicoMovido) return { success: false, error: 'Tópico não encontrado.' };

  // Insere na nova semana
  const semanaDestinoIndex = semanasProcessadas.findIndex((s) => s.numero === novaSemanaNumero);
  if (semanaDestinoIndex !== -1) {
    semanasProcessadas[semanaDestinoIndex].topicos.push(topicoMovido);
  } else {
    semanasProcessadas.push({
      numero: novaSemanaNumero,
      titulo: `Semana ${novaSemanaNumero}`,
      topicos: [topicoMovido],
    });
  }

  semanasProcessadas.sort((a, b) => a.numero - b.numero);
  const newData = { ...data, semanas: semanasProcessadas };
  saveCronograma(newData);
  return { success: true, data: newData };
};

export const removerTopicoCronograma = (topicoId: string) => {
  const data = getCronograma();
  if (!data) return { success: false, error: 'Cronograma não encontrado.' };

  const semanasProcessadas = data.semanas.map((s) => ({
    ...s,
    topicos: s.topicos.filter((t) => t.id !== topicoId),
  }));

  const newData = { ...data, semanas: semanasProcessadas };
  saveCronograma(newData);

  // Limpa também o progresso associado e o DaysMap
  try {
    const currentProg = getCronogramaProgresso();
    if (currentProg[topicoId]) {
      delete currentProg[topicoId];
      saveCronogramaProgresso(currentProg);
    }
    const mappedDays = getCronogramaDays();
    if (mappedDays[topicoId]) {
      delete mappedDays[topicoId];
      saveCronogramaDays(mappedDays);
    }
  } catch (e) {
    console.error('Aviso: Erro ao limpar progresso/days ao deletar tópico:', e);
  }

  return { success: true, data: newData };
};

export const adicionarTopicoAoCronograma = (
  semanaNumero: number,
  payload: Omit<CronogramaTopico, 'id'> & { id?: string }
) => {
  const data = getCronograma();
  if (!data) return { success: false, error: 'Cronograma não encontrado.' };

  const idSeguro = payload.id || `custom-${Date.now()}`;
  const novoTopico: CronogramaTopico = {
    ...payload,
    id: idSeguro,
  };

  const semanasProcessadas = [...data.semanas];
  const indexSemana = semanasProcessadas.findIndex((s) => s.numero === semanaNumero);

  if (indexSemana !== -1) {
    semanasProcessadas[indexSemana].topicos.push(novoTopico);
  } else {
    semanasProcessadas.push({
      numero: semanaNumero,
      titulo: `Semana ${semanaNumero}`,
      topicos: [novoTopico],
    });
  }

  semanasProcessadas.sort((a, b) => a.numero - b.numero);
  const newData = { ...data, semanas: semanasProcessadas };
  saveCronograma(newData);

  if (payload.assignedDay) {
    setTopicAssignedDay(idSeguro, payload.assignedDay);
  }

  return { success: true, data: newData };
};

export const atualizarTopicoNoCronograma = (
  topicoId: string,
  atualizacoes: Partial<CronogramaTopico>
) => {
  const data = getCronograma();
  if (!data) return { success: false, error: 'Cronograma não encontrado.' };

  let topicoAtualizado = false;
  const semanasProcessadas = data.semanas.map((s) => ({
    ...s,
    topicos: s.topicos.map((t) => {
      if (t.id === topicoId) {
        topicoAtualizado = true;
        return {
          ...t,
          ...atualizacoes,
        };
      }
      return t;
    }),
  }));

  if (!topicoAtualizado) {
    return { success: false, error: 'Tópico não encontrado.' };
  }

  const newData = { ...data, semanas: semanasProcessadas };
  saveCronograma(newData);

  if (atualizacoes.assignedDay) {
    setTopicAssignedDay(topicoId, atualizacoes.assignedDay);
  }

  return { success: true, data: newData };
};

// ============================================================================
// 6. VALIDAÇÃO ZOD E IMPORTAÇÃO DE ARQUIVOS JSON
// ============================================================================

export function normalizarCronogramaValidado(validado: ValidatedCronogramaData): CronogramaData {
  return {
    versao: validado.versao ?? 1,
    titulo: (validado.titulo || 'Cronograma de Estudos').trim(),
    descricao: validado.descricao,
    dataAtualizacao: validado.dataAtualizacao,
    semanas: validado.semanas.map((s, sIdx) => {
      const num = s.numero ?? sIdx + 1;
      return {
        numero: num,
        titulo: (s.titulo || `Semana ${num}`).trim(),
        subtitulo: s.subtitulo,
        dataInicio: s.dataInicio,
        dataFim: s.dataFim,
        topicos: s.topicos.map((t) => {
          let passos: FlowStep[] = [];
          if (t.passos && t.passos.length > 0) {
            passos = t.passos.map((p) => {
              const label =
                p.label ||
                (p.tipo === 'aulas'
                  ? 'Aulas principais'
                  : p.tipo === 'aulas_bonus'
                  ? 'Aulas bônus'
                  : p.tipo.charAt(0).toUpperCase() + p.tipo.slice(1));
              return {
                tipo: p.tipo,
                label,
                detalhe: p.detalhe,
                dia: p.dia,
                metaQuestoes: p.metaQuestoes,
                temaQuestoes: p.temaQuestoes,
                focoQuestoes: p.focoQuestoes,
              };
            });
          } else {
            passos = PASSOS_PADRAO.map((p) => ({ ...p }));
          }

          return {
            id: t.id.trim(),
            titulo: t.titulo.trim(),
            area: t.area.trim(),
            grandeArea: t.grandeArea || t.area.trim(),
            especialidade: t.especialidade,
            topicosSecundarios: t.topicosSecundarios,
            assignedDay: t.assignedDay,
            estimativaMinutos: t.estimativaMinutos,
            revisao: t.revisao as any,
            passos,
          };
        }),
      };
    }),
  };
}

export function parseAndValidateCronogramaJson(rawText: string | any): CronogramaData {
  let parsedData: unknown;
  if (typeof rawText === 'string') {
    try {
      parsedData = JSON.parse(rawText);
    } catch {
      throw new Error('Arquivo JSON corrompido ou mal formatado.');
    }
  } else {
    parsedData = rawText;
  }

  const cronogramaValidado = CronogramaJSONSchema.parse(parsedData);
  return normalizarCronogramaValidado(cronogramaValidado);
}

export async function processarImportacaoCronograma(
  fileContent: string | unknown
): Promise<{ success: boolean; data?: CronogramaData; error?: string }> {
  try {
    const cronogramaPronto = parseAndValidateCronogramaJson(fileContent);
    saveCronograma(cronogramaPronto);
    return { success: true, data: cronogramaPronto };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const issues = error.issues || (error as any).errors || [];
      const errorMessage = issues
        .map((err: any) => `Caminho: ${err.path.join('.')} - Problema: ${err.message}`)
        .join('\n');
      return {
        success: false,
        error: `O arquivo JSON importado possui erros de estrutura e não pôde ser lido.\n\nDetalhes:\n${errorMessage}`,
      };
    }
    return {
      success: false,
      error: error?.message || 'Arquivo JSON corrompido ou mal formatado.',
    };
  }
}

async function readTextFileFromUri(uri: string): Promise<string> {
  try {
    const text = await FileSystemLegacy.readAsStringAsync(uri, {
      encoding: FileSystemLegacy.EncodingType.UTF8,
    });
    if (text && text.trim()) return text;
  } catch {}

  try {
    const file = new FileSystem.File(uri);
    const text = await file.text();
    if (text && text.trim()) return text;
  } catch {}

  if (uri.startsWith('content://')) {
    try {
      const baseDir =
        FileSystemLegacy.cacheDirectory ||
        FileSystemLegacy.documentDirectory ||
        (FileSystem.Paths?.cache?.uri ? `${FileSystem.Paths.cache.uri}/` : '');
      const tempPath = `${baseDir.endsWith('/') ? baseDir : baseDir + '/'}cronograma_import_${Date.now()}.json`;

      await FileSystemLegacy.copyAsync({ from: uri, to: tempPath });
      const text = await FileSystemLegacy.readAsStringAsync(tempPath, {
        encoding: FileSystemLegacy.EncodingType.UTF8,
      });
      await FileSystemLegacy.deleteAsync(tempPath, { idempotent: true });
      if (text && text.trim()) return text;
    } catch {}
  }

  if (!uri.startsWith('content://')) {
    try {
      const res = await fetch(uri);
      const text = await res.text();
      if (text && text.trim()) return text;
    } catch {}
  }

  throw new Error('Não foi possível ler o arquivo selecionado.');
}

export async function pickAndImportCronograma(): Promise<{
  success: boolean;
  data?: CronogramaData;
  error?: string;
  cancelado?: boolean;
}> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/json', '*/*'],
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return { success: false, cancelado: true };
    }

    const asset = result.assets[0];
    const fileContent = await readTextFileFromUri(asset.uri);

    if (!fileContent || !fileContent.trim()) {
      return { success: false, error: 'O arquivo selecionado está vazio.' };
    }

    return await processarImportacaoCronograma(fileContent);
  } catch (err: any) {
    console.error('Erro na importação do cronograma:', err);
    return { success: false, error: err?.message || 'Falha ao importar cronograma.' };
  }
}

// ============================================================================
// MOTOR DE ORÇAMENTO DE ENERGIA (ENERGY BUDGET)
// ============================================================================

// Configurações do Orçamento de Energia
export const BASE_DAILY_BUDGET = 15; // Teto ideal de pontos por dia
export const SOFT_LIMIT = 18; // Teto máximo absoluto tolerado (com penalidade no dia seguinte)

/**
 * Calcula a carga cognitiva total já alocada em um dia específico.
 */
export async function calculateDailyLoad(dataYYYYMMDD: string): Promise<number> {
  const atividades = await getAtividadesPorData(dataYYYYMMDD);
  return atividades.reduce((total, atv) => total + (atv.feedback_cansaco || 0), 0);
}

/**
 * Calcula o orçamento de energia disponível para o dia atual, 
 * aplicando penalidades se o dia anterior ultrapassou o teto ideal.
 */
export async function getAdjustedDailyBudget(
  dataAtualYYYYMMDD: string,
  dataAnteriorYYYYMMDD: string
): Promise<number> {
  const cargaOntem = await calculateDailyLoad(dataAnteriorYYYYMMDD);

  let orcamentoHoje = BASE_DAILY_BUDGET;

  // Se passou do ideal ontem, cobra a dívida hoje
  if (cargaOntem > BASE_DAILY_BUDGET) {
    const excesso = cargaOntem - BASE_DAILY_BUDGET;
    orcamentoHoje -= excesso;
  }

  // Garante um orçamento mínimo de sobrevivência (ex: 8 pontos) para não travar o app
  return Math.max(orcamentoHoje, 8);
}

/**
 * Verifica se uma nova atividade pode ser agendada no dia solicitado 
 * respeitando o Soft Limit (Tolerância).
 */
export async function canScheduleActivity(
  dataYYYYMMDD: string,
  pesoAtividade: number
): Promise<{ canSchedule: boolean; currentLoad: number; futureLoad: number }> {
  const cargaAtual = await calculateDailyLoad(dataYYYYMMDD);
  const cargaFutura = cargaAtual + pesoAtividade;

  // Permite agendar se a carga futura não estourar o limite rígido (SOFT_LIMIT)
  const canSchedule = cargaFutura <= SOFT_LIMIT;

  return {
    canSchedule,
    currentLoad: cargaAtual,
    futureLoad: cargaFutura,
  };
}

