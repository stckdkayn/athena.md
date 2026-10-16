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
import {
  getDatabase,
  getMemoryHealthSummary,
  getQuestionTimeStats,
  MemoryHealthSummary,
  QuestionTimeStats,
} from '@/services/database';
import { getStreakInfo, StreakInfo } from '@/services/streakService';
import { StreakModal } from '@/components/modals/StreakModal';
import { GargaloDetalheModal, BottleneckTheme, FocoMetrica } from '@/components/modals/GargaloDetalheModal';
import { TreinoFocadoModal, TargetTreinoGargalo, MicroFocoTreinoOption } from '@/components/modals/TreinoFocadoModal';
import Heatmap from '@/components/Heatmap';
import {
  classificarGrandeArea,
  GrandeAreaSimulado,
  getQuestoesCache,
  getQuestionsByThemes,
  saveActiveQuizSession,
  clearActiveQuizSession,
} from '@/services/questionService';
import { generateDailySession } from '@/services/studyAgentService';
import { storage } from '@/services/storage';

export type TimeRangeOption = 'hoje' | '7dias' | '30dias' | 'geral';

interface GrandeAreaMetrica {
  key: GrandeAreaSimulado;
  label: string;
  icone: string;
  cor: string;
  total: number;
  acertos: number;
  taxa: number;
}

const GRANDES_AREAS_INFO: Record<GrandeAreaSimulado, { label: string; icone: string; cor: string }> = {
  clinica_medica: { label: 'Clínica Médica', icone: 'stethoscope', cor: '#3B82F6' },
  cirurgia: { label: 'Cirurgia Geral', icone: 'scalpel', cor: '#EF4444' },
  pediatria: { label: 'Pediatria', icone: 'baby-carriage', cor: '#10B981' },
  ginecologia_obstetricia: { label: 'Ginecologia & Obstetrícia', icone: 'mother-nurse', cor: '#EC4899' },
  medicina_preventiva: { label: 'Medicina Preventiva & SUS', icone: 'shield-account', cor: '#F59E0B' },
};

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

