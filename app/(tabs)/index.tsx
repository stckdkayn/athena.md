import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  TouchableOpacity,
  Image,
  useWindowDimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { LineChart, PieChart } from 'react-native-chart-kit';

import { Colors } from '@/constants/Colors';
import { storage } from '@/services/storage'; // <-- Importando o MMKV
import {
  clearActiveQuizSession,
  getQuestionEspecialidade,
  getQuestionFoco,
  getQuestionId,
  getQuestionMicroFoco,
  getQuestionTema,
  getQuestoesCache,
  getQuestoesMemoryCache,
  getQuestionsByThemes,
  loadActiveQuizSession,
} from '@/services/questionService';
import { getAllProgress, getQuestionsAnsweredTodayCount } from '@/services/progressService';

// Importação dos modais extraídos
import { NomeUsuarioModal } from '@/components/modals/NomeUsuarioModal';
import { MetaDiariaModal } from '@/components/modals/MetaDiariaModal';
import { GargaloDetalheModal, BottleneckTheme, FocoMetrica } from '@/components/modals/GargaloDetalheModal';
import { TreinoFocadoModal, TargetTreinoGargalo, MicroFocoTreinoOption } from '@/components/modals/TreinoFocadoModal';
import { StreakModal } from '@/components/modals/StreakModal';
import { getStreakInfo, StreakInfo } from '@/services/streakService';

interface ProgressRecord {
  id_questao?: string | number;
  tema?: string;
  especialidade?: string;
  foco?: string;
  foco_da_questao?: string;
  micro_foco?: string;
  microfoco?: string;
  subfoco?: string;
  correta: boolean;
  resposta_usuario?: string;
  gabarito?: string;
  data: string;
}

interface ThemeChartItem {
  name: string;
  rawName: string;
  population: number;
  percent: number;
  color: string;
  legendFontColor: string;
  legendFontSize: number;
}

type TimeRangeOption = 'hoje' | 'semana' | 'mes';

interface ActiveSessionInfo {
  currentIndex: number;
  totalQuestions: number;
}

interface LineChartDataset {
  data: number[];
  color?: (opacity?: number) => string;
  strokeWidth?: number;
}

interface EvolucaoMensalData {
  labels: string[];
  datasets: LineChartDataset[];
}

const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const gerarTemplateUltimos6Meses = () => {
  const meses: { ano: number; mes: number; label: string; count: number }[] = [];
  const agora = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    meses.push({
      ano: d.getFullYear(),
      mes: d.getMonth(),
      label: MESES_ABREV[d.getMonth()],
      count: 0,
    });
  }
  return meses;
};


/**
 * Retorna a cor sólida do aproveitamento de acordo com as faixas:
 * - 0% a 25%: Vermelho (#EF4444)
 * - 25% a 50%: Laranja (#F97316)
 * - 50% a 75%: Amarelo (#EAB308)
 * - 75% a 90%: Verde (#10B981)
 * - > 90%: Azul (#3B82F6)
 */
function getAproveitamentoCorSolida(taxa: number): string {
  if (taxa <= 25) return '#EF4444';
  if (taxa <= 50) return '#F97316';
  if (taxa <= 75) return '#EAB308';
  if (taxa <= 90) return '#10B981';
  return '#3B82F6';
}

const PALETA_CORES = ['#EAE115', '#FFF566', '#F5C518', '#FFFFFF', '#CBD5E1', '#E2E8F0', '#94A3B8', '#FBBF24'];

