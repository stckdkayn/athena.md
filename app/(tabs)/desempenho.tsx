import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';

import { Colors, ActiveThemeColors } from '@/constants/Colors';
import { useAppTheme } from '@/context/ThemeContext';
import AppHeader from '@/components/AppHeader';
import {
  getDatabase,
  getMemoryHealthSummary,
  getQuestionTimeStats,
  MemoryHealthSummary,
  QuestionTimeStats,
} from '@/services/database';
import { GargaloDetalheModal, BottleneckTheme, FocoMetrica } from '@/components/modals/GargaloDetalheModal';
import { TreinoFocadoModal, TargetTreinoGargalo, MicroFocoTreinoOption } from '@/components/modals/TreinoFocadoModal';
import { AthenaDialogModal, AthenaDialogVariant } from '@/components/modals/AthenaDialogModal';
import { MetaDiariaModal } from '@/components/modals/MetaDiariaModal';
import EvolucaoMensalChart from '@/components/EvolucaoMensalChart';
import CircularProgressRing from '@/components/CircularProgressRing';
import MemoryDonutChart from '@/components/MemoryDonutChart';
import ThemeDonutChart, { ThemeDistributionSegment } from '@/components/ThemeDonutChart';
import { TemasDetalheModal, TemaDetalhadoItem } from '@/components/modals/TemasDetalheModal';
import {
  getQuestoesCache,
  getQuestionsByThemes,
  saveActiveQuizSession,
  clearActiveQuizSession,
} from '@/services/questionService';
import { generateDailySession } from '@/services/studyAgentService';
import { storage } from '@/services/storage';

export type TimeRangeOption = 'hoje' | '7dias' | '30dias' | 'geral';

function getAproveitamentoCor(taxa: number): string {
  if (taxa <= 25) return '#EF4444';
  if (taxa <= 50) return '#F97316';
  if (taxa <= 75) return '#EAB308';
  if (taxa <= 90) return '#10B981';
  return '#3B82F6';
}

function formatSegundosEmTempo(segundos: number): string {
  if (!segundos || segundos <= 0) return '0s';
  const min = Math.floor(segundos / 60);
  const seg = segundos % 60;
  if (min === 0) return `${seg}s`;
  if (seg === 0) return `${min}m`;
  return `${min}m ${seg}s`;
}

