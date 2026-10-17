import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  TextInput,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { storage } from '@/services/storage';
import { Colors, ActiveThemeColors, hexToRgba } from '@/constants/Colors';
import { useAppTheme } from '@/context/ThemeContext';
import AppHeader from '@/components/AppHeader';
import CircularProgressRing from '@/components/CircularProgressRing';
import {
  ModalsMenuTopico,
  ModalConfirmarExclusaoTopico,
  ModalVisaoGeralSemanas,
  TopicAccordionBody,
  ModalNovoTopico,
} from '@/components/cronograma';
import {
  getCronogramaFromSQLite,
  getPassosPorTopico,
  togglePassoConcluido,
  PassoDB,
} from '@/services/database';
import {
  CronogramaData,
  CronogramaSemana,
  CronogramaTopico,
  CronogramaProgresso,
  FlowStep,
  FlowStepType,
  DiaSemana,
  DIAS_SEMANA_LISTA,
  CronogramaDaysMap,
  CronogramaRevisaoItem,
  getRevisoesDaSemana,
  getCronograma,
  getCronogramaProgresso,
  toggleStepProgress,
  isStepConcluido,
  getStepUniqueId,
  calcularProgressoSemana,
  calcularProgressoTopico,
  getCronogramaDays,
  saveCronogramaDays,
  setTopicAssignedDay,
  resolveAssignedDay,
  moverTopicoDeSemana,
  moverPassosDoTopicoDeDia,
  getStepAssignedDay,
  removerTopicoCronograma,
  adicionarTopicoAoCronograma,
  atualizarTopicoNoCronograma,
  getSemanaDoCronogramaPorData,
} from '@/services/scheduleService';
import {
  getQuestoesCache,
  getQuestionsByThemes,
  getQuestionId,
  getQuestionEspecialidade,
  getQuestionTema,
  clearActiveQuizSession,
  CartItem,
} from '@/services/questionService';

// Abreviações para as pílulas verticais de dias da semana
const DIA_ABBR_MAP: Record<DiaSemana, string> = {
  segunda: 'Seg',
  terca: 'Ter',
  quarta: 'Qua',
  quinta: 'Qui',
  sexta: 'Sex',
  sabado: 'Sáb',
  domingo: 'Dom',
};

// Retorna o dia da semana atual do dispositivo do utilizador (0 = domingo, 1 = segunda, etc.)
const getDiaAtualDispositivo = (): DiaSemana => {
  const dayIndex = new Date().getDay();
  switch (dayIndex) {
    case 1: return 'segunda';
    case 2: return 'terca';
    case 3: return 'quarta';
    case 4: return 'quinta';
    case 5: return 'sexta';
    case 6: return 'sabado';
    case 0:
    default: return 'domingo';
  }
};