export default function InicioScreen() {
  const router = useRouter();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isLandscape = windowWidth > windowHeight;

  const cardInnerWidth = Math.max(windowWidth - 64, 280);
  const pieChartWidth = isLandscape ? 340 : cardInnerWidth;
  const legendLeft = isLandscape ? 180 : cardInnerWidth * 0.52;
  const lineChartWidth = Math.max(windowWidth - 72, 280);

  // Estados Base Síncronos
  const [userName, setUserName] = useState<string>(() => storage.getString('@athena_user_name') || '');
  const [metaDiaria, setMetaDiaria] = useState<number>(() => {
    const saved = storage.getString('@athena_meta_questoes_diaria');
    return saved ? parseInt(saved, 10) : 0;
  });
  
  const [timeRange, setTimeRange] = useState<TimeRangeOption>('hoje');
  const [volumeTotal, setVolumeTotal] = useState<number>(0);
  const [volumeAcertos, setVolumeAcertos] = useState<number>(0);
  const [volumeTaxa, setVolumeTaxa] = useState<number>(0);
  const [pieData, setPieData] = useState<ThemeChartItem[]>([]);
  const [gargalos, setGargalos] = useState<BottleneckTheme[]>([]);
  const [questoesHojeCount, setQuestoesHojeCount] = useState<number>(0);

  // Estados dos Modais Extraídos
  const [modalNomeVisible, setModalNomeVisible] = useState<boolean>(false);
  const [modalMetaVisible, setModalMetaVisible] = useState<boolean>(false);
  const [modalStreakVisible, setModalStreakVisible] = useState<boolean>(false);
  const [streakInfo, setStreakInfo] = useState<StreakInfo | null>(null);
  const [selectedGargalo, setSelectedGargalo] = useState<BottleneckTheme | null>(null);
  
  const [targetTreinoGargalo, setTargetTreinoGargalo] = useState<TargetTreinoGargalo | null>(null);
  const [selectedMicroFocos, setSelectedMicroFocos] = useState<string[]>([]);
  const [treinoFocadoLimit, setTreinoFocadoLimit] = useState<string>('10');
  const userEditedLimitRef = useRef<boolean>(false);
  
  const [activeSession, setActiveSession] = useState<ActiveSessionInfo | null>(null);

  const [dadosEvolucao, setDadosEvolucao] = useState<EvolucaoMensalData>(() => {
    const meses = gerarTemplateUltimos6Meses();
    return {
      labels: meses.map((m) => m.label),
      datasets: [{ data: meses.map(() => 0), color: (opacity = 1) => `rgba(234, 225, 21, ${opacity})`, strokeWidth: 3 }],
    };
  });

  const metaPeriodo = useMemo(() => {
    if (metaDiaria <= 0) return 0;
    if (timeRange === 'semana') return metaDiaria * 7;
    if (timeRange === 'mes') return metaDiaria * 30;
    return metaDiaria;
  }, [metaDiaria, timeRange]);

  const getMetaSucessoTexto = (): string => {
    if (timeRange === 'semana') return '🎯 Meta semanal concluída!';
    if (timeRange === 'mes') return '🎯 Meta mensal concluída!';
    return '🎯 Meta diária concluída!';
  };

  // Preparação de Treino Focado
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
        Alert.alert('Aviso', 'Nenhuma questão cadastrada no banco de dados.');
        return;
      }

      const targetFocoNorm = focoNome.trim().toLowerCase();
      const targetTemaNorm = targetTema.trim().toLowerCase();
      const targetEspNorm = targetEsp ? targetEsp.trim().toLowerCase() : '';

      const normalized = parsed.map((q: any, idx: number) => ({
        ...q,
        _stableId: getQuestionId(q, idx),
      }));

      let matched = normalized.filter((q: any) => {
        const qTema = getQuestionTema(q).trim().toLowerCase();
        if (qTema !== targetTemaNorm) return false;

        const qEsp = getQuestionEspecialidade(q).trim().toLowerCase();
        if (targetEspNorm && targetEspNorm !== 'geral' && qEsp && qEsp !== 'geral' && qEsp !== targetEspNorm) {
          return false;
        }

        const qFoco = getQuestionFoco(q).trim().toLowerCase();
        return qFoco === targetFocoNorm || (targetFocoNorm === 'abordagem geral' && (qFoco === 'geral' || !qFoco));
      });

      if (matched.length === 0) {
        matched = normalized.filter((q: any) => {
          const qTema = getQuestionTema(q).trim().toLowerCase();
          if (qTema !== targetTemaNorm) return false;

          const qFoco = getQuestionFoco(q).trim().toLowerCase();
          return qFoco === targetFocoNorm || (targetFocoNorm === 'abordagem geral' && (qFoco === 'geral' || !qFoco));
        });
      }

      const allQuestionIds = matched.map((q: any) => q._stableId);
      const microFocoQuestionsMap: Record<string, string[]> = {};
      const geralQuestionIds: string[] = [];

      for (const q of matched) {
        const rawMicro = getQuestionMicroFoco(q).trim();
        if (rawMicro) {
          const microNorm = rawMicro.toLowerCase();
          if (!microFocoQuestionsMap[microNorm]) microFocoQuestionsMap[microNorm] = [];
          microFocoQuestionsMap[microNorm].push(q._stableId);
        } else {
          geralQuestionIds.push(q._stableId);
        }
      }

      const bottleneckMicroFocos = foco.microFocos || [];
      const microFocosOptions: MicroFocoTreinoOption[] = [];
      const processedNorms = new Set<string>();

      for (const mf of bottleneckMicroFocos) {
        const mfNorm = mf.nome.trim().toLowerCase();
        processedNorms.add(mfNorm);
        const qIds = microFocoQuestionsMap[mfNorm] || [];
        microFocosOptions.push({
          nome: mf.nome,
          totalGargalo: mf.total,
          acertosGargalo: mf.acertos,
          taxaGargalo: mf.taxa,
          questoesCount: qIds.length,
          questionIds: qIds,
        });
      }

      for (const [mNorm, qIds] of Object.entries(microFocoQuestionsMap)) {
        if (!processedNorms.has(mNorm)) {
          const sampleQ = matched.find((q: any) => getQuestionMicroFoco(q).trim().toLowerCase() === mNorm);
          const nomeOriginal = sampleQ ? getQuestionMicroFoco(sampleQ).trim() : mNorm;
          microFocosOptions.push({
            nome: nomeOriginal,
            questoesCount: qIds.length,
            questionIds: qIds,
          });
          processedNorms.add(mNorm);
        }
      }

      const defaultSelected = microFocosOptions.map((opt) => opt.nome);
      if (geralQuestionIds.length > 0) defaultSelected.push('__geral__');

      setSelectedMicroFocos(defaultSelected);
      userEditedLimitRef.current = false;
      setTreinoFocadoLimit(String(matched.length || 10));
      setTargetTreinoGargalo({
        tema: targetTema,
        especialidade: targetEsp,
        foco: focoNome,
        microFocosOptions,
        geralQuestionIds,
        allQuestionIds,
        allQuestionsCount: matched.length,
      });
    } catch (err) {
      console.error('Erro ao preparar treino focado:', err);
      Alert.alert('Erro', 'Não foi possível carregar as questões para este foco.');
    }
  };

  const toggleMicroFoco = (nome: string) => {
    setSelectedMicroFocos((prev) =>
      prev.includes(nome) ? prev.filter((item) => item !== nome) : [...prev, nome]
    );
  };

  const totalQuestoesSelecionadas = useMemo(() => {
    if (!targetTreinoGargalo) return 0;
    if (targetTreinoGargalo.microFocosOptions.length === 0 && targetTreinoGargalo.geralQuestionIds.length === 0) {
      return targetTreinoGargalo.allQuestionsCount;
    }

    const ids = new Set<string>();
    for (const opt of targetTreinoGargalo.microFocosOptions) {
      if (selectedMicroFocos.includes(opt.nome)) {
        opt.questionIds.forEach(id => ids.add(id));
      }
    }
    if (selectedMicroFocos.includes('__geral__')) {
      targetTreinoGargalo.geralQuestionIds.forEach(id => ids.add(id));
    }
    return ids.size;
  }, [targetTreinoGargalo, selectedMicroFocos]);

  useEffect(() => {
    if (targetTreinoGargalo && !userEditedLimitRef.current) {
      setTreinoFocadoLimit(String(totalQuestoesSelecionadas));
    }
  }, [totalQuestoesSelecionadas, targetTreinoGargalo]);

  const todosMicroFocosMarcados = useMemo(() => {
    if (!targetTreinoGargalo) return false;
    const totalOpts = targetTreinoGargalo.microFocosOptions.length + (targetTreinoGargalo.geralQuestionIds.length > 0 ? 1 : 0);
    return totalOpts > 0 && selectedMicroFocos.length >= totalOpts;
  }, [targetTreinoGargalo, selectedMicroFocos]);

  const toggleTodosMicroFocos = () => {
    if (!targetTreinoGargalo) return;
    if (todosMicroFocosMarcados) {
      setSelectedMicroFocos([]);
    } else {
      const all = targetTreinoGargalo.microFocosOptions.map((opt) => opt.nome);
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
        opt.questionIds.forEach(id => ids.add(id));
      }
    }

    if (selectedMicroFocos.includes('__geral__')) {
      targetTreinoGargalo.geralQuestionIds.forEach(id => ids.add(id));
    }

    if (targetTreinoGargalo.microFocosOptions.length === 0 && targetTreinoGargalo.geralQuestionIds.length === 0) {
      targetTreinoGargalo.allQuestionIds.forEach(id => ids.add(id));
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

    // Usando armazenamento MMKV síncrono
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

  const getSaudacao = (): string => {
    const hora = new Date().getHours();
    if (hora >= 5 && hora < 12) return 'Bom dia';
    if (hora >= 12 && hora < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  const getGreetingText = (): string => {
    const saudacao = getSaudacao();
    if (userName && userName.trim()) {
      const clean = userName.trim();
      const suffix = clean.endsWith('.') ? '' : '.';
      return `${saudacao}, ${clean}${suffix}`;
    }
    return `${saudacao}, Dr.`;
  };

  const getDataFormatada = (): string => {
    try {
      const options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' };
      const data = new Date().toLocaleDateString('pt-BR', options);
      return data.charAt(0).toUpperCase() + data.slice(1);
    } catch {
      return '';
    }
  };

  // Carregamento de Métricas O(1) via SQLite + MMKV
  const carregarMetricas = useCallback(async () => {
    try {
      const [records, streakData] = await Promise.all([
        getAllProgress(),
        getStreakInfo(),
      ]);
      setStreakInfo(streakData);

      const ultimos6Meses = gerarTemplateUltimos6Meses();

      for (const item of records) {
        if (!item.data) continue;
        const d = new Date(item.data);
        if (isNaN(d.getTime())) continue;

        const itemAno = d.getFullYear();
        const itemMes = d.getMonth();

        const match = ultimos6Meses.find((m) => m.ano === itemAno && m.mes === itemMes);
        if (match) match.count += 1;
      }

      setDadosEvolucao({
        labels: ultimos6Meses.map((m) => m.label),
        datasets: [{ data: ultimos6Meses.map((m) => m.count), color: (opacity = 1) => `rgba(234, 225, 21, ${opacity})`, strokeWidth: 3 }],
      });

      if (!records || records.length === 0) {
        setVolumeTotal(0);
        setVolumeAcertos(0);
        setVolumeTaxa(0);
        setPieData([]);
        setGargalos([]);
        setQuestoesHojeCount(0);
        return;
      }

      const dataHoje = new Date();
      dataHoje.setHours(0, 0, 0, 0);
      const hojeLimit = dataHoje.getTime();
      
      const feitasHoje = await getQuestionsAnsweredTodayCount();
      setQuestoesHojeCount(feitasHoje);

      let limitDate: number;
      if (timeRange === 'hoje') limitDate = hojeLimit;
      else if (timeRange === 'semana') limitDate = Date.now() - (7 * 24 * 60 * 60 * 1000);
      else limitDate = Date.now() - (30 * 24 * 60 * 60 * 1000);

      const filtradas = records.filter((r) => {
        if (!r.data) return false;
        const d = new Date(r.data).getTime();
        return !isNaN(d) && d >= limitDate;
      });

      const totalPeriodo = filtradas.length;
      const acertosPeriodo = filtradas.filter((r) => !!r.correta).length;
      const taxaPeriodo = totalPeriodo > 0 ? Math.round((acertosPeriodo / totalPeriodo) * 100) : 0;

      setVolumeTotal(totalPeriodo);
      setVolumeAcertos(acertosPeriodo);
      setVolumeTaxa(taxaPeriodo);

      const countsPorTema: Record<string, number> = {};
      for (const r of filtradas) {
        const tema = (r.tema || 'Tema Geral').trim();
        countsPorTema[tema] = (countsPorTema[tema] || 0) + 1;
      }

      const sortedTemas = Object.entries(countsPorTema).sort((a, b) => b[1] - a[1]);
      let temasAgrupados = [];
      if (sortedTemas.length > 5) {
        const top4 = sortedTemas.slice(0, 4);
        const outrosCount = sortedTemas.slice(4).reduce((sum, item) => sum + item[1], 0);
        temasAgrupados = top4.map(([nome, count]) => ({ nome, count }));
        if (outrosCount > 0) temasAgrupados.push({ nome: 'Outros', count: outrosCount });
      } else {
        temasAgrupados = sortedTemas.map(([nome, count]) => ({ nome, count }));
      }

      const chartItems: ThemeChartItem[] = temasAgrupados.map((item, index) => {
        const percent = totalPeriodo > 0 ? Math.round((item.count / totalPeriodo) * 100) : 0;
        return {
          name: `${item.nome} ${percent}%`,
          rawName: item.nome,
          population: item.count,
          percent,
          color: PALETA_CORES[index % PALETA_CORES.length],
          legendFontColor: '#9CA3AF',
          legendFontSize: 11,
        };
      });

      setPieData(chartItems);

      const questoesMap: Record<string, any> = {};
      try {
        const parsedQuestoes = getQuestoesMemoryCache();
        if (Array.isArray(parsedQuestoes)) {
          for (const q of parsedQuestoes) {
            if (q && (q.id || q.id_questao)) {
              questoesMap[String(q.id ?? q.id_questao).trim()] = q;
            }
          }
        }
      } catch (e) {
        console.warn('Erro ao carregar mapa de questões para gargalo:', e);
      }

      const temasMap: Record<string, any> = {};
      for (const r of filtradas) {
        const t = (r.tema || 'Tema Geral').trim();
        const esp = (r.especialidade || 'Geral').trim();
        const rawFoco = (r.foco || r.foco_da_questao || 'Abordagem Geral').trim();
        const focoNome = rawFoco ? rawFoco.charAt(0).toUpperCase() + rawFoco.slice(1) : 'Abordagem Geral';

        let rawMicroFoco = (r.micro_foco || r.microfoco || r.subfoco || '').trim();
        if (!rawMicroFoco && r.id_questao && questoesMap[String(r.id_questao).trim()]) {
          const qFound = questoesMap[String(r.id_questao).trim()];
          rawMicroFoco = (qFound.micro_foco || qFound.microfoco || qFound.subfoco || (Array.isArray(qFound.tags) && qFound.tags.length > 3 ? qFound.tags[3] : '')).toString().trim();
        }
        const microFocoNome = rawMicroFoco ? rawMicroFoco.charAt(0).toUpperCase() + rawMicroFoco.slice(1) : '';

        if (!temasMap[t]) temasMap[t] = { total: 0, acertos: 0, especialidade: esp, focosMap: {} };
        temasMap[t].total += 1;
        if (r.correta) temasMap[t].acertos += 1;

        if (!temasMap[t].focosMap[focoNome]) temasMap[t].focosMap[focoNome] = { total: 0, acertos: 0, microFocosMap: {} };
        temasMap[t].focosMap[focoNome].total += 1;
        if (r.correta) temasMap[t].focosMap[focoNome].acertos += 1;

        if (microFocoNome) {
          if (!temasMap[t].focosMap[focoNome].microFocosMap[microFocoNome]) {
            temasMap[t].focosMap[focoNome].microFocosMap[microFocoNome] = { total: 0, acertos: 0 };
          }
          temasMap[t].focosMap[focoNome].microFocosMap[microFocoNome].total += 1;
          if (r.correta) temasMap[t].focosMap[focoNome].microFocosMap[microFocoNome].acertos += 1;
        }
      }

      const listaGargalos: BottleneckTheme[] = Object.entries(temasMap)
        .map(([tema, dados]) => {
          const taxa = Math.round((dados.acertos / dados.total) * 100);
          const focos: FocoMetrica[] = Object.entries(dados.focosMap).map(([nome, fDados]: [string, any]) => {
            const microFocos = Object.entries(fDados.microFocosMap).map(([mNome, mDados]: [string, any]) => ({
              nome: mNome,
              total: mDados.total,
              acertos: mDados.acertos,
              taxa: Math.round((mDados.acertos / mDados.total) * 100),
            })).sort((a, b) => a.taxa - b.taxa || b.total - a.total);

            return {
              nome,
              total: fDados.total,
              acertos: fDados.acertos,
              taxa: Math.round((fDados.acertos / fDados.total) * 100),
              microFocos,
            };
          }).sort((a, b) => a.taxa - b.taxa || b.total - a.total);

          return { tema, especialidade: dados.especialidade, total: dados.total, acertos: dados.acertos, taxa, focos };
        })
        .filter((item) => item.taxa < 75)
        .sort((a, b) => a.taxa - b.taxa || b.total - a.total)
        .slice(0, 5);

      setGargalos(listaGargalos);
    } catch (err) {
      console.error('Erro ao processar métricas da tela Início:', err);
    }
  }, [timeRange]);

  const verificarSessaoAtiva = async () => {
    try {
      const parsed = await loadActiveQuizSession();
      if (parsed && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
        setActiveSession({
          currentIndex: typeof parsed.currentIndex === 'number' ? parsed.currentIndex : 0,
          totalQuestions: parsed.questions.length,
        });
        return;
      }
      setActiveSession(null);
    } catch (err) {
      console.error('Erro ao verificar sessão ativa no Início:', err);
      setActiveSession(null);
    }
  };

  const continuarQuiz = () => {
    router.push({
      pathname: '/treino/quiz',
      params: { retomar: 'true' },
    });
  };

  useFocusEffect(
    useCallback(() => {
      carregarMetricas();
      verificarSessaoAtiva();
    }, [carregarMetricas])
  );

  const chartConfig = {
    color: (opacity = 1) => `rgba(234, 225, 21, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
  };

  const lineChartConfig = {
    backgroundColor: Colors.surface,
    backgroundGradientFrom: Colors.surface,
    backgroundGradientTo: Colors.surface,
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(234, 225, 21, ${opacity})`,
    labelColor: () => Colors.textSecondary,
    propsForDots: { r: '4', strokeWidth: '2', stroke: Colors.primary, fill: Colors.surface },
    propsForBackgroundLines: { stroke: 'rgba(255, 255, 255, 0.05)', strokeDasharray: '4, 4' },
  };

  const getPeriodoLabel = (): string => {
    if (timeRange === 'hoje') return 'HOJE';
    if (timeRange === 'semana') return 'ÚLTIMA SEMANA';
    return 'ÚLTIMO MÊS';
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar hidden={true} barStyle="light-content" backgroundColor="#000000" />

      {/* Cabeçalho oficial Athena.md */}
      <View style={styles.headerBar}>
        <View style={styles.brandRow}>
          <Image source={require('../../assets/athena-logo.jpg')} style={styles.brandLogo} resizeMode="cover" />
          <Text style={styles.brandTitle}>Athena<Text style={styles.brandAccent}>.md</Text></Text>
        </View>

        {/* Badge de Ofensiva / Streak no canto direito */}
        <TouchableOpacity
          style={[
            styles.streakBadgeBtn,
            streakInfo?.activeToday ? styles.streakBadgeBtnActive : styles.streakBadgeBtnPending,
          ]}
          activeOpacity={0.75}
          onPress={() => setModalStreakVisible(true)}
        >
          <Ionicons
            name={streakInfo?.activeToday ? 'flame' : 'flame-outline'}
            size={18}
            color={streakInfo?.activeToday ? Colors.primary : '#8E959E'}
            style={{ marginRight: 5 }}
          />
          <Text
            style={[
              styles.streakBadgeText,
              streakInfo?.activeToday ? styles.streakBadgeTextActive : styles.streakBadgeTextPending,
            ]}
          >
            {streakInfo ? `${streakInfo.streak} ${streakInfo.streak === 1 ? 'dia' : 'dias'}` : '0 dias'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.contentContainer}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Saudação com emoji de aceno e data */}
          <View style={styles.greetingContainer}>
            {getDataFormatada().length > 0 && (
              <Text style={styles.greetingDate}>{getDataFormatada().toUpperCase()}</Text>
            )}
            <TouchableOpacity style={styles.greetingTitleRow} onPress={() => setModalNomeVisible(true)} activeOpacity={0.7}>
              <Text style={styles.greetingTitle}>{getGreetingText()}</Text>
              <Text style={styles.greetingEmoji}>👋</Text>
            </TouchableOpacity>
          </View>

          {/* Banner de Sessão Ativa Remodelado */}
          {activeSession && (
            <TouchableOpacity
              style={styles.activeSessionBanner}
              activeOpacity={0.85}
              onPress={continuarQuiz}
            >
              <View style={styles.activeSessionIcon}>
                <Ionicons name="play" size={16} color="#000000" />
              </View>
              <View style={styles.activeSessionTextCol}>
                <Text style={styles.activeSessionBannerTitle}>Sessão em Andamento</Text>
                <Text style={styles.activeSessionBannerSub}>
                  Você parou na questão {activeSession.currentIndex + 1} de {activeSession.totalQuestions}.
                </Text>
              </View>
              <Text style={styles.activeSessionBtnText}>Continuar</Text>
            </TouchableOpacity>
          )}

          {/* Filtro Temporal UI: Hoje, Semana, Mês */}
          <View style={styles.timeFilterContainer}>
            <TouchableOpacity
              style={[
                styles.timeFilterButton,
                timeRange === 'hoje' ? styles.timeFilterButtonActive : styles.timeFilterButtonInactive,
              ]}
              activeOpacity={0.8}
              onPress={() => setTimeRange('hoje')}
            >
              <Text
                style={[
                  styles.timeFilterButtonText,
                  timeRange === 'hoje' ? styles.timeFilterTextActive : styles.timeFilterTextInactive,
                ]}
              >
                Hoje
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.timeFilterButton,
                timeRange === 'semana' ? styles.timeFilterButtonActive : styles.timeFilterButtonInactive,
              ]}
              activeOpacity={0.8}
              onPress={() => setTimeRange('semana')}
            >
              <Text
                style={[
                  styles.timeFilterButtonText,
                  timeRange === 'semana' ? styles.timeFilterTextActive : styles.timeFilterTextInactive,
                ]}
              >
                Semana
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.timeFilterButton,
                timeRange === 'mes' ? styles.timeFilterButtonActive : styles.timeFilterButtonInactive,
              ]}
              activeOpacity={0.8}
              onPress={() => setTimeRange('mes')}
            >
              <Text
                style={[
                  styles.timeFilterButtonText,
                  timeRange === 'mes' ? styles.timeFilterTextActive : styles.timeFilterTextInactive,
                ]}
              >
                Mês
              </Text>
            </TouchableOpacity>
          </View>

          {/* Linha de Cards de Resumo do Período */}
          <View style={styles.metricsRow}>
            <TouchableOpacity
              style={styles.metricCard}
              onPress={() => setModalMetaVisible(true)}
              activeOpacity={0.7}
            >
              <View style={styles.metricIconRow}>
                <Ionicons name="flash-outline" size={18} color={Colors.primary} />
                <Text style={styles.metricCardLabel}>{getPeriodoLabel()}</Text>
                {metaPeriodo <= 0 && (
                  <View style={styles.metaBadge}>
                    <Ionicons name="flag-outline" size={11} color={Colors.primary} style={{ marginRight: 3 }} />
                    <Text style={styles.metaBadgeText}>DEFINIR META</Text>
                  </View>
                )}
              </View>

              {metaPeriodo > 0 ? (
                <View style={styles.metaValueContainer}>
                  <Text style={styles.metricCardValue}>
                    {volumeTotal}
                    <Text style={styles.metricCardValueMeta}>/{metaPeriodo}</Text>
                  </Text>
                </View>
              ) : (
                <Text style={styles.metricCardValue}>{volumeTotal}</Text>
              )}

              {metaPeriodo > 0 && (
                <View style={styles.metaProgressBarBg}>
                  <View
                    style={[
                      styles.metaProgressBarFill,
                      {
                        width: `${Math.min(100, Math.round((volumeTotal / metaPeriodo) * 100))}%`,
                        backgroundColor: volumeTotal >= metaPeriodo ? Colors.success : Colors.primary,
                      },
                    ]}
                  />
                </View>
              )}

              <Text style={styles.metricCardSubtext}>
                {metaPeriodo > 0 ? (
                  volumeTotal >= metaPeriodo ? getMetaSucessoTexto() : `Faltam ${metaPeriodo - volumeTotal} para a meta`
                ) : (
                  'Toque para definir meta'
                )}
              </Text>
            </TouchableOpacity>

            {(() => {
              const hasData = volumeTotal > 0;
              const corAproveitamento = hasData ? getAproveitamentoCorSolida(volumeTaxa) : Colors.textSecondary;
              return (
                <View style={styles.metricCard}>
                  <View style={styles.metricIconRow}>
                    <Ionicons
                      name="trending-up-outline"
                      size={18}
                      color={corAproveitamento}
                    />
                    <Text style={styles.metricCardLabel}>APROVEITAMENTO</Text>
                  </View>
                  <Text style={[styles.metricCardValue, { color: corAproveitamento }]}>
                    {hasData ? `${volumeTaxa}%` : '--'}
                  </Text>
                  <Text style={styles.metricCardSubtext}>
                    {hasData ? `${volumeAcertos} de ${volumeTotal} certas` : 'Sem questões no período'}
                  </Text>
                </View>
              );
            })()}
          </View>

          {/* Gráfico PieChart por Tema */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionTitleRow}>
                  <Ionicons name="pie-chart-outline" size={20} color={Colors.primary} style={{ marginRight: 8 }} />
                  <Text style={styles.sectionTitle}>Distribuição de Questões Feitas</Text>
                </View>
              </View>
              <Text style={styles.sectionSubtitle}>
                Proporção de questões resolvidas por assunto no período
              </Text>
            </View>

            {pieData.length > 0 ? (
              <View style={styles.chartWrapper}>
                <View style={styles.chartContainer}>
                  <View style={[styles.pieWrapper, isLandscape && { width: pieChartWidth }]}>
                    <PieChart
                      data={pieData}
                      width={pieChartWidth}
                      height={190}
                      chartConfig={chartConfig}
                      accessor="population"
                      backgroundColor="transparent"
                      paddingLeft="0"
                      hasLegend={false}
                    />
                  </View>
                  <View style={[styles.customLegendContainer, { left: legendLeft }]} pointerEvents="none">
                    {pieData.map((item, idx) => (
                      <View key={`${item.rawName}-${idx}`} style={styles.customLegendItem}>
                        <View style={styles.customLegendLeft}>
                          <View style={[styles.customLegendDot, { backgroundColor: item.color }]} />
                          <Text style={styles.customLegendName} numberOfLines={1} ellipsizeMode="tail">
                            {item.rawName}
                          </Text>
                        </View>
                        <Text style={styles.customLegendPercent}>{item.percent}%</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.emptyStateContainer}>
                <Ionicons name="calendar-outline" size={38} color="#3e4347" style={{ marginBottom: 10 }} />
                <Text style={styles.emptyStateTitle}>Nenhuma questão no período</Text>
                <Text style={styles.emptyStateSubtitle}>
                  Resolva questões dos seus temas favoritos para visualizar o gráfico de distribuição por tema.
                </Text>
              </View>
            )}
          </View>

          {/* Gargalos Críticos */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionTitleRow}>
                  <Ionicons name="alert-circle-outline" size={20} color={Colors.error} style={{ marginRight: 8 }} />
                  <Text style={styles.sectionTitle}>Temas Críticos</Text>
                </View>
                <View style={[styles.badgePill, { backgroundColor: 'rgba(255, 76, 76, 0.15)', borderColor: 'rgba(255, 76, 76, 0.3)' }]}>
                  <Text style={[styles.badgePillText, { color: Colors.error }]}>Taxa &lt; 75%</Text>
                </View>
              </View>
              <Text style={styles.sectionSubtitle}>
                Assuntos com rendimento abaixo de 75% para reforçar e revisar
              </Text>
            </View>

            {gargalos.length > 0 ? (
              <View style={styles.gargalosList}>
                {gargalos.map((item, idx) => {
                  const isVeryLow = item.taxa < 50;
                  const accentColor = isVeryLow ? Colors.error : '#F59E0B';
                  return (
                    <TouchableOpacity
                      key={`${item.tema}-${idx}`}
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
                          {item.especialidade} • {item.acertos}/{item.total} acertos
                        </Text>
                      </View>
                      <View style={[styles.gargaloRateBadge, { borderColor: accentColor }]}>
                        <Text style={[styles.gargaloRateText, { color: accentColor }]}>{item.taxa}%</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color="#64748b" style={{ marginLeft: 6 }} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <View style={styles.emptyStateContainer}>
                <Ionicons name="checkmark-done-circle-outline" size={38} color={Colors.success} style={{ marginBottom: 10 }} />
                <Text style={styles.emptyStateTitle}>
                  {volumeTotal > 0 ? 'Excelente! Nenhum gargalo crítico' : 'Sem histórico registrado'}
                </Text>
                <Text style={styles.emptyStateSubtitle}>
                  {volumeTotal > 0
                    ? 'Todos os temas praticados no período estão com aproveitamento acima de 75%.'
                    : 'Resolva questões para identificar os temas que precisam de reforço nos seus estudos.'}
                </Text>
              </View>
            )}
          </View>

          {/* Gráfico de Linha: Evolução Mensal Fixo (Últimos 6 meses) */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionTitleRow}>
                  <Ionicons name="trending-up-outline" size={20} color={Colors.primary} style={{ marginRight: 8 }} />
                  <Text style={styles.sectionTitle}>Evolução de Longo Prazo</Text>
                </View>
              </View>
              <Text style={styles.sectionSubtitle}>
                Volume de questões praticadas ao longo dos últimos 6 meses
              </Text>
            </View>

            <View style={styles.lineChartContainer}>
              <LineChart
                data={dadosEvolucao}
                width={lineChartWidth}
                height={220}
                bezier
                fromZero
                withInnerLines={true}
                withOuterLines={false}
                withVerticalLines={false}
                chartConfig={lineChartConfig}
                style={styles.lineChart}
              />
            </View>
          </View>
          <View style={{ height: 24 }} />
        </ScrollView>

        {/* Modais Extraídos (Otimização Arquitetural) */}
        <NomeUsuarioModal
          visible={modalNomeVisible}
          onClose={() => setModalNomeVisible(false)}
          onSave={setUserName}
          initialName={userName}
        />

        <MetaDiariaModal
          visible={modalMetaVisible}
          onClose={() => setModalMetaVisible(false)}
          onSave={setMetaDiaria}
          initialMeta={metaDiaria}
        />

        <StreakModal
          visible={modalStreakVisible}
          onClose={() => setModalStreakVisible(false)}
          streakInfo={streakInfo}
        />

        <GargaloDetalheModal
          visible={!!selectedGargalo}
          onClose={() => setSelectedGargalo(null)}
          gargalo={selectedGargalo}
          onPrepararTreino={prepararTreinoFoco}
        />

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
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000000',
  },
  headerBar: {
    backgroundColor: '#000000',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e2124',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandLogo: {
    width: 50,
    height: 50,
    marginRight: 14,
    borderRadius: 25,
  },
  brandTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  brandAccent: {
    color: Colors.primary,
  },
  streakBadgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  streakBadgeBtnActive: {
    backgroundColor: 'rgba(234, 225, 21, 0.1)',
    borderColor: 'rgba(234, 225, 21, 0.3)',
  },
  streakBadgeBtnPending: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  streakBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  streakBadgeTextActive: {
    color: Colors.primary,
  },
  streakBadgeTextPending: {
    color: '#8E959E',
  },
  contentContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    padding: 16,
  },
  greetingContainer: {
    paddingTop: 8,
    paddingBottom: 14,
    paddingHorizontal: 4,
  },
  greetingDate: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  greetingTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  greetingTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: Colors.text,
    letterSpacing: -0.6,
  },
  greetingEmoji: {
    fontSize: 26,
    marginLeft: 8,
  },
  
  /* Banner de Sessão Ativa Embutido no Topo */
  activeSessionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(234, 225, 21, 0.08)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(234, 225, 21, 0.3)',
  },
  activeSessionIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  activeSessionTextCol: {
    flex: 1,
  },
  activeSessionBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primary,
  },
  activeSessionBannerSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  activeSessionBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    backgroundColor: '#202428',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },

  /* Filtro Temporal UI */
  timeFilterContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
    paddingHorizontal: 2,
  },
  timeFilterButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  timeFilterButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  timeFilterButtonInactive: {
    backgroundColor: Colors.surface,
    borderColor: '#2e3235',
  },
  timeFilterButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  timeFilterTextActive: {
    color: '#000000',
  },
  timeFilterTextInactive: {
    color: Colors.textSecondary,
  },

  metricsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  metricCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2e3235',
    padding: 14,
  },
  metricIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  metricCardLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textSecondary,
    letterSpacing: 0.5,
  },
  metricCardValue: {
    fontSize: 28,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 2,
  },
  metricCardSubtext: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  sectionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2e3235',
    padding: 18,
    marginBottom: 14,
  },
  sectionHeader: {
    marginBottom: 14,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  sectionSubtitle: {
    fontSize: 12.5,
    color: Colors.textSecondary,
    marginTop: 4,
    lineHeight: 17,
  },
  badgePill: {
    backgroundColor: 'rgba(234, 225, 21, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(234, 225, 21, 0.25)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  chartWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    width: '100%',
  },
  chartContainer: {
    position: 'relative',
    width: '100%',
    minHeight: 190,
  },
  pieWrapper: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: 190,
  },
  customLegendContainer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  customLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  customLegendLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  customLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  customLegendName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: '#CBD5E1',
  },
  customLegendPercent: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
    textAlign: 'right',
    minWidth: 38,
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 12,
  },
  emptyStateTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  emptyStateSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  gargalosList: {
    gap: 10,
  },
  gargaloItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2d3135',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  gargaloIndexBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 76, 76, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  gargaloIndexText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.error,
  },
  gargaloInfo: {
    flex: 1,
    marginRight: 10,
  },
  gargaloTema: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 2,
  },
  gargaloEspecialidade: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  gargaloRateBadge: {
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  gargaloRateText: {
    fontSize: 13,
    fontWeight: '800',
  },
  metaValueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  metricCardValueMeta: {
    fontSize: 18,
    fontWeight: '700',
    color: '#8e959e',
  },
  metaBadge: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(234, 225, 21, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(234, 225, 21, 0.25)',
  },
  metaBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: 0.3,
  },
  metaProgressBarBg: {
    height: 4,
    backgroundColor: '#26292d',
    borderRadius: 2,
    marginVertical: 4,
    overflow: 'hidden',
    width: '100%',
  },
  metaProgressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  lineChartContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    borderRadius: 16,
  },
  lineChart: {
    marginVertical: 4,
    borderRadius: 16,
  },
});