function formatSegundosEmHoras(segundos: number): string {
  if (!segundos || segundos <= 0) return '0m';
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  if (h === 0) return `${Math.max(1, m)}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function getQuestionId(q: any, idx: number): string {
  const rawId = q?.id ?? q?.id_questao ?? q?._id;
  if (rawId !== undefined && rawId !== null && String(rawId).trim() !== '') {
    return String(rawId).trim();
  }
  return `q_${idx}`;
}

const PALETA_TEMAS = [
  '#EAE115', // Amarelo de destaque padrão Athena
  '#3B82F6', // Azul
  '#10B981', // Verde Esmeralda
  '#8B5CF6', // Roxo
  '#F97316', // Laranja
  '#EC4899', // Rosa
];

export default function DesempenhoScreen() {
  const { colors: themeColors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(themeColors, isDark), [themeColors, isDark]);
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();

  const [loading, setLoading] = useState<boolean>(true);
  const [timeRange, setTimeRange] = useState<TimeRangeOption>('hoje');

  // Métricas gerais
  const [totalQuestoes, setTotalQuestoes] = useState<number>(0);
  const [totalAcertos, setTotalAcertos] = useState<number>(0);
  const [aproveitamento, setAproveitamento] = useState<number>(0);

  // Distribuição de questões por temas (Gráfico em Anel)
  const [temasDistribuicao, setTemasDistribuicao] = useState<ThemeDistributionSegment[]>([]);
  const [todosTemasDetalhados, setTodosTemasDetalhados] = useState<TemaDetalhadoItem[]>([]);
  const [modalTemasVisible, setModalTemasVisible] = useState<boolean>(false);

  // Telemetria de tempo
  const [timeStats, setTimeStats] = useState<QuestionTimeStats>({
    tempoMedioSegundos: 0,
    tempoTotalSegundos: 0,
    totalQuestoesComTempo: 0,
  });

  // Saúde da Memória (SM-2)
  const [memoryHealth, setMemoryHealth] = useState<MemoryHealthSummary>({
    total: 0,
    pendentes: 0,
    longoPrazo: 0,
    consolidando: 0,
  });

  // Gargalos e Treino Focado
  const [gargalos, setGargalos] = useState<BottleneckTheme[]>([]);
  const [selectedGargalo, setSelectedGargalo] = useState<BottleneckTheme | null>(null);
  const [targetTreinoGargalo, setTargetTreinoGargalo] = useState<TargetTreinoGargalo | null>(null);
  const [selectedMicroFocos, setSelectedMicroFocos] = useState<string[]>([]);
  const [treinoFocadoLimit, setTreinoFocadoLimit] = useState<string>('10');
  const userEditedLimitRef = useRef<boolean>(false);

  // Sessão diária do SM-2
  const [gerandoSessaoSM2, setGerandoSessaoSM2] = useState<boolean>(false);

  // Meta de Questões (Diária, Semanal, Mensal)
  const [metaDiaria, setMetaDiaria] = useState<number>(() => {
    const saved = storage.getString('@athena_meta_questoes_diaria');
    return saved ? parseInt(saved, 10) || 0 : 0;
  });
  const [modalMetaVisible, setModalMetaVisible] = useState<boolean>(false);

  // Diálogo unificado no padrão Athena/Notion
  const [dialogConfig, setDialogConfig] = useState<{
    visible: boolean;
    title: string;
    message?: string;
    variant?: AthenaDialogVariant;
    icon?: keyof typeof Ionicons.glyphMap;
  }>({
    visible: false,
    title: '',
  });

  const showDialog = useCallback((
    title: string,
    message?: string,
    variant: AthenaDialogVariant = 'info',
    icon?: keyof typeof Ionicons.glyphMap
  ) => {
    setDialogConfig({ visible: true, title, message, variant, icon });
  }, []);

  // Calcula o timestamp de início de acordo com o timeRange selecionado
  const getSinceTimestamp = useCallback((range: TimeRangeOption): number => {
    const now = new Date();
    if (range === 'hoje') {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return today.getTime();
    }
    if (range === '7dias') {
      return now.getTime() - 7 * 24 * 60 * 60 * 1000;
    }
    if (range === '30dias') {
      return now.getTime() - 30 * 24 * 60 * 60 * 1000;
    }
    return 0; // 'geral'
  }, []);

  const carregarMetricas = useCallback(async () => {
    try {
      setLoading(true);
      const database = getDatabase();
      const since = getSinceTimestamp(timeRange);

      // 1. Saúde da Memória e Estatísticas de Tempo em paralelo
      const [memHealth, qTimeStats] = await Promise.all([
        getMemoryHealthSummary(),
        getQuestionTimeStats(since > 0 ? since : undefined),
      ]);

      setMemoryHealth(memHealth);
      setTimeStats(qTimeStats);

      // 2. Consulta registros de progresso no período filtrado
      const whereClause = since > 0 ? 'WHERE timestamp >= ?' : '';
      const params = since > 0 ? [since] : [];

      const rows = await database.getAllAsync<any>(
        `SELECT id_questao, tema, especialidade, foco, micro_foco, correta, timestamp 
         FROM progresso 
         ${whereClause} 
         ORDER BY timestamp DESC;`,
        params
      );

      if (!rows || rows.length === 0) {
        setTotalQuestoes(0);
        setTotalAcertos(0);
        setAproveitamento(0);
        setGargalos([]);
        setTemasDistribuicao([]);
        setTodosTemasDetalhados([]);
        return;
      }

      let acertosCount = 0;
      const totalQ = rows.length;

      const temasMap: Record<string, any> = {};

      for (const r of rows) {
        const isOk = r.correta === 1 || r.correta === true;
        if (isOk) acertosCount++;

        // Agrupamento para Gargalos e Temas
        const tNome = String(r.tema || 'Geral').trim();
        if (!temasMap[tNome]) {
          temasMap[tNome] = {
            tema: tNome,
            especialidade: String(r.especialidade || '').trim(),
            total: 0,
            acertos: 0,
            focosMap: {},
          };
        }
        temasMap[tNome].total += 1;
        if (isOk) temasMap[tNome].acertos += 1;

        const fNome = String(r.foco || 'Geral').trim();
        if (!temasMap[tNome].focosMap[fNome]) {
          temasMap[tNome].focosMap[fNome] = {
            total: 0,
            acertos: 0,
            microFocosMap: {},
          };
        }
        temasMap[tNome].focosMap[fNome].total += 1;
        if (isOk) temasMap[tNome].focosMap[fNome].acertos += 1;

        const mfNome = String(r.micro_foco || '').trim();
        if (mfNome) {
          if (!temasMap[tNome].focosMap[fNome].microFocosMap[mfNome]) {
            temasMap[tNome].focosMap[fNome].microFocosMap[mfNome] = { total: 0, acertos: 0 };
          }
          temasMap[tNome].focosMap[fNome].microFocosMap[mfNome].total += 1;
          if (isOk) temasMap[tNome].focosMap[fNome].microFocosMap[mfNome].acertos += 1;
        }
      }

      setTotalQuestoes(totalQ);
      setTotalAcertos(acertosCount);
      const taxaGlobal = totalQ > 0 ? Math.round((acertosCount / totalQ) * 100) : 0;
      setAproveitamento(taxaGlobal);

      // Formata a lista de Gargalos
      const listaGargalos: BottleneckTheme[] = Object.entries(temasMap)
        .map(([tema, dados]: [string, any]) => {
          const taxa = dados.total > 0 ? Math.round((dados.acertos / dados.total) * 100) : 0;
          const focos: FocoMetrica[] = Object.entries(dados.focosMap).map(([nome, fDados]: [string, any]) => {
            const microFocos = Object.entries(fDados.microFocosMap).map(([mNome, mDados]: [string, any]) => ({
              nome: mNome,
              total: mDados.total,
              acertos: mDados.acertos,
              taxa: mDados.total > 0 ? Math.round((mDados.acertos / mDados.total) * 100) : 0,
            })).sort((a, b) => a.taxa - b.taxa || b.total - a.total);

            return {
              nome,
              total: fDados.total,
              acertos: fDados.acertos,
              taxa: fDados.total > 0 ? Math.round((fDados.acertos / fDados.total) * 100) : 0,
              microFocos,
            };
          }).sort((a, b) => a.taxa - b.taxa || b.total - a.total);

          return {
            tema,
            especialidade: dados.especialidade,
            total: dados.total,
            acertos: dados.acertos,
            taxa,
            focos,
          };
        })
        .filter((item) => item.taxa < 75 && item.total >= 2)
        .sort((a, b) => a.taxa - b.taxa || b.total - a.total)
        .slice(0, 5);

      setGargalos(listaGargalos);

      // Distribuição de questões feitas por temas (Top 3 ou 4 + Outros)
      const sortedTemas = Object.entries(temasMap)
        .map(([tema, dados]: [string, any]) => ({ nome: tema, count: dados.total as number }))
        .sort((a, b) => b.count - a.count);

      let temasAgrupados: { nome: string; count: number }[] = [];
      if (sortedTemas.length > 4) {
        const top3 = sortedTemas.slice(0, 3);
        const outrosCount = sortedTemas.slice(3).reduce((sum, item) => sum + item.count, 0);
        temasAgrupados = top3.map((item) => ({ nome: item.nome, count: item.count }));
        if (outrosCount > 0) temasAgrupados.push({ nome: 'Outros', count: outrosCount });
      } else {
        temasAgrupados = sortedTemas;
      }

      const segmentosTemas: ThemeDistributionSegment[] = temasAgrupados.map((item, idx) => {
        const percent = totalQ > 0 ? Math.round((item.count / totalQ) * 100) : 0;
        return {
          name: item.nome,
          count: item.count,
          percent,
          color: item.nome === 'Outros' ? '#64748B' : PALETA_TEMAS[idx % PALETA_TEMAS.length],
        };
      });
      setTemasDistribuicao(segmentosTemas);

      // Lista completa e ordenada de todos os temas para o modal detalhado
      const PALETA_TEMAS_EXTENDIDA = [
        '#EAE115', // Amarelo Athena
        '#3B82F6', // Azul
        '#10B981', // Verde Esmeralda
        '#8B5CF6', // Roxo
        '#F97316', // Laranja
        '#EC4899', // Rosa
        '#06B6D4', // Cyan
        '#6366F1', // Indigo
        '#14B8A6', // Teal
        '#A855F7', // Purple
      ];

      const listaCompletaTemas: TemaDetalhadoItem[] = Object.entries(temasMap)
        .map(([tema, dados]: [string, any], idx: number) => {
          const taxa = dados.total > 0 ? Math.round((dados.acertos / dados.total) * 100) : 0;
          const pctVolume = totalQ > 0 ? Math.round((dados.total / totalQ) * 100) : 0;
          return {
            nome: tema,
            especialidade: dados.especialidade,
            total: dados.total as number,
            acertos: dados.acertos as number,
            taxa,
            percentualVolume: pctVolume,
            color: PALETA_TEMAS_EXTENDIDA[idx % PALETA_TEMAS_EXTENDIDA.length],
          };
        })
        .sort((a, b) => b.total - a.total || a.taxa - b.taxa);

      setTodosTemasDetalhados(listaCompletaTemas);
    } catch (err) {
      console.error('[DesempenhoScreen] Erro ao carregar métricas:', err);
    } finally {
      setLoading(false);
    }
  }, [timeRange, getSinceTimestamp]);

  useFocusEffect(
    useCallback(() => {
      carregarMetricas();
    }, [carregarMetricas])
  );

  // Iniciar Revisão Diária do SM-2
  const iniciarRevisaoSM2 = async () => {
    if (gerandoSessaoSM2) return;
    setGerandoSessaoSM2(true);
    try {
      const questoesHoje = await generateDailySession(15);
      if (!questoesHoje || questoesHoje.length === 0) {
        showDialog('Tudo em dia! 🎉', 'Você não possui questões com revisão vencida no SM-2 para hoje.', 'success');
        return;
      }
      await saveActiveQuizSession({
        questions: questoesHoje,
        currentIndex: 0,
      });
      router.push({
        pathname: '/treino/quiz',
        params: { retomar: 'true' },
      });
    } catch (err) {
      console.error('Erro ao gerar sessão SM-2:', err);
      showDialog('Erro', 'Não foi possível gerar a revisão no momento.', 'error');
    } finally {
      setGerandoSessaoSM2(false);
    }
  };

  // Preparação de Treino Focado em Gargalo
  const prepararTreinoFoco = async (foco: FocoMetrica) => {
    if (!selectedGargalo) return;

    const targetTema = selectedGargalo.tema;
    const targetEsp = selectedGargalo.especialidade;
    const focoNome = foco.nome;

    try {
      let parsed = await getQuestionsByThemes([targetTema]);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        parsed = await getQuestoesCache();
      }
      if (!Array.isArray(parsed) || parsed.length === 0) {
        showDialog('Aviso', 'Nenhuma questão cadastrada para este tema.', 'warning');
        return;
      }

      const targetFocoNorm = focoNome.trim().toLowerCase();
      const targetTemaNorm = targetTema.trim().toLowerCase();

      const normalized = parsed.map((q: any, idx: number) => ({
        ...q,
        _stableId: getQuestionId(q, idx),
      }));

      const matched = normalized.filter((q: any) => {
        const qTema = (q?.tema || '').trim().toLowerCase();
        const qFoco = (q?.foco_da_questao || q?.foco || q?.tipo || '').trim().toLowerCase();
        const matchTema = qTema === targetTemaNorm || qTema.includes(targetTemaNorm);
        const matchFoco = qFoco === targetFocoNorm || qFoco.includes(targetFocoNorm);
        return matchTema && matchFoco;
      });

      const options: MicroFocoTreinoOption[] = [];
      const geralQuestionIds: string[] = [];

      for (const opt of foco.microFocos || []) {
        const optNorm = opt.nome.trim().toLowerCase();
        const qIds = matched
          .filter((q: any) => {
            const mf = (q?.micro_foco || q?.microfoco || q?.subfoco || '').trim().toLowerCase();
            return mf === optNorm || mf.includes(optNorm);
          })
          .map((q: any) => q._stableId);

        if (qIds.length > 0) {
          options.push({
            nome: opt.nome,
            totalGargalo: opt.total,
            acertosGargalo: opt.acertos,
            taxaGargalo: opt.taxa,
            questoesCount: qIds.length,
            questionIds: qIds,
          });
        }
      }

      const allocatedIds = new Set(options.flatMap((o) => o.questionIds));
      for (const q of matched) {
        if (!allocatedIds.has(q._stableId)) {
          geralQuestionIds.push(q._stableId);
        }
      }

      const allIds = Array.from(new Set(matched.map((q: any) => q._stableId)));

      setSelectedMicroFocos(options.map((o) => o.nome));
      setTreinoFocadoLimit(String(matched.length || 10));
      setTargetTreinoGargalo({
        tema: targetTema,
        especialidade: targetEsp,
        foco: focoNome,
        microFocosOptions: options,
        geralQuestionIds,
        allQuestionIds: allIds,
        allQuestionsCount: matched.length,
      });
    } catch (err) {
      console.error('Erro ao preparar treino focado:', err);
    }
  };

  const totalQuestoesSelecionadas = useMemo(() => {
    if (!targetTreinoGargalo) return 0;
    if (targetTreinoGargalo.microFocosOptions.length === 0 && targetTreinoGargalo.geralQuestionIds.length === 0) {
      return targetTreinoGargalo.allQuestionsCount;
    }
    const ids = new Set<string>();
    for (const opt of targetTreinoGargalo.microFocosOptions) {
      if (selectedMicroFocos.includes(opt.nome)) {
        opt.questionIds.forEach((id) => ids.add(id));
      }
    }
    if (selectedMicroFocos.includes('__geral__')) {
      targetTreinoGargalo.geralQuestionIds.forEach((id) => ids.add(id));
    }
    return ids.size;
  }, [targetTreinoGargalo, selectedMicroFocos]);

  const todosMicroFocosMarcados = useMemo(() => {
    if (!targetTreinoGargalo) return false;
    const totalPossivel = targetTreinoGargalo.microFocosOptions.length + (targetTreinoGargalo.geralQuestionIds.length > 0 ? 1 : 0);
    return selectedMicroFocos.length === totalPossivel && totalPossivel > 0;
  }, [targetTreinoGargalo, selectedMicroFocos]);

  const toggleMicroFoco = (nome: string) => {
    setSelectedMicroFocos((prev) =>
      prev.includes(nome) ? prev.filter((n) => n !== nome) : [...prev, nome]
    );
  };

  const toggleTodosMicroFocos = () => {
    if (!targetTreinoGargalo) return;
    if (todosMicroFocosMarcados) {
      setSelectedMicroFocos([]);
    } else {
      const all = targetTreinoGargalo.microFocosOptions.map((o) => o.nome);
      if (targetTreinoGargalo.geralQuestionIds.length > 0) all.push('__geral__');
      setSelectedMicroFocos(all);
    }
  };

  const executarTreinoGargalo = () => {
    if (!targetTreinoGargalo) return;

    const ids = new Set<string>();
    const activeMicroFocoNames: string[] = [];

    for (const opt of targetTreinoGargalo.microFocosOptions) {
      if (selectedMicroFocos.includes(opt.nome)) {
        activeMicroFocoNames.push(opt.nome);
        opt.questionIds.forEach((id) => ids.add(id));
      }
    }

    if (selectedMicroFocos.includes('__geral__')) {
      targetTreinoGargalo.geralQuestionIds.forEach((id) => ids.add(id));
    }

    if (targetTreinoGargalo.microFocosOptions.length === 0 && targetTreinoGargalo.geralQuestionIds.length === 0) {
      targetTreinoGargalo.allQuestionIds.forEach((id) => ids.add(id));
    }

    const allowedQuestionIds = Array.from(ids);

    if (allowedQuestionIds.length === 0) {
      showDialog('Sem Questões', 'Marque ao menos um micro-foco com questões disponíveis para iniciar o treino.', 'warning');
      return;
    }

    const parsedLimit = parseInt(treinoFocadoLimit.trim(), 10);
    const finalLimit = parsedLimit && parsedLimit > 0 ? String(parsedLimit) : String(allowedQuestionIds.length);

    const cartItem = {
      especialidade: targetTreinoGargalo.especialidade,
      tema: targetTreinoGargalo.tema,
      allowedQuestionIds,
      focos: [targetTreinoGargalo.foco],
      microFocos: activeMicroFocoNames.length > 0 ? activeMicroFocoNames : undefined,
      filterCount: allowedQuestionIds.length,
    };

    storage.set('@athena_cart', JSON.stringify([cartItem]));
    storage.set('@athena_quiz_limit', finalLimit);
    clearActiveQuizSession();

    setTargetTreinoGargalo(null);
    setSelectedGargalo(null);

    router.push({
      pathname: '/treino/quiz',
      params: { limite: finalLimit },
    });
  };

  // Avaliação do Ritmo de Prova
  const ritmoBadge = useMemo(() => {
    const sec = timeStats.tempoMedioSegundos;
    if (!sec || timeStats.totalQuestoesComTempo === 0) {
      return { text: 'Aguardando coletas', cor: themeColors.textMuted, icone: 'timer-outline' };
    }
    if (sec <= 45) {
      return { text: 'Ritmo Rápido / Ágil', cor: '#10B981', icone: 'flash-outline' };
    }
    if (sec <= 140) {
      return { text: 'Ritmo Ideal de Prova', cor: themeColors.primary, icone: 'checkmark-circle-outline' };
    }
    return { text: 'Atenção ao Tempo (>2m20s)', cor: '#EF4444', icone: 'alert-circle-outline' };
  }, [timeStats, themeColors]);

  const corAproveitamento = getAproveitamentoCor(aproveitamento);

  // Meta ajustada ao filtro temporal selecionado
  const metaCalculada = useMemo(() => {
    if (!metaDiaria || metaDiaria <= 0) return 0;
    if (timeRange === 'hoje') return metaDiaria;
    if (timeRange === '7dias') return metaDiaria * 7;
    if (timeRange === '30dias') return metaDiaria * 30;
    return metaDiaria * 30; // base mensal para visualização geral
  }, [metaDiaria, timeRange]);

  const timeRangeLabel = useMemo(() => {
    switch (timeRange) {
      case 'hoje': return 'Hoje';
      case '7dias': return 'Últimos 7 dias';
      case '30dias': return 'Últimos 30 dias';
      default: return 'Todo o período';
    }
  }, [timeRange]);

  const getPeriodoLabel = useCallback((): string => {
    if (timeRange === 'hoje') return 'QUESTÕES HOJE';
    if (timeRange === '7dias') return 'ÚLTIMOS 7 DIAS';
    if (timeRange === '30dias') return 'ÚLTIMOS 30 DIAS';
    return 'QUESTÕES TOTAL';
  }, [timeRange]);

  const getMetaSucessoTexto = useCallback((): string => {
    if (timeRange === '7dias') return '🎯 Meta semanal concluída!';
    if (timeRange === '30dias') return '🎯 Meta mensal concluída!';
    return '🎯 Meta diária concluída!';
  }, [timeRange]);

  // Taxa de retenção do algoritmo SM-2 (questões retidas / total no algoritmo)
  const taxaRetencaoSM2 = useMemo(() => {
    if (!memoryHealth.total || memoryHealth.total === 0) return 0;
    return Math.round((memoryHealth.longoPrazo / memoryHealth.total) * 100);
  }, [memoryHealth]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={themeColors.background} />

      {/* Cabeçalho Unificado */}
      <AppHeader />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. Filtro Temporal (Hoje / 7 dias / 30 dias / Geral) */}
        <View style={styles.timeFilterRow}>
          {[
            { key: 'hoje', label: 'Hoje' },
            { key: '7dias', label: '7 Dias' },
            { key: '30dias', label: '30 Dias' },
            { key: 'geral', label: 'Tudo' },
          ].map((item) => {
            const isSelected = timeRange === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.filterChip, isSelected && styles.filterChipActive]}
                activeOpacity={0.8}
                onPress={() => setTimeRange(item.key as TimeRangeOption)}
              >
                <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={themeColors.primary} />
            <Text style={styles.loadingText}>Processando métricas clínicas...</Text>
          </View>
        ) : (
          <>
            {/* 1. Linha Superior: Quantidade de Questões Feitas + Desempenho (Estilo Main) */}
            <View style={styles.metricsRow}>
              {/* Card 1: Quantidade de Questões Feitas */}
              <TouchableOpacity
                style={styles.metricCard}
                activeOpacity={0.7}
                onPress={() => setModalMetaVisible(true)}
              >
                <View style={styles.metricIconRow}>
                  <Ionicons name="flash-outline" size={17} color={themeColors.primary} />
                  <Text style={styles.metricCardLabel}>{getPeriodoLabel()}</Text>
                  {metaCalculada <= 0 && (
                    <View style={styles.metaBadge}>
                      <Ionicons name="flag-outline" size={10} color={themeColors.primary} style={{ marginRight: 2 }} />
                      <Text style={styles.metaBadgeText}>DEFINIR META</Text>
                    </View>
                  )}
                </View>

                {metaCalculada > 0 ? (
                  <View style={styles.metaValueContainer}>
                    <Text style={styles.metricCardValue}>
                      {totalQuestoes}
                      <Text style={styles.metricCardValueMeta}>/{metaCalculada}</Text>
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.metricCardValue}>{totalQuestoes}</Text>
                )}

                {metaCalculada > 0 && (
                  <View style={styles.metaProgressBarBg}>
                    <View
                      style={[
                        styles.metaProgressBarFill,
                        {
                          width: `${Math.min(100, Math.round((totalQuestoes / metaCalculada) * 100))}%`,
                          backgroundColor: totalQuestoes >= metaCalculada ? '#10B981' : themeColors.primary,
                        },
                      ]}
                    />
                  </View>
                )}

                <Text style={styles.metricCardSubtext} numberOfLines={1}>
                  {metaCalculada > 0 ? (
                    totalQuestoes >= metaCalculada ? getMetaSucessoTexto() : `Faltam ${metaCalculada - totalQuestoes} para a meta`
                  ) : (
                    'Toque para definir meta'
                  )}
                </Text>
              </TouchableOpacity>

              {/* Card 2: Desempenho / Aproveitamento */}
              {(() => {
                const hasData = totalQuestoes > 0;
                const corAprov = hasData ? getAproveitamentoCor(aproveitamento) : themeColors.textSecondary;
                return (
                  <View style={styles.metricCard}>
                    <View style={styles.metricIconRow}>
                      <Ionicons
                        name="trending-up-outline"
                        size={17}
                        color={corAprov}
                      />
                      <Text style={styles.metricCardLabel}>APROVEITAMENTO</Text>
                    </View>
                    <Text style={[styles.metricCardValue, { color: corAprov }]}>
                      {hasData ? `${aproveitamento}%` : '--'}
                    </Text>
                    <Text style={styles.metricCardSubtext} numberOfLines={1}>
                      {hasData ? `${totalAcertos} de ${totalQuestoes} certas` : 'Sem questões no período'}
                    </Text>
                  </View>
                );
              })()}
            </View>

            {/* 2. Linha Inferior: Temas de Questões Feitas (Gráfico em Anel) + Tempo Médio */}
            <View style={styles.metricsRow}>
              {/* Card 3: Temas de Questões Feitas (Gráfico em Anel) */}
              <TouchableOpacity
                style={styles.metricCard}
                activeOpacity={0.7}
                onPress={() => setModalTemasVisible(true)}
              >
                <View style={styles.metricIconRow}>
                  <Ionicons name="pie-chart-outline" size={17} color="#EAE115" />
                  <Text style={styles.metricCardLabel}>TEMAS ESTUDADOS</Text>
                  <Ionicons
                    name="chevron-forward"
                    size={13}
                    color={themeColors.textSecondary}
                    style={{ marginLeft: 'auto' }}
                  />
                </View>

                {totalQuestoes > 0 && temasDistribuicao.length > 0 ? (
                  <View style={styles.temaCardContent}>
                    <View style={styles.temaDonutWrapper}>
                      <ThemeDonutChart
                        segments={temasDistribuicao}
                        total={totalQuestoes}
                        size={56}
                        strokeWidth={6}
                        showCenterText={true}
                        centerLabel=""
                      />
                    </View>
                    <View style={styles.temaCardLegendCol}>
                      {temasDistribuicao.slice(0, 3).map((item, idx) => (
                        <View key={`tema-leg-${item.name}-${idx}`} style={styles.temaCardLegendItem}>
                          <View style={[styles.temaLegendDot, { backgroundColor: item.color }]} />
                          <Text style={styles.temaCardLegendName} numberOfLines={1} ellipsizeMode="tail">
                            {item.name}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : (
                  <View style={styles.emptyTemaMiniBox}>
                    <ThemeDonutChart
                      segments={[]}
                      total={0}
                      size={48}
                      strokeWidth={5}
                      showCenterText={false}
                    />
                    <Text style={styles.emptyTemaMiniText}>Sem dados no período</Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Card 4: Tempo Médio */}
              <View style={styles.metricCard}>
                <View style={styles.metricIconRow}>
                  <Ionicons name="stopwatch-outline" size={17} color={themeColors.primary} />
                  <Text style={styles.metricCardLabel}>TEMPO MÉDIO</Text>
                </View>

                <Text style={styles.metricCardValue}>
                  {timeStats.totalQuestoesComTempo > 0
                    ? formatSegundosEmTempo(timeStats.tempoMedioSegundos)
                    : '--'}
                </Text>

                <View style={styles.ritmoBadge}>
                  <Ionicons name={ritmoBadge.icone as any} size={11} color={ritmoBadge.cor} style={{ marginRight: 4 }} />
                  <Text style={[styles.ritmoBadgeText, { color: ritmoBadge.cor }]} numberOfLines={1}>
                    {ritmoBadge.text}
                  </Text>
                </View>

                <Text style={styles.metricCardSubtext} numberOfLines={1}>
                  Total: {formatSegundosEmHoras(timeStats.tempoTotalSegundos)} de foco ativo
                </Text>
              </View>
            </View>

            {/* 2. Card de Algoritmo de Retenção (SM-2) */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.titleWithIcon}>
                  <Ionicons name="sparkles" size={18} color={themeColors.primary} style={{ marginRight: 8 }} />
                  <Text style={styles.sectionTitle}>Algoritmo de Retenção</Text>
                </View>
              </View>

              <Text style={styles.sectionDesc}>
                Distribuição da retenção de longo prazo e revisões agendadas.
              </Text>

              {/* Layout Donut + Legenda ao Lado */}
              <View style={styles.memoryBodyRow}>
                {/* Gráfico de Anel Multi-Segmento */}
                <View style={styles.memoryDonutWrapper}>
                  <MemoryDonutChart
                    longoPrazo={memoryHealth.longoPrazo}
                    consolidando={memoryHealth.consolidando}
                    pendentes={memoryHealth.pendentes}
                    size={88}
                    strokeWidth={8.5}
                  />
                </View>

                {/* Legenda Vertical ao Lado */}
                <View style={styles.memoryLegendSideCol}>
                  {/* 1. Retidas */}
                  <View style={styles.memoryLegendSideRow}>
                    <View style={[styles.memoryLegendBullet, { backgroundColor: '#10B981' }]} />
                    <View style={styles.memoryLegendTextBox}>
                      <Text style={styles.memoryLegendName}>Retidas</Text>
                      <Text style={styles.memoryLegendValue}>
                        {memoryHealth.longoPrazo}{memoryHealth.total > 0 ? ` (${Math.round((memoryHealth.longoPrazo / memoryHealth.total) * 100)}%)` : ''}
                      </Text>
                    </View>
                  </View>

                  {/* 2. Em Treino */}
                  <View style={styles.memoryLegendSideRow}>
                    <View style={[styles.memoryLegendBullet, { backgroundColor: '#F59E0B' }]} />
                    <View style={styles.memoryLegendTextBox}>
                      <Text style={styles.memoryLegendName}>Em Treino</Text>
                      <Text style={styles.memoryLegendValue}>
                        {memoryHealth.consolidando}{memoryHealth.total > 0 ? ` (${Math.round((memoryHealth.consolidando / memoryHealth.total) * 100)}%)` : ''}
                      </Text>
                    </View>
                  </View>

                  {/* 3. Vencidas */}
                  <View style={styles.memoryLegendSideRow}>
                    <View style={[styles.memoryLegendBullet, { backgroundColor: '#EF4444' }]} />
                    <View style={styles.memoryLegendTextBox}>
                      <Text style={styles.memoryLegendName}>Vencidas</Text>
                      <Text style={[styles.memoryLegendValue, memoryHealth.pendentes > 0 && { color: '#EF4444', fontWeight: '800' }]}>
                        {memoryHealth.pendentes}{memoryHealth.total > 0 ? ` (${Math.round((memoryHealth.pendentes / memoryHealth.total) * 100)}%)` : ''}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Botão Amarelo de Iniciar Questões Vencidas em Baixo */}
              <TouchableOpacity
                style={[
                  styles.btnIniciarVencidas,
                  memoryHealth.pendentes === 0 && styles.btnIniciarVencidasZero,
                ]}
                activeOpacity={0.85}
                onPress={iniciarRevisaoSM2}
                disabled={gerandoSessaoSM2}
              >
                {gerandoSessaoSM2 ? (
                  <ActivityIndicator size="small" color="#18181B" />
                ) : (
                  <>
                    <Ionicons name="play" size={15} color="#18181B" style={{ marginRight: 6 }} />
                    <Text style={styles.btnIniciarVencidasText}>
                      Iniciar questões vencidas{memoryHealth.pendentes > 0 ? ` (${memoryHealth.pendentes})` : ''}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* 3. Gargalos Críticos - Versão Original da branch main */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.titleWithIcon}>
                  <Ionicons name="alert-circle-outline" size={19} color="#EF4444" style={{ marginRight: 8 }} />
                  <Text style={styles.sectionTitle}>Desempenhos Críticos</Text>
                </View>
                <View style={[styles.cardBadge, { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.3)' }]}>
                  <Text style={[styles.cardBadgeText, { color: '#EF4444' }]}>Taxa &lt; 75%</Text>
                </View>
              </View>

              <Text style={styles.sectionDesc}>
                Assuntos com rendimento abaixo de 75% para reforçar e revisar
              </Text>

              {gargalos.length > 0 ? (
                <View style={styles.gargalosList}>
                  {gargalos.map((item, idx) => {
                    const isVeryLow = item.taxa < 50;
                    const accentColor = isVeryLow ? '#EF4444' : '#F59E0B';
                    return (
                      <TouchableOpacity
                        key={`gargalo-${item.tema}-${idx}`}
                        style={styles.gargaloItem}
                        activeOpacity={0.7}
                        onPress={() => setSelectedGargalo(item)}
                      >
                        <View style={styles.gargaloIndexBadge}>
                          <Text style={styles.gargaloIndexText}>{idx + 1}º</Text>
                        </View>
                        <View style={styles.gargaloInfo}>
                          <Text style={styles.gargaloTema} numberOfLines={1}>{item.tema}</Text>
                          <Text style={styles.gargaloEspecialidade} numberOfLines={1}>
                            {item.especialidade || 'Clínica Médica'} • {item.acertos}/{item.total} acertos
                          </Text>
                        </View>
                        <View style={[styles.gargaloRateBadge, { borderColor: accentColor }]}>
                          <Text style={[styles.gargaloRateText, { color: accentColor }]}>{item.taxa}%</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={themeColors.textSecondary} style={{ marginLeft: 6 }} />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.emptyGargaloBox}>
                  <Ionicons name="checkmark-done-circle-outline" size={38} color="#10B981" style={{ marginBottom: 8 }} />
                  <Text style={styles.emptyGargaloTitle}>
                    {totalQuestoes > 0 ? 'Excelente! Nenhum gargalo crítico' : 'Sem histórico registrado'}
                  </Text>
                  <Text style={styles.emptyGargaloSub}>
                    {totalQuestoes > 0
                      ? 'Todos os temas praticados no período estão com aproveitamento acima de 75%.'
                      : 'Resolva questões para identificar os temas que precisam de reforço nos seus estudos.'}
                  </Text>
                </View>
              )}
            </View>

            {/* 4. Evolução dos Últimos 6 Meses */}
            <EvolucaoMensalChart />

          </>
        )}
      </ScrollView>

      {/* Modal de Raio-X Detalhado do Gargalo */}
      <GargaloDetalheModal
        visible={!!selectedGargalo}
        onClose={() => setSelectedGargalo(null)}
        gargalo={selectedGargalo}
        onPrepararTreino={prepararTreinoFoco}
      />

      {/* Modal de Treino Focado no Gargalo */}
      <TreinoFocadoModal
        visible={!!targetTreinoGargalo}
        onClose={() => setTargetTreinoGargalo(null)}
        targetTreinoGargalo={targetTreinoGargalo}
        selectedMicroFocos={selectedMicroFocos}
        onToggleMicroFoco={toggleMicroFoco}
        onToggleTodos={toggleTodosMicroFocos}
        todosMarcados={todosMicroFocosMarcados}
        totalQuestoesSelecionadas={totalQuestoesSelecionadas}
        treinoFocadoLimit={treinoFocadoLimit}
        setTreinoFocadoLimit={setTreinoFocadoLimit}
        onUserEditLimit={() => { userEditedLimitRef.current = true; }}
        onExecutarTreino={executarTreinoGargalo}
        carregandoTreino={false}
      />

      {/* Diálogo Unificado no Padrão Athena/Notion */}
      <AthenaDialogModal
        visible={dialogConfig.visible}
        onClose={() => setDialogConfig((prev) => ({ ...prev, visible: false }))}
        title={dialogConfig.title}
        message={dialogConfig.message}
        variant={dialogConfig.variant}
        icon={dialogConfig.icon}
        primaryButtonText="Entendi"
        onPrimaryPress={() => setDialogConfig((prev) => ({ ...prev, visible: false }))}
      />

      {/* Modal de Meta de Questões (Diária, Semanal e Mensal) */}
      <MetaDiariaModal
        visible={modalMetaVisible}
        onClose={() => setModalMetaVisible(false)}
        onSave={(novaMeta) => setMetaDiaria(novaMeta)}
        initialMeta={metaDiaria}
      />

      {/* Modal de Detalhe Completo dos Temas Estudados */}
      <TemasDetalheModal
        visible={modalTemasVisible}
        onClose={() => setModalTemasVisible(false)}
        temas={todosTemasDetalhados}
        totalQuestoes={totalQuestoes}
        totalAcertos={totalAcertos}
        taxaGlobal={aproveitamento}
        timeRangeLabel={timeRangeLabel}
      />
    </SafeAreaView>
  );
}

function createStyles(theme: ActiveThemeColors, isDark: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    scrollView: {
      flex: 1,
    },
    content: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 110,
    },
    header: {
      marginBottom: 14,
    },
    title: {
      fontSize: 22,
      fontWeight: '800',
      color: theme.text,
      letterSpacing: -0.4,
    },
    subtitle: {
      fontSize: 13,
      color: theme.textSecondary,
      marginTop: 2,
    },

    /* Filtro Temporal */
    timeFilterRow: {
      flexDirection: 'row',
      backgroundColor: theme.backgroundSecondary,
      borderRadius: 12,
      padding: 3,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: theme.border,
    },
    filterChip: {
      flex: 1,
      paddingVertical: 7,
      alignItems: 'center',
      borderRadius: 9,
    },
    filterChipActive: {
      backgroundColor: theme.surfaceCard || theme.surface,
      borderWidth: 1,
      borderColor: theme.borderSubtle,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0.2 : 0.05,
      shadowRadius: 3,
      elevation: 1,
    },
    filterChipText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.textSecondary,
    },
    filterChipTextActive: {
      color: theme.primary,
      fontWeight: '700',
    },

    loadingContainer: {
      paddingVertical: 60,
      alignItems: 'center',
    },
    loadingText: {
      color: theme.textSecondary,
      fontSize: 13,
      marginTop: 12,
    },

    /* Linhas de Métricas (Estilo Main) */
    metricsRow: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 12,
    },
    metricCard: {
      flex: 1,
      backgroundColor: theme.surfaceCard || theme.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      justifyContent: 'space-between',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.25 : 0.05,
      shadowRadius: 8,
      elevation: 2,
    },
    metricIconRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 6,
    },
    metricCardLabel: {
      fontSize: 10,
      fontWeight: '800',
      color: theme.textSecondary,
      letterSpacing: 0.5,
    },
    metaBadge: {
      marginLeft: 'auto',
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(234, 225, 21, 0.1)' : 'rgba(234, 179, 8, 0.12)',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(234, 225, 21, 0.25)' : 'rgba(234, 179, 8, 0.25)',
    },
    metaBadgeText: {
      fontSize: 8.5,
      fontWeight: '800',
      color: theme.primary,
      letterSpacing: 0.3,
    },
    metaValueContainer: {
      flexDirection: 'row',
      alignItems: 'baseline',
    },
    metricCardValue: {
      fontSize: 26,
      fontWeight: '900',
      color: theme.text,
      marginBottom: 2,
      letterSpacing: -0.4,
    },
    metricCardValueMeta: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.textSecondary,
    },
    metaProgressBarBg: {
      height: 4,
      backgroundColor: isDark ? '#26292d' : 'rgba(0, 0, 0, 0.06)',
      borderRadius: 2,
      marginVertical: 4,
      overflow: 'hidden',
      width: '100%',
    },
    metaProgressBarFill: {
      height: '100%',
      borderRadius: 2,
    },
    metricCardSubtext: {
      fontSize: 11.5,
      color: theme.textSecondary,
      fontWeight: '500',
      marginTop: 2,
    },

    /* Card de Temas em Anel (ao lado de Tempo Médio) */
    temaCardContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 4,
    },
    temaDonutWrapper: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    temaCardLegendCol: {
      flex: 1,
      gap: 4,
      justifyContent: 'center',
    },
    temaCardLegendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    temaLegendDot: {
      width: 6.5,
      height: 6.5,
      borderRadius: 3.25,
    },
    temaCardLegendName: {
      flex: 1,
      fontSize: 10.5,
      fontWeight: '600',
      color: theme.textSecondary,
    },
    temaCardLegendPct: {
      fontSize: 10,
      fontWeight: '700',
      color: theme.text,
    },
    emptyTemaMiniBox: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 6,
      gap: 6,
    },
    emptyTemaMiniText: {
      fontSize: 11,
      color: theme.textMuted,
      textAlign: 'center',
    },
    ritmoBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
      paddingHorizontal: 6,
      paddingVertical: 2.5,
      borderRadius: 6,
      alignSelf: 'flex-start',
      marginTop: 2,
      marginBottom: 4,
      maxWidth: '100%',
    },
    ritmoBadgeText: {
      fontSize: 9.5,
      fontWeight: '700',
    },

    /* Seção Padrão de Card */
    sectionCard: {
      backgroundColor: theme.surfaceCard || theme.surface,
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.25 : 0.05,
      shadowRadius: 8,
      elevation: 2,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    titleWithIcon: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: theme.text,
    },
    sectionDesc: {
      fontSize: 12,
      color: theme.textSecondary,
      marginBottom: 14,
      lineHeight: 16,
    },
    cardBadge: {
      backgroundColor: theme.primarySubtle,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: theme.primaryBorder,
    },
    cardBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: theme.primary,
      textTransform: 'uppercase',
    },

    /* Saúde da Memória (SM-2) */
    memoryTotalBadge: {
      backgroundColor: theme.primarySubtle,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: theme.primaryBorder,
    },
    memoryTotalBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: theme.primary,
      textTransform: 'uppercase',
    },
    memoryBodyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 4,
    },
    memoryDonutWrapper: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingRight: 16,
    },
    memoryLegendSideCol: {
      flex: 1,
      gap: 10,
      justifyContent: 'center',
    },
    memoryLegendSideRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    memoryLegendBullet: {
      width: 9,
      height: 9,
      borderRadius: 4.5,
    },
    memoryLegendTextBox: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      flex: 1,
    },
    memoryLegendName: {
      fontSize: 12.5,
      fontWeight: '600',
      color: theme.textSecondary,
    },
    memoryLegendValue: {
      fontSize: 12.5,
      fontWeight: '700',
      color: theme.text,
    },
    btnIniciarVencidas: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#EAE115',
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 16,
      marginTop: 14,
      shadowColor: '#EAE115',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 6,
      elevation: 2,
    },
    btnIniciarVencidasZero: {
      opacity: 0.8,
    },
    btnIniciarVencidasText: {
      fontSize: 13.5,
      fontWeight: '800',
      color: '#18181B',
      letterSpacing: -0.2,
    },

    /* Gargalos Críticos */
    gargalosList: {
      gap: 10,
    },
    gargaloItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? theme.backgroundSecondary : '#FAFAF9',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      paddingVertical: 10,
      paddingHorizontal: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0.2 : 0.03,
      shadowRadius: 4,
      elevation: 1,
    },
    gargaloIndexBadge: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: 'rgba(239, 68, 68, 0.12)',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    gargaloIndexText: {
      fontSize: 12,
      fontWeight: '800',
      color: '#EF4444',
    },
    gargaloInfo: {
      flex: 1,
      marginRight: 10,
    },
    gargaloTema: {
      fontSize: 13.5,
      fontWeight: '700',
      color: theme.text,
      marginBottom: 2,
    },
    gargaloEspecialidade: {
      fontSize: 11,
      color: theme.textSecondary,
      fontWeight: '500',
    },
    gargaloRateBadge: {
      borderWidth: 1.5,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 4,
      backgroundColor: isDark ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.8)',
    },
    gargaloRateText: {
      fontSize: 12.5,
      fontWeight: '800',
    },
    emptyGargaloBox: {
      alignItems: 'center',
      paddingVertical: 20,
      paddingHorizontal: 16,
    },
    emptyGargaloTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: '#10B981',
      marginTop: 10,
      marginBottom: 4,
      textAlign: 'center',
    },
    emptyGargaloSub: {
      fontSize: 12,
      color: theme.textSecondary,
      textAlign: 'center',
      lineHeight: 16,
    },
  });
}