export default function DesempenhoScreen() {
  const { colors: themeColors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(themeColors, isDark), [themeColors, isDark]);
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();

  const [loading, setLoading] = useState<boolean>(true);
  const [timeRange, setTimeRange] = useState<TimeRangeOption>('7dias');

  // Métricas gerais
  const [totalQuestoes, setTotalQuestoes] = useState<number>(0);
  const [totalAcertos, setTotalAcertos] = useState<number>(0);
  const [aproveitamento, setAproveitamento] = useState<number>(0);

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

  // Ofensiva e Modais
  const [streakInfo, setStreakInfo] = useState<StreakInfo | null>(null);
  const [modalStreakVisible, setModalStreakVisible] = useState<boolean>(false);

  // Grandes Áreas
  const [grandesAreas, setGrandesAreas] = useState<GrandeAreaMetrica[]>([]);

  // Gargalos e Treino Focado
  const [gargalos, setGargalos] = useState<BottleneckTheme[]>([]);
  const [selectedGargalo, setSelectedGargalo] = useState<BottleneckTheme | null>(null);
  const [targetTreinoGargalo, setTargetTreinoGargalo] = useState<TargetTreinoGargalo | null>(null);
  const [selectedMicroFocos, setSelectedMicroFocos] = useState<string[]>([]);
  const [treinoFocadoLimit, setTreinoFocadoLimit] = useState<string>('10');
  const userEditedLimitRef = useRef<boolean>(false);

  // Sessão diária do SM-2
  const [gerandoSessaoSM2, setGerandoSessaoSM2] = useState<boolean>(false);

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

      // 1. Ofensiva, Saúde da Memória e Estatísticas de Tempo em paralelo
      const [streakData, memHealth, qTimeStats] = await Promise.all([
        getStreakInfo(),
        getMemoryHealthSummary(),
        getQuestionTimeStats(since > 0 ? since : undefined),
      ]);

      setStreakInfo(streakData);
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
        setGrandesAreas([]);
        setGargalos([]);
        return;
      }

      let acertosCount = 0;
      const totalQ = rows.length;

      // Mapas auxiliares para as 5 Grandes Áreas e Gargalos
      const areasAccumulator: Record<GrandeAreaSimulado, { total: number; acertos: number }> = {
        clinica_medica: { total: 0, acertos: 0 },
        cirurgia: { total: 0, acertos: 0 },
        pediatria: { total: 0, acertos: 0 },
        ginecologia_obstetricia: { total: 0, acertos: 0 },
        medicina_preventiva: { total: 0, acertos: 0 },
      };

      const temasMap: Record<string, any> = {};

      for (const r of rows) {
        const isOk = r.correta === 1 || r.correta === true;
        if (isOk) acertosCount++;

        // Classificação na Grande Área
        const ga = classificarGrandeArea({
          tema: r.tema,
          especialidade: r.especialidade,
        });
        if (areasAccumulator[ga]) {
          areasAccumulator[ga].total += 1;
          if (isOk) areasAccumulator[ga].acertos += 1;
        }

        // Agrupamento para Gargalos
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

      // Formata as 5 Grandes Áreas
      const gaList: GrandeAreaMetrica[] = (Object.keys(areasAccumulator) as GrandeAreaSimulado[]).map((key) => {
        const item = areasAccumulator[key];
        const info = GRANDES_AREAS_INFO[key];
        const taxa = item.total > 0 ? Math.round((item.acertos / item.total) * 100) : 0;
        return {
          key,
          label: info.label,
          icone: info.icone,
          cor: info.cor,
          total: item.total,
          acertos: item.acertos,
          taxa,
        };
      });
      setGrandesAreas(gaList);

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
        Alert.alert('Tudo em dia! 🎉', 'Você não possui questões com revisão vencida no SM-2 para hoje.');
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
      Alert.alert('Erro', 'Não foi possível gerar a revisão no momento.');
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
        Alert.alert('Aviso', 'Nenhuma questão cadastrada para este tema.');
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
      Alert.alert('Sem Questões', 'Marque ao menos um micro-foco com questões disponíveis para iniciar o treino.');
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

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={themeColors.background} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Cabeçalho */}
        <View style={styles.header}>
          <Text style={styles.title}>Seu Desempenho</Text>
          <Text style={styles.subtitle}>Métricas de retenção, ritmo de prova e pontos críticos.</Text>
        </View>

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
            {/* 2. Grid de Cards Principais (Hero Metrics) */}
            <View style={styles.heroGrid}>
              {/* Card A: Aproveitamento */}
              <View style={styles.heroCard}>
                <View style={styles.heroCardHeader}>
                  <Text style={styles.heroCardLabel}>APROVEITAMENTO</Text>
                  <MaterialCommunityIcons name="target" size={16} color={corAproveitamento} />
                </View>
                <Text style={[styles.heroCardValue, { color: corAproveitamento }]}>
                  {aproveitamento}%
                </Text>
                <View style={styles.progressBarTrack}>
                  <View style={[styles.progressBarFill, { width: `${aproveitamento}%`, backgroundColor: corAproveitamento }]} />
                </View>
                <Text style={styles.heroCardSub}>
                  {totalAcertos} acertos de {totalQuestoes} questões
                </Text>
              </View>

              {/* Card B: Ritmo de Resolução */}
              <View style={styles.heroCard}>
                <View style={styles.heroCardHeader}>
                  <Text style={styles.heroCardLabel}>TEMPO MÉDIO</Text>
                  <Ionicons name="stopwatch-outline" size={16} color={themeColors.primary} />
                </View>
                <Text style={styles.heroCardValue}>
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
                <Text style={styles.heroCardSub}>
                  Total: {formatSegundosEmHoras(timeStats.tempoTotalSegundos)} de foco ativo
                </Text>
              </View>
            </View>

            {/* 3. Card de Saúde da Memória & Curva de Esquecimento (SM-2) */}
            <View style={styles.sectionCard}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.titleWithIcon}>
                  <Ionicons name="sparkles" size={18} color={themeColors.primary} style={{ marginRight: 8 }} />
                  <Text style={styles.sectionTitle}>Saúde da Memória (SM-2)</Text>
                </View>
                <View style={styles.memoryTotalBadge}>
                  <Text style={styles.memoryTotalBadgeText}>{memoryHealth.total} no algoritmo</Text>
                </View>
              </View>

              <Text style={styles.sectionDesc}>
                Distribuição da retenção de longo prazo e revisões agendadas.
              </Text>

              {/* Barra Tripla Segmentada de Retenção */}
              <View style={styles.memoryBarContainer}>
                {memoryHealth.total > 0 ? (
                  <>
                    <View
                      style={[
                        styles.memoryBarSegment,
                        {
                          backgroundColor: '#10B981',
                          flex: Math.max(1, memoryHealth.longoPrazo),
                          borderTopLeftRadius: 6,
                          borderBottomLeftRadius: 6,
                        },
                      ]}
                    />
                    <View
                      style={[
                        styles.memoryBarSegment,
                        {
                          backgroundColor: '#F59E0B',
                          flex: Math.max(1, memoryHealth.consolidando),
                        },
                      ]}
                    />
                    <View
                      style={[
                        styles.memoryBarSegment,
                        {
                          backgroundColor: '#EF4444',
                          flex: Math.max(1, memoryHealth.pendentes),
                          borderTopRightRadius: 6,
                          borderBottomRightRadius: 6,
                        },
                      ]}
                    />
                  </>
                ) : (
                  <View style={[styles.memoryBarSegment, { backgroundColor: '#2E3236', flex: 1, borderRadius: 6 }]} />
                )}
              </View>

              {/* Legenda dos 3 Estados */}
              <View style={styles.memoryLegendRow}>
                <View style={styles.memoryLegendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
                  <Text style={styles.memoryLegendText}>Retidas ({memoryHealth.longoPrazo})</Text>
                </View>
                <View style={styles.memoryLegendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
                  <Text style={styles.memoryLegendText}>Em Treino ({memoryHealth.consolidando})</Text>
                </View>
                <View style={styles.memoryLegendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
                  <Text style={styles.memoryLegendText}>Vencidas ({memoryHealth.pendentes})</Text>
                </View>
              </View>

              {/* Call-to-action para Iniciar Revisão do SM-2 se houver pendências */}
              {memoryHealth.pendentes > 0 ? (
                <TouchableOpacity
                  style={styles.reviewSm2Banner}
                  activeOpacity={0.85}
                  onPress={iniciarRevisaoSM2}
                  disabled={gerandoSessaoSM2}
                >
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.reviewSm2Title}>
                      {memoryHealth.pendentes} {memoryHealth.pendentes === 1 ? 'questão venceu' : 'questões venceram'} hoje
                    </Text>
                    <Text style={styles.reviewSm2Subtitle}>
                      {gerandoSessaoSM2 ? 'Preparando caderno de revisão...' : 'Revise agora antes que caia no esquecimento.'}
                    </Text>
                  </View>
                  <View style={styles.reviewSm2Button}>
                    {gerandoSessaoSM2 ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Ionicons name="play" size={14} color="#FFFFFF" />
                    )}
                  </View>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* 4. Heatmap Interativo de Consistência (Estilo GitHub) */}
            <Heatmap />

            {/* 5. Raio-X das 5 Grandes Áreas da Residência Médica */}
            <View style={styles.sectionCard}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.titleWithIcon}>
                  <MaterialCommunityIcons name="view-grid-outline" size={18} color={themeColors.primary} style={{ marginRight: 8 }} />
                  <Text style={styles.sectionTitle}>Raio-X das 5 Grandes Áreas</Text>
                </View>
                <Text style={styles.cardBadge}>Provas de R1</Text>
              </View>

              <Text style={styles.sectionDesc}>
                Distribuição e aproveitamento nos pilares do ciclo clínico.
              </Text>

              <View style={styles.areasContainer}>
                {grandesAreas.map((area) => {
                  const corBarra = getAproveitamentoCor(area.taxa);
                  return (
                    <View key={area.key} style={styles.areaRow}>
                      <View style={styles.areaHeader}>
                        <View style={styles.areaTitleRow}>
                          <View style={[styles.areaIconBox, { backgroundColor: `${area.cor}20` }]}>
                            <MaterialCommunityIcons name={area.icone as any} size={15} color={area.cor} />
                          </View>
                          <Text style={styles.areaName}>{area.label}</Text>
                        </View>
                        <View style={styles.areaStatsRow}>
                          <Text style={styles.areaCountText}>
                            {area.total} {area.total === 1 ? 'questão' : 'questões'}
                          </Text>
                          <Text style={[styles.areaTaxaText, { color: corBarra }]}>
                            {area.total > 0 ? `${area.taxa}%` : '--'}
                          </Text>
                        </View>
                      </View>

                      {/* Barra de Aproveitamento por Área */}
                      <View style={styles.areaProgressTrack}>
                        <View
                          style={[
                            styles.areaProgressFill,
                            {
                              width: `${area.total > 0 ? area.taxa : 0}%`,
                              backgroundColor: corBarra,
                            },
                          ]}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* 6. Top Gargalos & Pontos Fracos com Treino Focado */}
            <View style={styles.sectionCard}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.titleWithIcon}>
                  <Ionicons name="alert-circle-outline" size={19} color="#EF4444" style={{ marginRight: 8 }} />
                  <Text style={styles.sectionTitle}>Gargalos Clínicos</Text>
                </View>
                <View style={[styles.cardBadge, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
                  <Text style={[styles.cardBadgeText, { color: '#EF4444' }]}>Abaixo de 75%</Text>
                </View>
              </View>

              <Text style={styles.sectionDesc}>
                Temas com menor taxa de acerto no período. Toque para ver o raio-x e treinar.
              </Text>

              {gargalos.length > 0 ? (
                <View style={styles.gargalosList}>
                  {gargalos.map((g, idx) => {
                    const corTaxa = getAproveitamentoCor(g.taxa);
                    return (
                      <TouchableOpacity
                        key={`gargalo-${g.tema}-${idx}`}
                        style={styles.gargaloItemCard}
                        activeOpacity={0.8}
                        onPress={() => setSelectedGargalo(g)}
                      >
                        <View style={styles.gargaloItemHeader}>
                          <View style={{ flex: 1, marginRight: 8 }}>
                            <Text style={styles.gargaloItemTitle} numberOfLines={1}>
                              {g.tema}
                            </Text>
                            <Text style={styles.gargaloItemSub} numberOfLines={1}>
                              {g.especialidade || 'Clínica Médica'} • {g.total} resoluções
                            </Text>
                          </View>
                          <View style={[styles.gargaloTaxaBadge, { borderColor: `${corTaxa}50`, backgroundColor: `${corTaxa}15` }]}>
                            <Text style={[styles.gargaloTaxaText, { color: corTaxa }]}>
                              {g.taxa}%
                            </Text>
                          </View>
                        </View>

                        <View style={styles.gargaloFooterRow}>
                          <Text style={styles.gargaloAcertosText}>
                            {g.acertos} acertos de {g.total}
                          </Text>
                          <View style={styles.gargaloActionBtn}>
                            <Text style={styles.gargaloActionBtnText}>Raio-X & Treino</Text>
                            <Ionicons name="chevron-forward" size={13} color={themeColors.primary} />
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.emptyGargaloBox}>
                  <Ionicons name="shield-checkmark-outline" size={36} color="#10B981" />
                  <Text style={styles.emptyGargaloTitle}>Nenhum gargalo crítico detectado!</Text>
                  <Text style={styles.emptyGargaloSub}>
                    Seu aproveitamento está acima de 75% nos temas respondidos neste período. Excelente domínio!
                  </Text>
                </View>
              )}
            </View>

            {/* 7. Card de Ofensiva / Streak com Link para o Modal */}
            <TouchableOpacity
              style={styles.streakFooterCard}
              activeOpacity={0.85}
              onPress={() => setModalStreakVisible(true)}
            >
              <View style={styles.streakFooterLeft}>
                <Text style={styles.flameEmoji}>🔥</Text>
                <View style={{ marginLeft: 12 }}>
                  <Text style={styles.streakFooterTitle}>
                    {streakInfo?.streak || 0} {streakInfo?.streak === 1 ? 'Dia de Ofensiva' : 'Dias de Ofensiva'}
                  </Text>
                  <Text style={styles.streakFooterSub}>
                    {streakInfo?.bestStreak
                      ? `Recorde histórico: ${streakInfo.bestStreak} dias seguidos`
                      : 'Resolva questões diariamente para consolidar o hábito'}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* Modal detalhado de Streak / Ofensiva */}
      <StreakModal
        visible={modalStreakVisible}
        onClose={() => setModalStreakVisible(false)}
        streakInfo={streakInfo}
      />

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
      paddingBottom: 40,
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
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.borderSubtle,
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

    /* Hero Metrics Grid */
    heroGrid: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 16,
    },
    heroCard: {
      flex: 1,
      backgroundColor: theme.surface,
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: theme.border,
    },
    heroCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    heroCardLabel: {
      fontSize: 10,
      fontWeight: '800',
      color: theme.textSecondary,
      letterSpacing: 0.5,
    },
    heroCardValue: {
      fontSize: 24,
      fontWeight: '900',
      color: theme.text,
      marginBottom: 6,
    },
    heroCardSub: {
      fontSize: 10.5,
      color: theme.textMuted,
      marginTop: 6,
      lineHeight: 14,
    },
    progressBarTrack: {
      height: 4,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
      borderRadius: 2,
      overflow: 'hidden',
    },
    progressBarFill: {
      height: '100%',
      borderRadius: 2,
    },
    ritmoBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      alignSelf: 'flex-start',
    },
    ritmoBadgeText: {
      fontSize: 10,
      fontWeight: '700',
    },

    /* Seção Padrão de Card */
    sectionCard: {
      backgroundColor: theme.surface,
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: theme.border,
    },
    cardHeaderRow: {
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
    memoryBarContainer: {
      flexDirection: 'row',
      height: 8,
      marginBottom: 10,
    },
    memoryBarSegment: {
      height: '100%',
    },
    memoryLegendRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    memoryLegendItem: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    legendDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
      marginRight: 5,
    },
    memoryLegendText: {
      fontSize: 11,
      color: theme.textSecondary,
      fontWeight: '600',
    },
    reviewSm2Banner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.backgroundSecondary,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: theme.primaryBorder,
      marginTop: 4,
    },
    reviewSm2Title: {
      fontSize: 13,
      fontWeight: '800',
      color: theme.text,
    },
    reviewSm2Subtitle: {
      fontSize: 11,
      color: theme.textSecondary,
      marginTop: 2,
    },
    reviewSm2Button: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },

    /* As 5 Grandes Áreas */
    areasContainer: {
      gap: 12,
    },
    areaRow: {
      marginBottom: 4,
    },
    areaHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    areaTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    areaIconBox: {
      width: 26,
      height: 26,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 8,
    },
    areaName: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.text,
    },
    areaStatsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    areaCountText: {
      fontSize: 11,
      color: theme.textMuted,
    },
    areaTaxaText: {
      fontSize: 13,
      fontWeight: '800',
    },
    areaProgressTrack: {
      height: 5,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
      borderRadius: 3,
      overflow: 'hidden',
    },
    areaProgressFill: {
      height: '100%',
      borderRadius: 3,
    },

    /* Gargalos Clínicos */
    gargalosList: {
      gap: 10,
    },
    gargaloItemCard: {
      backgroundColor: theme.backgroundSecondary,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: theme.border,
    },
    gargaloItemHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    gargaloItemTitle: {
      fontSize: 13.5,
      fontWeight: '700',
      color: theme.text,
    },
    gargaloItemSub: {
      fontSize: 11,
      color: theme.textSecondary,
      marginTop: 2,
    },
    gargaloTaxaBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      borderWidth: 1,
    },
    gargaloTaxaText: {
      fontSize: 12,
      fontWeight: '800',
    },
    gargaloFooterRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: theme.borderSubtle,
    },
    gargaloAcertosText: {
      fontSize: 11,
      color: theme.textMuted,
    },
    gargaloActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    gargaloActionBtnText: {
      fontSize: 11.5,
      fontWeight: '700',
      color: theme.primary,
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

    /* Streak Footer Card */
    streakFooterCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.surface,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 8,
    },
    streakFooterLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    flameEmoji: {
      fontSize: 24,
    },
    streakFooterTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.text,
    },
    streakFooterSub: {
      fontSize: 11,
      color: theme.textSecondary,
      marginTop: 2,
    },
  });
}