// Cores temáticas por grande área médica
const getTopicColor = (area?: string, especialidade?: string, grandeArea?: string, titulo?: string): string => {
  const normalize = (val?: string) =>
    (val || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

  const str = `${normalize(area)} ${normalize(especialidade)} ${normalize(grandeArea)} ${normalize(titulo)}`;

  // Ginecologia e Obstetrícia -> Rosa (#EC4899)
  if (str.includes('gineco') || str.includes('obstetr') || /\bgo\b/.test(str)) {
    return '#EC4899';
  }

  // Cirurgia Geral -> Vermelho (#EF4444)
  if (str.includes('cirurg') || str.includes('trauma') || str.includes('urolog') || str.includes('anestesio') || str.includes('ortoped')) {
    return '#EF4444';
  }

  // Pediatria -> Verde (#10B981)
  if (str.includes('pediatr') || str.includes('puericult') || str.includes('neonat')) {
    return '#10B981';
  }

  // Medicina Preventiva / Saúde Coletiva -> Roxo (#8B5CF6)
  if (
    str.includes('preventiv') ||
    str.includes('epidemiolog') ||
    str.includes('saude coletiva') ||
    str.includes('saude publica') ||
    str.includes('estatistic') ||
    str.includes('bioetic') ||
    str.includes('sus')
  ) {
    return '#8B5CF6';
  }

  // Clínica Médica e suas subespecialidades -> Azul (#3B82F6)
  if (
    str.includes('clinic') ||
    str.includes('medica') ||
    str.includes('nefro') ||
    str.includes('cardio') ||
    str.includes('gastro') ||
    str.includes('pneumo') ||
    str.includes('neuro') ||
    str.includes('hemato') ||
    str.includes('infecto') ||
    str.includes('endocrino') ||
    str.includes('reumato') ||
    str.includes('dermato') ||
    str.includes('psiquiatr') ||
    str.includes('oftalmo') ||
    str.includes('otorrino') ||
    str.includes('geriatr') ||
    str.includes('hematolog') ||
    str.includes('oncolog') ||
    str.includes('hepatolog') ||
    str.includes('alerg') ||
    str.includes('imuno')
  ) {
    return '#3B82F6';
  }

  return Colors.primary;
};

const formatTopicSpecialtyLabel = (area?: string, especialidade?: string): string => {
  const cleanArea = area?.trim() || '';
  const cleanEsp = especialidade?.trim() || '';
  if (cleanArea && cleanEsp && cleanArea.toLowerCase() !== cleanEsp.toLowerCase()) {
    return `${cleanArea} • ${cleanEsp}`;
  }
  return cleanArea || cleanEsp || '';
};

const STEP_ICONS: Record<FlowStepType, { icon: any; label: string }> = {
  apostila: { icon: 'book-outline', label: 'Apostila' },
  aulas: { icon: 'play-circle-outline', label: 'Aulas principais' },
  aulas_bonus: { icon: 'sparkles-outline', label: 'Aulas bônus' },
  questoes: { icon: 'pencil-outline', label: 'Questões' },
  flashcards: { icon: 'albums-outline', label: 'Flashcards' },
};

const normalizeText = (text: string): string => {
  if (!text) return '';
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
};

const formatarEstimativaTempo = (minutos?: number): string | null => {
  if (!minutos || minutos <= 0) return null;
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const minRestantes = minutos % 60;
  if (minRestantes === 0) return `${horas}h`;
  return `${horas}h ${minRestantes}m`;
};

export interface CronogramaSearchResult {
  id: string;
  semanaNumero: number;
  semanaTitulo: string;
  topicoTitulo: string;
  area: string;
  grandeArea?: string;
  especialidade?: string;
  assignedDay: DiaSemana;
  matchedDetail?: string;
  matchSource?: string;
}

export type AbaDiaCronograma = DiaSemana;

export default function CronogramaScreen() {
  const router = useRouter();
  const { colors: themeColors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(themeColors, isDark), [themeColors, isDark]);

  // Estados principais
  const [cronograma, setCronograma] = useState<CronogramaData | null>(null);
  const [progresso, setProgresso] = useState<CronogramaProgresso>({});
  const [daysMap, setDaysMap] = useState<CronogramaDaysMap>({});
  const [semanaAtiva, setSemanaAtiva] = useState<number>(() => {
    const semStr = storage.getString('@athena_semana_ativa');
    if (semStr) return parseInt(semStr, 10);
    const hoje = new Date();
    const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    return getSemanaDoCronogramaPorData(hojeStr);
  });
  const [diaAtivo, setDiaAtivo] = useState<AbaDiaCronograma>(getDiaAtualDispositivo());
  const dayScrollViewRef = useRef<ScrollView>(null);
  const [expandedTopicIds, setExpandedTopicIds] = useState<Set<string>>(new Set());
  const [dbPassosMap, setDbPassosMap] = useState<Record<string, PassoDB[]>>({});
  const [quizLoadingTopicId, setQuizLoadingTopicId] = useState<string | null>(null);

  // Sincroniza a semana ativa com o MMKV para uso compartilhado na Timeline Diária (index.tsx)
  useEffect(() => {
    storage.set('@athena_semana_ativa', semanaAtiva);
  }, [semanaAtiva]);

  // Estados de Modais e Pesquisa
  const [showSearch, setShowSearch] = useState<boolean>(false);
  const [searchText, setSearchText] = useState<string>('');
  const [showWeekOverviewModal, setShowWeekOverviewModal] = useState<boolean>(false);
  const [showEscolherSemanaModal, setShowEscolherSemanaModal] = useState<{
    topico: CronogramaTopico;
    semanaOrigemNumero: number;
    currentDay: DiaSemana;
  } | null>(null);
  const [topicoMenuAberto, setTopicoMenuAberto] = useState<{
    topico: CronogramaTopico;
    semanaOrigemNumero: number;
    currentDay: DiaSemana;
  } | null>(null);
  const [showMoveDayModal, setShowMoveDayModal] = useState<{
    topico: CronogramaTopico;
    currentDay: DiaSemana;
  } | null>(null);
  const [topicoParaExcluir, setTopicoParaExcluir] = useState<{
    topico: CronogramaTopico;
    semanaOrigemNumero: number;
  } | null>(null);
  const [showNovoTopicoModal, setShowNovoTopicoModal] = useState<boolean>(false);
  const [topicoParaEditar, setTopicoParaEditar] = useState<CronogramaTopico | null>(null);

  // Carrega todos os dados buscando direto do SQLite com fallback para o cache local
  const carregarDados = async () => {
    try {
      let cronogramaData = await getCronogramaFromSQLite();
      if (!cronogramaData || !cronogramaData.semanas || cronogramaData.semanas.length === 0) {
        cronogramaData = getCronograma();
      }
      const progressoData = getCronogramaProgresso();
      const daysData = getCronogramaDays();

      if (cronogramaData && cronogramaData.semanas?.length > 0) {
        setCronograma(cronogramaData);
        const semanasOrdenadas = [...cronogramaData.semanas].sort((a: any, b: any) => a.numero - b.numero);
        const primeiraPendente = semanasOrdenadas.find((s: any) => {
          if (!s.topicos || s.topicos.length === 0) return false;
          const stats = calcularProgressoSemana(s, progressoData || {});
          return stats.porcentagem < 100;
        });
        const semanaPadrao = primeiraPendente ? primeiraPendente.numero : semanasOrdenadas[semanasOrdenadas.length - 1].numero;

        setSemanaAtiva((curr) => {
          const currSemana = cronogramaData.semanas.find((s: any) => s.numero === curr);
          if (!currSemana) return semanaPadrao;
          return curr;
        });
      } else {
        setCronograma(null);
      }

      setProgresso(progressoData || {});
      setDaysMap(daysData || {});
    } catch (err) {
      console.error('Erro ao carregar cronograma:', err);
    }
  };

  useEffect(() => {
    carregarDados();
  }, []);

  useFocusEffect(
    useCallback(() => {
      setDiaAtivo(getDiaAtualDispositivo());
      carregarDados();
    }, [])
  );

  useEffect(() => {
    const idx = DIAS_SEMANA_LISTA.findIndex((d) => d.id === diaAtivo);
    if (idx > 1 && dayScrollViewRef.current) {
      setTimeout(() => {
        dayScrollViewRef.current?.scrollTo({ x: idx * 56, animated: true });
      }, 150);
    }
  }, [diaAtivo]);

  const semanasList = useMemo(() => cronograma?.semanas || [], [cronograma]);

  const semanaAtual = useMemo(() => {
    if (!semanasList.length) return null;
    return semanasList.find((s) => s.numero === semanaAtiva) || semanasList[0] || null;
  }, [semanasList, semanaAtiva]);

  const revisoesDaSemana = useMemo(() => {
    if (!semanaAtual) return [];
    return getRevisoesDaSemana(semanaAtual.numero, cronograma);
  }, [semanaAtual, cronograma]);

  const currentWeekIndex = useMemo(() => semanasList.findIndex((s) => s.numero === semanaAtiva), [semanasList, semanaAtiva]);
  const isFirstWeek = currentWeekIndex <= 0;
  const isLastWeek = currentWeekIndex >= semanasList.length - 1;

  const statsSemana = useMemo(() => {
    if (!semanaAtual) return { total: 0, concluidos: 0, porcentagem: 0 };
    return calcularProgressoSemana(semanaAtual, progresso);
  }, [semanaAtual, progresso]);

  const semanaAtualEstudoNumero = useMemo(() => {
    if (!cronograma?.semanas || cronograma.semanas.length === 0) return 1;
    const semanasOrdenadas = [...cronograma.semanas].sort((a, b) => a.numero - b.numero);
    for (const s of semanasOrdenadas) {
      if (!s.topicos || s.topicos.length === 0) continue;
      const stats = calcularProgressoSemana(s, progresso);
      if (stats.porcentagem < 100) return s.numero;
    }
    return semanasOrdenadas[semanasOrdenadas.length - 1].numero;
  }, [cronograma, progresso]);

  const isSemanaAtual = semanaAtiva === semanaAtualEstudoNumero;

  const dayStatsMap = useMemo(() => {
    const stats: Record<DiaSemana, { count: number; completedCount: number; isAllDone: boolean }> = {
      segunda: { count: 0, completedCount: 0, isAllDone: false },
      terca: { count: 0, completedCount: 0, isAllDone: false },
      quarta: { count: 0, completedCount: 0, isAllDone: false },
      quinta: { count: 0, completedCount: 0, isAllDone: false },
      sexta: { count: 0, completedCount: 0, isAllDone: false },
      sabado: { count: 0, completedCount: 0, isAllDone: false },
      domingo: { count: 0, completedCount: 0, isAllDone: false },
    };

    if (!semanaAtual?.topicos) return stats;
    const WEEKDAY_ORDER: DiaSemana[] = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];

    for (const d of WEEKDAY_ORDER) {
      for (let idx = 0; idx < semanaAtual.topicos.length; idx++) {
        const topico = semanaAtual.topicos[idx];
        const fallbackDay = resolveAssignedDay(topico.id, idx, daysMap);
        const rawPassos = topico.passos || [];

        let passosDoDia: FlowStep[] = [];
        if (rawPassos.length > 0) {
          passosDoDia = rawPassos.filter((p) => getStepAssignedDay(p, fallbackDay) === d);
        } else if (fallbackDay === d) {
          passosDoDia = [];
        }

        if (passosDoDia.length > 0) {
          stats[d].count += 1;
          const concluidos = passosDoDia.filter((p, pIdx) =>
            isStepConcluido(progresso, topico.id, getStepUniqueId(p, pIdx), p.tipo)
          ).length;
          if (concluidos === passosDoDia.length) {
            stats[d].completedCount += 1;
          }
        } else if (rawPassos.length === 0 && fallbackDay === d) {
          stats[d].count += 1;
          if (calcularProgressoTopico(topico, progresso) === 100) {
            stats[d].completedCount += 1;
          }
        }
      }

      for (let rIdx = 0; rIdx < revisoesDaSemana.length; rIdx++) {
        const rev = revisoesDaSemana[rIdx];
        const assignedRevDay = daysMap[rev.id]
          ? daysMap[rev.id]
          : (rIdx % 2 === 0 ? 'sexta' : 'sabado');

        if (assignedRevDay === d) {
          stats[d].count += 1;
          const concluidos = rev.passos.filter((p, pIdx) =>
            isStepConcluido(progresso, rev.id, getStepUniqueId(p, pIdx), p.tipo)
          ).length;
          if (concluidos === rev.passos.length && rev.passos.length > 0) {
            stats[d].completedCount += 1;
          }
        }
      }
    }

    const hoje = getDiaAtualDispositivo();
    const todayIndex = WEEKDAY_ORDER.indexOf(hoje);

    for (let i = 0; i < WEEKDAY_ORDER.length; i++) {
      const key = WEEKDAY_ORDER[i];
      if (stats[key].count > 0) {
        stats[key].isAllDone = stats[key].completedCount === stats[key].count;
      } else if (todayIndex !== -1 && i < todayIndex) {
        stats[key].isAllDone = true;
      } else {
        stats[key].isAllDone = false;
      }
    }

    return stats;
  }, [semanaAtual, daysMap, progresso, revisoesDaSemana]);

  const dayDisplayStatusMap = useMemo(() => {
    const statusMap: Record<DiaSemana, 'done' | 'late' | 'in_progress' | 'empty'> = {
      segunda: 'empty', terca: 'empty', quarta: 'empty', quinta: 'empty', sexta: 'empty', sabado: 'empty', domingo: 'empty',
    };
    const WEEKDAY_ORDER: DiaSemana[] = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];

    if (!isSemanaAtual) {
      for (const day of WEEKDAY_ORDER) {
        const stats = dayStatsMap[day];
        statusMap[day] = ((stats && stats.count > 0 && stats.isAllDone) || statsSemana.porcentagem === 100) ? 'done' : 'empty';
      }
      return statusMap;
    }

    const hoje = getDiaAtualDispositivo();
    const todayIndex = WEEKDAY_ORDER.indexOf(hoje);

    for (let i = 0; i < WEEKDAY_ORDER.length; i++) {
      const day = WEEKDAY_ORDER[i];
      const stats = dayStatsMap[day];
      const count = stats?.count || 0;
      const isAllDone = stats?.isAllDone || false;

      if (count > 0 && isAllDone) {
        statusMap[day] = 'done';
        continue;
      }

      if (todayIndex !== -1 && i < todayIndex) {
        statusMap[day] = count > 0 ? 'late' : 'done';
        continue;
      }

      if (day === hoje) {
        statusMap[day] = 'in_progress';
        continue;
      }

      statusMap[day] = 'empty';
    }

    return statusMap;
  }, [dayStatsMap, isSemanaAtual]);

  const topicosFiltrados = useMemo(() => {
    if (!semanaAtual) return [];
    const list: { cardKey: string; topico: CronogramaTopico & { assignedDay: DiaSemana }; passos: FlowStep[]; topicProgress: number; isCardDone: boolean; }[] = [];

    if (!semanaAtual.topicos) return [];

    semanaAtual.topicos.forEach((topico, idx) => {
      const fallbackDay = resolveAssignedDay(topico.id, idx, daysMap);
      const topicoWithDay = { ...topico, assignedDay: fallbackDay };
      const rawPassos = topico.passos || [];
      let passosDoDia: FlowStep[] = [];

      if (rawPassos.length > 0) {
        passosDoDia = rawPassos.filter((p) => getStepAssignedDay(p, fallbackDay) === diaAtivo);
      } else if (fallbackDay === diaAtivo) {
        passosDoDia = [];
      }

      if (passosDoDia.length > 0 || (rawPassos.length === 0 && fallbackDay === diaAtivo)) {
        const concluidos = passosDoDia.filter((p, pIdx) => isStepConcluido(progresso, topico.id, getStepUniqueId(p, pIdx), p.tipo)).length;
        const total = passosDoDia.length;
        const topicProgress = total > 0 ? Math.round((concluidos / total) * 100) : calcularProgressoTopico(topico, progresso);

        let passosOrdenados = [...passosDoDia];
        const aulasIdx = passosOrdenados.findIndex((p) => p.tipo === 'aulas');
        const bonusIdx = passosOrdenados.findIndex((p) => p.tipo === 'aulas_bonus');

        if (aulasIdx !== -1 && bonusIdx !== -1 && bonusIdx !== aulasIdx + 1) {
          const [bonusStep] = passosOrdenados.splice(bonusIdx, 1);
          const newAulasIdx = passosOrdenados.findIndex((p) => p.tipo === 'aulas');
          passosOrdenados.splice(newAulasIdx + 1, 0, bonusStep);
        }

        list.push({
          cardKey: `${topico.id}_${diaAtivo}`,
          topico: topicoWithDay,
          passos: passosOrdenados,
          topicProgress,
          isCardDone: total > 0 ? concluidos === total : topicProgress === 100,
        });
      }
    });

    revisoesDaSemana.forEach((rev, rIdx) => {
      const assignedRevDay = daysMap[rev.id]
        ? daysMap[rev.id]
        : (rIdx % 2 === 0 ? 'sexta' : 'sabado');

      if (assignedRevDay === diaAtivo) {
        const passos = rev.passos;
        const concluidos = passos.filter((p, pIdx) => isStepConcluido(progresso, rev.id, getStepUniqueId(p, pIdx), p.tipo)).length;
        const total = passos.length;

        list.push({
          cardKey: `${rev.id}_${diaAtivo}`,
          topico: { ...rev.topicoOriginal, id: rev.id, isRevisao: true, revisaoIntervaloLabel: rev.intervaloLabel, revisaoOrigemSemana: rev.semanaOrigemNumero, assignedDay: diaAtivo, passos: rev.passos },
          passos: rev.passos,
          topicProgress: total > 0 ? Math.round((concluidos / total) * 100) : 0,
          isCardDone: total > 0 && concluidos === total,
        });
      }
    });

    return list;
  }, [semanaAtual, daysMap, diaAtivo, progresso, revisoesDaSemana]);

  const searchResults = useMemo((): CronogramaSearchResult[] => {
    const query = normalizeText(searchText);
    if (!query || !cronograma?.semanas) return [];
    const results: CronogramaSearchResult[] = [];
    const WEEKDAY_ORDER: DiaSemana[] = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];

    for (const s of cronograma.semanas) {
      if (!s.topicos) continue;
      s.topicos.forEach((t, idx) => {
        const fallbackDay = resolveAssignedDay(t.id, idx, daysMap);
        let assignedDay = fallbackDay;

        if (t.passos && t.passos.length > 0) {
          const primeiroDia = WEEKDAY_ORDER.find((dia) => t.passos?.some((p) => getStepAssignedDay(p, fallbackDay) === dia));
          if (primeiroDia) assignedDay = primeiroDia;
        }

        let isMatch = false;
        let matchedDetail: string | undefined;
        let matchSource: string | undefined;

        // 1. Título do tópico
        if (normalizeText(t.titulo).includes(query)) {
          isMatch = true;
        }
        // 2. Área, Especialidade ou Grande Área
        else if (normalizeText(t.area || '').includes(query)) {
          isMatch = true;
        } else if (t.grandeArea && normalizeText(t.grandeArea).includes(query)) {
          isMatch = true;
        } else if (t.especialidade && normalizeText(t.especialidade).includes(query)) {
          isMatch = true;
        }
        // 3. Tópicos secundários
        else if (t.topicosSecundarios?.some((st) => normalizeText(st).includes(query))) {
          isMatch = true;
          const found = t.topicosSecundarios.find((st) => normalizeText(st).includes(query));
          if (found) {
            matchedDetail = found;
            matchSource = 'Tópico Secundário';
          }
        }
        // 4. Descrição (lembretes/anotações)
        else if (t.descricao && normalizeText(t.descricao).includes(query)) {
          isMatch = true;
          matchedDetail = t.descricao;
          matchSource = 'Descrição';
        }
        // 5. Aulas Bônus
        else if (
          t.aulasBonus &&
          (Array.isArray(t.aulasBonus)
            ? t.aulasBonus.some((ab) => normalizeText(ab).includes(query))
            : normalizeText(t.aulasBonus).includes(query))
        ) {
          isMatch = true;
          matchedDetail = Array.isArray(t.aulasBonus)
            ? t.aulasBonus.find((ab) => normalizeText(ab).includes(query))
            : t.aulasBonus;
          matchSource = 'Aula Bônus';
        }

        // 6. Passos (checklist: apostila, aulas, aulas bônus, questões, flashcards)
        if (!isMatch && t.passos && t.passos.length > 0) {
          for (const passo of t.passos) {
            // Se o passo tem dia específico onde foi encontrado
            const passoDay = getStepAssignedDay(passo, fallbackDay);

            if (passo.detalhe && normalizeText(passo.detalhe).includes(query)) {
              isMatch = true;
              matchedDetail = passo.detalhe;
              matchSource = passo.label || (passo.tipo === 'aulas_bonus' ? 'Aula Bônus' : passo.tipo === 'aulas' ? 'Aulas' : passo.tipo === 'apostila' ? 'Apostila' : passo.tipo === 'questoes' ? 'Questões' : 'Flashcards');
              if (passoDay) assignedDay = passoDay;
              break;
            }
            if (passo.label && normalizeText(passo.label).includes(query)) {
              isMatch = true;
              matchedDetail = passo.label;
              matchSource = 'Item da Trilha';
              if (passoDay) assignedDay = passoDay;
              break;
            }
            if (passo.temaQuestoes) {
              const temas = Array.isArray(passo.temaQuestoes) ? passo.temaQuestoes : [passo.temaQuestoes];
              const foundTema = temas.find((tema) => normalizeText(tema).includes(query));
              if (foundTema) {
                isMatch = true;
                matchedDetail = foundTema;
                matchSource = 'Tema de Questões';
                if (passoDay) assignedDay = passoDay;
                break;
              }
            }
            if (passo.focoQuestoes && normalizeText(passo.focoQuestoes).includes(query)) {
              isMatch = true;
              matchedDetail = passo.focoQuestoes;
              matchSource = 'Foco';
              if (passoDay) assignedDay = passoDay;
              break;
            }
          }
        }

        if (isMatch) {
          results.push({
            id: t.id,
            semanaNumero: s.numero,
            semanaTitulo: s.titulo || '',
            topicoTitulo: t.titulo,
            area: t.area,
            grandeArea: t.grandeArea,
            especialidade: t.especialidade,
            assignedDay,
            matchedDetail,
            matchSource,
          });
        }
      });
    }
    return results;
  }, [cronograma, searchText, daysMap]);

  const toggleCardExpand = async (cardKey: string, topicId?: string) => {
    const isOpening = !expandedTopicIds.has(cardKey);
    setExpandedTopicIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardKey)) next.delete(cardKey);
      else next.add(cardKey);
      return next;
    });

    const targetTopicId = topicId || cardKey.split('_')[0];
    if (isOpening && targetTopicId) {
      try {
        const passosDoBanco = await getPassosPorTopico(targetTopicId);
        if (passosDoBanco && passosDoBanco.length > 0) {
          setDbPassosMap((prev) => ({
            ...prev,
            [targetTopicId]: passosDoBanco,
          }));
        }
      } catch (err) {
        console.error('[Cronograma] Erro ao buscar passos do SQLite:', err);
      }
    }
  };

  const handleToggleStep = async (topicoId: string, tipoOrStepId: string, passoIdNum?: number) => {
    try {
      // 1. Atualiza no SQLite caso tenhamos o id do passo ou encontremos no dbPassosMap
      let targetPassoId = passoIdNum;
      if (!targetPassoId && dbPassosMap[topicoId]) {
        const found = dbPassosMap[topicoId].find(
          (p) => String(p.id) === tipoOrStepId || p.tipo === tipoOrStepId
        );
        if (found) targetPassoId = found.id;
      }

      if (targetPassoId) {
        await togglePassoConcluido(targetPassoId);
        // Atualiza estado local dbPassosMap para renderização e feedback instantâneos
        setDbPassosMap((prev) => {
          const passos = prev[topicoId];
          if (!passos) return prev;
          return {
            ...prev,
            [topicoId]: passos.map((p) =>
              p.id === targetPassoId ? { ...p, concluido: p.concluido === 1 ? 0 : 1 } : p
            ),
          };
        });
      }

      // 2. Atualiza no serviço/MMKV para recalcular progresso geral
      const novoProgresso = toggleStepProgress(topicoId, tipoOrStepId);
      setProgresso(novoProgresso);

      if (semanaAtual) {
        const statsAtual = calcularProgressoSemana(semanaAtual, novoProgresso);
        if (statsAtual.total > 0 && statsAtual.concluidos === statsAtual.total) {
          const idx = semanasList.findIndex((s) => s.numero === semanaAtiva);
          if (idx !== -1 && idx < semanasList.length - 1) {
            const proximaSemana = semanasList[idx + 1];
            setTimeout(() => {
              setSemanaAtiva(proximaSemana.numero);
              setDiaAtivo(getDiaAtualDispositivo());
            }, 600);
          }
        }
      }
    } catch (e) {
      console.error('Erro ao alternar passo:', e);
    }
  };

  const handleMoveToDay = (topicoId: string, targetDay: DiaSemana) => {
    try {
      if (showMoveDayModal?.currentDay && !showMoveDayModal.topico.isRevisao) {
        const res = moverPassosDoTopicoDeDia(topicoId, showMoveDayModal.currentDay, targetDay);
        if (res.success && res.data) setCronograma(res.data);
      }
      const novoMapa = setTopicAssignedDay(topicoId, targetDay);
      setDaysMap(novoMapa);
      setShowMoveDayModal(null);
      setTopicoMenuAberto(null);
    } catch (err) {
      console.error('Erro ao mover tópico de dia:', err);
    }
  };

  const handleStartQuizForTopic = async (topico: CronogramaTopico, step?: FlowStep, isStepConcluido: boolean = false) => {
    try {
      setQuizLoadingTopicId(topico.id);
      setExpandedTopicIds((prev) => {
        const next = new Set(prev);
        next.delete(topico.id);
        return next;
      });

      let temasParaBuscar: string[] = [];
      if (Array.isArray(step?.temaQuestoes)) {
        temasParaBuscar = step.temaQuestoes;
      } else if (typeof step?.temaQuestoes === 'string' && step.temaQuestoes.trim()) {
        temasParaBuscar = step.temaQuestoes.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
      } else {
        temasParaBuscar = [topico.titulo];
        if (Array.isArray(topico.topicosSecundarios) && topico.topicosSecundarios.length > 0) {
          temasParaBuscar.push(...topico.topicosSecundarios);
        }
      }

      // Consulta seletiva de alta performance no SQLite
      let questoesCache = await getQuestionsByThemes(temasParaBuscar);
      if (!questoesCache || questoesCache.length === 0) {
        questoesCache = await getQuestoesCache();
      }

      const normalizedQueries = temasParaBuscar.map((t) => normalizeText(t)).filter(Boolean);
      const queryArea = normalizeText(topico.especialidade || topico.area || '');

      let matching = (questoesCache || []).filter((q) => {
        const qTema = normalizeText(getQuestionTema(q));
        const tags = Array.isArray(q.tags) ? q.tags.map((t: any) => normalizeText(String(t))) : [];
        return normalizedQueries.some((nq) => qTema.includes(nq) || nq.includes(qTema) || tags.some((t: string) => t.includes(nq)));
      });

      if (matching.length === 0 && queryArea) {
        matching = (questoesCache || []).filter((q) => {
          const qEsp = normalizeText(getQuestionEspecialidade(q));
          return qEsp.includes(queryArea) || queryArea.includes(qEsp);
        });
      }

      const limitNum = step?.metaQuestoes && step.metaQuestoes > 0 ? step.metaQuestoes : 20;

      if (matching.length > 0) {
        const cartItemsByTema: Record<string, { especialidade: string; ids: string[] }> = {};
        matching.forEach((q, idx) => {
          const esp = getQuestionEspecialidade(q) || topico.especialidade || topico.area || 'Geral';
          const tema = getQuestionTema(q) || topico.titulo;
          const id = getQuestionId(q, idx);
          if (!cartItemsByTema[tema]) cartItemsByTema[tema] = { especialidade: esp, ids: [] };
          cartItemsByTema[tema].ids.push(id);
        });

        const cartItems: CartItem[] = Object.entries(cartItemsByTema).map(([tema, val]) => ({
          especialidade: val.especialidade,
          tema,
          allowedQuestionIds: val.ids,
          filterCount: val.ids.length,
        }));
        storage.set('@athena_cart', JSON.stringify(cartItems));
      } else {
        const cartItems: CartItem[] = temasParaBuscar.map((t) => ({
          especialidade: topico.especialidade || topico.area || 'Geral',
          tema: t,
          filterCount: 0,
        }));
        storage.set('@athena_cart', JSON.stringify(cartItems));
      }

      if (isStepConcluido) {
        const filtrosAtuaisRaw = storage.getString('@athena_filtros_simulado');
        let filtrosAtuais = { apenasErrei: false, apenasFavoritas: false };
        if (filtrosAtuaisRaw) {
          try { filtrosAtuais = JSON.parse(filtrosAtuaisRaw); } catch (e) { console.warn(e); }
        }
        storage.set('@athena_filtros_simulado', JSON.stringify({ ...filtrosAtuais, apenasErrei: true }));
      } else {
        const filtrosAtuaisRaw = storage.getString('@athena_filtros_simulado');
        if (filtrosAtuaisRaw) {
          try {
            const filtrosAtuais = JSON.parse(filtrosAtuaisRaw);
            storage.set('@athena_filtros_simulado', JSON.stringify({ ...filtrosAtuais, apenasErrei: false }));
          } catch (e) {}
        }
      }

      storage.set('@athena_quiz_limit', String(limitNum));
      await clearActiveQuizSession();

      router.push({
        pathname: '/treino/quiz',
        params: { limite: String(limitNum) },
      });
    } catch (err) {
      console.error('Erro ao iniciar treino para o tópico:', err);
      Alert.alert('Erro', 'Não foi possível iniciar as questões para este tópico.');
    } finally {
      setQuizLoadingTopicId(null);
    }
  };

  const handleConfirmMoverSemana = (semanaDestinoNum: number) => {
    if (!showEscolherSemanaModal) return;
    const targetTopicoId = showEscolherSemanaModal.topico.id;
    try {
      const res = moverTopicoDeSemana(targetTopicoId, semanaDestinoNum);
      if (res.success && res.data) {
        setCronograma(res.data);
        setSemanaAtiva(semanaDestinoNum);
      }
    } catch (err) {
      console.error('Erro ao mover de semana:', err);
      Alert.alert('Erro', 'Não foi possível mover o tópico de semana.');
    } finally {
      setShowEscolherSemanaModal(null);
      setTopicoMenuAberto(null);
    }
  };

  const handleConfirmExcluirTopico = () => {
    if (!topicoParaExcluir) return;
    try {
      const res = removerTopicoCronograma(topicoParaExcluir.topico.id);
      if (res.success && res.data) {
        setCronograma(res.data);
      }
    } catch (err) {
      console.error('Erro ao remover tópico:', err);
    } finally {
      setTopicoParaExcluir(null);
    }
  };

  const handleSalvarNovoTopico = async (
    semanaDestinoNum: number,
    novoTopicoPayload: Omit<CronogramaTopico, 'id'> & { id?: string }
  ): Promise<boolean> => {
    try {
      if (novoTopicoPayload.id) {
        const res = atualizarTopicoNoCronograma(novoTopicoPayload.id, novoTopicoPayload);
        if (res.success && res.data) {
          setCronograma(res.data);
          const daysData = getCronogramaDays();
          setDaysMap(daysData || {});
          if (novoTopicoPayload.assignedDay) setDiaAtivo(novoTopicoPayload.assignedDay);
          return true;
        } else {
          throw new Error(res.error || 'Falha ao atualizar lembrete.');
        }
      }

      const res = adicionarTopicoAoCronograma(semanaDestinoNum, novoTopicoPayload);
      if (res.success && res.data) {
        setCronograma(res.data);
        const daysData = getCronogramaDays();
        setDaysMap(daysData || {});
        if (semanaDestinoNum !== semanaAtiva) setSemanaAtiva(semanaDestinoNum);
        if (novoTopicoPayload.assignedDay) setDiaAtivo(novoTopicoPayload.assignedDay);
        return true;
      } else {
        throw new Error(res.error || 'Falha ao salvar lembrete.');
      }
    } catch (err: any) {
      console.error('Erro ao salvar lembrete:', err);
      Alert.alert('Erro', err?.message || 'Não foi possível salvar o lembrete.');
      return false;
    }
  };

  const handleAvancarSemana = () => {
    if (!semanasList.length) return;
    if (currentWeekIndex < semanasList.length - 1) {
      setSemanaAtiva(semanasList[currentWeekIndex + 1].numero);
    }
  };

  const handleRetrocederSemana = () => {
    if (!semanasList.length) return;
    if (currentWeekIndex > 0) {
      setSemanaAtiva(semanasList[currentWeekIndex - 1].numero);
    }
  };

  if (!cronograma || !semanasList.length) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: themeColors.background }]} edges={['top', 'left', 'right']}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={themeColors.background} />
        <AppHeader />

        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="calendar-outline" size={48} color={Colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>Nenhum Cronograma Ativo</Text>
          <Text style={styles.emptyDescription}>Importe seu arquivo de cronograma JSON nas Configurações para iniciar seu planejamento de estudos.</Text>
          <TouchableOpacity style={styles.settingsRedirectButton} onPress={() => router.push('/(tabs)/configuracoes')} activeOpacity={0.8}>
            <Ionicons name="settings-outline" size={18} color={Colors.primary} />
            <Text style={styles.settingsRedirectText}>Ir para Configurações</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: themeColors.background }]} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={themeColors.background} />

      <AppHeader />

      <View style={styles.weekSelectorWrapper}>
        <View style={styles.weekNavRow}>
          <TouchableOpacity
            style={[styles.searchIconButton, (showSearch || searchText.length > 0) && styles.searchIconButtonActive]}
            onPress={() => {
              if (showSearch) { setShowSearch(false); setSearchText(''); }
              else { setShowSearch(true); }
            }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.7}
          >
            <Ionicons name={showSearch || searchText.length > 0 ? 'close' : 'search'} size={20} color={showSearch || searchText.length > 0 ? Colors.primary : Colors.textSecondary} />
          </TouchableOpacity>

          <View style={styles.weekStepperCenter}>
            <TouchableOpacity onPress={handleRetrocederSemana} disabled={isFirstWeek} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} activeOpacity={0.6}>
              <Ionicons name="chevron-back" size={22} color={isFirstWeek ? '#34383E' : '#FFFFFF'} />
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setShowWeekOverviewModal(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} activeOpacity={0.7}>
              <Text style={styles.weekTextOnly}>Semana {semanaAtiva}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleAvancarSemana} disabled={isLastWeek} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} activeOpacity={0.6}>
              <Ionicons name="chevron-forward" size={22} color={isLastWeek ? '#34383E' : '#FFFFFF'} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.weekProgressRingButton} onPress={() => setShowWeekOverviewModal(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.7}>
            <CircularProgressRing progress={statsSemana.porcentagem} size={30} strokeWidth={3} color={Colors.primary} backgroundColor="#22252A" showText={false} />
          </TouchableOpacity>
        </View>

        {showSearch && (
          <View style={styles.searchBarRow}>
            <Ionicons name="search" size={16} color={Colors.primary} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar matérias, temas ou aulas..."
              placeholderTextColor="#8E959E"
              value={searchText}
              onChangeText={setSearchText}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="default"
              inputMode="text"
              textContentType="none"
              returnKeyType="search"
              blurOnSubmit={false}
            />
            {searchText.length > 0 && (
              <TouchableOpacity onPress={() => setSearchText('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={18} color="#8E959E" />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {searchText.trim().length > 0 ? (
        <FlatList
          data={searchResults}
          keyExtractor={(item) => `search_${item.id}_${item.semanaNumero}`}
          contentContainerStyle={styles.searchResultsList}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.noSearchBox}>
              <Ionicons name="search-outline" size={32} color="#454A52" />
              <Text style={styles.noSearchText}>Nenhum resultado encontrado para "{searchText}"</Text>
            </View>
          }
          renderItem={({ item }) => {
            const topicColor = getTopicColor(item.area, item.especialidade, item.grandeArea, item.topicoTitulo);
            const cardFillBg = isDark ? hexToRgba(topicColor, 0.12) : hexToRgba(topicColor, 0.08);
            const cardBorderColor = isDark ? hexToRgba(topicColor, 0.28) : hexToRgba(topicColor, 0.20);
            return (
              <View style={styles.topicCardWrapper}>
                <View style={[styles.topicLeftIndicator, { backgroundColor: topicColor }]} />
                <TouchableOpacity
                  style={[
                    styles.searchResultCard,
                    {
                      backgroundColor: cardFillBg,
                      borderColor: cardBorderColor,
                    },
                  ]}
                  activeOpacity={0.7}
                  onPress={() => {
                    setSemanaAtiva(item.semanaNumero);
                    setDiaAtivo(item.assignedDay);
                    setExpandedTopicIds((prev) => new Set([...prev, `${item.id}_${item.assignedDay}`, item.id]));
                    setSearchText('');
                    setShowSearch(false);
                  }}
                >
                  <View style={styles.searchResultContent}>
                    <View style={styles.searchResultTopRow}>
                      <View style={[styles.specialtyBadgePill, { borderColor: `${topicColor}40`, backgroundColor: `${topicColor}18` }]}>
                        <Text style={[styles.topicAreaText, { color: topicColor }]}>{formatTopicSpecialtyLabel(item.area, item.especialidade)}</Text>
                      </View>
                      <Text style={styles.searchResultWeekBadge}>Semana {item.semanaNumero} • {DIAS_SEMANA_LISTA.find((d) => d.id === item.assignedDay)?.shortLabel}</Text>
                    </View>
                    <Text style={styles.searchResultTitle}>{item.topicoTitulo}</Text>
                    {item.matchedDetail ? (
                      <View style={styles.searchMatchedDetailRow}>
                        <Ionicons name="search" size={11} color={Colors.primary} style={{ marginRight: 4 }} />
                        <Text style={styles.searchMatchedDetailText} numberOfLines={1}>
                          <Text style={styles.searchMatchedDetailLabel}>{item.matchSource ? `${item.matchSource}: ` : ''}</Text>
                          {item.matchedDetail}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Ionicons name="arrow-forward" size={16} color="#68707B" />
                </TouchableOpacity>
              </View>
            );
          }}
        />
      ) : (
        <>
          <View style={styles.daySelectorWrapper}>
            <ScrollView ref={dayScrollViewRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.daySelectorContent}>
              {DIAS_SEMANA_LISTA.map((dia) => {
                const isSelected = diaAtivo === dia.id;
                const displayStatus = dayDisplayStatusMap[dia.id];
                const isLate = displayStatus === 'late';
                const isDone = displayStatus === 'done';

                return (
                  <TouchableOpacity
                    key={dia.id}
                    style={[styles.dayPillVertical, isDone && styles.dayPillVerticalDone, isLate && styles.dayPillVerticalLate, isSelected && (isLate ? styles.dayPillVerticalLateSelected : isDone ? styles.dayPillVerticalDoneSelected : styles.dayPillVerticalSelected)]}
                    onPress={() => setDiaAtivo(dia.id)}
                    hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.dayPillTopSegment}>
                      <Text style={[styles.dayPillAbbrText, isDone && styles.dayPillAbbrTextDone, isLate && styles.dayPillAbbrTextLate, isSelected && !isLate && !isDone && styles.dayPillAbbrTextSelected]}>
                        {DIA_ABBR_MAP[dia.id] || dia.shortLabel}
                      </Text>
                    </View>
                    <View style={styles.dayPillBottomSegment}>
                      {displayStatus === 'done' ? (
                        <View style={styles.dayStatusDoneCircle}>
                          <Ionicons name="checkmark" size={11} color="#FFFFFF" />
                        </View>
                      ) : displayStatus === 'late' ? (
                        <View style={styles.dayStatusLateCircle}>
                          <Ionicons name="close" size={12} color="#FFFFFF" />
                        </View>
                      ) : displayStatus === 'in_progress' ? (
                        <View style={styles.dayStatusProgressOuter}>
                          <View style={styles.dayStatusProgressInner} />
                        </View>
                      ) : (
                        <View style={styles.dayStatusEmptyCircle} />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <FlatList
            data={topicosFiltrados}
            keyExtractor={(item) => item.cardKey}
            contentContainerStyle={styles.topicsListContent}
            ListEmptyComponent={
              <View style={styles.emptyDayContainer}>
                <Ionicons name="cafe-outline" size={44} color="#454A52" />
                <Text style={styles.emptyDayTitle}>
                  {`Nenhum tópico para ${DIAS_SEMANA_LISTA.find((d) => d.id === diaAtivo)?.label}`}
                </Text>
                <Text style={styles.emptyDaySub}>
                  Aproveite para revisar ou adiantar matérias de outros dias.
                </Text>
              </View>
            }
            renderItem={({ item: cardItem }) => {
              const item = cardItem.topico;
              const isExpanded = expandedTopicIds.has(cardItem.cardKey);
              const topicColor = getTopicColor(item.area, item.especialidade, item.grandeArea, item.titulo);
              const topicProgress = cardItem.topicProgress;
              const isCardDone = cardItem.isCardDone;
              const passos = cardItem.passos;

              const isLembrete = item.isLembrete || item.area === 'Lembrete';
              const passoLembrete = passos[0];
              const stepUniqueIdLembrete = passoLembrete ? getStepUniqueId(passoLembrete, 0) : 'step_0';
              const lembreteConcluido = passoLembrete
                ? isStepConcluido(progresso, item.id, stepUniqueIdLembrete, passoLembrete.tipo)
                : isCardDone;

              if (isLembrete) {
                const lembreteColor = '#F59E0B';
                const lembreteFillBg = isDark ? hexToRgba(lembreteColor, 0.12) : hexToRgba(lembreteColor, 0.08);
                const lembreteBorder = lembreteConcluido
                  ? themeColors.success
                  : (isDark ? hexToRgba(lembreteColor, 0.28) : hexToRgba(lembreteColor, 0.20));

                return (
                  <View style={styles.topicCardWrapper}>
                    <View style={[styles.topicLeftIndicator, { backgroundColor: lembreteConcluido ? Colors.success : lembreteColor }]} />
                    <View
                      style={[
                        styles.topicCardContainer,
                        {
                          backgroundColor: lembreteConcluido ? themeColors.success : lembreteFillBg,
                          borderColor: lembreteBorder,
                        },
                        lembreteConcluido && styles.topicCardContainerDone,
                      ]}
                    >
                      <TouchableOpacity
                        style={[styles.lembreteCardClosed, lembreteConcluido && styles.lembreteCardClosedDone]}
                        onPress={() => passoLembrete && handleToggleStep(item.id, stepUniqueIdLembrete)}
                        activeOpacity={0.8}
                      >
                        <TouchableOpacity
                          style={[styles.checkboxBox, lembreteConcluido && styles.checkboxBoxConcluido, { marginRight: 12 }]}
                          onPress={() => passoLembrete && handleToggleStep(item.id, stepUniqueIdLembrete)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          activeOpacity={0.8}
                        >
                          {lembreteConcluido && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                        </TouchableOpacity>

                        <View style={styles.topicCenterContent}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <Text
                              style={[
                                styles.topicTitleText,
                                lembreteConcluido && styles.lembreteTitleDone,
                                { flex: 1 },
                              ]}
                              numberOfLines={2}
                            >
                              {item.titulo}
                            </Text>
                            <View style={[styles.lembreteBadgePill, lembreteConcluido && styles.lembreteBadgePillDone]}>
                              <Ionicons name="bookmark-outline" size={10} color={lembreteConcluido ? '#FFFFFF' : '#F59E0B'} style={{ marginRight: 3 }} />
                              <Text style={[styles.topicAreaText, { color: lembreteConcluido ? '#FFFFFF' : '#F59E0B' }]}>
                                Lembrete
                              </Text>
                            </View>
                          </View>
                          {item.descricao || (passoLembrete && passoLembrete.detalhe && passoLembrete.detalhe !== item.titulo) ? (
                            <Text
                              style={[
                                styles.lembreteDescText,
                                lembreteConcluido && styles.lembreteDescDone,
                              ]}
                              numberOfLines={2}
                            >
                              {item.descricao || passoLembrete?.detalhe}
                            </Text>
                          ) : null}
                        </View>

                        <View style={styles.topicRightControls}>
                          <TouchableOpacity
                            style={styles.threeDotsButton}
                            onPress={() =>
                              setTopicoMenuAberto({
                                topico: item,
                                semanaOrigemNumero: semanaAtiva,
                                currentDay: daysMap[item.id] || diaAtivo,
                              })
                            }
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          >
                            <Ionicons name="ellipsis-vertical" size={16} color={lembreteConcluido ? '#FFFFFF' : '#8E959E'} />
                          </TouchableOpacity>
                        </View>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              }

              const cardFillBg = isDark ? hexToRgba(topicColor, 0.12) : hexToRgba(topicColor, 0.08);
              const cardBorderColor = isCardDone
                ? themeColors.success
                : isDark
                ? hexToRgba(topicColor, 0.28)
                : hexToRgba(topicColor, 0.20);

              return (
                <View style={styles.topicCardWrapper}>
                  <View style={[styles.topicLeftIndicator, { backgroundColor: isCardDone ? Colors.success : topicColor }]} />
                  <View
                    style={[
                      styles.topicCardContainer,
                      {
                        backgroundColor: isCardDone ? themeColors.success : cardFillBg,
                        borderColor: cardBorderColor,
                      },
                      isCardDone && styles.topicCardContainerDone,
                    ]}
                  >
                  <TouchableOpacity
                    style={[styles.topicCardClosed, isCardDone && styles.topicCardClosedDone, isExpanded && (isCardDone ? styles.topicCardOpenHeaderDone : styles.topicCardOpenHeader)]}
                    onPress={() => toggleCardExpand(cardItem.cardKey, item.id)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.topicCenterContent}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <View style={[styles.specialtyBadgePill, { marginBottom: 0 }, isCardDone ? styles.specialtyBadgePillDone : { borderColor: `${topicColor}40`, backgroundColor: `${topicColor}18` }]}>
                          <Text style={[styles.topicAreaText, { color: isCardDone ? '#FFFFFF' : topicColor }]} numberOfLines={1}>
                            {formatTopicSpecialtyLabel(item.area, item.especialidade)}
                          </Text>
                        </View>
                        {!item.isRevisao && item.estimativaMinutos ? (
                          <View style={[styles.specialtyBadgePill, { marginBottom: 0, marginLeft: 0, flexDirection: 'row', alignItems: 'center' }, isCardDone ? styles.specialtyBadgePillDone : { backgroundColor: '#1A1D20', borderColor: '#2E3339' }]}>
                            <Ionicons name="time-outline" size={10} color={isCardDone ? '#FFFFFF' : '#8E959E'} style={{ marginRight: 4 }} />
                            <Text style={[styles.topicAreaText, { color: isCardDone ? '#FFFFFF' : '#8E959E' }]}>{formatarEstimativaTempo(item.estimativaMinutos)}</Text>
                          </View>
                        ) : null}
                        {item.isRevisao ? (
                          <View style={[styles.specialtyBadgePill, { marginBottom: 0, marginLeft: 0, paddingHorizontal: 5, paddingVertical: 3, justifyContent: 'center', alignItems: 'center' }, isCardDone ? styles.specialtyBadgePillDone : { backgroundColor: 'rgba(167, 139, 250, 0.15)', borderColor: 'rgba(167, 139, 250, 0.4)' }]}>
                            <Ionicons name="repeat" size={12} color={isCardDone ? '#FFFFFF' : '#A78BFA'} />
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.topicTitleText} numberOfLines={1}>{item.titulo}</Text>
                    </View>
                    <View style={styles.topicRightControls}>
                      <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={isCardDone ? '#FFFFFF' : '#68707B'} />
                      <CircularProgressRing progress={topicProgress} size={38} strokeWidth={3.5} color={isCardDone ? '#FFFFFF' : topicColor} backgroundColor={isCardDone ? 'rgba(0, 0, 0, 0.25)' : '#26292C'} completedColor={isCardDone ? '#FFFFFF' : '#10B981'} />
                      <TouchableOpacity
                        style={styles.threeDotsButton}
                        onPress={() => setTopicoMenuAberto({ topico: item, semanaOrigemNumero: semanaAtiva, currentDay: item.isRevisao ? daysMap[item.id] || diaAtivo : diaAtivo })}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons name="ellipsis-vertical" size={16} color={isCardDone ? '#FFFFFF' : '#8E959E'} />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>

                  <TopicAccordionBody isExpanded={isExpanded}>
                    <View style={styles.accordionBody}>
                      <Text style={styles.studyTrailHeading}>{item.isRevisao ? 'Checklist de Revisão Espaçada:' : 'Checklist do Dia:'}</Text>
                      <View style={styles.checklistContainer}>
                        {passos.map((passo, passoIdx) => {
                          const stepUniqueId = getStepUniqueId(passo, passoIdx);
                          const dbPassosList = dbPassosMap[item.id];
                          const dbPasso = dbPassosList?.find(
                            (dp) => String(dp.id) === (passo as any).id || (dp.tipo === passo.tipo && (dp.label === passo.label || dp.detalhe === passo.detalhe))
                          );
                          const concluido = dbPasso !== undefined
                            ? dbPasso.concluido === 1
                            : isStepConcluido(progresso, item.id, stepUniqueId, passo.tipo);
                          const passoDbId = dbPasso?.id;
                          const isQuestoes = passo.tipo === 'questoes';
                          const isQuizLoadingThis = quizLoadingTopicId === item.id && isQuestoes;
                          const stepConfig = STEP_ICONS[passo.tipo as FlowStepType] || { icon: 'checkmark-circle-outline', label: passo.label };
                          const displayLabel = item.isRevisao
                            ? (passo.tipo === 'questoes' ? 'Questões de Revisão' : passo.tipo === 'flashcards' ? 'Flashcards' : passo.label || stepConfig.label)
                            : (passo.tipo === 'aulas' && (passo.label === 'Aulas' || !passo.label) ? 'Aulas principais' : passo.tipo === 'aulas_bonus' && (!passo.label || passo.label === 'Aulas' || passo.label === 'Aulas bonus') ? 'Aulas bônus' : (passo.label || stepConfig.label));

                          return (
                            <TouchableOpacity
                              key={`${item.id}_${stepUniqueId}`}
                              style={[styles.checklistItemRow, concluido && styles.checklistItemRowConcluido]}
                              onPress={() => {
                                if (isQuestoes) handleStartQuizForTopic(item, passo, concluido);
                                else handleToggleStep(item.id, stepUniqueId, passoDbId);
                              }}
                              activeOpacity={0.7}
                            >
                              <TouchableOpacity style={[styles.checkboxBox, concluido && styles.checkboxBoxConcluido]} onPress={() => handleToggleStep(item.id, stepUniqueId, passoDbId)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.8}>
                                {concluido && <Ionicons name="checkmark" size={13} color="#FFFFFF" />}
                              </TouchableOpacity>
                              <View style={[styles.stepIconBox, concluido && styles.stepIconBoxConcluido]}>
                                <Ionicons name={stepConfig.icon} size={22} color={concluido ? '#34D399' : isQuestoes ? Colors.primary : '#FFFFFF'} />
                              </View>
                              <View style={styles.stepInfoCol}>
                                <View style={styles.stepTitleLine}>
                                  <Text style={[styles.stepTitleText, concluido && styles.stepTitleTextConcluido]}>{displayLabel}</Text>
                                </View>
                                {passo.detalhe && (!item.isRevisao || passo.tipo !== 'flashcards') ? (
                                  <Text style={[styles.stepDetailText, concluido && styles.stepDetailTextConcluido]} numberOfLines={2}>
                                    {passo.detalhe}
                                  </Text>
                                ) : null}
                              </View>
                              {isQuestoes && (
                                <TouchableOpacity style={[styles.stepActionQuizBtn, concluido && { backgroundColor: '#2A2E37' }]} onPress={() => handleStartQuizForTopic(item, passo, concluido)} activeOpacity={0.8}>
                                  {isQuizLoadingThis ? (
                                    <ActivityIndicator size="small" color={concluido ? '#FFFFFF' : '#0D0E11'} />
                                  ) : (
                                    <>
                                      <Ionicons name={concluido ? 'refresh' : 'play'} size={13} color={concluido ? '#FFFFFF' : '#0D0E11'} />
                                      <Text style={[styles.stepActionQuizText, concluido && { color: '#FFFFFF' }]}>{concluido ? 'Revisar Erros' : 'Iniciar'}</Text>
                                    </>
                                  )}
                                </TouchableOpacity>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      <View style={styles.accordionFooter}>
                        <Text style={styles.accordionFooterProgress}>
                          {passos.filter((p, pIdx) => isStepConcluido(progresso, item.id, getStepUniqueId(p, pIdx), p.tipo)).length}/
                          {passos.length} tarefas de hoje concluídas
                        </Text>
                      </View>
                    </View>
                  </TopicAccordionBody>
                  </View>
                </View>
              );
            }}
          />
        </>
      )}

      <ModalsMenuTopico
        topicoMenuAberto={topicoMenuAberto}
        setTopicoMenuAberto={setTopicoMenuAberto}
        showMoveDayModal={showMoveDayModal}
        setShowMoveDayModal={setShowMoveDayModal}
        showEscolherSemanaModal={showEscolherSemanaModal}
        setShowEscolherSemanaModal={setShowEscolherSemanaModal}
        semanasList={semanasList}
        progresso={progresso}
        onMoveToDay={handleMoveToDay}
        onConfirmMoverSemana={handleConfirmMoverSemana}
        onRequestDeleteTopico={(topico, semanaOrigemNumero) => setTopicoParaExcluir({ topico, semanaOrigemNumero })}
        onRequestEditLembrete={(topico) => {
          setTopicoParaEditar(topico);
          setShowNovoTopicoModal(true);
        }}
      />

      <ModalConfirmarExclusaoTopico
        topicoParaExcluir={topicoParaExcluir}
        onCancel={() => setTopicoParaExcluir(null)}
        onConfirm={handleConfirmExcluirTopico}
      />

      <ModalVisaoGeralSemanas
        visible={showWeekOverviewModal}
        onClose={() => setShowWeekOverviewModal(false)}
        semanasList={semanasList}
        semanaAtiva={semanaAtiva}
        progresso={progresso}
        onSelectSemana={(semanaNum) => setSemanaAtiva(semanaNum)}
      />

      <TouchableOpacity
        style={styles.fabButton}
        onPress={() => {
          setTopicoParaEditar(null);
          setShowNovoTopicoModal(true);
        }}
        activeOpacity={0.85}
        accessibilityLabel="Adicionar lembrete"
        accessibilityRole="button"
      >
        <Ionicons name="add" size={30} color={isDark ? '#000000' : '#FFFFFF'} />
      </TouchableOpacity>

      <ModalNovoTopico
        visible={showNovoTopicoModal}
        onClose={() => {
          setShowNovoTopicoModal(false);
          setTopicoParaEditar(null);
        }}
        semanasList={semanasList}
        semanaAtivaNumero={semanaAtiva}
        diaSugerido={diaAtivo}
        topicoParaEditar={topicoParaEditar}
        onSalvar={handleSalvarNovoTopico}
      />
    </SafeAreaView>
  );
}

function createStyles(theme: ActiveThemeColors, isDark: boolean) {
  const cardBorder = theme.border;
  const subtleBorder = theme.borderSubtle;
  const cardBg = theme.surfaceCard;

  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.background,
    },
    centerBox: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadingText: {
      marginTop: 12,
      color: theme.textSecondary,
      fontSize: 14,
    },
    headerContainer: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: cardBorder,
      backgroundColor: theme.background,
    },
    headerTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    headerIcon: {
      marginRight: 10,
    },
    headerTitle: {
      fontSize: 24,
      fontWeight: '800',
      color: theme.text,
      letterSpacing: -0.5,
    },
    headerSubtitle: {
      fontSize: 14,
      color: theme.textSecondary,
      marginTop: 4,
      lineHeight: 20,
      textAlign: 'left',
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: cardBg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: cardBorder,
      paddingHorizontal: 12,
      height: 44,
      marginTop: 12,
      marginBottom: 4,
    },
    searchIcon: {
      marginRight: 8,
    },
    searchBarRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: cardBg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: cardBorder,
      paddingHorizontal: 12,
      height: 42,
      marginTop: 10,
    },
    searchInput: {
      flex: 1,
      color: theme.text,
      fontSize: 14,
      padding: 0,
      paddingVertical: 0,
    },
    weekSelectorWrapper: {
      paddingHorizontal: 16,
      paddingTop: 0,
      paddingBottom: 10,
      backgroundColor: 'transparent',
    },
    weekNavRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    searchIconButton: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchIconButtonActive: {
      backgroundColor: theme.primarySubtle,
      borderRadius: 16,
    },
    weekStepperCenter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 18,
    },
    weekTextOnly: {
      fontSize: 17,
      fontWeight: '800',
      color: theme.text,
      letterSpacing: -0.3,
    },
    weekProgressRingButton: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchResultsList: {
      padding: 16,
      gap: 10,
    },
    searchResultCard: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: cardBg,
      borderRadius: 12,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: cardBorder,
      overflow: 'hidden',
    },
    searchResultContent: {
      flex: 1,
      paddingVertical: 10,
    },
    searchResultTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    searchResultArea: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    searchResultWeekBadge: {
      fontSize: 10,
      color: theme.textSecondary,
    },
    searchResultTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.text,
    },
    searchMatchedDetailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 4,
      backgroundColor: theme.primarySubtle,
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 6,
      alignSelf: 'flex-start',
      maxWidth: '100%',
    },
    searchMatchedDetailLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.primary,
    },
    searchMatchedDetailText: {
      fontSize: 11,
      color: theme.text,
    },
    noSearchBox: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 40,
    },
    noSearchText: {
      color: theme.textSecondary,
      fontSize: 14,
      marginTop: 10,
      textAlign: 'center',
    },
    daySelectorWrapper: {
      backgroundColor: theme.background,
      paddingVertical: 10,
    },
    daySelectorContent: {
      paddingHorizontal: 16,
      gap: 8,
    },
    dayPillVertical: {
      width: 48,
      height: 58,
      borderRadius: 12,
      backgroundColor: cardBg,
      borderWidth: 1.5,
      borderColor: isDark ? 'transparent' : subtleBorder,
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 7,
    },
    dayPillVerticalSelected: {
      backgroundColor: isDark ? '#27291a' : theme.surface,
      borderColor: theme.primary,
    },
    dayPillRevSelected: {
      backgroundColor: isDark ? 'rgba(167, 139, 250, 0.15)' : 'rgba(139, 92, 246, 0.10)',
      borderColor: '#A78BFA',
    },
    dayPillRevDone: {
      backgroundColor: isDark ? 'rgba(139, 92, 246, 0.12)' : 'rgba(139, 92, 246, 0.08)',
      borderColor: '#8B5CF6',
    },
    dayPillRevDoneSelected: {
      backgroundColor: isDark ? 'rgba(139, 92, 246, 0.25)' : 'rgba(139, 92, 246, 0.16)',
      borderColor: '#A78BFA',
    },
    dayRevBadgeCircle: {
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: '#8B5CF6',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 3,
    },
    dayRevBadgeText: {
      fontSize: 9,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    dayPillVerticalDone: {
      backgroundColor: isDark ? '#122019' : 'rgba(16, 185, 129, 0.08)',
      borderColor: '#10B981',
    },
    dayPillVerticalDoneSelected: {
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.22)' : 'rgba(16, 185, 129, 0.15)',
      borderColor: '#34D399',
    },
    dayPillVerticalLate: {
      backgroundColor: isDark ? '#261416' : 'rgba(239, 68, 68, 0.08)',
      borderColor: '#EF4444',
    },
    dayPillVerticalLateSelected: {
      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.15)',
      borderColor: '#F87171',
    },
    dayPillTopSegment: {
      alignItems: 'center',
      justifyContent: 'center',
      flex: 1,
    },
    dayPillAbbrText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.textSecondary,
      letterSpacing: -0.2,
    },
    dayPillAbbrTextSelected: {
      color: theme.primary,
      fontWeight: '800',
    },
    dayPillAbbrTextDone: {
      color: '#10B981',
      fontWeight: '800',
    },
    dayPillRevAbbrTextDone: {
      color: '#A78BFA',
      fontWeight: '800',
    },
    dayPillAbbrTextLate: {
      color: '#EF4444',
      fontWeight: '800',
    },
    dayPillBottomSegment: {
      alignItems: 'center',
      justifyContent: 'center',
      flex: 1,
    },
    dayStatusDoneCircle: {
      width: 17,
      height: 17,
      borderRadius: 8.5,
      backgroundColor: '#10B981',
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayStatusRevDoneCircle: {
      width: 17,
      height: 17,
      borderRadius: 8.5,
      backgroundColor: '#8B5CF6',
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayStatusLateCircle: {
      width: 17,
      height: 17,
      borderRadius: 8.5,
      backgroundColor: '#EF4444',
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayStatusProgressOuter: {
      width: 17,
      height: 17,
      borderRadius: 8.5,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayStatusProgressInner: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
      backgroundColor: theme.background,
    },
    dayStatusEmptyCircle: {
      width: 17,
      height: 17,
      borderRadius: 8.5,
      borderWidth: 1.5,
      borderColor: cardBorder,
      backgroundColor: 'transparent',
    },
    topicsListContent: {
      padding: 16,
      gap: 12,
      paddingBottom: 96,
    },
    topicCardWrapper: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: 8,
    },
    topicLeftIndicator: {
      width: 4.5,
      borderRadius: 3,
      alignSelf: 'stretch',
    },
    topicCardContainer: {
      flex: 1,
      backgroundColor: cardBg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: cardBorder,
      overflow: 'hidden',
    },
    topicCardContainerDone: {
      borderColor: theme.success,
    },
    topicCardClosed: {
      height: 65,
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: 16,
      paddingRight: 12,
    },
    topicCardClosedDone: {
      backgroundColor: theme.success,
    },
    topicCardOpenHeader: {
      borderBottomWidth: 1,
      borderBottomColor: cardBorder,
    },
    topicCardOpenHeaderDone: {
      backgroundColor: theme.success,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(0, 0, 0, 0.15)',
    },
    topicCenterContent: {
      flex: 1,
      paddingRight: 12,
      justifyContent: 'center',
    },
    specialtyBadgePill: {
      alignSelf: 'flex-start',
      borderRadius: 6,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderWidth: 1,
      marginBottom: 4,
    },
    specialtyBadgePillDone: {
      backgroundColor: 'rgba(0, 0, 0, 0.2)',
      borderColor: 'rgba(255, 255, 255, 0.35)',
    },
    topicAreaText: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.2,
    },
    topicTitleText: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.text,
      letterSpacing: -0.2,
    },
    topicRightControls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    threeDotsButton: {
      padding: 4,
    },
    accordionBody: {
      padding: 14,
      backgroundColor: isDark ? '#141618' : '#F7F7F6',
    },
    accordionBodyDone: {
      backgroundColor: '#388E3C',
    },
    secondaryTopicsBox: {
      backgroundColor: theme.surface,
      padding: 10,
      borderRadius: 8,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: cardBorder,
    },
    secondaryTopicsTitle: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.textSecondary,
      marginBottom: 4,
      textTransform: 'uppercase',
    },
    secondaryTopicsText: {
      fontSize: 12,
      color: theme.text,
      lineHeight: 17,
    },
    studyTrailHeading: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.textSecondary,
      textTransform: 'uppercase',
      marginBottom: 10,
      letterSpacing: 0.5,
    },
    checklistContainer: {
      gap: 8,
      marginBottom: 12,
    },
    checklistItemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.surface,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: cardBorder,
      gap: 12,
    },
    checklistItemRowConcluido: {
      backgroundColor: 'rgba(16, 185, 129, 0.08)',
      borderColor: 'rgba(16, 185, 129, 0.28)',
      opacity: 0.95,
    },
    checklistItemRowDoneCard: {
      backgroundColor: 'rgba(0, 0, 0, 0.2)',
      borderColor: 'rgba(0, 0, 0, 0.25)',
      opacity: 0.95,
    },
    checkboxBox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: isDark ? '#424855' : '#D1D5DB',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    checkboxBoxConcluido: {
      backgroundColor: '#10B981',
      borderColor: '#10B981',
    },
    checkboxBoxDoneCard: {
      backgroundColor: 'rgba(0, 0, 0, 0.3)',
      borderColor: 'rgba(255, 255, 255, 0.4)',
    },
    stepIconBox: {
      width: 36,
      height: 36,
      borderRadius: 9,
      backgroundColor: isDark ? '#20242C' : 'rgba(0, 0, 0, 0.04)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepIconBoxConcluido: {
      backgroundColor: 'rgba(16, 185, 129, 0.16)',
    },
    stepIconBoxDoneCard: {
      backgroundColor: 'rgba(0, 0, 0, 0.2)',
    },
    stepInfoCol: {
      flex: 1,
      justifyContent: 'center',
    },
    stepTitleLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    stepTitleText: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.text,
    },
    stepTitleTextConcluido: {
      color: '#A7F3D0',
      textDecorationLine: 'line-through',
    },
    stepTitleTextDoneCard: {
      color: '#FFFFFF',
      textDecorationLine: 'line-through',
    },
    stepDetailText: {
      fontSize: 12,
      color: theme.textSecondary,
      marginTop: 2,
      lineHeight: 16,
    },
    stepDetailTextConcluido: {
      color: 'rgba(167, 243, 208, 0.65)',
      textDecorationLine: 'line-through',
    },
    stepDetailTextDoneCard: {
      color: 'rgba(255, 255, 255, 0.8)',
      textDecorationLine: 'line-through',
    },
    stepMetaBadge: {
      backgroundColor: theme.primarySubtle,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: theme.primaryBorder,
    },
    stepMetaBadgeConcluido: {
      backgroundColor: 'rgba(16, 185, 129, 0.12)',
      borderColor: 'rgba(16, 185, 129, 0.25)',
    },
    stepMetaBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: theme.primary,
    },
    stepMetaBadgeTextConcluido: {
      color: '#A7F3D0',
      textDecorationLine: 'line-through',
    },
    stepActionQuizBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.primary,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 8,
      gap: 5,
    },
    stepActionQuizText: {
      fontSize: 13,
      fontWeight: '800',
      color: isDark ? '#000000' : '#FFFFFF',
      letterSpacing: -0.2,
    },
    accordionFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: cardBorder,
    },
    accordionFooterProgress: {
      fontSize: 11,
      color: theme.textSecondary,
      fontWeight: '600',
    },
    emptyDayContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 50,
      paddingHorizontal: 20,
    },
    emptyDayTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.text,
      marginTop: 12,
      textAlign: 'center',
    },
    emptyDaySub: {
      fontSize: 13,
      color: theme.textSecondary,
      marginTop: 6,
      textAlign: 'center',
      lineHeight: 18,
    },
    emptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    emptyIconCircle: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: theme.primarySubtle,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: theme.text,
      marginBottom: 8,
      textAlign: 'center',
    },
    emptyDescription: {
      fontSize: 14,
      color: theme.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 24,
    },
    demoButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.primary,
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 20,
      gap: 8,
      marginBottom: 12,
      width: '100%',
      justifyContent: 'center',
    },
    demoButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: isDark ? '#000000' : '#FFFFFF',
    },
    settingsRedirectButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: cardBg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: cardBorder,
      paddingVertical: 14,
      paddingHorizontal: 20,
      gap: 8,
      width: '100%',
      justifyContent: 'center',
    },
    settingsRedirectText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.primary,
    },
    fabButton: {
      position: 'absolute',
      bottom: 24,
      right: 20,
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.35 : 0.15,
      shadowRadius: 6,
      elevation: 8,
      zIndex: 99,
    },
    lembreteCardClosed: {
      minHeight: 65,
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: 14,
      paddingRight: 12,
      paddingVertical: 12,
    },
    lembreteCardClosedDone: {
      backgroundColor: theme.success,
    },
    lembreteBadgePill: {
      alignSelf: 'flex-start',
      borderRadius: 6,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderWidth: 1,
      borderColor: 'rgba(245, 158, 11, 0.4)',
      backgroundColor: 'rgba(245, 158, 11, 0.12)',
      flexDirection: 'row',
      alignItems: 'center',
    },
    lembreteBadgePillDone: {
      backgroundColor: 'rgba(0, 0, 0, 0.2)',
      borderColor: 'rgba(255, 255, 255, 0.35)',
    },
    lembreteTitleDone: {
      textDecorationLine: 'line-through',
      color: 'rgba(255, 255, 255, 0.85)',
    },
    lembreteDescText: {
      fontSize: 12,
      color: theme.textSecondary,
      marginTop: 2,
      lineHeight: 16,
    },
    lembreteDescDone: {
      textDecorationLine: 'line-through',
      color: 'rgba(255, 255, 255, 0.65)',
    },
  });
}
