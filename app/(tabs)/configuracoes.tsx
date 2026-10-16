import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  StatusBar,
  Modal,
  TextInput,
  Platform,
  BackHandler,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { Ionicons, MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { unzip } from 'react-native-zip-archive';
import JSZip from 'jszip';
import { useNavigation } from 'expo-router';
import { Colors, ThemeMode, AccentColorKey } from '@/constants/Colors';
import { useAppTheme } from '@/context/ThemeContext';
import {
  ICalFeed,
  getICalFeeds,
  addICalFeed,
  removeICalFeed,
  syncICalFeed,
  syncAllICalFeeds,
  getAutoSyncEnabled,
  setAutoSyncEnabled,
  getLastSyncTimestamp,
  importarArquivoICS,
  contarEventosICSLocais,
  limparEventosICSLocais,
} from '@/services/icsService';

import { storage } from '@/services/storage'; // <-- Motor Síncrono MMKV

import {
  getQuestoesCache,
  invalidateQuestoesCache,
  saveQuestoesStorage,
  clearQuestoesStorage,
  clearActiveQuizSession,
} from '@/services/questionService';
import {
  getDistinctProgressThemes,
  deleteProgressByThemes,
  getDiagnosticSummary,
  DiagnosticSummary,
} from '@/services/progressService';
import { limparGargalosEReplanejar } from '@/services/schedulerService';
import { invalidateImageCache, clearAllAthenaImages } from '@/services/imageService';
import {
  getGitHubConfig,
  saveGitHubConfig,
  getSyncMetadata,
  saveSyncMetadata,
  clearBancosSyncMetadata,
  resetSyncMetadata,
  clearUpdateStatus,
  testGitHubConnection,
  syncFromGitHub,
  checkForUpdates,
  normalizeQuestion,
  subscribeToUpdateStatus,
  checkSilentUpdates,
  UpdateNotificationStatus,
  SyncMetadata,
  SyncProgress,
  SyncResult,
  SyncCheckResult,
  syncCronogramaFromGitHub,
} from '@/services/githubSync';
import HealthIcon from '@/components/HealthIcon';
import {
  CronogramaData,
  CronogramaProgresso,
  getCronograma,
  getCronogramaProgresso,
  calcularProgressoGeral,
  pickAndImportCronograma,
  resetCronogramaProgresso,
  clearCronograma,
} from '@/services/scheduleService';

interface ImportSuccessInfo {
  adicionadas: number;
  duplicadas: number;
  totalFinal: number;
  especialidades: string[];
}

interface ImageImportSuccessInfo {
  totalExtraidas: number;
  subpasta: string;
  totalGeralImagens: number;
}

interface BancoItemInfo {
  id: string;
  nome: string;
  totalQuestoes: number;
}

interface GrupoBancosInfo {
  tagMaior: string;
  totalQuestoes: number;
  totalBancos: number;
  bancos: BancoItemInfo[];
}

interface PacoteItemInfo {
  nome: string;
  totalImagens: number;
  caminho: string;
}

interface GrupoPacotesInfo {
  tagMaior: string;
  totalImagens: number;
  totalPacotes: number;
  pacotes: PacoteItemInfo[];
}

function normalizarNomeParaComparacao(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\.zip$/i, '')
    .replace(/_imagens$/i, '')
    .replace(/-imagens$/i, '')
    .replace(/\s+imagens$/i, '')
    .replace(/_img$/i, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function calcularDistanciaLevenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = [];
  for (let i = 0; i <= m; i++) dp[i] = [i];
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + 1
        );
      }
    }
  }
  return dp[m][n];
}

function nomesSaoCompativeis(nomeBanco: string, nomePacote: string): boolean {
  const b = normalizarNomeParaComparacao(nomeBanco);
  const p = normalizarNomeParaComparacao(nomePacote);
  if (!b || !p) return false;
  if (b === p) return true;
  if (b.includes(p) || p.includes(b)) return true;
  const maxLen = Math.max(b.length, p.length);
  if (maxLen >= 5) {
    const dist = calcularDistanciaLevenshtein(b, p);
    if (dist <= 2) return true;
  }
  return false;
}

function extrairTagMaior(q: any): string {
  if (Array.isArray(q?.tags) && q.tags.length > 0) {
    const t0 = String(q.tags[0]).trim();
    if (t0) return t0;
  }
  if (q?.especialidade && typeof q.especialidade === 'string' && q.especialidade.trim()) {
    return q.especialidade.trim();
  }
  if (q?.area && typeof q.area === 'string' && q.area.trim()) {
    return q.area.trim();
  }
  return 'Geral';
}

function formatarNomeBanco(raw: string): string {
  if (!raw) return 'Geral';
  const clean = raw.replace(/\.json$/i, '').trim();
  if (/[A-Z]/.test(clean) && /\s/.test(clean)) {
    return clean;
  }
  if (/^[A-Z0-9_-]+$/.test(clean) && clean.length <= 5) {
    return clean.replace(/_/g, ' ');
  }
  const words = clean.replace(/_/g, ' ').split(/\s+/);
  return words
    .map((w) => {
      if (['de', 'da', 'do', 'dos', 'das', 'e', 'em', 'para', 'com', 'por'].includes(w.toLowerCase())) {
        return w.toLowerCase();
      }
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

export default function ConfiguracoesScreen() {
  const {
    mode,
    accentKey,
    setMode,
    setAccent,
    colors: themeColors,
    accentOption,
    availableAccents,
  } = useAppTheme();

  const [questoesCount, setQuestoesCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [unzipping, setUnzipping] = useState<boolean>(false);
  const [importandoICS, setImportandoICS] = useState<boolean>(false);
  const [totalImagensSalvas, setTotalImagensSalvas] = useState<number>(0);

  // Estados do Gerenciador de Armazenamento Granular
  const [gruposBancosList, setGruposBancosList] = useState<GrupoBancosInfo[]>([]);
  const [gruposPacotesList, setGruposPacotesList] = useState<GrupoPacotesInfo[]>([]);
  const [loadingStorage, setLoadingStorage] = useState<boolean>(false);
  const [itemParaExcluir, setItemParaExcluir] = useState<{
    tipo: 'banco' | 'imagem';
    id: string;
    nome: string;
    tagMaior?: string;
    count: number;
  } | null>(null);
  const [excluindoItem, setExcluindoItem] = useState<boolean>(false);

  // Estados dos Modais
  const [grupoBancosModal, setGrupoBancosModal] = useState<GrupoBancosInfo | null>(null);
  const [searchBancoModal, setSearchBancoModal] = useState<string>('');
  const [grupoPacotesModal, setGrupoPacotesModal] = useState<GrupoPacotesInfo | null>(null);
  const [searchPacoteModal, setSearchPacoteModal] = useState<string>('');
  const [modalZipVisible, setModalZipVisible] = useState<boolean>(false);
  const [zipUriPendente, setZipUriPendente] = useState<string | null>(null);
  const [pacoteOrigemInput, setPacoteOrigemInput] = useState<string>('');

  const [modalResetVisible, setModalResetVisible] = useState<boolean>(false);
  const [modalDiagnosticoVisible, setModalDiagnosticoVisible] = useState<boolean>(false);
  const [diagnosticoData, setDiagnosticoData] = useState<DiagnosticSummary | null>(null);
  const [carregandoDiagnostico, setCarregandoDiagnostico] = useState<boolean>(false);

  const abrirDiagnostico = async () => {
    setCarregandoDiagnostico(true);
    setModalDiagnosticoVisible(true);
    try {
      const data = await getDiagnosticSummary();
      setDiagnosticoData(data);
    } catch (err) {
      console.error('Erro ao abrir diagnóstico:', err);
    } finally {
      setCarregandoDiagnostico(false);
    }
  };
  const [temasDisponiveis, setTemasDisponiveis] = useState<string[]>([]);
  const [searchTema, setSearchTema] = useState<string>('');
  const [temasSelecionados, setTemasSelecionados] = useState<string[]>([]);
  const [temasParaConfirmar, setTemasParaConfirmar] = useState<string[] | null>(null);
  const [resettingTema, setResettingTema] = useState<boolean>(false);
  const [sucessoTemaReset, setSucessoTemaReset] = useState<string[] | null>(null);

  const [modalZerarBancoVisible, setModalZerarBancoVisible] = useState<boolean>(false);
  const [zerandoBanco, setZerandoBanco] = useState<boolean>(false);
  const [sucessoZerarBanco, setSucessoZerarBanco] = useState<boolean>(false);

  const [sucessoImportacao, setSucessoImportacao] = useState<ImportSuccessInfo | null>(null);
  const [sucessoImportacaoImagens, setSucessoImportacaoImagens] = useState<ImageImportSuccessInfo | null>(null);
  const [modalBancoVazioVisible, setModalBancoVazioVisible] = useState<boolean>(false);

  // Sincronização Nuvem (GitHub)
  const [modalGitHubConfigVisible, setModalGitHubConfigVisible] = useState<boolean>(false);
  const [gitHubTokenInput, setGitHubTokenInput] = useState<string>('');
  const [gitHubRepoInput, setGitHubRepoInput] = useState<string>('');
  const [mostrarToken, setMostrarToken] = useState<boolean>(false);
  const [testandoConexao, setTestandoConexao] = useState<boolean>(false);
  const [resultadoTesteConexao, setResultadoTesteConexao] = useState<{ sucesso: boolean; mensagem: string; } | null>(null);

  const [modalSyncProgressVisible, setModalSyncProgressVisible] = useState<boolean>(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress>({
    etapa: 'verificando', progressoAtual: 0, totalItens: 1, mensagem: 'Iniciando sincronização...',
  });

  const [modalSyncSuccessVisible, setModalSyncSuccessVisible] = useState<boolean>(false);
  const [syncResultData, setSyncResultData] = useState<SyncResult | null>(null);
  const [modalUpToDateVisible, setModalUpToDateVisible] = useState<boolean>(false);
  const [syncMetadata, setSyncMetadata] = useState<SyncMetadata | null>(null);
  const [temTokenConfigurado, setTemTokenConfigurado] = useState<boolean>(false);
  const [updateStatus, setUpdateStatusState] = useState<UpdateNotificationStatus>({
    hasUpdate: false, totalBancosNovos: 0, totalPacotesNovos: 0,
  });

  const [modalNovasQuestoesVisible, setModalNovasQuestoesVisible] = useState<boolean>(false);
  const [modalCredenciaisSalvasVisible, setModalCredenciaisSalvasVisible] = useState<boolean>(false);
  const [modalSyncErrorVisible, setModalSyncErrorVisible] = useState<boolean>(false);
  const [syncErrorMessage, setSyncErrorMessage] = useState<string>('');

  const [modalSincronizacaoSeletivaVisible, setModalSincronizacaoSeletivaVisible] = useState<boolean>(false);
  const [carregandoBancosRemotos, setCarregandoBancosRemotos] = useState<boolean>(false);
  const [checkResultRemoto, setCheckResultRemoto] = useState<SyncCheckResult | null>(null);
  const [especialidadesSelecionadas, setEspecialidadesSelecionadas] = useState<string[]>([]);
  const [baixarImagensCorrespondentes, setBaixarImagensCorrespondentes] = useState<boolean>(true);
  const [searchEspecialidadeFiltro, setSearchEspecialidadeFiltro] = useState<string>('');

  // Cronograma de Estudos
  const [cronogramaInfo, setCronogramaInfo] = useState<CronogramaData | null>(null);
  const [cronogramaProgresso, setCronogramaProgresso] = useState<CronogramaProgresso>({});
  const [cronogramaStats, setCronogramaStats] = useState<{ total: number; concluidos: number; porcentagem: number }>({
    total: 0, concluidos: 0, porcentagem: 0,
  });
  const [modalRemoverCronogramaVisible, setModalRemoverCronogramaVisible] = useState<boolean>(false);
  const [modalResetCronogramaVisible, setModalResetCronogramaVisible] = useState<boolean>(false);
  const [sucessoCronogramaModal, setSucessoCronogramaModal] = useState<{ titulo: string; semanas: number; topicos: number; } | null>(null);
  const [erroCronogramaModal, setErroCronogramaModal] = useState<string | null>(null);
  const [sucessoAcaoCronograma, setSucessoAcaoCronograma] = useState<{ titulo: string; mensagem: string; } | null>(null);
  const [baixandoCronogramaGitHub, setBaixandoCronogramaGitHub] = useState<boolean>(false);

  const [currentView, setCurrentView] = useState<'menu' | 'adicionar_questoes' | 'cronograma' | 'calendario'>('menu');
  const [icalFeeds, setIcalFeeds] = useState<ICalFeed[]>([]);
  const [autoSyncAtivo, setAutoSyncAtivo] = useState<boolean>(true);
  const [ultimoSyncTimestamp, setUltimoSyncTimestamp] = useState<number | null>(null);
  const [sincronizandoTudo, setSincronizandoTudo] = useState<boolean>(false);
  const [sincronizandoFeedId, setSincronizandoFeedId] = useState<string | null>(null);
  const [modalAddFeedVisible, setModalAddFeedVisible] = useState<boolean>(false);
  const [novoFeedNome, setNovoFeedNome] = useState<string>('');
  const [novoFeedUrl, setNovoFeedUrl] = useState<string>('');
  const [novoFeedTipo, setNovoFeedTipo] = useState<string>('Faculdade');
  const [salvandoNovoFeed, setSalvandoNovoFeed] = useState<boolean>(false);
  const [feedParaRemover, setFeedParaRemover] = useState<ICalFeed | null>(null);
  const [modalLimparICSVisible, setModalLimparICSVisible] = useState<boolean>(false);
  const [limpandoICS, setLimpandoICS] = useState<boolean>(false);
  const [totalEventosICSParaLimpar, setTotalEventosICSParaLimpar] = useState<number>(0);

  const carregarDadosCalendario = () => {
    try {
      setIcalFeeds(getICalFeeds());
      setAutoSyncAtivo(getAutoSyncEnabled());
      setUltimoSyncTimestamp(getLastSyncTimestamp());
    } catch (e) {
      console.error('Erro ao carregar dados do calendário:', e);
    }
  };
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['github']));

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };
  const navigation = useNavigation();

  const carregarDadosCronograma = () => {
    try {
      const data = getCronograma();
      const prog = getCronogramaProgresso();
      setCronogramaInfo(data);
      setCronogramaProgresso(prog || {});
      if (data && data.semanas) {
        setCronogramaStats(calcularProgressoGeral(data, prog || {}));
      } else {
        setCronogramaStats({ total: 0, concluidos: 0, porcentagem: 0 });
      }
    } catch (e) {
      console.error('Erro ao carregar cronograma em configurações:', e);
    }
  };

  useEffect(() => {
    carregarContagem();
    carregarTotalImagens();
    carregarGerenciadorArmazenamento();
    carregarMetadadosGitHub();
    carregarDadosCronograma();
    carregarDadosCalendario();

    const unsubUpdate = subscribeToUpdateStatus((status) => {
      setUpdateStatusState(status);
    });

    return () => unsubUpdate();
  }, []);

  useEffect(() => {
    const unsubTabPress = navigation.addListener('tabPress' as any, () => {
      setCurrentView('menu');
      setModalResetVisible(false);
      setModalZerarBancoVisible(false);
      setModalZipVisible(false);
      setModalNovasQuestoesVisible(false);
      setModalCredenciaisSalvasVisible(false);
      setModalSyncErrorVisible(false);
      setModalRemoverCronogramaVisible(false);
      setModalResetCronogramaVisible(false);
      setModalAddFeedVisible(false);
      setModalLimparICSVisible(false);
      setFeedParaRemover(null);
      setSucessoCronogramaModal(null);
      setErroCronogramaModal(null);
      setSucessoAcaoCronograma(null);
      setItemParaExcluir(null);
    });
    return unsubTabPress;
  }, [navigation]);

  useEffect(() => {
    const onBackPress = () => {
      if (currentView === 'adicionar_questoes' || currentView === 'cronograma' || currentView === 'calendario') {
        setCurrentView('menu');
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [currentView]);

  const carregarMetadadosGitHub = async () => {
    try {
      const cfg = await getGitHubConfig();
      if (cfg.owner && cfg.repo) setGitHubRepoInput(`${cfg.owner}/${cfg.repo}`);
      else setGitHubRepoInput('');
      setGitHubTokenInput(cfg.token || '');
      setTemTokenConfigurado(Boolean(cfg.token && cfg.token.trim().length > 0 && cfg.owner && cfg.repo));

      const meta = await getSyncMetadata();
      setSyncMetadata(meta);
    } catch (e) {
      console.warn('Erro ao carregar metadados GitHub:', e);
    }
  };

  const formatarData = (isoStr: string | null | undefined): string => {
    if (!isoStr) return 'Nunca';
    try {
      const d = new Date(isoStr);
      const dia = String(d.getDate()).padStart(2, '0');
      const mes = String(d.getMonth() + 1).padStart(2, '0');
      const hora = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      return `${dia}/${mes} às ${hora}:${min}`;
    } catch {
      return 'Data inválida';
    }
  };

  const abrirOpcaoAdicionarQuestoes = () => {
    setCurrentView('adicionar_questoes');
    if (updateStatus.hasUpdate) setModalNovasQuestoesVisible(true);
  };

  const abrirSincronizacaoGitHub = async () => {
    const cfg = await getGitHubConfig();
    if (!cfg.owner || !cfg.repo || !cfg.token || !cfg.token.trim()) {
      setResultadoTesteConexao(null);
      setModalGitHubConfigVisible(true);
      return;
    }
    executarSincronizacao(false);
  };

  const abrirModalSincronizacaoSeletiva = async () => {
    const cfg = await getGitHubConfig();
    if (!cfg.owner || !cfg.repo || !cfg.token || !cfg.token.trim()) {
      setResultadoTesteConexao(null);
      setModalGitHubConfigVisible(true);
      return;
    }

    setSearchEspecialidadeFiltro('');
    setModalSincronizacaoSeletivaVisible(true);
    setCarregandoBancosRemotos(true);

    try {
      const res = await checkForUpdates(cfg);
      setCheckResultRemoto(res);

      if (res.especialidadesComAtualizacao.length > 0) {
        setEspecialidadesSelecionadas(res.especialidadesComAtualizacao.map((e) => e.nome));
      } else if (questoesCount === 0) {
        setEspecialidadesSelecionadas(res.especialidades.map((e) => e.nome));
      } else {
        setEspecialidadesSelecionadas([]);
      }
    } catch (err: any) {
      console.warn('Erro ao verificar especialidades remotas:', err);
      Alert.alert('Falha ao consultar GitHub', err?.message || 'Não foi possível carregar a lista de especialidades do repositório.');
      setModalSincronizacaoSeletivaVisible(false);
    } finally {
      setCarregandoBancosRemotos(false);
    }
  };

  const toggleSelecionarEspecialidade = (nome: string) => {
    setEspecialidadesSelecionadas((prev) =>
      prev.includes(nome) ? prev.filter((e) => e !== nome) : [...prev, nome]
    );
  };

  const selecionarTodasComAtualizacao = () => {
    if (!checkResultRemoto) return;
    setEspecialidadesSelecionadas(checkResultRemoto.especialidadesComAtualizacao.map((e) => e.nome));
  };

  const selecionarTodasEspecialidades = () => {
    if (!checkResultRemoto) return;
    setEspecialidadesSelecionadas(checkResultRemoto.especialidades.map((e) => e.nome));
  };

  const desmarcarTodasEspecialidades = () => setEspecialidadesSelecionadas([]);

  const executarSincronizacaoSeletivaConfirmada = () => {
    if (especialidadesSelecionadas.length === 0) {
      Alert.alert('Nenhuma Seleção', 'Por favor, marque ao menos uma especialidade para baixar.');
      return;
    }
    setModalSincronizacaoSeletivaVisible(false);
    executarSincronizacao(false, undefined, baixarImagensCorrespondentes, especialidadesSelecionadas);
  };

  const executarSincronizacao = async (
    forceAll: boolean = false,
    selectedBancos?: string[],
    baixarImagens: boolean = true,
    selectedEspecialidades?: string[]
  ) => {
    setModalUpToDateVisible(false);
    setModalSyncProgressVisible(true);
    setSyncProgress({
      etapa: 'verificando', progressoAtual: 0, totalItens: 1, mensagem: 'Conectando ao repositório GitHub...', detalhe: 'Verificando versão remota e novidades...',
    });

    try {
      const result = await syncFromGitHub({
        forceAll, selectedBancos, selectedEspecialidades, baixarImagens, onProgress: (p) => setSyncProgress(p),
      });

      carregarContagem();
      await carregarTotalImagens();
      await carregarGerenciadorArmazenamento();
      await carregarMetadadosGitHub();

      setModalSyncProgressVisible(false);

      if (result.sucesso) {
        if (result.questoesAdicionadas === 0 && result.questoesAtualizadas === 0 && result.imagensExtraidas === 0 && !forceAll && !selectedBancos && !selectedEspecialidades) {
          setModalUpToDateVisible(true);
        } else {
          setSyncResultData(result);
          setModalSyncSuccessVisible(true);
        }
      } else {
        setSyncErrorMessage(result.mensagem || 'Não foi possível concluir a sincronização com o repositório.');
        setModalSyncErrorVisible(true);
      }
    } catch (err: any) {
      setModalSyncProgressVisible(false);
      setSyncErrorMessage(err?.message || 'Falha ao sincronizar com o GitHub. Verifique a conexão com a internet e as credenciais.');
      setModalSyncErrorVisible(true);
    }
  };

  const executarTesteConexao = async () => {
    const cleanRepo = gitHubRepoInput.trim();
    if (!cleanRepo || !cleanRepo.includes('/')) {
      setResultadoTesteConexao({ sucesso: false, mensagem: 'Por favor, informe o repositório no formato usuário/repositório.' });
      return;
    }

    const parts = cleanRepo.split('/');
    const owner = parts[0]?.trim() || '';
    const repo = parts[1]?.trim() || '';
    const cleanToken = gitHubTokenInput.trim();

    if (!owner || !repo || !cleanToken) {
      setResultadoTesteConexao({ sucesso: false, mensagem: 'Credenciais inválidas ou incompletas.' });
      return;
    }

    setTestandoConexao(true);
    setResultadoTesteConexao(null);
    try {
      const res = await testGitHubConnection({ owner, repo, branch: 'main', token: cleanToken });
      setResultadoTesteConexao({ sucesso: res.success, mensagem: res.message });
    } catch (e: any) {
      setResultadoTesteConexao({ sucesso: false, mensagem: e?.message || 'Erro inesperado ao testar conexão.' });
    } finally {
      setTestandoConexao(false);
    }
  };

  const salvarConfiguracoesGitHub = async () => {
    try {
      const cleanRepo = gitHubRepoInput.trim();
      const parts = cleanRepo.split('/');
      const owner = parts[0]?.trim() || '';
      const repo = parts[1]?.trim() || '';
      const cleanToken = gitHubTokenInput.trim();

      if (!owner || !repo || !cleanToken) {
        setResultadoTesteConexao({ sucesso: false, mensagem: 'Credenciais inválidas.' });
        return;
      }

      await saveGitHubConfig({ owner, repo, branch: 'main', token: cleanToken });
      setTemTokenConfigurado(true);
      setModalGitHubConfigVisible(false);
      checkSilentUpdates(true);
      setModalCredenciaisSalvasVisible(true);
    } catch (e: any) {
      setResultadoTesteConexao({ sucesso: false, mensagem: e?.message || 'Não foi possível salvar as configurações.' });
    }
  };

  const carregarContagem = async () => {
    try {
      const questoes = await getQuestoesCache();
      setQuestoesCount(questoes.length);
    } catch (error) {
      console.error('Erro ao ler questões:', error);
      setQuestoesCount(0);
    }
  };

  const carregarTotalImagens = async (): Promise<number> => {
    try {
      const baseDir = FileSystemLegacy.documentDirectory || (FileSystem as any).documentDirectory || (FileSystem.Paths?.document?.uri ? `${FileSystem.Paths.document.uri}/` : '');
      const targetDir = baseDir.endsWith('/') ? `${baseDir}AthenaImagens/` : `${baseDir}/AthenaImagens/`;
      const info = await FileSystemLegacy.getInfoAsync(targetDir);
      if (info.exists && info.isDirectory) {
        let totalCount = 0;
        const items = await FileSystemLegacy.readDirectoryAsync(targetDir);
        for (const item of items) {
          if (item === '__MACOSX' || item.startsWith('.')) continue;
          const itemPath = `${targetDir}${item}`;
          const itemInfo = await FileSystemLegacy.getInfoAsync(itemPath);
          if (itemInfo.isDirectory) {
            const subFiles = await FileSystemLegacy.readDirectoryAsync(itemPath);
            totalCount += subFiles.filter((f) => /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(f)).length;
          } else if (/\.(jpg|jpeg|png|webp|gif|svg)$/i.test(item)) {
            totalCount += 1;
          }
        }
        setTotalImagensSalvas(totalCount);
        return totalCount;
      }
      setTotalImagensSalvas(0);
      return 0;
    } catch {
      setTotalImagensSalvas(0);
      return 0;
    }
  };

  const carregarGerenciadorArmazenamento = async () => {
    try {
      setLoadingStorage(true);

      const parsed = await getQuestoesCache();
      const gruposBancosMap = new Map<string, Map<string, { count: number; nomeDisplay: string }>>();

      if (Array.isArray(parsed) && parsed.length > 0) {
        for (const q of parsed) {
            const tagMaior = extrairTagMaior(q);
            const rawOrigem = (q?.origem || q?.origin || q?.pacote || q?.banco || '').toString().trim();
            let idBanco = rawOrigem || 'banco_geral';
            let nomeDisplay = idBanco;

            if (idBanco === 'banco_geral') {
              const tagMaiorNorm = tagMaior.toLowerCase();
              const temaPrin = typeof q?.tema_principal === 'string' ? q.tema_principal.trim() : '';
              const temaSimp = typeof q?.tema === 'string' ? q.tema.trim() : '';
              if (temaPrin && temaPrin.toLowerCase() !== tagMaiorNorm) {
                nomeDisplay = temaPrin; idBanco = nomeDisplay;
              } else if (temaSimp && temaSimp.toLowerCase() !== tagMaiorNorm) {
                nomeDisplay = temaSimp; idBanco = nomeDisplay;
              } else if (Array.isArray(q?.tags) && q.tags.length > 0) {
                const tagDiff = q.tags.find((t: any) => typeof t === 'string' && t.trim().toLowerCase() !== tagMaiorNorm && t.trim().toLowerCase() !== 'bagagem');
                if (tagDiff) { nomeDisplay = String(tagDiff).trim(); idBanco = nomeDisplay; }
                else if (q.tags.length > 1) { nomeDisplay = String(q.tags[1]).trim(); idBanco = nomeDisplay; }
                else nomeDisplay = 'Geral';
              } else {
                nomeDisplay = 'Geral';
              }
            }

            if (!gruposBancosMap.has(tagMaior)) gruposBancosMap.set(tagMaior, new Map());
            const bancosDoGrupo = gruposBancosMap.get(tagMaior)!;

            if (!bancosDoGrupo.has(idBanco)) bancosDoGrupo.set(idBanco, { count: 0, nomeDisplay });
            const item = bancosDoGrupo.get(idBanco)!;
            item.count += 1;
          }
        }

      const novosGruposBancos: GrupoBancosInfo[] = Array.from(gruposBancosMap.entries())
        .map(([tagMaior, bancosMap]) => {
          const bancos: BancoItemInfo[] = Array.from(bancosMap.entries())
            .map(([id, val]) => ({ id, nome: formatarNomeBanco(val.nomeDisplay), totalQuestoes: val.count }))
            .sort((a, b) => b.totalQuestoes - a.totalQuestoes);
          return { tagMaior, totalQuestoes: bancos.reduce((acc, b) => acc + b.totalQuestoes, 0), totalBancos: bancos.length, bancos };
        })
        .sort((a, b) => b.totalQuestoes - a.totalQuestoes);

      setGruposBancosList(novosGruposBancos);

      const baseDir = FileSystemLegacy.documentDirectory || (FileSystem as any).documentDirectory || (FileSystem.Paths?.document?.uri ? `${FileSystem.Paths.document.uri}/` : '');
      const athenaImagensDir = baseDir.endsWith('/') ? `${baseDir}AthenaImagens/` : `${baseDir}/AthenaImagens/`;
      const dirInfo = await FileSystemLegacy.getInfoAsync(athenaImagensDir);

      const pacotesEncontrados: PacoteItemInfo[] = [];
      if (dirInfo.exists && dirInfo.isDirectory) {
        const items = await FileSystemLegacy.readDirectoryAsync(athenaImagensDir);
        for (const item of items) {
          if (item === '__MACOSX' || item.startsWith('.')) continue;
          const itemPath = `${athenaImagensDir}${item}`;
          const itemInfo = await FileSystemLegacy.getInfoAsync(itemPath);
          if (itemInfo.isDirectory) {
            const files = await FileSystemLegacy.readDirectoryAsync(itemPath);
            const imgCount = files.filter((f) => /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(f)).length;
            pacotesEncontrados.push({ nome: item, totalImagens: imgCount, caminho: `AthenaImagens/${item}/` });
          }
        }
      }

      const gruposPacotesMap = new Map<string, PacoteItemInfo[]>();
      for (const pacote of pacotesEncontrados) {
        let tagDestino: string | null = null;
        for (const grupo of novosGruposBancos) {
          const achou = grupo.bancos.some((banco) => nomesSaoCompativeis(banco.nome, pacote.nome) || nomesSaoCompativeis(banco.id, pacote.nome));
          if (achou) { tagDestino = grupo.tagMaior; break; }
        }
        if (!tagDestino) tagDestino = 'Outras Imagens';
        if (!gruposPacotesMap.has(tagDestino)) gruposPacotesMap.set(tagDestino, []);
        gruposPacotesMap.get(tagDestino)!.push(pacote);
      }

      const novosGruposPacotes: GrupoPacotesInfo[] = Array.from(gruposPacotesMap.entries())
        .map(([tagMaior, pacotes]) => {
          pacotes.sort((a, b) => a.nome.localeCompare(b.nome));
          return { tagMaior, totalImagens: pacotes.reduce((acc, p) => acc + p.totalImagens, 0), totalPacotes: pacotes.length, pacotes };
        })
        .sort((a, b) => a.tagMaior === 'Outras Imagens' ? 1 : b.tagMaior === 'Outras Imagens' ? -1 : b.totalImagens - a.totalImagens);

      setGruposPacotesList(novosGruposPacotes);
    } catch (err) {
      console.error('Erro ao carregar dados de armazenamento:', err);
    } finally {
      setLoadingStorage(false);
    }
  };

  const executarExclusaoItem = async () => {
    if (!itemParaExcluir) return;
    setExcluindoItem(true);
    try {
      if (itemParaExcluir.tipo === 'banco') {
        const idAlvo = itemParaExcluir.id;
        const nomeAlvo = itemParaExcluir.nome;
        const tagAlvo = itemParaExcluir.tagMaior;
        const excluirTodosDoGrupo = idAlvo === '__TODOS__';

        const parsed = await getQuestoesCache();
        if (Array.isArray(parsed)) {
          const filtradas = parsed.filter((q: any) => {
            const qTag = extrairTagMaior(q);
            if (tagAlvo && qTag !== tagAlvo) return true;
            if (excluirTodosDoGrupo) return false;

            const o = (q?.origem || q?.origin || q?.pacote || '').toString().trim();
            const t = (q?.tema_principal || q?.tema || '').toString().trim();

            const matchOrigem = o === idAlvo || o === nomeAlvo || normalizarNomeParaComparacao(o) === normalizarNomeParaComparacao(idAlvo) || normalizarNomeParaComparacao(o) === normalizarNomeParaComparacao(nomeAlvo);
            const matchTema = (!o || o === 'banco_geral') && (t === idAlvo || t === nomeAlvo || normalizarNomeParaComparacao(t) === normalizarNomeParaComparacao(idAlvo));

            return !(matchOrigem || matchTema);
          });

          await saveQuestoesStorage(filtradas);
          setQuestoesCount(filtradas.length);
          
          if (filtradas.length === 0) {
            await clearBancosSyncMetadata();
            storage.delete('@athena_cart');
            clearActiveQuizSession();
          } else {
            try {
              const cartRaw = storage.getString('@athena_cart');
              if (cartRaw) {
                const cartArr = JSON.parse(cartRaw);
                if (Array.isArray(cartArr)) {
                  const existingThemes = new Set(filtradas.map((q: any) => (q?.tema_principal || q?.tema || '').toString().trim().toLowerCase()));
                  const updatedCart = cartArr.filter((ci: any) => {
                    const t = (typeof ci === 'object' ? ci?.tema : ci) || '';
                    return existingThemes.has(String(t).trim().toLowerCase());
                  });
                  storage.set('@athena_cart', JSON.stringify(updatedCart));
                }
              }
            } catch {}
          }
        }

        try {
          const meta = await getSyncMetadata();
          let metaAlterado = false;
          if (meta.bancos) {
            for (const key of Object.keys(meta.bancos)) {
              if (excluirTodosDoGrupo || key === idAlvo || key === nomeAlvo || normalizarNomeParaComparacao(key) === normalizarNomeParaComparacao(idAlvo) || normalizarNomeParaComparacao(key) === normalizarNomeParaComparacao(nomeAlvo)) {
                delete meta.bancos[key];
                metaAlterado = true;
              }
            }
          }
          if (metaAlterado) { await saveSyncMetadata(meta); setSyncMetadata(meta); }
        } catch {}

        if (grupoBancosModal) {
          if (excluirTodosDoGrupo) setGrupoBancosModal(null);
          else {
            const bancosRestantes = grupoBancosModal.bancos.filter((b) => b.id !== idAlvo && b.nome !== nomeAlvo);
            if (bancosRestantes.length === 0) setGrupoBancosModal(null);
            else setGrupoBancosModal({ ...grupoBancosModal, bancos: bancosRestantes, totalBancos: bancosRestantes.length, totalQuestoes: bancosRestantes.reduce((acc, b) => acc + b.totalQuestoes, 0) });
          }
        }
      } else if (itemParaExcluir.tipo === 'imagem') {
        const idAlvo = itemParaExcluir.id;
        const excluirTodosDoGrupo = idAlvo === '__TODOS__';

        const baseDir = FileSystemLegacy.documentDirectory || (FileSystem as any).documentDirectory || (FileSystem.Paths?.document?.uri ? `${FileSystem.Paths.document.uri}/` : '');
        const athenaImagensDir = baseDir.endsWith('/') ? `${baseDir}AthenaImagens/` : `${baseDir}/AthenaImagens/`;

        if (excluirTodosDoGrupo && grupoPacotesModal) {
          for (const p of grupoPacotesModal.pacotes) {
            await FileSystemLegacy.deleteAsync(`${athenaImagensDir}${p.nome}/`, { idempotent: true });
          }
          setGrupoPacotesModal(null);
        } else {
          await FileSystemLegacy.deleteAsync(`${athenaImagensDir}${idAlvo}/`, { idempotent: true });

          if (grupoPacotesModal) {
            const pacotesRestantes = grupoPacotesModal.pacotes.filter((p) => p.nome !== idAlvo);
            if (pacotesRestantes.length === 0) setGrupoPacotesModal(null);
            else setGrupoPacotesModal({ ...grupoPacotesModal, pacotes: pacotesRestantes, totalPacotes: pacotesRestantes.length, totalImagens: pacotesRestantes.reduce((acc, p) => acc + p.totalImagens, 0) });
          }
        }

        invalidateImageCache();
        await carregarTotalImagens();

        try {
          const meta = await getSyncMetadata();
          let metaAlterado = false;
          if (meta.pacotes_imagens) {
            for (const key of Object.keys(meta.pacotes_imagens)) {
              if (excluirTodosDoGrupo || key === idAlvo || normalizarNomeParaComparacao(key) === normalizarNomeParaComparacao(idAlvo)) {
                delete meta.pacotes_imagens[key];
                metaAlterado = true;
              }
            }
          }
          if (metaAlterado) { await saveSyncMetadata(meta); setSyncMetadata(meta); }
        } catch {}
      }

      setItemParaExcluir(null);
      await carregarGerenciadorArmazenamento();
    } catch (err: any) {
      console.error('Erro ao excluir item do armazenamento:', err);
      Alert.alert('Erro', err?.message || 'Não foi possível concluir a exclusão.');
    } finally {
      setExcluindoItem(false);
    }
  };

  const importarJSON = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', '*/*'], copyToCacheDirectory: true });
      if (result.canceled || !result.assets || result.assets.length === 0) return;

      setLoading(true);
      const uri = result.assets[0].uri;
      const fileOrigem = (result.assets[0].name || 'banco').replace(/\.json$/i, '').trim();

      let fileContent: string;
      try {
        fileContent = await FileSystemLegacy.readAsStringAsync(uri, { encoding: FileSystemLegacy.EncodingType.UTF8 });
      } catch {
        try { fileContent = await new FileSystem.File(uri).text(); }
        catch {
          if (!uri.startsWith('content://')) fileContent = await (await fetch(uri)).text();
          else throw new Error('Não foi possível ler o arquivo selecionado.');
        }
      }

      const parsedData = JSON.parse(fileContent);
      if (!Array.isArray(parsedData)) throw new Error('O arquivo selecionado não contém uma lista válida.');

      const normalizedData = parsedData.map((item: any, idx: number) => normalizeQuestion(item, idx, fileOrigem || 'banco_geral'));
      
      let questoesAtuais = await getQuestoesCache();
      const existingIds = new Set<string>();
      for (const q of questoesAtuais) {
        const id = q?.id ?? q?.id_questao;
        if (id !== undefined && id !== null && String(id).trim() !== '') existingIds.add(String(id).trim());
      }

      const novasQuestoes: any[] = [];
      let duplicadasCount = 0;

      for (const q of normalizedData) {
        const qId = String(q.id).trim();
        if (existingIds.has(qId)) duplicadasCount++;
        else { existingIds.add(qId); novasQuestoes.push(q); }
      }

      const bancoFinal = [...questoesAtuais, ...novasQuestoes];
      await saveQuestoesStorage(bancoFinal);
      setQuestoesCount(bancoFinal.length);
      await carregarGerenciadorArmazenamento();

      const especialidadesDoLote = Array.from(new Set((novasQuestoes.length > 0 ? novasQuestoes : normalizedData).map((q) => q.especialidade).filter((e): e is string => Boolean(e && typeof e === 'string' && e.trim() !== ''))));
      setSucessoImportacao({ adicionadas: novasQuestoes.length, duplicadas: duplicadasCount, totalFinal: bancoFinal.length, especialidades: especialidadesDoLote });
    } catch (error: any) {
      Alert.alert('Erro ao Importar', error?.message || 'Não foi possível processar o arquivo JSON selecionado.');
    } finally {
      setLoading(false);
    }
  };

  const abrirModalZerarBanco = () => {
    if (questoesCount === 0 && totalImagensSalvas === 0) setModalBancoVazioVisible(true);
    else setModalZerarBancoVisible(true);
  };

  const executarZerarBanco = async () => {
    try {
      setZerandoBanco(true);
      
      await clearQuestoesStorage();
      storage.delete('@athena_cart'); // Síncrono
      clearActiveQuizSession(); // Síncrono
      setQuestoesCount(0);
      setGruposBancosList([]);

      await clearAllAthenaImages();
      setTotalImagensSalvas(0);
      setGruposPacotesList([]);
      setGrupoPacotesModal(null);

      await resetSyncMetadata();
      await clearUpdateStatus();
      
      await carregarGerenciadorArmazenamento();
      await carregarTotalImagens();
      await carregarMetadadosGitHub();

      setModalZerarBancoVisible(false);
      setSucessoZerarBanco(true);
    } catch (error) {
      console.error('Erro ao zerar banco:', error);
      Alert.alert('Erro', 'Não foi possível zerar o banco de dados.');
    } finally {
      setZerandoBanco(false);
    }
  };

  const cancelarModalZip = async () => {
    if (unzipping) return;
    if (zipUriPendente && zipUriPendente.includes('_staging_')) {
      try { await FileSystemLegacy.deleteAsync(zipUriPendente, { idempotent: true }); } catch {}
    }
    setModalZipVisible(false);
    setZipUriPendente(null);
  };

  const descompactarArquivoZip = async (zipUri: string, subfolder: string): Promise<number> => {
    const cleanSub = subfolder.trim().replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    const baseDir = FileSystemLegacy.documentDirectory || (FileSystem as any).documentDirectory || (FileSystem.Paths?.document?.uri ? `${FileSystem.Paths.document.uri}/` : '');
    const targetDir = `${baseDir.endsWith('/') ? `${baseDir}AthenaImagens/` : `${baseDir}/AthenaImagens/`}${cleanSub}/`;

    if (!(await FileSystemLegacy.getInfoAsync(targetDir)).exists) await FileSystemLegacy.makeDirectoryAsync(targetDir, { intermediates: true });

    let localZipPath: string | null = null;
    if (zipUri.startsWith('file://') && (zipUri.includes('AthenaImagens') || zipUri.includes('temp_zip_staging'))) localZipPath = zipUri;
    else {
      const tempZipFile = `${targetDir}temp_input_${Date.now()}.zip`;
      try {
        await FileSystemLegacy.copyAsync({ from: zipUri, to: tempZipFile });
        if ((await FileSystemLegacy.getInfoAsync(tempZipFile)).exists) localZipPath = tempZipFile;
      } catch {}
    }

    let unzippedViaNative = false;
    try {
      if (localZipPath) {
        try { await unzip(localZipPath.replace(/^file:\/\//, ''), targetDir.replace(/^file:\/\//, '')); unzippedViaNative = true; } catch {}
      }

      if (!unzippedViaNative) {
        const pathToRead = localZipPath || zipUri;
        let zipBuffer: ArrayBuffer | Uint8Array | string | null = null;
        let isBase64 = false;

        try { zipBuffer = await new FileSystem.File(pathToRead).arrayBuffer(); }
        catch {
          try { zipBuffer = await new FileSystem.File(pathToRead).bytes(); }
          catch {
            try { zipBuffer = await FileSystemLegacy.readAsStringAsync(pathToRead, { encoding: FileSystemLegacy.EncodingType.Base64 }); isBase64 = true; }
            catch {
              try { zipBuffer = await (await fetch(pathToRead)).arrayBuffer(); } catch {}
            }
          }
        }

        if (!zipBuffer) throw new Error('Não foi possível ler os dados do arquivo ZIP.');

        let zip = await JSZip.loadAsync(zipBuffer, isBase64 ? { base64: true } : undefined);
        let extractedCount = 0;
        for (const [filename, fileObj] of Object.entries(zip.files)) {
          if (fileObj.dir || filename.includes('__MACOSX') || filename.startsWith('.')) continue;
          const cleanName = filename.split('/').pop();
          if (!cleanName || !cleanName.match(/\.(jpg|jpeg|png|webp|gif|svg)$/i)) continue;

          try {
            const fileBase64 = await fileObj.async('base64');
            await FileSystemLegacy.writeAsStringAsync(`${targetDir}${cleanName}`, fileBase64, { encoding: FileSystemLegacy.EncodingType.Base64 });
            extractedCount++;
          } catch {}
        }
        if (extractedCount === 0) throw new Error('O arquivo ZIP foi lido, mas não contém imagens válidas.');
      }

      if (unzippedViaNative) {
        try {
          const rootItems = await FileSystemLegacy.readDirectoryAsync(targetDir);
          for (const item of rootItems) {
            if (item === '__MACOSX' || item.startsWith('.')) continue;
            const itemPath = `${targetDir}${item}`;
            if ((await FileSystemLegacy.getInfoAsync(itemPath)).isDirectory) {
              const subItems = await FileSystemLegacy.readDirectoryAsync(itemPath);
              for (const sub of subItems) {
                if (sub.match(/\.(jpg|jpeg|png|webp|gif|svg)$/i)) await FileSystemLegacy.moveAsync({ from: `${itemPath}/${sub}`, to: `${targetDir}${sub}` });
              }
            }
          }
        } catch {}
      }

      return (await FileSystemLegacy.readDirectoryAsync(targetDir)).filter((f) => /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(f)).length;
    } finally {
      if (localZipPath && (localZipPath.includes('_staging_') || localZipPath.includes('temp_input_'))) try { await FileSystemLegacy.deleteAsync(localZipPath, { idempotent: true }); } catch {}
      if (zipUri && zipUri !== localZipPath && zipUri.includes('_staging_')) try { await FileSystemLegacy.deleteAsync(zipUri, { idempotent: true }); } catch {}
    }
  };

  const selecionarArquivoZip = async () => {
    try {
      let pickedUri: string | null = null;
      let rawName = 'pacote';

      try {
        const result = await DocumentPicker.getDocumentAsync({ type: ['application/zip', 'application/x-zip-compressed', 'multipart/x-zip', '*/*'], copyToCacheDirectory: false });
        if (result.canceled || !result.assets || result.assets.length === 0) return;
        pickedUri = result.assets[0].uri;
        rawName = result.assets[0].name || 'pacote';
      } catch {
        try {
          const fileResult = await FileSystem.File.pickFileAsync({ mimeTypes: ['application/zip', 'application/x-zip-compressed', 'multipart/x-zip', '*/*'] });
          if (fileResult.canceled || !fileResult.result) return;
          const picked = Array.isArray(fileResult.result) ? fileResult.result[0] : fileResult.result;
          pickedUri = picked.uri;
          rawName = picked.name || 'pacote';
        } catch {
          Alert.alert('Erro', 'Não foi possível selecionar o arquivo.');
          return;
        }
      }

      if (!pickedUri) return;

      const baseDir = FileSystemLegacy.documentDirectory || (FileSystem as any).documentDirectory || (FileSystem.Paths?.document?.uri ? `${FileSystem.Paths.document.uri}/` : '');
      const stagingDir = baseDir.endsWith('/') ? `${baseDir}AthenaImagens/` : `${baseDir}/AthenaImagens/`;
      if (!(await FileSystemLegacy.getInfoAsync(stagingDir)).exists) await FileSystemLegacy.makeDirectoryAsync(stagingDir, { intermediates: true });

      const tempStagedZip = `${stagingDir}_staging_${Date.now()}.zip`;
      let stagedOk = false;

      try {
        await FileSystemLegacy.copyAsync({ from: pickedUri, to: tempStagedZip });
        const check = await FileSystemLegacy.getInfoAsync(tempStagedZip);
        if (check.exists && (check.size === undefined || check.size > 0)) stagedOk = true;
      } catch {}

      if (!stagedOk) {
        try {
          const srcFile = new FileSystem.File(pickedUri);
          const bytes = await srcFile.bytes();
          new FileSystem.File(tempStagedZip).write(bytes);
          stagedOk = true;
        } catch {}
      }

      setZipUriPendente(stagedOk ? tempStagedZip : pickedUri);
      setPacoteOrigemInput(rawName.replace(/\.zip$/i, '').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase() || 'pacote_1');
      setModalZipVisible(true);
    } catch {
      Alert.alert('Erro', 'Não foi possível selecionar o arquivo ZIP.');
    }
  };

  const confirmarImportacaoZip = async () => {
    if (!zipUriPendente) return;
    const subfolderName = pacoteOrigemInput.trim().replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    if (!subfolderName) { Alert.alert('Atenção', 'Informe um identificador válido para a subpasta.'); return; }

    setModalZipVisible(false);
    setUnzipping(true);

    try {
      const count = await descompactarArquivoZip(zipUriPendente, subfolderName);
      invalidateImageCache();
      const totalGeral = await carregarTotalImagens();
      await carregarGerenciadorArmazenamento();

      setSucessoImportacaoImagens({ totalExtraidas: count, subpasta: subfolderName, totalGeralImagens: totalGeral });
    } catch (error: any) {
      Alert.alert('Erro ao Descompactar', error?.message || 'Não foi possível descompactar o arquivo ZIP selecionado.');
    } finally {
      setUnzipping(false);
      setZipUriPendente(null);
    }
  };

  const abrirModalReset = async () => {
    setSearchTema('');
    setTemasSelecionados([]);
    setTemasParaConfirmar(null);
    try {
      const arrayDeTemas = await getDistinctProgressThemes();
      setTemasDisponiveis(arrayDeTemas);
    } catch {
      setTemasDisponiveis([]);
    }
    setModalResetVisible(true);
  };

  const toggleSelecionarTema = (tema: string) => setTemasSelecionados((prev) => prev.includes(tema) ? prev.filter((t) => t !== tema) : [...prev, tema]);
  const toggleSelecionarTodos = () => {
    const todosVisiveisSelecionados = temasFiltrados.length > 0 && temasFiltrados.every((t) => temasSelecionados.includes(t));
    if (todosVisiveisSelecionados) setTemasSelecionados((prev) => prev.filter((t) => !temasFiltrados.includes(t)));
    else setTemasSelecionados([...new Set([...temasSelecionados, ...temasFiltrados])]);
  };

  const executarResetTemas = async () => {
    if (!temasParaConfirmar || temasParaConfirmar.length === 0) return;
    const temasExcluir = new Set(temasParaConfirmar);
    try {
      setResettingTema(true);
      await deleteProgressByThemes(temasParaConfirmar);
      await limparGargalosEReplanejar(temasParaConfirmar);
      const temasExcluidosArray = [...temasParaConfirmar];
      setTemasParaConfirmar(null);
      setTemasSelecionados([]);
      setModalResetVisible(false);
      setTemasDisponiveis((prev) => prev.filter((t) => !temasExcluir.has(t)));
      setSucessoTemaReset(temasExcluidosArray);
    } catch {
      Alert.alert('Erro', 'Não foi possível apagar o histórico dos temas selecionados.');
    } finally {
      setResettingTema(false);
    }
  };


  const temasFiltrados = useMemo(() => {
    if (!searchTema.trim()) return temasDisponiveis;
    const term = searchTema.toLowerCase().trim();
    return temasDisponiveis.filter((t) => t.toLowerCase().includes(term));
  }, [temasDisponiveis, searchTema]);

  const bancosFiltradosNoModal = useMemo(() => {
    if (!grupoBancosModal) return [];
    if (!searchBancoModal.trim()) return grupoBancosModal.bancos;
    const term = searchBancoModal.toLowerCase().trim();
    return grupoBancosModal.bancos.filter(
      (b) => b.nome.toLowerCase().includes(term) || b.id.toLowerCase().includes(term)
    );
  }, [grupoBancosModal, searchBancoModal]);

  const pacotesFiltradosNoModal = useMemo(() => {
    if (!grupoPacotesModal) return [];
    if (!searchPacoteModal.trim()) return grupoPacotesModal.pacotes;
    const term = searchPacoteModal.toLowerCase().trim();
    return grupoPacotesModal.pacotes.filter((p) => p.nome.toLowerCase().includes(term));
  }, [grupoPacotesModal, searchPacoteModal]);

  const especialidadesRemotasFiltradas = useMemo(() => {
    if (!checkResultRemoto) return [];
    const especialidades = checkResultRemoto.especialidades || [];
    if (!searchEspecialidadeFiltro.trim()) return especialidades;
    const term = searchEspecialidadeFiltro.toLowerCase().trim();
    return especialidades.filter((esp) => {
      const nomeEsp = esp.nome.toLowerCase();
      if (nomeEsp.includes(term)) return true;
      const temNosTemas = esp.temasNomes.some((t) => t.toLowerCase().includes(term));
      if (temNosTemas) return true;
      const temNosBancos = esp.bancos.some((b) => b.nome.toLowerCase().includes(term));
      return temNosBancos;
    });
  }, [checkResultRemoto, searchEspecialidadeFiltro]);

  const solicitarExclusaoBanco = (banco: BancoItemInfo, tagMaior: string) => {
    setItemParaExcluir({
      tipo: 'banco',
      id: banco.id,
      nome: banco.nome,
      tagMaior,
      count: banco.totalQuestoes,
    });
  };

  const solicitarExclusaoPacote = (pacote: PacoteItemInfo, tagMaior: string) => {
    setItemParaExcluir({
      tipo: 'imagem',
      id: pacote.nome,
      nome: pacote.nome,
      tagMaior,
      count: pacote.totalImagens,
    });
  };

  const solicitarExclusaoTodosBancosDoGrupo = (grupo: GrupoBancosInfo) => {
    setItemParaExcluir({
      tipo: 'banco',
      id: '__TODOS__',
      nome: `Todos os ${grupo.totalBancos} bancos`,
      tagMaior: grupo.tagMaior,
      count: grupo.totalQuestoes,
    });
  };

  const solicitarExclusaoTodosPacotesDoGrupo = (grupo: GrupoPacotesInfo) => {
    setItemParaExcluir({
      tipo: 'imagem',
      id: '__TODOS__',
      nome: `Todos os ${grupo.totalPacotes} pacotes`,
      tagMaior: grupo.tagMaior,
      count: grupo.totalImagens,
    });
  };

  const confirmarResetTemasSelecionados = () => {
    if (temasSelecionados.length === 0) return;
    setTemasParaConfirmar([...temasSelecionados]);
  };

  const handleImportarCronogramaJSON = async () => {
    try {
      const res = await pickAndImportCronograma();
      if (res.cancelado) return;
      if (res.success && res.data) {
        carregarDadosCronograma();
        const totalTops = res.data.semanas.reduce((acc, s) => acc + (s.topicos?.length || 0), 0);
        setSucessoCronogramaModal({ titulo: res.data.titulo || '', semanas: res.data.semanas.length, topicos: totalTops });
      } else if (res.error) setErroCronogramaModal(res.error);
    } catch (e: any) {
      setErroCronogramaModal(e?.message || 'Falha ao importar cronograma.');
    }
  };

  const handleBaixarCronogramaGitHub = async () => {
    try {
      const cfg = await getGitHubConfig();
      if (!cfg.owner || !cfg.repo) {
        setErroCronogramaModal('Repositório GitHub não configurado. Por favor, configure o repositório nas Configurações do GitHub primeiro.');
        return;
      }
      setBaixandoCronogramaGitHub(true);
      const res = await syncCronogramaFromGitHub();
      if (res.success && res.data) {
        carregarDadosCronograma();
        const totalTops = res.data.semanas.reduce((acc, s) => acc + (s.topicos?.length || 0), 0);
        setSucessoCronogramaModal({ titulo: res.data.titulo || '', semanas: res.data.semanas.length, topicos: totalTops });
      } else {
        setErroCronogramaModal(res.error || 'Falha ao baixar cronograma do GitHub.');
      }
    } catch (err: any) {
      setErroCronogramaModal(err?.message || 'Falha ao baixar cronograma do GitHub.');
    } finally {
      setBaixandoCronogramaGitHub(false);
    }
  };

  const handleResetarProgressoCronograma = () => {
    setModalResetCronogramaVisible(false);
    resetCronogramaProgresso();
    carregarDadosCronograma();
    setSucessoAcaoCronograma({ titulo: 'Progresso Redefinido', mensagem: 'Todas as tarefas, apostilas, aulas, questões e flashcards foram desmarcados com sucesso.' });
  };

  const handleRemoverCronograma = () => {
    setModalRemoverCronogramaVisible(false);
    clearCronograma();
    carregarDadosCronograma();
    setSucessoAcaoCronograma({ titulo: 'Cronograma Removido', mensagem: 'O cronograma ativo e todo o progresso associado foram excluídos do dispositivo com sucesso.' });
  };

  const formatarUltimaSincronizacao = (ts?: number | null): string => {
    if (!ts) return 'Nunca sincronizado';
    const agora = Date.now();
    const diffSegundos = Math.floor((agora - ts) / 1000);
    if (diffSegundos < 60) return 'Agora mesmo';
    const diffMinutos = Math.floor(diffSegundos / 60);
    if (diffMinutos < 60) return `Há ${diffMinutos} ${diffMinutos === 1 ? 'minuto' : 'minutos'}`;
    const diffHoras = Math.floor(diffMinutos / 60);
    if (diffHoras < 24) return `Há ${diffHoras} ${diffHoras === 1 ? 'hora' : 'horas'}`;
    const diffDias = Math.floor(diffHoras / 24);
    return `Há ${diffDias} ${diffDias === 1 ? 'dia' : 'dias'}`;
  };

  const handleToggleAutoSync = () => {
    const novoStatus = !autoSyncAtivo;
    setAutoSyncAtivo(novoStatus);
    setAutoSyncEnabled(novoStatus);
  };

  const handleSincronizarTudo = async () => {
    try {
      setSincronizandoTudo(true);
      const res = await syncAllICalFeeds(false);
      carregarDadosCalendario();
      Alert.alert(
        'Sincronização Concluída',
        `Foram sincronizados ${res.total} ${res.total === 1 ? 'evento' : 'eventos'} em ${res.feedsCount} ${res.feedsCount === 1 ? 'calendário' : 'calendários'}.`
      );
    } catch (err: any) {
      console.error('Erro ao sincronizar todos os feeds:', err);
      Alert.alert('Erro na Sincronização', err?.message || 'Falha ao sincronizar calendários.');
    } finally {
      setSincronizandoTudo(false);
    }
  };

  const handleSincronizarFeed = async (feedId: string) => {
    try {
      setSincronizandoFeedId(feedId);
      const res = await syncICalFeed(feedId);
      carregarDadosCalendario();
      Alert.alert('Sucesso', `${res.count} ${res.count === 1 ? 'evento sincronizado' : 'eventos sincronizados'} com sucesso.`);
    } catch (err: any) {
      console.error('Erro ao sincronizar feed:', err);
      Alert.alert('Erro ao Sincronizar', err?.message || 'Não foi possível sincronizar este calendário.');
    } finally {
      setSincronizandoFeedId(null);
    }
  };

  const handleSalvarNovoFeed = async () => {
    if (!novoFeedUrl.trim()) {
      Alert.alert('Campo Obrigatório', 'Por favor, insira o link de iCal / Google Calendar.');
      return;
    }
    try {
      setSalvandoNovoFeed(true);
      const feed = await addICalFeed({
        nome: novoFeedNome.trim() || 'Google Calendar',
        url: novoFeedUrl.trim(),
        tipo: novoFeedTipo,
      });
      setModalAddFeedVisible(false);
      setNovoFeedNome('');
      setNovoFeedUrl('');
      setNovoFeedTipo('Faculdade');
      carregarDadosCalendario();
      Alert.alert(
        'Calendário Adicionado!',
        `O calendário "${feed.nome}" foi conectado e ${feed.totalEventos} ${feed.totalEventos === 1 ? 'evento foi importado' : 'eventos foram importados'} para a sua agenda.`
      );
    } catch (err: any) {
      console.error('Erro ao adicionar feed iCal:', err);
      Alert.alert('Erro ao Adicionar', err?.message || 'Não foi possível validar ou conectar este link de calendário.');
    } finally {
      setSalvandoNovoFeed(false);
    }
  };

  const handleConfirmarRemoverFeed = async () => {
    if (!feedParaRemover) return;
    const feed = feedParaRemover;
    try {
      setFeedParaRemover(null);
      await removeICalFeed(feed.id);
      carregarDadosCalendario();
      Alert.alert('Calendário Removido', `O calendário "${feed.nome}" e todas as suas atividades foram removidos com sucesso.`);
    } catch (err: any) {
      console.error('Erro ao remover feed:', err);
      Alert.alert('Erro', err?.message || 'Não foi possível remover o calendário.');
    }
  };

  const handleImportarICS = async () => {
    try {
      setImportandoICS(true);
      const resultado = await importarArquivoICS();
      if (!resultado) {
        return;
      }
      carregarDadosCalendario();
      Alert.alert(
        'Sucesso!',
        `${resultado.count} ${resultado.count === 1 ? 'evento foi importado' : 'eventos foram importados'} para a sua agenda.`
      );
    } catch (err: any) {
      console.error('Erro ao importar arquivo ICS:', err);
      Alert.alert('Erro na Importação', err?.message || 'Não foi possível importar o arquivo de calendário.');
    } finally {
      setImportandoICS(false);
    }
  };

  const handleAbrirModalLimparICS = async () => {
    try {
      const total = await contarEventosICSLocais();
      setTotalEventosICSParaLimpar(total);
      setModalLimparICSVisible(true);
    } catch (e) {
      console.error('Erro ao contar eventos do .ICS:', e);
      setTotalEventosICSParaLimpar(0);
      setModalLimparICSVisible(true);
    }
  };

  const handleConfirmarLimparICS = async () => {
    try {
      setLimpandoICS(true);
      const totalRemovidos = await limparEventosICSLocais();
      setModalLimparICSVisible(false);
      carregarDadosCalendario();
      Alert.alert(
        'Limpeza Concluída',
        `${totalRemovidos} ${totalRemovidos === 1 ? 'evento do .ICS foi removido' : 'eventos do .ICS foram removidos'} da sua agenda com sucesso.`
      );
    } catch (err: any) {
      console.error('Erro ao limpar eventos do .ICS:', err);
      Alert.alert('Erro', err?.message || 'Não foi possível limpar os eventos do .ICS.');
    } finally {
      setLimpandoICS(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar hidden={true} barStyle="light-content" />
      {currentView === 'menu' && (
        <View style={styles.headerContainer}>
          <View style={styles.headerTitleRow}>
            <Ionicons name="settings-outline" size={26} color={Colors.primary} style={styles.headerIcon} />
            <Text style={styles.headerTitle}>Configurações</Text>
          </View>
          <Text style={styles.headerSubtitle}>Gerencie seus dados, questões e preferências do app</Text>
        </View>
      )}
      <ScrollView contentContainerStyle={styles.scrollContainer} style={styles.container}>
        {currentView === 'menu' ? (
          <View style={styles.menuOptionsContainer}>
            <TouchableOpacity style={styles.menuOptionCard} activeOpacity={0.7} onPress={abrirOpcaoAdicionarQuestoes}>
              <View style={[styles.menuOptionIconBox, { backgroundColor: 'rgba(234, 225, 21, 0.12)' }]}>
                <Ionicons name="cloud-upload-outline" size={24} color={Colors.primary} />
                {updateStatus.hasUpdate && <View style={styles.cardNotificationDot} />}
              </View>
              <View style={styles.menuOptionContent}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={styles.menuOptionTitle}>Gerenciar Questões</Text>
                  {updateStatus.hasUpdate && (
                    <View style={styles.menuUpdateBadge}>
                      <View style={styles.menuUpdateBadgeDot} />
                      <Text style={styles.menuUpdateBadgeText}>Novas questões</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.menuOptionSubtitle}>Sincronização com GitHub, importar arquivos, armazenamento e progresso</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuOptionCard} activeOpacity={0.7} onPress={() => { carregarDadosCronograma(); setCurrentView('cronograma'); }}>
              <View style={[styles.menuOptionIconBox, { backgroundColor: 'rgba(234, 225, 21, 0.12)' }]}>
                <Ionicons name="calendar-outline" size={24} color={Colors.primary} />
              </View>
              <View style={styles.menuOptionContent}>
                <Text style={styles.menuOptionTitle}>Cronograma de Estudos</Text>
                <Text style={styles.menuOptionSubtitle}>Baixar do GitHub, importar JSON ou gerenciar cronograma</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>

            {/* Seção: Calendário e Agenda */}
            <View style={{ marginTop: 12 }}>
              <View style={styles.minSectionHeader}>
                <Text style={styles.minSectionTitle}>Calendário e Agenda</Text>
              </View>
              <TouchableOpacity
                style={styles.menuOptionCard}
                activeOpacity={0.7}
                onPress={() => {
                  carregarDadosCalendario();
                  setCurrentView('calendario');
                }}
              >
                <View style={[styles.menuOptionIconBox, { backgroundColor: 'rgba(59, 130, 246, 0.12)' }]}>
                  <Ionicons name="calendar" size={24} color="#3B82F6" />
                </View>
                <View style={styles.menuOptionContent}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.menuOptionTitle}>Calendário & Sincronização</Text>
                    {icalFeeds.length > 0 && (
                      <View style={[styles.menuUpdateBadge, { backgroundColor: 'rgba(59, 130, 246, 0.18)', borderColor: 'rgba(59, 130, 246, 0.35)' }]}>
                        <Text style={[styles.menuUpdateBadgeText, { color: '#60A5FA' }]}>
                          {icalFeeds.length} {icalFeeds.length === 1 ? 'link ativo' : 'links ativos'}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.menuOptionSubtitle}>
                    Google Calendar (iCal/Webcal), sincronização automática e arquivos .ICS
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Seção: Aparência e Personalização */}
            <View style={{ marginTop: 12 }}>
              <View style={styles.minSectionHeader}>
                <Text style={styles.minSectionTitle}>Aparência e Personalização</Text>
              </View>
              <View style={[styles.appearanceCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                {/* Modo de Tema */}
                <View style={styles.appearanceRowHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="contrast-outline" size={18} color={themeColors.primary} />
                    <Text style={[styles.appearanceSectionLabel, { color: themeColors.text }]}>Tema Base</Text>
                  </View>
                  <Text style={[styles.appearanceCurrentValue, { color: themeColors.textSecondary }]}>
                    {mode === 'dark' ? 'Modo Escuro' : mode === 'light' ? 'Modo Claro' : 'Acompanhar Sistema'}
                  </Text>
                </View>

                <View style={styles.themeModeSelectorRow}>
                  <TouchableOpacity
                    style={[
                      styles.themeModeChip,
                      { backgroundColor: themeColors.backgroundSecondary, borderColor: themeColors.border },
                      mode === 'dark' && [
                        styles.themeModeChipActive,
                        { borderColor: themeColors.primary, backgroundColor: themeColors.primarySubtle },
                      ],
                    ]}
                    onPress={() => setMode('dark')}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="moon"
                      size={16}
                      color={mode === 'dark' ? themeColors.primary : themeColors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.themeModeChipText,
                        { color: themeColors.textSecondary },
                        mode === 'dark' && { color: themeColors.primary, fontWeight: '700' },
                      ]}
                    >
                      Escuro
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.themeModeChip,
                      { backgroundColor: themeColors.backgroundSecondary, borderColor: themeColors.border },
                      mode === 'light' && [
                        styles.themeModeChipActive,
                        { borderColor: themeColors.primary, backgroundColor: themeColors.primarySubtle },
                      ],
                    ]}
                    onPress={() => setMode('light')}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="sunny"
                      size={16}
                      color={mode === 'light' ? themeColors.primary : themeColors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.themeModeChipText,
                        { color: themeColors.textSecondary },
                        mode === 'light' && { color: themeColors.primary, fontWeight: '700' },
                      ]}
                    >
                      Claro
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.themeModeChip,
                      { backgroundColor: themeColors.backgroundSecondary, borderColor: themeColors.border },
                      mode === 'system' && [
                        styles.themeModeChipActive,
                        { borderColor: themeColors.primary, backgroundColor: themeColors.primarySubtle },
                      ],
                    ]}
                    onPress={() => setMode('system')}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="phone-portrait-outline"
                      size={16}
                      color={mode === 'system' ? themeColors.primary : themeColors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.themeModeChipText,
                        { color: themeColors.textSecondary },
                        mode === 'system' && { color: themeColors.primary, fontWeight: '700' },
                      ]}
                    >
                      Sistema
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={[styles.appearanceDivider, { backgroundColor: themeColors.borderSubtle }]} />

                {/* Seletor de Cores de Destaque */}
                <View style={styles.appearanceRowHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="color-palette-outline" size={18} color={themeColors.primary} />
                    <Text style={[styles.appearanceSectionLabel, { color: themeColors.text }]}>Cor de Destaque</Text>
                  </View>
                  <Text style={[styles.appearanceCurrentValue, { color: themeColors.primary, fontWeight: '700' }]}>
                    {accentOption.label}
                  </Text>
                </View>

                <View style={styles.accentColorsRow}>
                  {availableAccents.map((item) => {
                    const isSelected = accentKey === item.key;
                    return (
                      <TouchableOpacity
                        key={item.key}
                        style={[
                          styles.accentCircleTouchTarget,
                          isSelected && [styles.accentCircleActive, { borderColor: item.color }],
                        ]}
                        onPress={() => setAccent(item.key)}
                        activeOpacity={0.7}
                        accessibilityLabel={item.label}
                      >
                        <View style={[styles.accentCircleColor, { backgroundColor: item.color }]}>
                          {isSelected && (
                            <Ionicons
                              name="checkmark-sharp"
                              size={18}
                              color={item.key === 'amarelo' ? '#000000' : '#FFFFFF'}
                            />
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>
          </View>
        ) : currentView === 'adicionar_questoes' ? (
          <>
            <View style={styles.subScreenHeader}>
              <TouchableOpacity style={styles.subScreenBackBtn} onPress={() => setCurrentView('menu')} activeOpacity={0.7} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="arrow-back" size={22} color={Colors.text} />
              </TouchableOpacity>
              <Text style={styles.subScreenHeaderTitle}>Gerenciar Questões</Text>
            </View>

            <View style={styles.menuSummaryCard}>
              <View style={styles.menuSummaryLeft}>
                <Text style={styles.menuSummaryLabel}>BANCO DE DADOS LOCAL</Text>
                <Text style={styles.menuSummaryValue}>{questoesCount} {questoesCount === 1 ? 'questão carregada' : 'questões carregadas'}</Text>
                <Text style={styles.menuSummarySubValue}>{totalImagensSalvas} {totalImagensSalvas === 1 ? 'imagem offline salva' : 'imagens offline salvas'}</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: questoesCount > 0 ? 'rgba(76, 175, 80, 0.15)' : Colors.background }]}>
                <View style={[styles.statusDot, { backgroundColor: questoesCount > 0 ? Colors.success : Colors.textSecondary }]} />
                <Text style={[styles.statusBadgeText, { color: questoesCount > 0 ? Colors.success : Colors.textSecondary }]}>{questoesCount > 0 ? 'Ativo' : 'Vazio'}</Text>
              </View>
            </View>

            {updateStatus.hasUpdate && (
              <View style={styles.updateAlertBanner}>
                <View style={styles.updateAlertContent}>
                  <View style={styles.updateAlertIconBox}><Ionicons name="sparkles" size={20} color="#000000" /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.updateAlertTitle}>Novas Questões Disponíveis!</Text>
                    <Text style={styles.updateAlertSubtitle}>{updateStatus.totalBancosNovos > 0 ? `Detectamos ${updateStatus.totalBancosNovos} novo(s) banco(s) de questões e atualizações disponíveis no GitHub.` : 'Existem atualizações de questões ou imagens prontas para download no GitHub.'}</Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.updateAlertActionBtn} onPress={abrirModalSincronizacaoSeletiva} activeOpacity={0.8}>
                  <Ionicons name="checkbox-outline" size={16} color="#000000" style={{ marginRight: 6 }} />
                  <Text style={styles.updateAlertActionBtnText}>Ver e Escolher Especialidades</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Acordeão 1: GitHub */}
            <View style={styles.accordionCard}>
              <TouchableOpacity
                style={[styles.accordionHeader, expandedSections.has('github') && styles.accordionHeaderOpen]}
                activeOpacity={0.7}
                onPress={() => toggleSection('github')}
              >
                <View style={[styles.accordionIconBox, { backgroundColor: 'rgba(234, 225, 21, 0.12)' }]}>
                  <Ionicons name="logo-github" size={22} color={Colors.primary} />
                </View>
                <View style={styles.accordionHeaderContent}>
                  <Text style={styles.accordionTitle}>GitHub</Text>
                  <Text style={styles.accordionSubtitle} numberOfLines={1}>
                    {gitHubRepoInput ? gitHubRepoInput : 'Sincronização em nuvem e repositório'}
                  </Text>
                </View>
                <Ionicons
                  name={expandedSections.has('github') ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={Colors.textSecondary}
                />
              </TouchableOpacity>

              {expandedSections.has('github') && (
                <View style={styles.accordionBody}>
                  <View style={styles.gitHubSyncCardInner}>
                    <View style={styles.gitHubSyncHeader}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                          <Text style={styles.gitHubSyncTitle} numberOfLines={1}>
                            {gitHubRepoInput ? gitHubRepoInput : 'Nenhum repositório configurado'}
                          </Text>
                          <View style={[styles.gitHubStatusBadge, { backgroundColor: updateStatus.hasUpdate ? 'rgba(255, 59, 48, 0.15)' : temTokenConfigurado ? 'rgba(76, 175, 80, 0.15)' : 'rgba(255, 167, 38, 0.15)', borderColor: updateStatus.hasUpdate ? 'rgba(255, 59, 48, 0.35)' : temTokenConfigurado ? 'rgba(76, 175, 80, 0.3)' : 'rgba(255, 167, 38, 0.3)' }]}>
                            <Text style={[styles.gitHubStatusBadgeText, { color: updateStatus.hasUpdate ? '#FF5252' : temTokenConfigurado ? Colors.success : '#FFA726' }]}>
                              {updateStatus.hasUpdate ? 'Atualização Disponível' : temTokenConfigurado ? 'Conectado' : 'Credenciais Pendentes'}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.gitHubSyncSubRow}>
                          <Ionicons name="time-outline" size={12} color={Colors.textSecondary} />
                          <Text style={styles.gitHubSyncSub}>
                            {syncMetadata?.ultimaSincronizacao ? `Última sincronização: ${formatarData(syncMetadata.ultimaSincronizacao)}` : 'Nenhuma sincronização recente'}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <View style={styles.gitHubSyncActionsContainer}>
                      <TouchableOpacity style={styles.gitHubSyncPrimaryBtn} onPress={abrirModalSincronizacaoSeletiva} activeOpacity={0.8} disabled={modalSyncProgressVisible}>
                        <Ionicons name="checkbox-outline" size={18} color="#000000" style={{ marginRight: 8 }} />
                        <Text style={styles.gitHubSyncPrimaryBtnText}>Baixar Questões por Especialidade</Text>
                        <Ionicons name="chevron-forward" size={16} color="rgba(0, 0, 0, 0.55)" style={{ marginLeft: 'auto' }} />
                      </TouchableOpacity>
                      <View style={styles.gitHubSyncSecondaryRow}>
                        <TouchableOpacity style={styles.gitHubSyncSecondaryBtn} onPress={abrirSincronizacaoGitHub} activeOpacity={0.7} disabled={modalSyncProgressVisible}>
                          <Ionicons name="sync" size={15} color={Colors.text} style={{ marginRight: 6 }} />
                          <Text style={styles.gitHubSyncSecondaryBtnText}>Sincronizar Tudo</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.gitHubSyncSecondaryBtn} onPress={() => { setResultadoTesteConexao(null); setModalGitHubConfigVisible(true); }} activeOpacity={0.7}>
                          <Ionicons name="key-outline" size={15} color={Colors.textSecondary} style={{ marginRight: 6 }} />
                          <Text style={styles.gitHubSyncSecondaryBtnText}>Login</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </View>
              )}
            </View>

            {/* Acordeão 2: Importação Local */}
            <View style={styles.accordionCard}>
              <TouchableOpacity
                style={[styles.accordionHeader, expandedSections.has('local') && styles.accordionHeaderOpen]}
                activeOpacity={0.7}
                onPress={() => toggleSection('local')}
              >
                <View style={[styles.accordionIconBox, { backgroundColor: 'rgba(234, 225, 21, 0.12)' }]}>
                  <MaterialCommunityIcons name="tray-arrow-down" size={22} color={Colors.primary} />
                </View>
                <View style={styles.accordionHeaderContent}>
                  <Text style={styles.accordionTitle}>Importação Local</Text>
                  <Text style={styles.accordionSubtitle} numberOfLines={1}>
                    Carregar arquivos .json de questões e pacotes .zip de imagens
                  </Text>
                </View>
                <Ionicons
                  name={expandedSections.has('local') ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={Colors.textSecondary}
                />
              </TouchableOpacity>

              {expandedSections.has('local') && (
                <View style={styles.accordionBody}>
                  <View style={styles.minCardsCol}>
                    <TouchableOpacity style={[styles.minActionCard, loading && styles.buttonDisabled]} onPress={importarJSON} activeOpacity={0.7} disabled={loading}>
                      <View style={[styles.minIconBox, { backgroundColor: 'rgba(234, 225, 21, 0.12)' }]}><Ionicons name="document-text-outline" size={22} color={Colors.primary} /></View>
                      <View style={styles.minActionContent}>
                        <Text style={styles.minActionTitle}>Banco de Questões</Text>
                        <Text style={styles.minActionSub}>Arquivo .json</Text>
                      </View>
                      {loading ? <ActivityIndicator size="small" color={Colors.primary} /> : <View style={styles.minActionPill}><Ionicons name="cloud-upload-outline" size={15} color={Colors.primary} style={{ marginRight: 5 }} /><Text style={styles.minActionPillText}>Carregar</Text></View>}
                    </TouchableOpacity>

                    <TouchableOpacity style={[styles.minActionCard, unzipping && styles.buttonDisabled]} onPress={selecionarArquivoZip} activeOpacity={0.7} disabled={unzipping || loading}>
                      <View style={[styles.minIconBox, { backgroundColor: 'rgba(234, 225, 21, 0.12)' }]}><MaterialCommunityIcons name="folder-zip-outline" size={22} color={Colors.primary} /></View>
                      <View style={styles.minActionContent}>
                        <Text style={styles.minActionTitle}>Pacote de Imagens</Text>
                        <Text style={styles.minActionSub}>Arquivo .zip</Text>
                      </View>
                      {unzipping ? <ActivityIndicator size="small" color={Colors.primary} /> : <View style={styles.minActionPill}><Ionicons name="cloud-upload-outline" size={15} color={Colors.primary} style={{ marginRight: 5 }} /><Text style={styles.minActionPillText}>Carregar</Text></View>}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            {/* Acordeão 3: Armazenamento */}
            <View style={styles.accordionCard}>
              <TouchableOpacity
                style={[styles.accordionHeader, expandedSections.has('storage') && styles.accordionHeaderOpen]}
                activeOpacity={0.7}
                onPress={() => toggleSection('storage')}
              >
                <View style={[styles.accordionIconBox, { backgroundColor: 'rgba(234, 225, 21, 0.12)' }]}>
                  <MaterialCommunityIcons name="server-outline" size={22} color={Colors.primary} />
                </View>
                <View style={styles.accordionHeaderContent}>
                  <Text style={styles.accordionTitle}>Armazenamento</Text>
                  <Text style={styles.accordionSubtitle} numberOfLines={1}>
                    {gruposBancosList.length} conjunto(s) de questões • {gruposPacotesList.length} pacote(s) de imagens
                  </Text>
                </View>
                <Ionicons
                  name={expandedSections.has('storage') ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={Colors.textSecondary}
                />
              </TouchableOpacity>

              {expandedSections.has('storage') && (
                <View style={styles.accordionBody}>
                  <View style={styles.minStorageCardInner}>
                    <View style={styles.minStorageSubHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}><MaterialCommunityIcons name="code-json" size={16} color={Colors.primary} style={{ marginRight: 6 }} /><Text style={styles.minStorageSubTitle}>Bancos de Questões</Text></View>
                      <Text style={styles.minStorageBadge}>{gruposBancosList.length} {gruposBancosList.length === 1 ? 'conjunto' : 'conjuntos'}</Text>
                    </View>

                    {gruposBancosList.length === 0 ? (
                      <Text style={styles.minEmptyText}>Nenhum banco de questões importado.</Text>
                    ) : (
                      gruposBancosList.map((grupo, index) => (
                        <TouchableOpacity key={`grupo-banco-${grupo.tagMaior}-${index}`} style={styles.minStorageRow} onPress={() => { setGrupoBancosModal(grupo); setSearchBancoModal(''); }} activeOpacity={0.7}>
                          <View style={styles.minGroupIconBox}><MaterialCommunityIcons name="layers-outline" size={18} color={Colors.primary} /></View>
                          <View style={{ flex: 1, marginRight: 8 }}><Text style={styles.minItemTitle} numberOfLines={1}>{grupo.tagMaior}</Text><Text style={styles.minItemSub}>{grupo.totalBancos} {grupo.totalBancos === 1 ? 'banco' : 'bancos'} • {grupo.totalQuestoes} questões</Text></View>
                          <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
                        </TouchableOpacity>
                      ))
                    )}

                    <View style={styles.minDivider} />

                    <View style={styles.minStorageSubHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}><MaterialCommunityIcons name="folder-multiple-image" size={16} color={Colors.primary} style={{ marginRight: 6 }} /><Text style={styles.minStorageSubTitle}>Pacotes de Imagens</Text></View>
                      <Text style={styles.minStorageBadge}>{gruposPacotesList.length} {gruposPacotesList.length === 1 ? 'conjunto' : 'conjuntos'}</Text>
                    </View>

                    {gruposPacotesList.length === 0 ? (
                      <Text style={styles.minEmptyText}>Nenhum pacote de imagens descompactado.</Text>
                    ) : (
                      gruposPacotesList.map((grupo, index) => (
                        <TouchableOpacity key={`grupo-pacote-${grupo.tagMaior}-${index}`} style={styles.minStorageRow} onPress={() => { setGrupoPacotesModal(grupo); setSearchPacoteModal(''); }} activeOpacity={0.7}>
                          <View style={styles.minGroupIconBox}><MaterialCommunityIcons name="image-multiple-outline" size={18} color={Colors.primary} /></View>
                          <View style={{ flex: 1, marginRight: 8 }}><Text style={styles.minItemTitle} numberOfLines={1}>{grupo.tagMaior}</Text><Text style={styles.minItemSub}>{grupo.totalPacotes} {grupo.totalPacotes === 1 ? 'pacote' : 'pacotes'} • {grupo.totalImagens} imagens</Text></View>
                          <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
                        </TouchableOpacity>
                      ))
                    )}
                  </View>
                </View>
              )}
            </View>

            {/* Ações de Gerenciamento: Resetar Progresso e Apagar Banco de Dados */}
            <View style={[styles.menuOptionsContainer, { marginTop: 4 }]}>
              <TouchableOpacity style={styles.menuOptionCard} activeOpacity={0.7} onPress={abrirModalReset} disabled={loading}>
                <View style={[styles.menuOptionIconBox, { backgroundColor: 'rgba(255, 167, 38, 0.12)' }]}>
                  <MaterialCommunityIcons name="refresh" size={24} color="#FFA726" />
                </View>
                <View style={styles.menuOptionContent}>
                  <Text style={styles.menuOptionTitle}>Resetar Progresso</Text>
                  <Text style={styles.menuOptionSubtitle}>Apagar histórico de acertos e resoluções por tema</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuOptionCard} activeOpacity={0.7} onPress={abrirModalZerarBanco} disabled={loading || zerandoBanco}>
                <View style={[styles.menuOptionIconBox, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
                  <Ionicons name="trash-outline" size={22} color={Colors.error} />
                </View>
                <View style={styles.menuOptionContent}>
                  <Text style={[styles.menuOptionTitle, { color: '#FF6B6B' }]}>Apagar Banco de Dados</Text>
                  <Text style={styles.menuOptionSubtitle}>Excluir todas as questões e imagens salvas do banco local</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuOptionCard} activeOpacity={0.7} onPress={abrirDiagnostico}>
                <View style={[styles.menuOptionIconBox, { backgroundColor: 'rgba(59, 130, 246, 0.12)' }]}>
                  <Ionicons name="analytics-outline" size={24} color="#3B82F6" />
                </View>
                <View style={styles.menuOptionContent}>
                  <Text style={styles.menuOptionTitle}>Diagnóstico do Histórico & SM-2</Text>
                  <Text style={styles.menuOptionSubtitle}>Ver registros de tempo, sessões e agendamentos de repetição espaçada</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </>
        ) : currentView === 'cronograma' ? (
          /* Sub-tela: Cronograma de Estudos */
          <>
            <View style={styles.subScreenHeader}>
              <TouchableOpacity style={styles.subScreenBackBtn} onPress={() => setCurrentView('menu')} activeOpacity={0.7} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="arrow-back" size={22} color={Colors.text} />
              </TouchableOpacity>
              <Text style={styles.subScreenHeaderTitle}>Cronograma de Estudos</Text>
            </View>

            <View style={styles.menuSummaryCard}>
              <View style={styles.menuSummaryLeft}>
                <Text style={styles.menuSummaryLabel}>STATUS DO CRONOGRAMA</Text>
                <Text style={styles.menuSummaryValue}>{cronogramaInfo ? cronogramaInfo.titulo : 'Nenhum cronograma ativo'}</Text>
                <Text style={styles.menuSummarySubValue}>{cronogramaInfo ? `${cronogramaInfo.semanas?.length || 0} semanas • ${cronogramaStats.total} tarefas • ${cronogramaStats.concluidos} concluídas (${cronogramaStats.porcentagem}%)` : 'Importe um arquivo JSON ou carregue o modelo de residência médica.'}</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: cronogramaInfo ? 'rgba(76, 175, 80, 0.15)' : Colors.background }]}>
                <View style={[styles.statusDot, { backgroundColor: cronogramaInfo ? Colors.success : Colors.textSecondary }]} />
                <Text style={[styles.statusBadgeText, { color: cronogramaInfo ? Colors.success : Colors.textSecondary }]}>{cronogramaInfo ? 'Ativo' : 'Vazio'}</Text>
              </View>
            </View>

            {cronogramaInfo && cronogramaStats.total > 0 && (
              <View style={[styles.weekProgressBarBg, { marginHorizontal: 0, marginBottom: 16 }]}>
                <View style={[styles.weekProgressBarFill, { width: `${Math.min(100, Math.max(0, cronogramaStats.porcentagem))}%` }]} />
              </View>
            )}

            <View style={styles.menuOptionsContainer}>
              <TouchableOpacity style={[styles.menuOptionCard, baixandoCronogramaGitHub && styles.buttonDisabled]} activeOpacity={0.7} onPress={handleBaixarCronogramaGitHub} disabled={baixandoCronogramaGitHub}>
                <View style={[styles.menuOptionIconBox, { backgroundColor: 'rgba(234, 225, 21, 0.12)' }]}><Ionicons name="logo-github" size={24} color={Colors.primary} /></View>
                <View style={styles.menuOptionContent}>
                  <Text style={styles.menuOptionTitle}>Baixar do GitHub</Text>
                  <Text style={styles.menuOptionSubtitle}>Sincronizar cronograma.json direto do seu repositório configurado</Text>
                </View>
                {baixandoCronogramaGitHub ? <ActivityIndicator size="small" color={Colors.primary} /> : <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />}
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuOptionCard} activeOpacity={0.7} onPress={handleImportarCronogramaJSON}>
                <View style={[styles.menuOptionIconBox, { backgroundColor: 'rgba(234, 225, 21, 0.12)' }]}><Ionicons name="cloud-upload-outline" size={24} color={Colors.primary} /></View>
                <View style={styles.menuOptionContent}>
                  <Text style={styles.menuOptionTitle}>Importar Arquivo JSON</Text>
                  <Text style={styles.menuOptionSubtitle}>Carregar novo arquivo .json estruturado com suas semanas e tópicos</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>

              <TouchableOpacity style={[styles.menuOptionCard, !cronogramaInfo && styles.buttonDisabled]} activeOpacity={0.7} onPress={() => setModalResetCronogramaVisible(true)} disabled={!cronogramaInfo}>
                <View style={[styles.menuOptionIconBox, { backgroundColor: 'rgba(255, 167, 38, 0.12)' }]}><MaterialCommunityIcons name="refresh" size={24} color="#FFA726" /></View>
                <View style={styles.menuOptionContent}>
                  <Text style={styles.menuOptionTitle}>Resetar Progresso</Text>
                  <Text style={styles.menuOptionSubtitle}>Desmarcar todos os passos concluídos (Apostila, Aulas, Questões e Flashcards)</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>

              <TouchableOpacity style={[styles.menuOptionCard, !cronogramaInfo && styles.buttonDisabled]} activeOpacity={0.7} onPress={() => setModalRemoverCronogramaVisible(true)} disabled={!cronogramaInfo}>
                <View style={[styles.menuOptionIconBox, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}><Ionicons name="trash-outline" size={22} color={Colors.error} /></View>
                <View style={styles.menuOptionContent}>
                  <Text style={[styles.menuOptionTitle, { color: '#FF6B6B' }]}>Remover Cronograma</Text>
                  <Text style={styles.menuOptionSubtitle}>Excluir o cronograma salvo no aparelho e o progresso associado</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </>
        ) : (
          /* Sub-tela: Calendário & iCal */
          <>
            <View style={styles.subScreenHeader}>
              <TouchableOpacity
                style={styles.subScreenBackBtn}
                onPress={() => setCurrentView('menu')}
                activeOpacity={0.7}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="arrow-back" size={22} color={Colors.text} />
              </TouchableOpacity>
              <Text style={styles.subScreenHeaderTitle}>Calendário & Sincronização</Text>
            </View>

            {/* Card de Resumo */}
            <View style={styles.menuSummaryCard}>
              <View style={styles.menuSummaryLeft}>
                <Text style={styles.menuSummaryLabel}>STATUS DO CALENDÁRIO</Text>
                <Text style={styles.menuSummaryValue}>
                  {icalFeeds.length === 0
                    ? 'Nenhum link conectado'
                    : `${icalFeeds.length} ${icalFeeds.length === 1 ? 'calendário conectado' : 'calendários conectados'}`}
                </Text>
                <Text style={styles.menuSummarySubValue}>
                  {ultimoSyncTimestamp
                    ? `Última sincronização: ${formatarUltimaSincronizacao(ultimoSyncTimestamp)}`
                    : 'Nenhuma sincronização realizada ainda.'}
                </Text>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: icalFeeds.length > 0 ? 'rgba(59, 130, 246, 0.15)' : Colors.background },
                ]}
              >
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: icalFeeds.length > 0 ? '#3B82F6' : Colors.textSecondary },
                  ]}
                />
                <Text
                  style={[
                    styles.statusBadgeText,
                    { color: icalFeeds.length > 0 ? '#3B82F6' : Colors.textSecondary },
                  ]}
                >
                  {icalFeeds.length > 0 ? 'Ativo' : 'Vazio'}
                </Text>
              </View>
            </View>

            {/* Sincronização Automática Silenciosa */}
            <TouchableOpacity
              style={styles.menuOptionCard}
              activeOpacity={0.7}
              onPress={handleToggleAutoSync}
            >
              <View
                style={[
                  styles.menuOptionIconBox,
                  { backgroundColor: autoSyncAtivo ? 'rgba(16, 185, 129, 0.15)' : 'rgba(156, 163, 175, 0.12)' },
                ]}
              >
                <Ionicons
                  name={autoSyncAtivo ? 'sync' : 'sync-outline'}
                  size={24}
                  color={autoSyncAtivo ? '#10B981' : Colors.textSecondary}
                />
              </View>
              <View style={styles.menuOptionContent}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={styles.menuOptionTitle}>Sincronização Automática Silenciosa</Text>
                </View>
                <Text style={styles.menuOptionSubtitle}>
                  {autoSyncAtivo
                    ? 'Ativa: atualiza eventos em segundo plano ao abrir o app e ao ver a agenda (a cada 15 min)'
                    : 'Desativada: os eventos só serão atualizados ao tocar em Sincronizar'}
                </Text>
              </View>
              <Ionicons
                name={autoSyncAtivo ? 'toggle' : 'toggle-outline'}
                size={34}
                color={autoSyncAtivo ? '#10B981' : Colors.textSecondary}
              />
            </TouchableOpacity>

            {/* Ações de Sincronização e Adição */}
            <View style={styles.menuOptionsContainer}>
              <TouchableOpacity
                style={[styles.menuOptionCard, (sincronizandoTudo || icalFeeds.length === 0) && styles.buttonDisabled]}
                activeOpacity={0.7}
                onPress={handleSincronizarTudo}
                disabled={sincronizandoTudo || icalFeeds.length === 0}
              >
                <View style={[styles.menuOptionIconBox, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                  <Ionicons name="refresh" size={24} color="#3B82F6" />
                </View>
                <View style={styles.menuOptionContent}>
                  <Text style={styles.menuOptionTitle}>Sincronizar Todos os Calendários</Text>
                  <Text style={styles.menuOptionSubtitle}>
                    {sincronizandoTudo
                      ? 'Baixando eventos e atualizando a agenda...'
                      : 'Baixa as alterações mais recentes dos seus links cadastrados'}
                  </Text>
                </View>
                {sincronizandoTudo ? (
                  <ActivityIndicator size="small" color="#3B82F6" />
                ) : (
                  <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuOptionCard}
                activeOpacity={0.7}
                onPress={() => {
                  setNovoFeedNome('');
                  setNovoFeedUrl('');
                  setNovoFeedTipo('Faculdade');
                  setModalAddFeedVisible(true);
                }}
              >
                <View style={[styles.menuOptionIconBox, { backgroundColor: 'rgba(234, 225, 21, 0.15)' }]}>
                  <Ionicons name="add-circle-outline" size={24} color={Colors.primary} />
                </View>
                <View style={styles.menuOptionContent}>
                  <Text style={[styles.menuOptionTitle, { color: Colors.primary }]}>+ Adicionar Link de iCal</Text>
                  <Text style={styles.menuOptionSubtitle}>
                    Google Calendar, Outlook ou qualquer link no formato .ics / webcal
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Lista de Feeds Configurados */}
            <View style={{ marginTop: 16 }}>
              <View style={styles.minSectionHeader}>
                <Text style={styles.minSectionTitle}>LINKS CONFIGURADOS ({icalFeeds.length})</Text>
              </View>

              {icalFeeds.length === 0 ? (
                <View style={styles.emptyDayContainer}>
                  <Ionicons name="calendar-outline" size={40} color="#454A52" />
                  <Text style={styles.emptyDayTitle}>Nenhum link adicionado</Text>
                  <Text style={styles.emptyDaySub}>
                    Adicione o endereço secreto iCal do seu Google Calendar para que suas aulas e plantões apareçam na sua agenda diária.
                  </Text>
                </View>
              ) : (
                icalFeeds.map((feed) => {
                  const isSincronizandoEste = sincronizandoFeedId === feed.id;
                  return (
                    <View key={feed.id} style={[styles.menuOptionCard, { paddingVertical: 14, marginBottom: 10 }]}>
                      <View style={[styles.menuOptionIconBox, { backgroundColor: 'rgba(59, 130, 246, 0.12)' }]}>
                        <Ionicons name="logo-google" size={22} color="#3B82F6" />
                      </View>
                      <View style={styles.menuOptionContent}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <Text style={styles.menuOptionTitle} numberOfLines={1}>{feed.nome}</Text>
                          <View style={[styles.menuUpdateBadge, { backgroundColor: 'rgba(139, 92, 246, 0.18)', borderColor: 'rgba(139, 92, 246, 0.35)' }]}>
                            <Text style={[styles.menuUpdateBadgeText, { color: '#A78BFA' }]}>{feed.tipo}</Text>
                          </View>
                        </View>
                        <Text style={styles.menuOptionSubtitle} numberOfLines={1}>
                          {feed.url}
                        </Text>
                        <Text style={[styles.menuOptionSubtitle, { color: '#68707B', fontSize: 11, marginTop: 4 }]}>
                          {feed.totalEventos !== undefined ? `${feed.totalEventos} eventos ativos` : 'Eventos sincronizados'} • {formatarUltimaSincronizacao(feed.ultimaSincronizacao)}
                        </Text>
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <TouchableOpacity
                          onPress={() => handleSincronizarFeed(feed.id)}
                          disabled={isSincronizandoEste}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          {isSincronizandoEste ? (
                            <ActivityIndicator size="small" color="#3B82F6" />
                          ) : (
                            <Ionicons name="sync-outline" size={20} color="#3B82F6" />
                          )}
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => setFeedParaRemover(feed)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="trash-outline" size={20} color={Colors.error} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </View>

            {/* Importação Manual por Arquivo */}
            <View style={{ marginTop: 14 }}>
              <View style={styles.minSectionHeader}>
                <Text style={styles.minSectionTitle}>IMPORTAÇÃO MANUAL</Text>
              </View>
              <TouchableOpacity
                style={[styles.menuOptionCard, importandoICS && styles.buttonDisabled]}
                activeOpacity={0.7}
                onPress={handleImportarICS}
                disabled={importandoICS}
              >
                <View style={[styles.menuOptionIconBox, { backgroundColor: 'rgba(234, 225, 21, 0.12)' }]}>
                  <Feather name="download-cloud" size={24} color={Colors.primary} />
                </View>
                <View style={styles.menuOptionContent}>
                  <Text style={styles.menuOptionTitle}>Importar Arquivo .ICS Local</Text>
                  <Text style={styles.menuOptionSubtitle}>
                    {importandoICS
                      ? 'Processando eventos e salvando na agenda...'
                      : 'Carregar arquivo salvo na memória do aparelho'}
                  </Text>
                </View>
                {importandoICS ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.menuOptionCard, { marginTop: 10 }]}
                activeOpacity={0.7}
                onPress={handleAbrirModalLimparICS}
              >
                <View style={[styles.menuOptionIconBox, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
                  <Ionicons name="trash-outline" size={22} color={Colors.error} />
                </View>
                <View style={styles.menuOptionContent}>
                  <Text style={[styles.menuOptionTitle, { color: '#FF6B6B' }]}>Limpar Eventos do .ICS</Text>
                  <Text style={styles.menuOptionSubtitle}>
                    Remover todas as aulas e atividades adicionadas por arquivo .ICS
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>

      {/* Modais Extraídos Omitidos para Brevidade */}
      <Modal visible={modalResetVisible} animationType="fade" transparent={true} onRequestClose={() => setModalResetVisible(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.confirmBackdropDismiss} activeOpacity={1} onPress={() => setModalResetVisible(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIconCircle}><MaterialCommunityIcons name="delete-sweep" size={26} color="#FFA726" /></View>
              <Text style={styles.modalTitle}>Escolha os Temas para Apagar</Text>
              <Text style={styles.modalSubtitle}>Marque os temas desejados para apagar exclusivamente o histórico de resoluções correspondente.</Text>
            </View>

            {temasDisponiveis.length > 0 && (
              <View style={styles.searchBarContainer}>
                <Ionicons name="search-outline" size={18} color={Colors.textSecondary} style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.searchBarInput}
                  placeholder="Buscar tema..."
                  placeholderTextColor={Colors.textSecondary}
                  value={searchTema}
                  onChangeText={setSearchTema}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="default"
                  inputMode="text"
                  textContentType="none"
                  returnKeyType="search"
                  blurOnSubmit={false}
                />
                {searchTema.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchTema('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={18} color={Colors.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>
            )}

            {temasFiltrados.length > 0 && (
              <View style={styles.selectionToolbar}>
                <TouchableOpacity style={styles.selectionToolbarBtn} activeOpacity={0.7} onPress={toggleSelecionarTodos}>
                  <Ionicons name={temasFiltrados.length > 0 && temasFiltrados.every((t) => temasSelecionados.includes(t)) ? 'checkbox' : 'square-outline'} size={18} color={temasFiltrados.length > 0 && temasFiltrados.every((t) => temasSelecionados.includes(t)) ? Colors.primary : Colors.textSecondary} style={{ marginRight: 6 }} />
                  <Text style={styles.selectionToolbarBtnText}>{temasFiltrados.length > 0 && temasFiltrados.every((t) => temasSelecionados.includes(t)) ? 'Desmarcar todos' : 'Selecionar todos'}</Text>
                </TouchableOpacity>
                <View style={styles.selectionCountBadge}>
                  <Text style={styles.selectionCountText}>{temasSelecionados.length} selecionado{temasSelecionados.length === 1 ? '' : 's'}</Text>
                </View>
              </View>
            )}

            {temasDisponiveis.length === 0 ? (
              <View style={styles.modalEmptyContainer}>
                <Ionicons name="folder-open-outline" size={42} color={Colors.textSecondary} />
                <Text style={styles.modalEmptyTitle}>Nenhum histórico encontrado</Text>
                <Text style={styles.modalEmptySubtitle}>Não há resoluções registradas para nenhum tema no momento.</Text>
              </View>
            ) : temasFiltrados.length === 0 ? (
              <View style={styles.modalEmptyContainer}>
                <Ionicons name="search-outline" size={38} color={Colors.textSecondary} />
                <Text style={styles.modalEmptyTitle}>Nenhum tema encontrado</Text>
                <Text style={styles.modalEmptySubtitle}>Nenhum tema corresponde a "{searchTema}".</Text>
              </View>
            ) : (
              <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={true} keyboardShouldPersistTaps="handled">
                {temasFiltrados.map((temaItem, idx) => {
                  const isSelected = temasSelecionados.includes(temaItem);
                  return (
                    <TouchableOpacity key={`${temaItem}-${idx}`} style={[styles.temaItemRow, isSelected && styles.temaItemRowSelected]} activeOpacity={0.7} onPress={() => toggleSelecionarTema(temaItem)}>
                      <View style={styles.temaItemInfo}>
                        <Ionicons name={isSelected ? 'checkbox' : 'square-outline'} size={22} color={isSelected ? Colors.error : '#61676d'} style={{ marginRight: 10 }} />
                        <Text style={[styles.temaItemText, isSelected && styles.temaItemTextSelected]} numberOfLines={2}>{temaItem}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {temasDisponiveis.length > 0 && (
              <TouchableOpacity style={[styles.modalDeleteSelectedBtn, temasSelecionados.length === 0 && styles.modalDeleteSelectedBtnDisabled]} activeOpacity={0.85} onPress={confirmarResetTemasSelecionados} disabled={temasSelecionados.length === 0}>
                <Ionicons name="trash-outline" size={18} color={temasSelecionados.length === 0 ? '#656b73' : '#FFFFFF'} style={{ marginRight: 8 }} />
                <Text style={[styles.modalDeleteSelectedBtnText, temasSelecionados.length === 0 && styles.modalDeleteSelectedBtnTextDisabled]}>{temasSelecionados.length === 0 ? 'Excluir Selecionados' : `Excluir Selecionados (${temasSelecionados.length})`}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.modalCancelButton} activeOpacity={0.8} onPress={() => setModalResetVisible(false)}>
              <Text style={styles.modalCancelButtonText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={temasParaConfirmar !== null && temasParaConfirmar.length > 0} animationType="fade" transparent={true} onRequestClose={() => !resettingTema && setTemasParaConfirmar(null)}>
        <View style={styles.confirmModalOverlay}>
          <TouchableOpacity style={styles.confirmBackdropDismiss} activeOpacity={1} onPress={() => !resettingTema && setTemasParaConfirmar(null)} />
          <View style={styles.confirmModalCard}>
            <View style={styles.confirmIconCircle}><MaterialCommunityIcons name="alert-octagon-outline" size={32} color={Colors.error} /></View>
            <Text style={styles.confirmTitle}>Zerar Histórico</Text>
            <Text style={styles.confirmDescription}>{temasParaConfirmar && temasParaConfirmar.length === 1 ? 'Tem certeza que deseja apagar todo o histórico de resoluções de:' : `Tem certeza que deseja apagar todo o histórico de resoluções dos ${temasParaConfirmar?.length || 0} temas selecionados?`}</Text>
            {temasParaConfirmar && (
              <View style={styles.confirmThemeBox}>
                <MaterialCommunityIcons name={temasParaConfirmar.length === 1 ? 'bookmark' : 'bookmark-multiple'} size={18} color={Colors.primary} style={{ marginRight: 8, marginTop: 2 }} />
                <Text style={styles.confirmThemeText} numberOfLines={3}>{temasParaConfirmar.join(', ')}</Text>
              </View>
            )}
            <View style={styles.confirmWarningBox}>
              <Ionicons name="warning-outline" size={16} color="#FFA726" style={{ marginRight: 6 }} />
              <Text style={styles.confirmWarningText}>Esta ação é irreversível e excluirá acertos, erros e métricas apenas dos temas selecionados.</Text>
            </View>
            <View style={styles.confirmButtonsRow}>
              <TouchableOpacity style={styles.confirmCancelBtn} activeOpacity={0.8} onPress={() => setTemasParaConfirmar(null)} disabled={resettingTema}><Text style={styles.confirmCancelBtnText}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.confirmDeleteBtn, resettingTema && styles.buttonDisabled]} activeOpacity={0.85} onPress={executarResetTemas} disabled={resettingTema}>
                {resettingTema ? <ActivityIndicator size="small" color="#FFFFFF" /> : <><Ionicons name="trash-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} /><Text style={styles.confirmDeleteBtnText}>Sim, Zerar ({temasParaConfirmar?.length || 0})</Text></>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={sucessoTemaReset !== null && sucessoTemaReset.length > 0} animationType="fade" transparent={true} onRequestClose={() => setSucessoTemaReset(null)}>
        <View style={styles.confirmModalOverlay}>
          <TouchableOpacity style={styles.confirmBackdropDismiss} activeOpacity={1} onPress={() => setSucessoTemaReset(null)} />
          <View style={styles.successModalCard}>
            <View style={styles.successIconCircle}><Ionicons name="checkmark-circle" size={44} color={Colors.success} /></View>
            <Text style={styles.successModalTitle}>Histórico Zerado!</Text>
            <Text style={styles.successModalDescription}>{sucessoTemaReset && sucessoTemaReset.length === 1 ? 'O histórico de questões resolvidas do tema abaixo foi apagado com sucesso:' : `O histórico de questões resolvidas de ${sucessoTemaReset?.length || 0} temas foi apagado com sucesso:`}</Text>
            {sucessoTemaReset && (
              <View style={styles.successThemeBox}>
                <MaterialCommunityIcons name="bookmark-check" size={20} color={Colors.success} style={{ marginRight: 8, marginTop: 2 }} />
                <Text style={styles.successThemeText} numberOfLines={3}>{sucessoTemaReset.join(', ')}</Text>
              </View>
            )}
            <View style={styles.successInfoBox}>
              <Ionicons name="shield-checkmark-outline" size={18} color={Colors.primary} style={{ marginRight: 8 }} />
              <Text style={styles.successInfoText}>O progresso e os dados das demais especialidades e temas permanecem intactos.</Text>
            </View>
            <TouchableOpacity style={styles.successDoneButton} activeOpacity={0.85} onPress={() => setSucessoTemaReset(null)}>
              <Text style={styles.successDoneButtonText}>Entendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={modalZerarBancoVisible} animationType="fade" transparent={true} onRequestClose={() => !zerandoBanco && setModalZerarBancoVisible(false)}>
        <View style={styles.confirmModalOverlay}>
          <TouchableOpacity style={styles.confirmBackdropDismiss} activeOpacity={1} onPress={() => !zerandoBanco && setModalZerarBancoVisible(false)} />
          <View style={styles.confirmModalCard}>
            <View style={styles.dangerIconCircle}><MaterialCommunityIcons name="database-alert" size={34} color={Colors.error} /></View>
            <Text style={styles.confirmTitle}>Apagar Banco de Dados</Text>
            <Text style={styles.confirmDescription}>Esta ação removerá permanentemente todas as questões cadastradas e todos os arquivos de imagens do armazenamento interno do seu aparelho.</Text>
            <View style={styles.dangerHighlightBox}>
              <Ionicons name="trash" size={20} color={Colors.error} style={{ marginRight: 8 }} />
              <Text style={styles.dangerHighlightText}>{questoesCount} {questoesCount === 1 ? 'questão' : 'questões'}{totalImagensSalvas > 0 ? ` e ${totalImagensSalvas} ${totalImagensSalvas === 1 ? 'imagem' : 'imagens'}` : ''} serão excluídas</Text>
            </View>
            <View style={styles.confirmWarningBox}>
              <Ionicons name="warning-outline" size={16} color="#FFA726" style={{ marginRight: 6 }} />
              <Text style={styles.confirmWarningText}>Ação irreversível. O banco de questões e os pacotes de imagens serão zerados. O histórico de acertos e erros não é afetado, e você poderá baixar tudo novamente pelo GitHub ou importar novos arquivos.</Text>
            </View>
            <View style={styles.confirmButtonsRow}>
              <TouchableOpacity style={styles.confirmCancelBtn} activeOpacity={0.8} onPress={() => setModalZerarBancoVisible(false)} disabled={zerandoBanco}><Text style={styles.confirmCancelBtnText}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.confirmDeleteBtn, zerandoBanco && styles.buttonDisabled]} activeOpacity={0.85} onPress={executarZerarBanco} disabled={zerandoBanco}>
                {zerandoBanco ? <ActivityIndicator size="small" color="#FFFFFF" /> : <><Ionicons name="trash-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} /><Text style={styles.confirmDeleteBtnText}>Sim, Zerar Tudo</Text></>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={sucessoZerarBanco} animationType="fade" transparent={true} onRequestClose={() => setSucessoZerarBanco(false)}>
        <View style={styles.confirmModalOverlay}>
          <TouchableOpacity style={styles.confirmBackdropDismiss} activeOpacity={1} onPress={() => setSucessoZerarBanco(false)} />
          <View style={styles.successModalCard}>
            <View style={styles.successIconCircle}><Ionicons name="checkmark-circle" size={44} color={Colors.success} /></View>
            <Text style={styles.successModalTitle}>Banco Zerado!</Text>
            <Text style={styles.successModalDescription}>Todas as questões e arquivos de imagens foram removidos com sucesso do armazenamento local.</Text>
            <View style={styles.successInfoBox}>
              <Ionicons name="information-circle-outline" size={18} color={Colors.primary} style={{ marginRight: 8 }} />
              <Text style={styles.successInfoText}>O banco de dados e os pacotes de imagens foram completamente limpos. Você pode sincronizar com o GitHub ou importar novos arquivos a qualquer momento.</Text>
            </View>
            <TouchableOpacity style={styles.successDoneButton} activeOpacity={0.85} onPress={() => setSucessoZerarBanco(false)}>
              <Text style={styles.successDoneButtonText}>Entendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={sucessoImportacao !== null} animationType="fade" transparent={true} onRequestClose={() => setSucessoImportacao(null)}>
        <View style={styles.confirmModalOverlay}>
          <TouchableOpacity style={styles.confirmBackdropDismiss} activeOpacity={1} onPress={() => setSucessoImportacao(null)} />
          <View style={styles.importSuccessCard}>
            <View style={styles.importSuccessIconCircle}><Ionicons name={sucessoImportacao && sucessoImportacao.adicionadas > 0 ? "cloud-done" : "checkmark-circle"} size={40} color={Colors.success} /></View>
            <Text style={styles.importSuccessTitle}>{sucessoImportacao && sucessoImportacao.adicionadas > 0 ? 'Banco Atualizado!' : 'Nenhuma Nova Questão'}</Text>
            <Text style={styles.importSuccessSubtitle}>{sucessoImportacao && sucessoImportacao.adicionadas > 0 ? 'O arquivo JSON foi processado e integrado com sucesso ao seu banco de dados local.' : 'Todas as questões deste arquivo já constam cadastradas no seu banco de dados.'}</Text>
            {sucessoImportacao && (
              <View style={styles.importStatsCard}>
                <View style={styles.importStatsGrid}>
                  <View style={styles.importStatBox}><Text style={styles.importStatLabel}>NOVAS</Text><Text style={[styles.importStatValue, { color: Colors.success }]}>+{sucessoImportacao.adicionadas}</Text></View>
                  <View style={styles.importStatDivider} />
                  <View style={styles.importStatBox}><Text style={styles.importStatLabel}>DUPLICADAS</Text><Text style={[styles.importStatValue, { color: Colors.textSecondary }]}>{sucessoImportacao.duplicadas}</Text></View>
                  <View style={styles.importStatDivider} />
                  <View style={styles.importStatBox}><Text style={styles.importStatLabel}>TOTAL BANCO</Text><Text style={[styles.importStatValue, { color: Colors.primary }]}>{sucessoImportacao.totalFinal}</Text></View>
                </View>
                {sucessoImportacao.especialidades.length > 0 && (
                  <View style={styles.importSpecsRow}>
                    {sucessoImportacao.especialidades.slice(0, 3).map((esp, i) => (
                      <View key={i} style={styles.importSpecChip}><Ionicons name="medical" size={11} color={Colors.primary} style={{ marginRight: 4 }} /><Text style={styles.importSpecChipText} numberOfLines={1}>{esp}</Text></View>
                    ))}
                    {sucessoImportacao.especialidades.length > 3 && <View style={styles.importSpecChip}><Text style={styles.importSpecChipText}>+{sucessoImportacao.especialidades.length - 3} mais</Text></View>}
                  </View>
                )}
              </View>
            )}
            <View style={styles.importInfoBox}>
              <Ionicons name="sparkles-outline" size={17} color={Colors.primary} style={{ marginRight: 8, marginTop: 1 }} />
              <Text style={styles.importInfoText}>Tudo pronto para treinar! As novas questões já estão disponíveis na aba <Text style={{ fontWeight: '700', color: Colors.text }}>Questões</Text>.</Text>
            </View>
            <TouchableOpacity style={styles.importDoneButton} activeOpacity={0.85} onPress={() => setSucessoImportacao(null)}>
              <Text style={styles.importDoneButtonText}>Excelente, Começar a Estudar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={modalBancoVazioVisible} animationType="fade" transparent={true} onRequestClose={() => setModalBancoVazioVisible(false)}>
        <View style={styles.confirmModalOverlay}>
          <TouchableOpacity style={styles.confirmBackdropDismiss} activeOpacity={1} onPress={() => setModalBancoVazioVisible(false)} />
          <View style={styles.emptyDbModalCard}>
            <View style={styles.emptyDbIconCircle}><MaterialCommunityIcons name="database-off-outline" size={40} color="#FFA726" /></View>
            <Text style={styles.emptyDbTitle}>Banco Já Está Vazio</Text>
            <Text style={styles.emptyDbSubtitle}>Não há questões ou arquivos de imagem armazenados no momento no aplicativo para serem apagados.</Text>
            <View style={styles.emptyDbInfoBox}>
              <Ionicons name="bulb-outline" size={18} color="#FFA726" style={{ marginRight: 8, marginTop: 1 }} />
              <Text style={styles.emptyDbInfoText}>Para iniciar seus simulados e treinos, sincronize com o GitHub ou importe um arquivo no formato <Text style={{ fontWeight: '700', color: Colors.text }}>JSON</Text> com as questões.</Text>
            </View>
            <View style={styles.emptyDbButtonsCol}>
              <TouchableOpacity style={styles.emptyDbPrimaryButton} activeOpacity={0.85} onPress={() => { setModalBancoVazioVisible(false); setTimeout(() => { importarJSON(); }, 250); }}>
                <Ionicons name="cloud-upload-outline" size={18} color="#000000" style={{ marginRight: 8 }} />
                <Text style={styles.emptyDbPrimaryButtonText}>Importar Questões (JSON)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.emptyDbSecondaryButton} activeOpacity={0.8} onPress={() => setModalBancoVazioVisible(false)}>
                <Text style={styles.emptyDbSecondaryButtonText}>Fechar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
          {/* Modal de Configuração do GitHub */}
      <Modal
        visible={modalGitHubConfigVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => !testandoConexao && setModalGitHubConfigVisible(false)}
      >
        <View style={styles.confirmModalOverlay}>
          <TouchableOpacity
            style={styles.confirmBackdropDismiss}
            activeOpacity={1}
            onPress={() => !testandoConexao && setModalGitHubConfigVisible(false)}
          />
          <View style={[styles.confirmModalCard, { maxWidth: 400 }]}>
            <View
              style={[
                styles.successIconCircle,
                { backgroundColor: 'rgba(234, 225, 21, 0.12)', borderColor: 'rgba(234, 225, 21, 0.3)' },
              ]}
            >
              <Ionicons name="logo-github" size={34} color={Colors.primary} />
            </View>

            <Text style={styles.confirmTitle}>Repositório GitHub</Text>
            <Text style={styles.confirmDescription}>
              Configure o repositório privado para download automático de questões e imagens.
            </Text>

            {/* Repositório Input */}
            <View style={styles.gitHubInputContainer}>
              <Text style={styles.pkgInputLabel}>REPOSITÓRIO (USUÁRIO/REPOSITÓRIO)</Text>
              <View style={styles.pkgInputWrapper}>
                <Ionicons name="git-branch-outline" size={17} color={Colors.primary} style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.pkgInput}
                  value={gitHubRepoInput}
                  onChangeText={setGitHubRepoInput}
                  placeholder="ex: usuario/repositorio"
                  placeholderTextColor={Colors.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            {/* Personal Access Token (PAT) Input */}
            <View style={[styles.gitHubInputContainer, { marginTop: 12 }]}>
              <Text style={styles.pkgInputLabel}>PERSONAL ACCESS TOKEN (PAT)</Text>
              <View style={styles.pkgInputWrapper}>
                <Ionicons name="key-outline" size={17} color={Colors.primary} style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.pkgInput}
                  value={gitHubTokenInput}
                  onChangeText={(t) => {
                    setGitHubTokenInput(t);
                    setResultadoTesteConexao(null);
                  }}
                  placeholder="ghp_... ou github_pat_..."
                  placeholderTextColor={Colors.textSecondary}
                  secureTextEntry={!mostrarToken}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  onPress={() => setMostrarToken(!mostrarToken)}
                  style={{ padding: 4 }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name={mostrarToken ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={Colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Dica de Permissão */}
            <View style={[styles.confirmWarningBox, { marginTop: 10, marginBottom: 12 }]}>
              <Ionicons name="information-circle-outline" size={16} color="#FFA726" style={{ marginRight: 6 }} />
              <Text style={styles.confirmWarningText}>
                Necessário token com leitura de conteúdo (escopo repo ou Contents: Read-only).
              </Text>
            </View>

            {/* Feedback do Teste de Conexão */}
            {resultadoTesteConexao && (
              <View
                style={[
                  styles.gitHubFeedbackBox,
                  {
                    backgroundColor: resultadoTesteConexao.sucesso
                      ? 'rgba(76, 175, 80, 0.12)'
                      : 'rgba(239, 68, 68, 0.12)',
                    borderColor: resultadoTesteConexao.sucesso
                      ? 'rgba(76, 175, 80, 0.3)'
                      : 'rgba(239, 68, 68, 0.3)',
                  },
                ]}
              >
                <Ionicons
                  name={resultadoTesteConexao.sucesso ? 'checkmark-circle' : 'alert-circle'}
                  size={18}
                  color={resultadoTesteConexao.sucesso ? Colors.success : Colors.error}
                  style={{ marginRight: 8 }}
                />
                <Text
                  style={[
                    styles.gitHubFeedbackText,
                    { color: resultadoTesteConexao.sucesso ? Colors.success : '#ff8a80' },
                  ]}
                >
                  {resultadoTesteConexao.mensagem}
                </Text>
              </View>
            )}

            {/* Botão de Testar Conexão */}
            <TouchableOpacity
              style={styles.gitHubTestBtn}
              onPress={executarTesteConexao}
              activeOpacity={0.7}
              disabled={testandoConexao}
            >
              {testandoConexao ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <>
                  <Ionicons name="flash-outline" size={15} color={Colors.primary} style={{ marginRight: 6 }} />
                  <Text style={styles.gitHubTestBtnText}>Testar Conexão com GitHub</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Botões Salvar / Cancelar */}
            <View style={[styles.confirmButtonsRow, { marginTop: 10 }]}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                activeOpacity={0.8}
                onPress={() => setModalGitHubConfigVisible(false)}
                disabled={testandoConexao}
              >
                <Text style={styles.confirmCancelBtnText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.gitHubSaveBtn, testandoConexao && styles.buttonDisabled]}
                activeOpacity={0.85}
                onPress={salvarConfiguracoesGitHub}
                disabled={testandoConexao}
              >
                <Ionicons name="checkmark" size={16} color="#000000" style={{ marginRight: 6 }} />
                <Text style={styles.gitHubSaveBtnText}>Salvar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal de Progresso da Sincronização */}
      <Modal
        visible={modalSyncProgressVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => {}}
      >
        <View style={styles.confirmModalOverlay}>
          <View style={[styles.confirmModalCard, { maxWidth: 360 }]}>
            <View
              style={[
                styles.successIconCircle,
                { backgroundColor: 'rgba(234, 225, 21, 0.12)', borderColor: 'rgba(234, 225, 21, 0.3)' },
              ]}
            >
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>

            <Text style={styles.confirmTitle}>Sincronizando</Text>
            <Text style={[styles.confirmDescription, { marginBottom: 16 }]}>
              Baixando dados e imagens do repositório privado...
            </Text>

            {/* Barra de Progresso Visual */}
            <View style={styles.syncProgressBarTrack}>
              <View
                style={[
                  styles.syncProgressBarFill,
                  {
                    width: `${Math.min(
                      100,
                      Math.max(
                        5,
                        Math.round(
                          (syncProgress.progressoAtual / Math.max(syncProgress.totalItens, 1)) * 100
                        )
                      )
                    )}%`,
                  },
                ]}
              />
            </View>

            {/* Informações da Etapa Atual */}
            <View style={styles.syncStatusCard}>
              <Text style={styles.syncStepMessage}>{syncProgress.mensagem}</Text>
              {syncProgress.detalhe ? (
                <Text style={styles.syncStepDetail} numberOfLines={2}>
                  {syncProgress.detalhe}
                </Text>
              ) : null}
            </View>

            <Text style={styles.syncWarningSubtext}>
              Por favor, mantenha o aplicativo aberto durante o download.
            </Text>
          </View>
        </View>
      </Modal>

      {/* Modal de Sucesso da Sincronização */}
      <Modal
        visible={modalSyncSuccessVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setModalSyncSuccessVisible(false)}
      >
        <View style={styles.confirmModalOverlay}>
          <TouchableOpacity
            style={styles.confirmBackdropDismiss}
            activeOpacity={1}
            onPress={() => setModalSyncSuccessVisible(false)}
          />
          <View style={styles.importSuccessCard}>
            <View style={styles.importSuccessIconCircle}>
              <Ionicons name="checkmark-circle" size={42} color={Colors.success} />
            </View>

            <Text style={styles.importSuccessTitle}>Sincronização Concluída!</Text>
            <Text style={styles.importSuccessSubtitle}>
              O seu banco de dados local foi atualizado com sucesso a partir do repositório GitHub.
            </Text>

            {/* Grid de Estatísticas da Sincronização */}
            <View style={styles.importStatsCard}>
              <View style={styles.importStatsGrid}>
                <View style={styles.importStatBox}>
                  <Text style={styles.importStatLabel}>NOVAS</Text>
                  <Text style={[styles.importStatValue, { color: Colors.primary }]}>
                    +{syncResultData?.questoesAdicionadas || 0}
                  </Text>
                </View>

                <View style={styles.importStatDivider} />

                <View style={styles.importStatBox}>
                  <Text style={styles.importStatLabel}>ATUALIZADAS</Text>
                  <Text style={[styles.importStatValue, { color: '#60A5FA' }]}>
                    {syncResultData?.questoesAtualizadas || 0}
                  </Text>
                </View>

                <View style={styles.importStatDivider} />

                <View style={styles.importStatBox}>
                  <Text style={styles.importStatLabel}>IMAGENS</Text>
                  <Text style={[styles.importStatValue, { color: Colors.success }]}>
                    {syncResultData?.imagensExtraidas || 0}
                  </Text>
                </View>
              </View>
            </View>

            {/* Resumo do Total Final */}
            <View style={styles.importInfoBox}>
              <Ionicons name="layers-outline" size={18} color={Colors.primary} style={{ marginRight: 8, marginTop: 1 }} />
              <Text style={styles.importInfoText}>
                Total no banco local: <Text style={{ color: Colors.text, fontWeight: '700' }}>{syncResultData?.totalQuestoesFinal || questoesCount} questões</Text> disponíveis para estudo offline.
              </Text>
            </View>

            <TouchableOpacity
              style={styles.importDoneButton}
              activeOpacity={0.85}
              onPress={() => setModalSyncSuccessVisible(false)}
            >
              <Text style={styles.importDoneButtonText}>Excelente, Concluir</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal Banco Já Atualizado */}
      <Modal
        visible={modalUpToDateVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setModalUpToDateVisible(false)}
      >
        <View style={styles.confirmModalOverlay}>
          <TouchableOpacity
            style={styles.confirmBackdropDismiss}
            activeOpacity={1}
            onPress={() => setModalUpToDateVisible(false)}
          />
          <View style={[styles.confirmModalCard, { maxWidth: 360 }]}>
            <View
              style={[
                styles.successIconCircle,
                { backgroundColor: 'rgba(234, 225, 21, 0.12)', borderColor: 'rgba(234, 225, 21, 0.3)' },
              ]}
            >
              <Ionicons name="cloud-done-outline" size={38} color={Colors.primary} />
            </View>

            <Text style={styles.confirmTitle}>Tudo Atualizado!</Text>
            <Text style={styles.confirmDescription}>
              O seu banco de dados local já possui as questões e imagens mais recentes registradas no GitHub.
            </Text>

            <View style={styles.upToDateInfoCard}>
              <Ionicons name="checkmark-circle-outline" size={18} color={Colors.success} style={{ marginRight: 8 }} />
              <Text style={styles.upToDateInfoText}>
                Nenhuma versão mais recente encontrada no repositório.
              </Text>
            </View>

            <TouchableOpacity
              style={styles.successDoneButton}
              activeOpacity={0.85}
              onPress={() => setModalUpToDateVisible(false)}
            >
              <Text style={styles.successDoneButtonText}>Entendido</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.forceSyncBtn}
              activeOpacity={0.7}
              onPress={() => executarSincronizacao(true)}
            >
              <Ionicons name="refresh-outline" size={15} color={Colors.textSecondary} style={{ marginRight: 6 }} />
              <Text style={styles.forceSyncBtnText}>Forçar Re-download Completo</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal de Sincronização Seletiva de Especialidades */}
      <Modal
        visible={modalSincronizacaoSeletivaVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => !modalSyncProgressVisible && setModalSincronizacaoSeletivaVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.confirmBackdropDismiss}
            activeOpacity={1}
            onPress={() => !modalSyncProgressVisible && setModalSincronizacaoSeletivaVisible(false)}
          />
          <View style={[styles.modalCard, { maxHeight: '88%' }]}>
            {/* Cabeçalho */}
            <View style={styles.modalHeader}>
              <View style={styles.modalIconCircle}>
                <Ionicons name="medical" size={26} color={Colors.primary} />
              </View>
              <Text style={styles.modalTitle}>Baixar por Especialidade</Text>
              <Text style={styles.modalSubtitle}>
                Selecione quais especialidades médicas deseja sincronizar ou atualizar do repositório.
              </Text>
            </View>

            {carregandoBancosRemotos ? (
              <View style={[styles.modalEmptyContainer, { paddingVertical: 40 }]}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={[styles.modalEmptyTitle, { marginTop: 16 }]}>
                  Consultando repositório GitHub...
                </Text>
              </View>
            ) : !checkResultRemoto || checkResultRemoto.especialidades.length === 0 ? (
              <View style={styles.modalEmptyContainer}>
                <Ionicons name="folder-open-outline" size={40} color={Colors.textSecondary} />
                <Text style={styles.modalEmptyTitle}>Nenhuma especialidade encontrada</Text>
                <Text style={styles.modalEmptySubtitle}>
                  O arquivo index.json do repositório não possui especialidades listadas.
                </Text>
                <TouchableOpacity
                  style={[styles.modalCancelButton, { marginTop: 16, width: '100%' }]}
                  activeOpacity={0.7}
                  onPress={() => setModalSincronizacaoSeletivaVisible(false)}
                >
                  <Text style={styles.modalCancelButtonText}>Fechar</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {/* Opção de Baixar Imagens Correspondentes */}
                <TouchableOpacity
                  style={styles.selectiveImageToggleRow}
                  activeOpacity={0.7}
                  onPress={() => setBaixarImagensCorrespondentes(!baixarImagensCorrespondentes)}
                >
                  <Ionicons
                    name={baixarImagensCorrespondentes ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={baixarImagensCorrespondentes ? Colors.primary : Colors.textSecondary}
                    style={{ marginRight: 10 }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.selectiveImageToggleTitle}>Baixar imagens correspondentes</Text>
                    <Text style={styles.selectiveImageToggleSub}>
                      Baixa e descompacta os arquivos de imagens das especialidades marcadas
                    </Text>
                  </View>
                  <Ionicons
                    name="images-outline"
                    size={18}
                    color={baixarImagensCorrespondentes ? Colors.primary : Colors.textSecondary}
                  />
                </TouchableOpacity>

                {/* Barra de Busca de Especialidades */}
                {checkResultRemoto.especialidades.length > 3 && (
                  <View style={[styles.searchBarContainer, { marginBottom: 8 }]}>
                    <Ionicons name="search-outline" size={17} color={Colors.textSecondary} style={{ marginRight: 8 }} />
                    <TextInput
                      style={styles.searchBarInput}
                      placeholder="Buscar especialidade..."
                      placeholderTextColor={Colors.textSecondary}
                      value={searchEspecialidadeFiltro}
                      onChangeText={setSearchEspecialidadeFiltro}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="default"
                      inputMode="text"
                      textContentType="none"
                      returnKeyType="search"
                      blurOnSubmit={false}
                    />
                    {searchEspecialidadeFiltro.length > 0 && (
                      <TouchableOpacity
                        onPress={() => setSearchEspecialidadeFiltro('')}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="close-circle" size={17} color={Colors.textSecondary} />
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* Barra de Ações Rápidas de Seleção */}
                <View style={styles.selectionToolbar}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {checkResultRemoto.especialidadesComAtualizacao.length > 0 && (
                      <TouchableOpacity
                        style={styles.selectionToolbarBtn}
                        onPress={selecionarTodasComAtualizacao}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.selectionToolbarBtnText, { color: Colors.primary }]}>
                          Atualizações ({checkResultRemoto.especialidadesComAtualizacao.length})
                        </Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.selectionToolbarBtn}
                      onPress={
                        especialidadesSelecionadas.length === checkResultRemoto.especialidades.length
                          ? desmarcarTodasEspecialidades
                          : selecionarTodasEspecialidades
                      }
                      activeOpacity={0.7}
                    >
                      <Text style={styles.selectionToolbarBtnText}>
                        {especialidadesSelecionadas.length === checkResultRemoto.especialidades.length
                          ? 'Desmarcar Todas'
                          : 'Marcar Todas'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.selectionCountBadge}>
                    <Text style={styles.selectionCountText}>
                      {especialidadesSelecionadas.length} / {checkResultRemoto.especialidades.length}
                    </Text>
                  </View>
                </View>

                {/* Lista de Especialidades Remotas */}
                <ScrollView
                  style={[styles.modalScroll, { maxHeight: 260 }]}
                  contentContainerStyle={styles.modalScrollContent}
                  showsVerticalScrollIndicator={true}
                  keyboardShouldPersistTaps="handled"
                >
                  {especialidadesRemotasFiltradas.length === 0 ? (
                    <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                      <Text style={{ color: Colors.textSecondary, fontSize: 13 }}>
                        Nenhuma especialidade encontrada para "{searchEspecialidadeFiltro}".
                      </Text>
                    </View>
                  ) : (
                    especialidadesRemotasFiltradas.map((esp) => {
                      const isSelected = especialidadesSelecionadas.includes(esp.nome);
                      return (
                        <TouchableOpacity
                          key={'esp-select-' + esp.nome}
                          style={[
                            styles.selectiveItemCard,
                            isSelected && styles.selectiveItemCardSelected,
                          ]}
                          activeOpacity={0.7}
                          onPress={() => toggleSelecionarEspecialidade(esp.nome)}
                        >
                          <Ionicons
                            name={isSelected ? 'checkbox' : 'square-outline'}
                            size={22}
                            color={isSelected ? Colors.primary : Colors.textSecondary}
                            style={{ marginRight: 10 }}
                          />
                          <View style={{ flex: 1, marginRight: 6 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                              <Text
                                style={[
                                  styles.selectiveItemName,
                                  isSelected && styles.selectiveItemNameSelected,
                                ]}
                                numberOfLines={1}
                              >
                                {esp.nome}
                              </Text>

                              {/* Badges de Status */}
                              {esp.status === 'atualizacao' && (
                                <View style={styles.badgeAtualizacao}>
                                  <Ionicons name="sparkles" size={9} color="#000000" style={{ marginRight: 3 }} />
                                  <Text style={styles.badgeAtualizacaoText}>ATUALIZAÇÃO</Text>
                                </View>
                              )}
                              {esp.status === 'novo' && (
                                <View style={styles.badgeNovo}>
                                  <Text style={styles.badgeNovoText}>NOVO</Text>
                                </View>
                              )}
                              {esp.status === 'atualizado' && (
                                <View style={styles.badgeInstalado}>
                                  <Ionicons name="checkmark" size={10} color={Colors.textSecondary} style={{ marginRight: 2 }} />
                                  <Text style={styles.badgeInstaladoText}>INSTALADO</Text>
                                </View>
                              )}
                            </View>

                            <Text style={styles.selectiveItemVersion}>
                              {esp.versaoRemota ? 'Versão remota: v' + esp.versaoRemota : 'Disponível no repositório'}
                              {esp.versaoLocal !== undefined ? ' • No app: v' + esp.versaoLocal : ''}
                              {esp.bancos.length > 0 ? ' • ' + esp.bancos.length + ' arquivo(s)' : ''}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </ScrollView>

                {/* Botões de Ação */}
                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    { marginTop: 12, paddingVertical: 14 },
                    especialidadesSelecionadas.length === 0 && styles.buttonDisabled,
                  ]}
                  activeOpacity={0.8}
                  onPress={executarSincronizacaoSeletivaConfirmada}
                  disabled={especialidadesSelecionadas.length === 0}
                >
                  <Ionicons name="cloud-download-outline" size={17} color="#000000" style={{ marginRight: 6 }} />
                  <Text style={styles.primaryButtonText}>
                    Baixar Selecionadas ({especialidadesSelecionadas.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.modalCancelButton}
                  activeOpacity={0.7}
                  onPress={() => setModalSincronizacaoSeletivaVisible(false)}
                >
                  <Text style={styles.modalCancelButtonText}>Cancelar</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Modal Customizado: Novas Questões Disponíveis */}
      <Modal
        visible={modalNovasQuestoesVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setModalNovasQuestoesVisible(false)}
      >
        <View style={styles.confirmModalOverlay}>
          <TouchableOpacity
            style={styles.confirmBackdropDismiss}
            activeOpacity={1}
            onPress={() => setModalNovasQuestoesVisible(false)}
          />
          <View style={[styles.confirmModalCard, { maxWidth: 360 }]}>
            <View
              style={[
                styles.successIconCircle,
                { backgroundColor: 'rgba(234, 225, 21, 0.15)', borderColor: 'rgba(234, 225, 21, 0.4)' },
              ]}
            >
              <Ionicons name="sparkles" size={34} color={Colors.primary} />
            </View>

            <Text style={styles.confirmTitle}>Novas Questões Disponíveis!</Text>
            <Text style={styles.confirmDescription}>
              Detectamos novas atualizações e pacotes de questões prontos para download no seu repositório GitHub.
            </Text>

            <View style={styles.novasQuestoesInfoCard}>
              <View style={styles.novasQuestoesStatItem}>
                <Ionicons name="document-text-outline" size={20} color={Colors.primary} style={{ marginBottom: 4 }} />
                <Text style={styles.novasQuestoesStatValue}>
                  {updateStatus.totalBancosNovos > 0 ? `${updateStatus.totalBancosNovos}` : 'Disponível'}
                </Text>
                <Text style={styles.novasQuestoesStatLabel}>Bancos com Atualizações</Text>
              </View>

              <View style={styles.novasQuestoesStatDivider} />

              <View style={styles.novasQuestoesStatItem}>
                <Ionicons name="images-outline" size={20} color="#60A5FA" style={{ marginBottom: 4 }} />
                <Text style={styles.novasQuestoesStatValue}>
                  {updateStatus.totalPacotesNovos > 0 ? `${updateStatus.totalPacotesNovos}` : 'Sincronizado'}
                </Text>
                <Text style={styles.novasQuestoesStatLabel}>Pacotes Imagens</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.successDoneButton}
              activeOpacity={0.85}
              onPress={() => {
                setModalNovasQuestoesVisible(false);
                abrirSincronizacaoGitHub();
              }}
            >
              <Ionicons name="cloud-download" size={17} color="#000000" style={{ marginRight: 6 }} />
              <Text style={styles.successDoneButtonText}>Sincronizar Agora</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.forceSyncBtn}
              activeOpacity={0.7}
              onPress={() => setModalNovasQuestoesVisible(false)}
            >
              <Text style={styles.forceSyncBtnText}>Lembrar Mais Tarde</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal Customizado: Credenciais Salvas com Sucesso */}
      <Modal
        visible={modalCredenciaisSalvasVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setModalCredenciaisSalvasVisible(false)}
      >
        <View style={styles.confirmModalOverlay}>
          <TouchableOpacity
            style={styles.confirmBackdropDismiss}
            activeOpacity={1}
            onPress={() => setModalCredenciaisSalvasVisible(false)}
          />
          <View style={[styles.confirmModalCard, { maxWidth: 360 }]}>
            <View
              style={[
                styles.successIconCircle,
                { backgroundColor: 'rgba(76, 175, 80, 0.15)', borderColor: 'rgba(76, 175, 80, 0.35)' },
              ]}
            >
              <Ionicons name="checkmark-done" size={36} color={Colors.success} />
            </View>

            <Text style={styles.confirmTitle}>Credenciais Salvas!</Text>
            <Text style={styles.confirmDescription}>
              Seu repositório do GitHub foi conectado com sucesso e permanecerá gravado com segurança no dispositivo.
            </Text>

            <View style={styles.credenciaisInfoBox}>
              <View style={styles.credenciaisInfoRow}>
                <Ionicons name="logo-github" size={16} color={Colors.textSecondary} style={{ marginRight: 8 }} />
                <Text style={styles.credenciaisInfoText} numberOfLines={1}>
                  {gitHubRepoInput || 'Repositório configurado'}
                </Text>
              </View>
              <View style={[styles.credenciaisInfoRow, { marginTop: 8 }]}>
                <Ionicons name="shield-checkmark-outline" size={16} color={Colors.success} style={{ marginRight: 8 }} />
                <Text style={[styles.credenciaisInfoText, { color: Colors.success }]}>
                  Autenticação Token Ativa
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.successDoneButton}
              activeOpacity={0.85}
              onPress={() => {
                setModalCredenciaisSalvasVisible(false);
                abrirSincronizacaoGitHub();
              }}
            >
              <Ionicons name="sync" size={16} color="#000000" style={{ marginRight: 6 }} />
              <Text style={styles.successDoneButtonText}>Sincronizar Agora</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.forceSyncBtn}
              activeOpacity={0.7}
              onPress={() => setModalCredenciaisSalvasVisible(false)}
            >
              <Text style={styles.forceSyncBtnText}>Concluir</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal Customizado: Falha na Sincronização */}
      <Modal
        visible={modalSyncErrorVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setModalSyncErrorVisible(false)}
      >
        <View style={styles.confirmModalOverlay}>
          <TouchableOpacity
            style={styles.confirmBackdropDismiss}
            activeOpacity={1}
            onPress={() => setModalSyncErrorVisible(false)}
          />
          <View style={[styles.confirmModalCard, { maxWidth: 360 }]}>
            <View
              style={[
                styles.successIconCircle,
                { backgroundColor: 'rgba(239, 68, 68, 0.12)', borderColor: 'rgba(239, 68, 68, 0.35)' },
              ]}
            >
              <MaterialCommunityIcons name="cloud-alert" size={36} color={Colors.error} />
            </View>

            <Text style={styles.confirmTitle}>Falha na Sincronização</Text>
            <Text style={styles.confirmDescription}>
              Não foi possível concluir a sincronização com o repositório GitHub.
            </Text>

            <View style={styles.syncErrorDetailsBox}>
              <Ionicons name="alert-circle-outline" size={18} color={Colors.error} style={{ marginRight: 8 }} />
              <Text style={styles.syncErrorDetailsText}>
                {syncErrorMessage || 'Verifique sua conexão e se as credenciais do repositório estão corretas.'}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.successDoneButton}
              activeOpacity={0.85}
              onPress={() => setModalSyncErrorVisible(false)}
            >
              <Text style={styles.successDoneButtonText}>Entendido</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.forceSyncBtn}
              activeOpacity={0.7}
              onPress={() => {
                setModalSyncErrorVisible(false);
                setModalGitHubConfigVisible(true);
              }}
            >
              <Ionicons name="settings-outline" size={15} color={Colors.primary} style={{ marginRight: 6 }} />
              <Text style={[styles.forceSyncBtnText, { color: Colors.primary }]}>Revisar Credenciais</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal de Configuração do Pacote de Imagens (.zip) e Nome da Subpasta */}
      <Modal
        visible={modalZipVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => !unzipping && setModalZipVisible(false)}
      >
        <View style={styles.confirmModalOverlay}>
          <TouchableOpacity
            style={styles.confirmBackdropDismiss}
            activeOpacity={1}
            onPress={() => !unzipping && setModalZipVisible(false)}
          />
          <View style={styles.pkgModalCard}>
            {/* Ícone com Halo Dourado */}
            <View style={styles.pkgIconCircle}>
              <MaterialCommunityIcons name="folder-zip-outline" size={38} color={Colors.primary} />
            </View>

            <Text style={styles.pkgTitle}>Pacote de Imagens</Text>

            <Text style={styles.pkgSubtitle}>
              Defina o identificador deste pacote. Os arquivos serão descompactados em uma subpasta isolada para vincular diretamente com a chave <Text style={{ color: Colors.primary, fontWeight: '700' }}>"origem"</Text> das questões do seu arquivo JSON.
            </Text>

            {/* Campo de Entrada do Nome do Pacote / Subpasta */}
            <View style={styles.pkgInputContainer}>
              <Text style={styles.pkgInputLabel}>IDENTIFICADOR DO BANCO / SUBPASTA</Text>
              <View style={styles.pkgInputWrapper}>
                <Ionicons name="folder-outline" size={18} color={Colors.primary} style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.pkgInput}
                  value={pacoteOrigemInput}
                  onChangeText={(text) =>
                    setPacoteOrigemInput(text.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase())
                  }
                  placeholder="ex: cardio_1"
                  placeholderTextColor={Colors.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  selectTextOnFocus
                />
              </View>
            </View>

            {/* Pré-visualização do Caminho Dinâmico */}
            <View style={styles.pkgPreviewBox}>
              <Ionicons name="file-tray-full-outline" size={16} color={Colors.primary} style={{ marginRight: 8, marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.pkgPreviewLabel}>Caminho da subpasta isolada:</Text>
                <Text style={styles.pkgPreviewPath} numberOfLines={2}>
                  AthenaImagens/{pacoteOrigemInput.trim() || 'pacote'}/
                </Text>
              </View>
            </View>

            {/* Ações */}
            <View style={styles.pkgButtonsRow}>
              <TouchableOpacity
                style={styles.pkgCancelBtn}
                activeOpacity={0.8}
                onPress={() => {
                  setModalZipVisible(false);
                  setZipUriPendente(null);
                }}
                disabled={unzipping}
              >
                <Text style={styles.pkgCancelBtnText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.pkgConfirmBtn,
                  (!pacoteOrigemInput.trim() || unzipping) && styles.buttonDisabled,
                ]}
                activeOpacity={0.85}
                onPress={confirmarImportacaoZip}
                disabled={!pacoteOrigemInput.trim() || unzipping}
              >
                {unzipping ? (
                  <ActivityIndicator size="small" color="#000000" />
                ) : (
                  <>
                    <Ionicons name="archive-outline" size={16} color="#000000" style={{ marginRight: 6 }} />
                    <Text style={styles.pkgConfirmBtnText}>Descompactar</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

          {/* Modal / Popup de Detalhes dos Bancos de Questões de um Grupo Específico */}
      <Modal
        visible={grupoBancosModal !== null}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setGrupoBancosModal(null)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.confirmBackdropDismiss}
            activeOpacity={1}
            onPress={() => setGrupoBancosModal(null)}
          />
          <View style={styles.modalCard}>
            {/* Cabeçalho do Modal */}
            <View style={styles.modalHeader}>
              <View style={styles.modalIconCircle}>
                <MaterialCommunityIcons name="layers-outline" size={26} color={Colors.primary} />
              </View>
              <Text style={styles.modalTitle}>{grupoBancosModal?.tagMaior}</Text>
              <Text style={styles.modalSubtitle}>
                {grupoBancosModal?.totalBancos} {grupoBancosModal?.totalBancos === 1 ? 'banco' : 'bancos'} • {grupoBancosModal?.totalQuestoes} questões no total. Toque na lixeira para excluir um banco específico.
              </Text>
            </View>

            {/* Barra de Busca se houver mais de 3 bancos */}
            {grupoBancosModal && grupoBancosModal.bancos.length > 3 && (
              <View style={styles.searchBarContainer}>
                <Ionicons name="search-outline" size={18} color={Colors.textSecondary} style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.searchBarInput}
                  placeholder="Buscar banco neste conjunto..."
                  placeholderTextColor={Colors.textSecondary}
                  value={searchBancoModal}
                  onChangeText={setSearchBancoModal}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="default"
                  inputMode="text"
                  textContentType="none"
                  returnKeyType="search"
                  blurOnSubmit={false}
                />
                {searchBancoModal.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setSearchBancoModal('')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close-circle" size={18} color={Colors.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Lista dos Bancos Específicos */}
            {bancosFiltradosNoModal.length === 0 ? (
              <View style={styles.modalEmptyContainer}>
                <Ionicons name="search-outline" size={38} color={Colors.textSecondary} />
                <Text style={styles.modalEmptyTitle}>Nenhum banco encontrado</Text>
                <Text style={styles.modalEmptySubtitle}>
                  Nenhum banco corresponde a "{searchBancoModal}".
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.modalScroll}
                contentContainerStyle={styles.modalScrollContent}
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
              >
                {bancosFiltradosNoModal.map((banco, idx) => (
                  <View key={`banco-row-${banco.id}-${idx}`} style={styles.storageItemInModal}>
                    <MaterialCommunityIcons name="database-outline" size={18} color={Colors.primary} style={{ marginRight: 10 }} />
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={styles.minItemTitle} numberOfLines={1}>
                        {banco.nome}
                      </Text>
                      <Text style={styles.minItemSub}>
                        {banco.totalQuestoes} {banco.totalQuestoes === 1 ? 'questão' : 'questões'}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.minDeleteBtn}
                      onPress={() => grupoBancosModal && solicitarExclusaoBanco(banco, grupoBancosModal.tagMaior)}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={16} color={Colors.error} />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}

            {/* Ação para excluir todos os bancos do grupo (se houver mais de 1) */}
            {grupoBancosModal && grupoBancosModal.bancos.length > 1 && (
              <TouchableOpacity
                style={styles.modalDeleteAllGroupBtn}
                activeOpacity={0.8}
                onPress={() => solicitarExclusaoTodosBancosDoGrupo(grupoBancosModal)}
              >
                <Ionicons name="trash-bin-outline" size={16} color={Colors.error} style={{ marginRight: 6 }} />
                <Text style={styles.modalDeleteAllGroupBtnText}>
                  Excluir Todos os Bancos de {grupoBancosModal.tagMaior}
                </Text>
              </TouchableOpacity>
            )}

            {/* Botão de Fechar */}
            <TouchableOpacity
              style={styles.modalCancelButton}
              activeOpacity={0.8}
              onPress={() => setGrupoBancosModal(null)}
            >
              <Text style={styles.modalCancelButtonText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal / Popup de Detalhes dos Pacotes de Imagens de um Grupo Específico */}
      <Modal
        visible={grupoPacotesModal !== null}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setGrupoPacotesModal(null)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.confirmBackdropDismiss}
            activeOpacity={1}
            onPress={() => setGrupoPacotesModal(null)}
          />
          <View style={styles.modalCard}>
            {/* Cabeçalho do Modal */}
            <View style={styles.modalHeader}>
              <View style={styles.modalIconCircle}>
                <MaterialCommunityIcons name="folder-multiple-image" size={26} color={Colors.primary} />
              </View>
              <Text style={styles.modalTitle}>{grupoPacotesModal?.tagMaior}</Text>
              <Text style={styles.modalSubtitle}>
                {grupoPacotesModal?.totalPacotes} {grupoPacotesModal?.totalPacotes === 1 ? 'pacote' : 'pacotes'} • {grupoPacotesModal?.totalImagens} imagens no total. Toque na lixeira para excluir um pacote específico.
              </Text>
            </View>

            {/* Barra de Busca se houver mais de 3 pacotes */}
            {grupoPacotesModal && grupoPacotesModal.pacotes.length > 3 && (
              <View style={styles.searchBarContainer}>
                <Ionicons name="search-outline" size={18} color={Colors.textSecondary} style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.searchBarInput}
                  placeholder="Buscar pacote de imagens..."
                  placeholderTextColor={Colors.textSecondary}
                  value={searchPacoteModal}
                  onChangeText={setSearchPacoteModal}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="default"
                  inputMode="text"
                  textContentType="none"
                  returnKeyType="search"
                  blurOnSubmit={false}
                />
                {searchPacoteModal.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setSearchPacoteModal('')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close-circle" size={18} color={Colors.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Lista dos Pacotes Específicos */}
            {pacotesFiltradosNoModal.length === 0 ? (
              <View style={styles.modalEmptyContainer}>
                <Ionicons name="search-outline" size={38} color={Colors.textSecondary} />
                <Text style={styles.modalEmptyTitle}>Nenhum pacote encontrado</Text>
                <Text style={styles.modalEmptySubtitle}>
                  Nenhum pacote corresponde a "{searchPacoteModal}".
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.modalScroll}
                contentContainerStyle={styles.modalScrollContent}
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
              >
                {pacotesFiltradosNoModal.map((pacote, idx) => (
                  <View key={`pacote-row-${pacote.nome}-${idx}`} style={styles.storageItemInModal}>
                    <MaterialCommunityIcons name="folder-zip-outline" size={18} color={Colors.primary} style={{ marginRight: 10 }} />
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={styles.minItemTitle} numberOfLines={1}>
                        {pacote.nome}
                      </Text>
                      <Text style={styles.minItemSub}>
                        {pacote.totalImagens} {pacote.totalImagens === 1 ? 'imagem' : 'imagens'}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.minDeleteBtn}
                      onPress={() => grupoPacotesModal && solicitarExclusaoPacote(pacote, grupoPacotesModal.tagMaior)}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={16} color={Colors.error} />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}

            {/* Ação para excluir todos os pacotes de imagens do grupo (se houver mais de 1) */}
            {grupoPacotesModal && grupoPacotesModal.pacotes.length > 1 && (
              <TouchableOpacity
                style={styles.modalDeleteAllGroupBtn}
                activeOpacity={0.8}
                onPress={() => solicitarExclusaoTodosPacotesDoGrupo(grupoPacotesModal)}
              >
                <Ionicons name="trash-bin-outline" size={16} color={Colors.error} style={{ marginRight: 6 }} />
                <Text style={styles.modalDeleteAllGroupBtnText}>
                  Excluir Todos os Pacotes de {grupoPacotesModal.tagMaior}
                </Text>
              </TouchableOpacity>
            )}

            {/* Botão de Fechar */}
            <TouchableOpacity
              style={styles.modalCancelButton}
              activeOpacity={0.8}
              onPress={() => setGrupoPacotesModal(null)}
            >
              <Text style={styles.modalCancelButtonText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal de Confirmação de Exclusão Granular (Banco ou Pacote de Imagem) */}
      <Modal
        visible={itemParaExcluir !== null}
        animationType="fade"
        transparent={true}
        onRequestClose={() => !excluindoItem && setItemParaExcluir(null)}
      >
        <View style={styles.confirmModalOverlay}>
          <TouchableOpacity
            style={styles.confirmBackdropDismiss}
            activeOpacity={1}
            onPress={() => !excluindoItem && setItemParaExcluir(null)}
          />
          <View style={styles.confirmModalCard}>
            <View style={styles.dangerIconCircle}>
              <MaterialCommunityIcons
                name={itemParaExcluir?.tipo === 'banco' ? 'database-remove' : 'folder-remove'}
                size={34}
                color={Colors.error}
              />
            </View>

            <Text style={styles.confirmTitle}>
              {itemParaExcluir?.tipo === 'banco' ? 'Excluir Banco de Questões' : 'Excluir Pacote de Imagens'}
            </Text>

            <Text style={styles.confirmDescription}>
              {itemParaExcluir?.tipo === 'banco'
                ? `Você está prestes a remover as questões do banco "${itemParaExcluir?.nome || itemParaExcluir?.id}"${itemParaExcluir?.tagMaior ? ` (${itemParaExcluir.tagMaior})` : ''}.`
                : `Você está prestes a excluir a subpasta de imagens "${itemParaExcluir?.nome || itemParaExcluir?.id}"${itemParaExcluir?.tagMaior ? ` (${itemParaExcluir.tagMaior})` : ''} do dispositivo.`}
            </Text>

            <View style={styles.dangerHighlightBox}>
              <Ionicons name="trash" size={20} color={Colors.error} style={{ marginRight: 8 }} />
              <Text style={styles.dangerHighlightText}>
                {itemParaExcluir?.tipo === 'banco'
                  ? `${itemParaExcluir?.count} ${itemParaExcluir?.count === 1 ? 'questão será excluída' : 'questões serão excluídas'}`
                  : `${itemParaExcluir?.count} ${itemParaExcluir?.count === 1 ? 'imagem será removida' : 'imagens serão removidas'}`}
              </Text>
            </View>

            <View style={styles.confirmWarningBox}>
              <Ionicons name="warning-outline" size={16} color="#FFA726" style={{ marginRight: 6 }} />
              <Text style={styles.confirmWarningText}>
                {itemParaExcluir?.tipo === 'banco'
                  ? 'Os demais bancos desta e de outras especialidades não serão afetados.'
                  : 'Libera o espaço de armazenamento imediatamente no aparelho.'}
              </Text>
            </View>

            <View style={styles.confirmButtonsRow}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                activeOpacity={0.8}
                onPress={() => setItemParaExcluir(null)}
                disabled={excluindoItem}
              >
                <Text style={styles.confirmCancelBtnText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmDeleteBtn, excluindoItem && styles.buttonDisabled]}
                activeOpacity={0.85}
                onPress={executarExclusaoItem}
                disabled={excluindoItem}
              >
                {excluindoItem ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.confirmDeleteBtnText}>Sim, Excluir</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: Sucesso ao Importar/Baixar Cronograma */}
      <Modal
        visible={sucessoCronogramaModal !== null}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setSucessoCronogramaModal(null)}
      >
        <View style={styles.confirmModalOverlay}>
          <TouchableOpacity
            style={styles.confirmBackdropDismiss}
            activeOpacity={1}
            onPress={() => setSucessoCronogramaModal(null)}
          />
          <View style={styles.importSuccessCard}>
            <View style={styles.importSuccessIconCircle}>
              <Ionicons name="calendar" size={40} color={Colors.success} />
            </View>

            <Text style={styles.importSuccessTitle}>Cronograma Carregado!</Text>
            <Text style={styles.importSuccessSubtitle}>
              O cronograma de estudos foi sincronizado e ativado com sucesso no aplicativo.
            </Text>

            {sucessoCronogramaModal && (
              <View style={styles.importStatsCard}>
                <View style={styles.importStatsGrid}>
                  <View style={styles.importStatBox}>
                    <Text style={styles.importStatLabel}>SEMANAS</Text>
                    <Text style={[styles.importStatValue, { color: Colors.primary }]}>
                      {sucessoCronogramaModal.semanas}
                    </Text>
                  </View>
                  <View style={styles.importStatDivider} />
                  <View style={styles.importStatBox}>
                    <Text style={styles.importStatLabel}>TÓPICOS</Text>
                    <Text style={[styles.importStatValue, { color: Colors.success }]}>
                      {sucessoCronogramaModal.topicos}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            <View style={styles.importInfoBox}>
              <Ionicons name="checkmark-circle-outline" size={18} color={Colors.primary} style={{ marginRight: 8, marginTop: 1 }} />
              <Text style={styles.importInfoText}>
                {sucessoCronogramaModal?.titulo
                  ? `"${sucessoCronogramaModal.titulo}" agora é seu cronograma ativo.`
                  : 'As semanas e metas já estão disponíveis na aba Cronograma.'}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.importDoneButton}
              activeOpacity={0.85}
              onPress={() => setSucessoCronogramaModal(null)}
            >
              <Text style={styles.importDoneButtonText}>Excelente, Concluir</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal: Erro ao Importar/Baixar Cronograma */}
      <Modal
        visible={erroCronogramaModal !== null}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setErroCronogramaModal(null)}
      >
        <View style={styles.confirmModalOverlay}>
          <TouchableOpacity
            style={styles.confirmBackdropDismiss}
            activeOpacity={1}
            onPress={() => setErroCronogramaModal(null)}
          />
          <View style={[styles.confirmModalCard, { maxWidth: 360 }]}>
            <View
              style={[
                styles.successIconCircle,
                { backgroundColor: 'rgba(239, 68, 68, 0.12)', borderColor: 'rgba(239, 68, 68, 0.35)' },
              ]}
            >
              <MaterialCommunityIcons name="alert-circle-outline" size={36} color={Colors.error} />
            </View>

            <Text style={styles.confirmTitle}>Erro no Cronograma</Text>
            <Text style={styles.confirmDescription}>
              Não foi possível carregar o cronograma. Verifique os detalhes do erro abaixo:
            </Text>

            <View style={styles.syncErrorDetailsBox}>
              <Ionicons name="alert-circle-outline" size={18} color={Colors.error} style={{ marginRight: 8 }} />
              <Text style={styles.syncErrorDetailsText}>
                {erroCronogramaModal || 'Erro desconhecido ao carregar cronograma.'}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.successDoneButton}
              activeOpacity={0.85}
              onPress={() => setErroCronogramaModal(null)}
            >
              <Text style={styles.successDoneButtonText}>Entendido</Text>
            </TouchableOpacity>

            {!temTokenConfigurado && (
              <TouchableOpacity
                style={styles.forceSyncBtn}
                activeOpacity={0.7}
                onPress={() => {
                  setErroCronogramaModal(null);
                  setModalGitHubConfigVisible(true);
                }}
              >
                <Ionicons name="settings-outline" size={15} color={Colors.primary} style={{ marginRight: 6 }} />
                <Text style={[styles.forceSyncBtnText, { color: Colors.primary }]}>Configurar Repositório</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* Modal: Sucesso de Ação do Cronograma (Reset ou Remoção) */}
      <Modal
        visible={sucessoAcaoCronograma !== null}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setSucessoAcaoCronograma(null)}
      >
        <View style={styles.confirmModalOverlay}>
          <TouchableOpacity
            style={styles.confirmBackdropDismiss}
            activeOpacity={1}
            onPress={() => setSucessoAcaoCronograma(null)}
          />
          <View style={styles.successModalCard}>
            <View style={styles.successIconCircle}>
              <Ionicons name="checkmark-done" size={40} color={Colors.success} />
            </View>
            <Text style={styles.successModalTitle}>{sucessoAcaoCronograma?.titulo}</Text>
            <Text style={styles.successModalDescription}>{sucessoAcaoCronograma?.mensagem}</Text>
            <TouchableOpacity
              style={styles.successDoneButton}
              activeOpacity={0.85}
              onPress={() => setSucessoAcaoCronograma(null)}
            >
              <Text style={styles.successDoneButtonText}>Concluir</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal: Confirmação Resetar Progresso Cronograma */}
      <Modal
        visible={modalResetCronogramaVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setModalResetCronogramaVisible(false)}
      >
        <View style={styles.confirmModalOverlay}>
          <TouchableOpacity
            style={styles.confirmBackdropDismiss}
            activeOpacity={1}
            onPress={() => setModalResetCronogramaVisible(false)}
          />
          <View style={styles.confirmModalCard}>
            <View style={[styles.confirmIconCircle, { backgroundColor: 'rgba(255, 167, 38, 0.12)', borderColor: 'rgba(255, 167, 38, 0.25)' }]}>
              <MaterialCommunityIcons name="refresh" size={32} color="#FFA726" />
            </View>
            <Text style={styles.confirmTitle}>Resetar Progresso?</Text>
            <Text style={styles.confirmDescription}>
              Você tem certeza de que deseja resetar todo o progresso do cronograma? Todas as tarefas marcadas serão desmarcadas. O cronograma em si permanecerá no aparelho.
            </Text>
            <View style={styles.confirmButtonsRow}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                activeOpacity={0.8}
                onPress={() => setModalResetCronogramaVisible(false)}
              >
                <Text style={styles.confirmCancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmDeleteBtn, { backgroundColor: '#FFA726' }]}
                activeOpacity={0.85}
                onPress={handleResetarProgressoCronograma}
              >
                <Ionicons name="refresh" size={16} color="#000000" style={{ marginRight: 6 }} />
                <Text style={[styles.confirmDeleteBtnText, { color: '#000000' }]}>Sim, Resetar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: Confirmação Remover Cronograma */}
      <Modal
        visible={modalRemoverCronogramaVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setModalRemoverCronogramaVisible(false)}
      >
        <View style={styles.confirmModalOverlay}>
          <TouchableOpacity
            style={styles.confirmBackdropDismiss}
            activeOpacity={1}
            onPress={() => setModalRemoverCronogramaVisible(false)}
          />
          <View style={styles.confirmModalCard}>
            <View style={styles.dangerIconCircle}>
              <MaterialCommunityIcons name="calendar-remove" size={34} color={Colors.error} />
            </View>
            <Text style={styles.confirmTitle}>Remover Cronograma?</Text>
            <Text style={styles.confirmDescription}>
              Esta ação excluirá o cronograma e todo o progresso associado do aparelho. Você precisará importá-lo novamente para usá-lo.
            </Text>
            <View style={styles.confirmButtonsRow}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                activeOpacity={0.8}
                onPress={() => setModalRemoverCronogramaVisible(false)}
              >
                <Text style={styles.confirmCancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmDeleteBtn}
                activeOpacity={0.85}
                onPress={handleRemoverCronograma}
              >
                <Ionicons name="trash-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.confirmDeleteBtnText}>Sim, Remover</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: Adicionar Feed de iCal */}
      <Modal
        visible={modalAddFeedVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => !salvandoNovoFeed && setModalAddFeedVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.confirmModalOverlay}
        >
          <TouchableOpacity
            style={styles.confirmBackdropDismiss}
            activeOpacity={1}
            onPress={() => !salvandoNovoFeed && setModalAddFeedVisible(false)}
          />
          <View style={[styles.confirmModalCard, { maxWidth: 400 }]}>
            <View style={[styles.gitHubSyncIconBox, { marginBottom: 12, width: 50, height: 50, borderRadius: 14, backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
              <Ionicons name="logo-google" size={26} color="#3B82F6" />
            </View>
            <Text style={styles.confirmTitle}>Conectar Calendário iCal</Text>
            <Text style={[styles.confirmDescription, { marginBottom: 14 }]}>
              Cole o link secreto do Google Calendar para espelhar suas aulas e eventos no Athena.
            </Text>

            {/* Nome do Calendário Input */}
            <View style={styles.pkgInputContainer}>
              <Text style={styles.pkgInputLabel}>NOME DO CALENDÁRIO</Text>
              <View style={styles.pkgInputWrapper}>
                <Ionicons name="calendar-outline" size={17} color={Colors.primary} style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.pkgInput}
                  value={novoFeedNome}
                  onChangeText={setNovoFeedNome}
                  placeholder="Ex: Faculdade, Trabalho, Plantões"
                  placeholderTextColor={Colors.textSecondary}
                  autoCapitalize="words"
                />
              </View>
            </View>

            {/* URL do iCal Input */}
            <View style={styles.pkgInputContainer}>
              <Text style={styles.pkgInputLabel}>URL DO ICAL / WEBCAL (GOOGLE CALENDAR)</Text>
              <View style={styles.pkgInputWrapper}>
                <Ionicons name="link-outline" size={17} color={Colors.primary} style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.pkgInput}
                  value={novoFeedUrl}
                  onChangeText={setNovoFeedUrl}
                  placeholder="https://calendar.google.com/calendar/ical/..."
                  placeholderTextColor={Colors.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            {/* Categoria Padrão */}
            <View style={{ width: '100%', marginBottom: 14 }}>
              <Text style={styles.pkgInputLabel}>
                CATEGORIA PADRÃO DOS EVENTOS
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingTop: 2 }}>
                {['Faculdade', 'Estudos', 'Saúde', 'Pessoal', 'Lazer'].map((cat) => {
                  const isSelected = novoFeedTipo === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[
                        { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#2A2E33', backgroundColor: '#16191B' },
                        isSelected && { backgroundColor: 'rgba(234, 225, 21, 0.15)', borderColor: Colors.primary },
                      ]}
                      onPress={() => setNovoFeedTipo(cat)}
                    >
                      <Text style={[{ fontSize: 13, fontWeight: '600', color: Colors.textSecondary }, isSelected && { color: Colors.primary, fontWeight: '700' }]}>
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Dica / Info Box */}
            <View style={[styles.confirmWarningBox, { marginBottom: 16 }]}>
              <Ionicons name="information-circle-outline" size={16} color="#60A5FA" style={{ marginRight: 6 }} />
              <Text style={[styles.confirmWarningText, { color: '#93C5FD' }]}>
                No Google Calendar no PC: Configurações &gt; Selecione sua agenda &gt; Integrar agenda &gt; Copie o "Endereço secreto no formato iCal".
              </Text>
            </View>

            {/* Botões */}
            <View style={styles.confirmButtonsRow}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                activeOpacity={0.8}
                onPress={() => setModalAddFeedVisible(false)}
                disabled={salvandoNovoFeed}
              >
                <Text style={styles.confirmCancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.gitHubSaveBtn, salvandoNovoFeed && styles.buttonDisabled]}
                activeOpacity={0.85}
                onPress={handleSalvarNovoFeed}
                disabled={salvandoNovoFeed}
              >
                {salvandoNovoFeed ? (
                  <ActivityIndicator size="small" color="#000000" />
                ) : (
                  <Text style={styles.gitHubSaveBtnText}>Salvar e Conectar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal: Remover Feed iCal */}
      <Modal
        visible={feedParaRemover !== null}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setFeedParaRemover(null)}
      >
        <View style={styles.confirmModalOverlay}>
          <TouchableOpacity
            style={styles.confirmBackdropDismiss}
            activeOpacity={1}
            onPress={() => setFeedParaRemover(null)}
          />
          <View style={styles.confirmModalCard}>
            <View style={styles.dangerIconCircle}>
              <Ionicons name="trash" size={30} color={Colors.error} />
            </View>
            <Text style={styles.confirmTitle}>Remover Calendário</Text>
            <Text style={styles.confirmDescription}>
              Deseja remover o calendário "{feedParaRemover?.nome}"? Todas as aulas e eventos importados por este link serão apagados da sua agenda.
            </Text>
            <View style={styles.confirmButtonsRow}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                activeOpacity={0.8}
                onPress={() => setFeedParaRemover(null)}
              >
                <Text style={styles.confirmCancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmDeleteBtn}
                activeOpacity={0.85}
                onPress={handleConfirmarRemoverFeed}
              >
                <Ionicons name="trash-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.confirmDeleteBtnText}>Sim, Remover</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: Limpar Eventos do .ICS */}
      <Modal
        visible={modalLimparICSVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => !limpandoICS && setModalLimparICSVisible(false)}
      >
        <View style={styles.confirmModalOverlay}>
          <TouchableOpacity
            style={styles.confirmBackdropDismiss}
            activeOpacity={1}
            onPress={() => !limpandoICS && setModalLimparICSVisible(false)}
          />
          <View style={styles.confirmModalCard}>
            <View style={styles.dangerIconCircle}>
              <Ionicons name="trash" size={30} color={Colors.error} />
            </View>
            <Text style={styles.confirmTitle}>Limpar Eventos do .ICS</Text>
            <Text style={styles.confirmDescription}>
              {totalEventosICSParaLimpar > 0
                ? `Deseja remover todos os ${totalEventosICSParaLimpar} eventos importados manualmente via arquivo .ICS? Suas outras tarefas, rotinas e revisões não serão afetadas.`
                : 'Nenhum evento importado por .ICS foi encontrado para remoção.'}
            </Text>
            <View style={styles.confirmButtonsRow}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                activeOpacity={0.8}
                onPress={() => setModalLimparICSVisible(false)}
                disabled={limpandoICS}
              >
                <Text style={styles.confirmCancelBtnText}>
                  {totalEventosICSParaLimpar > 0 ? 'Cancelar' : 'Fechar'}
                </Text>
              </TouchableOpacity>
              {totalEventosICSParaLimpar > 0 && (
                <TouchableOpacity
                  style={[styles.confirmDeleteBtn, limpandoICS && styles.buttonDisabled]}
                  activeOpacity={0.85}
                  onPress={handleConfirmarLimparICS}
                  disabled={limpandoICS}
                >
                  {limpandoICS ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="trash-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <Text style={styles.confirmDeleteBtnText}>Sim, Limpar</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal de Diagnóstico do Histórico e SM-2 */}
      <Modal
        visible={modalDiagnosticoVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setModalDiagnosticoVisible(false)}
      >
        <View style={styles.diagModalOverlay}>
          <View style={styles.diagModalContainer}>
            <View style={styles.diagModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="analytics" size={22} color="#3B82F6" />
                <Text style={styles.diagModalTitle}>Diagnóstico de Coleta</Text>
              </View>
              <TouchableOpacity onPress={() => setModalDiagnosticoVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {carregandoDiagnostico ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#3B82F6" />
                <Text style={{ marginTop: 12, color: '#94A3B8', fontSize: 13 }}>Consultando SQLite...</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 460 }}>
                {/* Resumo em cards */}
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                  <View style={styles.diagStatCard}>
                    <Text style={styles.diagStatLabel}>QuestionHistory</Text>
                    <Text style={styles.diagStatValue}>{diagnosticoData?.totalHistory ?? 0}</Text>
                    <Text style={styles.diagStatSub}>respostas gravadas</Text>
                  </View>
                  <View style={styles.diagStatCard}>
                    <Text style={styles.diagStatLabel}>QuestionReviewState</Text>
                    <Text style={styles.diagStatValue}>{diagnosticoData?.totalReviews ?? 0}</Text>
                    <Text style={styles.diagStatSub}>questões no SM-2</Text>
                  </View>
                </View>

                {/* Últimos registros de QuestionHistory */}
                <Text style={styles.diagSectionHeader}>ÚLTIMAS QUESTÕES RESPONDIDAS</Text>
                {diagnosticoData?.recentHistory && diagnosticoData.recentHistory.length > 0 ? (
                  diagnosticoData.recentHistory.map((item, idx) => {
                    const isOk = item.isCorrect === 1;
                    const dateStr = new Date(item.answeredAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    return (
                      <View key={item.id ?? idx} style={styles.diagItemCard}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <Text style={styles.diagItemTitle} numberOfLines={1}>{item.topic || 'Questão'}</Text>
                          <View style={[styles.diagBadge, { backgroundColor: isOk ? 'rgba(68, 153, 104, 0.15)' : 'rgba(235, 87, 87, 0.15)' }]}>
                            <Text style={[styles.diagBadgeText, { color: isOk ? '#449968' : '#EB5757' }]}>
                              {isOk ? 'ACERTO' : 'ERRO'}
                            </Text>
                          </View>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={styles.diagItemMeta}>⏱️ {item.timeSpentSeconds}s de resposta • {dateStr}</Text>
                          <Text style={styles.diagItemSubMeta} numberOfLines={1}>ID: {item.questionId.slice(0, 10)}</Text>
                        </View>
                        {item.sessionId ? (
                          <Text style={styles.diagSessionText} numberOfLines={1}>Sessão: {item.sessionId}</Text>
                        ) : null}
                      </View>
                    );
                  })
                ) : (
                  <View style={styles.diagEmptyBox}>
                    <Text style={styles.diagEmptyText}>Nenhum registro encontrado ainda no QuestionHistory.</Text>
                  </View>
                )}

                {/* Próximas revisões SM-2 */}
                {diagnosticoData?.recentReviews && diagnosticoData.recentReviews.length > 0 && (
                  <>
                    <Text style={[styles.diagSectionHeader, { marginTop: 14 }]}>ESTADO NO ALGORITMO SM-2</Text>
                    {diagnosticoData.recentReviews.map((r, idx) => (
                      <View key={r.questionId ?? idx} style={styles.diagItemCard}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                          <Text style={styles.diagItemTitle}>ID: {r.questionId.slice(0, 16)}...</Text>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#3B82F6' }}>Int: {r.interval}d</Text>
                        </View>
                        <Text style={styles.diagItemMeta}>
                          Repetições: {r.repetitions} • Fator: {r.easeFactor.toFixed(2)} • Próxima: {new Date(r.nextReviewDate).toLocaleDateString('pt-BR')}
                        </Text>
                      </View>
                    ))}
                  </>
                )}
              </ScrollView>
            )}

            <TouchableOpacity style={styles.diagCloseBtn} activeOpacity={0.8} onPress={() => setModalDiagnosticoVisible(false)}>
              <Text style={styles.diagCloseBtnText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContainer: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, alignItems: 'stretch' },
  headerContainer: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#2e3235' },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center' },
  headerIcon: { marginRight: 10 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: Colors.text, letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 14, color: Colors.textSecondary, marginTop: 4, lineHeight: 20, textAlign: 'left' },
  statusCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 20, marginVertical: 12, borderWidth: 1, borderColor: Colors.border, elevation: 0, shadowOpacity: 0 },
  statusHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  statusLabel: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 0.8 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  statusBadgeText: { fontSize: 12, fontWeight: '600' },
  countContainer: { marginVertical: 8 },
  countNumber: { fontSize: 38, fontWeight: '800', color: Colors.primary },
  countText: { fontSize: 16, fontWeight: '600', color: Colors.text, marginTop: -2 },
  statusDescription: { fontSize: 13, color: Colors.textSecondary, marginTop: 8, lineHeight: 18 },
  actionsContainer: { marginTop: 16, gap: 12 },
  primaryButton: { backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, paddingHorizontal: 20, borderRadius: 12, elevation: 0, shadowOpacity: 0 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  zipButton: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12 },
  zipButtonText: { color: Colors.text, fontSize: 15, fontWeight: '700' },
  zipButtonSubText: { color: Colors.textSecondary, fontSize: 11, marginTop: 2 },
  dangerButton: { backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.error, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12 },
  dangerButtonText: { color: Colors.error, fontSize: 14, fontWeight: '600' },
  infoBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 10, padding: 12, marginTop: 20, borderWidth: 1, borderColor: Colors.border },
  infoText: { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 16 },
  backupCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 20, marginTop: 20, borderWidth: 1, borderColor: Colors.border, elevation: 0, shadowOpacity: 0 },
  backupHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  backupSectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  backupDescription: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18, marginBottom: 16 },
  exportButton: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, paddingHorizontal: 20, borderRadius: 12 },
  exportButtonText: { color: Colors.primary, fontSize: 15, fontWeight: '700' },
  buttonDisabled: { opacity: 0.6 },
  buttonIcon: { marginRight: 8 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 4 },
  sectionHeaderTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  warningButton: { backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: '#FFA726', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12 },
  warningButtonText: { color: '#FFA726', fontSize: 15, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { backgroundColor: Colors.surface, borderRadius: 20, padding: 22, width: '100%', maxHeight: '82%', borderWidth: 1, borderColor: Colors.border, elevation: 0, shadowOpacity: 0 },
  modalHeader: { alignItems: 'center', marginBottom: 12 },
  modalIconCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255, 167, 38, 0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255, 167, 38, 0.25)' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  modalSubtitle: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginTop: 6, lineHeight: 18, paddingHorizontal: 8 },
  selectionToolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginTop: 2, marginBottom: 8 },
  selectionToolbarBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 4 },
  selectionToolbarBtnText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  selectionCountBadge: { backgroundColor: 'rgba(255, 255, 255, 0.06)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#2e3235' },
  selectionCountText: { fontSize: 11, fontWeight: '700', color: Colors.primary },
  modalScroll: { maxHeight: 250, marginVertical: 4 },
  modalScrollContent: { gap: 8, paddingVertical: 4 },
  temaItemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.background, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5, borderColor: '#2e3235' },
  temaItemRowSelected: { borderColor: 'rgba(239, 68, 68, 0.45)', backgroundColor: 'rgba(239, 68, 68, 0.08)' },
  temaItemInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  temaItemText: { fontSize: 14, color: Colors.text, fontWeight: '600', flexShrink: 1 },
  temaItemTextSelected: { color: '#ff8a80', fontWeight: '700' },
  modalDeleteSelectedBtn: { backgroundColor: Colors.error, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12, marginTop: 12, shadowColor: Colors.error, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 3 },
  modalDeleteSelectedBtnDisabled: { backgroundColor: '#1c1f21', shadowOpacity: 0, elevation: 0 },
  modalDeleteSelectedBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  modalDeleteSelectedBtnTextDisabled: { color: '#656b73' },
  modalCancelButton: { backgroundColor: Colors.background, paddingVertical: 13, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#3e4347', marginTop: 8 },
  modalCancelButtonText: { color: Colors.text, fontSize: 14, fontWeight: '700' },
  modalEmptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 32, paddingHorizontal: 16 },
  modalEmptyTitle: { fontSize: 15, fontWeight: '700', color: Colors.text, marginTop: 10 },
  modalEmptySubtitle: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginTop: 4, lineHeight: 18 },
  searchBarContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.background, borderRadius: 12, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 10 : 6, marginVertical: 12, borderWidth: 1, borderColor: '#2e3235' },
  searchBarInput: { flex: 1, color: Colors.text, fontSize: 14, padding: 0 },
  confirmModalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.82)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  confirmBackdropDismiss: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  confirmModalCard: { backgroundColor: Colors.surface, borderRadius: 22, padding: 24, width: '100%', maxWidth: 380, alignItems: 'center', borderWidth: 1.5, borderColor: '#3a2d2d', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 18, elevation: 10 },
  confirmIconCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255, 76, 76, 0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 14, borderWidth: 1, borderColor: 'rgba(255, 76, 76, 0.3)' },
  confirmTitle: { fontSize: 20, fontWeight: '800', color: Colors.text, textAlign: 'center', marginBottom: 8 },
  confirmDescription: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 12 },
  confirmThemeBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.background, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: '#3e4347', marginBottom: 14, maxWidth: '100%' },
  confirmThemeText: { fontSize: 14, fontWeight: '700', color: Colors.text, flexShrink: 1 },
  confirmWarningBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 167, 38, 0.08)', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: 'rgba(255, 167, 38, 0.25)', marginBottom: 20 },
  confirmWarningText: { flex: 1, fontSize: 12, color: '#FFA726', lineHeight: 16 },
  confirmButtonsRow: { flexDirection: 'row', width: '100%', gap: 12 },
  confirmCancelBtn: { flex: 1, backgroundColor: Colors.background, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#3e4347' },
  confirmCancelBtnText: { color: Colors.text, fontSize: 14, fontWeight: '600' },
  confirmDeleteBtn: { flex: 1, backgroundColor: Colors.error, flexDirection: 'row', paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', shadowColor: Colors.error, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  confirmDeleteBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  successModalCard: { backgroundColor: Colors.surface, borderRadius: 22, padding: 24, width: '100%', maxWidth: 380, alignItems: 'center', borderWidth: 1.5, borderColor: '#2e3532', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 18, elevation: 10 },
  successIconCircle: { width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(76, 175, 80, 0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(76, 175, 80, 0.3)' },
  successModalTitle: { fontSize: 20, fontWeight: '800', color: Colors.text, textAlign: 'center', marginBottom: 8 },
  successModalDescription: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 14, paddingHorizontal: 8 },
  successThemeBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.background, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: '#3e4347', marginBottom: 14, maxWidth: '100%' },
  successThemeText: { fontSize: 14, fontWeight: '700', color: Colors.text, flexShrink: 1 },
  successInfoBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(234, 225, 21, 0.08)', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: 'rgba(234, 225, 21, 0.2)', marginBottom: 20, width: '100%' },
  successInfoText: { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 16 },
  successDoneButton: { width: '100%', backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 3 },
  successDoneButtonText: { color: '#000000', fontSize: 15, fontWeight: '700' },
  dangerIconCircle: { width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(239, 68, 68, 0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)' },
  dangerHighlightBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(239, 68, 68, 0.1)', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)', marginBottom: 14, width: '100%' },
  dangerHighlightText: { fontSize: 14, fontWeight: '700', color: '#ff6b6b', flexShrink: 1 },
  importSuccessCard: { width: '100%', maxWidth: 380, backgroundColor: Colors.surface, borderRadius: 24, padding: 24, alignItems: 'center', borderWidth: 1.5, borderColor: '#34383d', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 10 },
  importSuccessIconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(76, 175, 80, 0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1.5, borderColor: 'rgba(76, 175, 80, 0.3)' },
  importSuccessTitle: { fontSize: 22, fontWeight: '800', color: Colors.text, textAlign: 'center', marginBottom: 6 },
  importSuccessSubtitle: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 18, marginBottom: 18, paddingHorizontal: 8 },
  importStatsCard: { width: '100%', backgroundColor: '#121416', borderRadius: 16, borderWidth: 1, borderColor: '#26292c', padding: 16, marginBottom: 16 },
  importStatsGrid: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  importStatBox: { flex: 1, alignItems: 'center' },
  importStatLabel: { fontSize: 10, fontWeight: '700', color: '#6b7280', letterSpacing: 0.5, marginBottom: 4 },
  importStatValue: { fontSize: 18, fontWeight: '800', color: Colors.text },
  importStatDivider: { width: 1, height: 26, backgroundColor: '#26292c' },
  importSpecsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#202326', justifyContent: 'center' },
  importSpecChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(234, 225, 21, 0.08)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(234, 225, 21, 0.2)' },
  importSpecChipText: { fontSize: 11, fontWeight: '600', color: Colors.primary },
  importInfoBox: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: 'rgba(234, 225, 21, 0.08)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(234, 225, 21, 0.2)', marginBottom: 20, width: '100%' },
  importInfoText: { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  importDoneButton: { width: '100%', backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 3 },
  importDoneButtonText: { color: '#000000', fontSize: 15, fontWeight: '800' },
  imageSuccessIconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(234, 225, 21, 0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1.5, borderColor: 'rgba(234, 225, 21, 0.3)' },
  imagePathPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0c0e0f', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginTop: 12, borderWidth: 1, borderColor: '#26292c', width: '100%' },
  imagePathPillLabel: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, marginRight: 4 },
  imagePathPillText: { flex: 1, fontSize: 12, fontWeight: '700', color: Colors.primary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  emptyDbModalCard: { width: '100%', maxWidth: 380, backgroundColor: Colors.surface, borderRadius: 24, padding: 24, alignItems: 'center', borderWidth: 1.5, borderColor: '#34383d', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 10 },
  emptyDbIconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255, 167, 38, 0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1.5, borderColor: 'rgba(255, 167, 38, 0.3)' },
  emptyDbTitle: { fontSize: 22, fontWeight: '800', color: Colors.text, textAlign: 'center', marginBottom: 8 },
  emptyDbSubtitle: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 18, marginBottom: 18, paddingHorizontal: 8 },
  emptyDbInfoBox: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: 'rgba(255, 167, 38, 0.08)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(255, 167, 38, 0.2)', marginBottom: 20, width: '100%' },
  emptyDbInfoText: { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  emptyDbButtonsCol: { width: '100%', gap: 10 },
  emptyDbPrimaryButton: { width: '100%', backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 3 },
  emptyDbPrimaryButtonText: { color: '#000000', fontSize: 15, fontWeight: '800' },
  emptyDbSecondaryButton: { width: '100%', paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  emptyDbSecondaryButtonText: { color: Colors.textSecondary, fontSize: 14, fontWeight: '600' },
  pkgModalCard: { width: '100%', maxWidth: 380, backgroundColor: Colors.surface, borderRadius: 24, padding: 24, alignItems: 'center', borderWidth: 1.5, borderColor: '#34383d', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 10 },
  pkgIconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(234, 225, 21, 0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1.5, borderColor: 'rgba(234, 225, 21, 0.3)' },
  pkgTitle: { fontSize: 22, fontWeight: '800', color: Colors.text, textAlign: 'center', marginBottom: 6 },
  pkgSubtitle: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 18, marginBottom: 18, paddingHorizontal: 4 },
  pkgInputContainer: { width: '100%', marginBottom: 14 },
  pkgInputLabel: { fontSize: 10, fontWeight: '700', color: '#8b949e', letterSpacing: 0.5, marginBottom: 6, marginLeft: 2 },
  pkgInputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#121416', borderRadius: 12, borderWidth: 1.5, borderColor: '#2b2f33', paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 12 : 6 },
  pkgInput: { flex: 1, color: Colors.text, fontSize: 15, fontWeight: '700' },
  pkgPreviewBox: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: 'rgba(234, 225, 21, 0.07)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(234, 225, 21, 0.2)', marginBottom: 20, width: '100%' },
  pkgPreviewLabel: { fontSize: 11, color: Colors.textSecondary, marginBottom: 2 },
  pkgPreviewPath: { fontSize: 13, fontWeight: '700', color: Colors.primary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  pkgButtonsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%' },
  pkgCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#34383d' },
  pkgCancelBtnText: { color: Colors.textSecondary, fontSize: 14, fontWeight: '700' },
  pkgConfirmBtn: { flex: 1.4, paddingVertical: 14, borderRadius: 12, backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 3 },
  pkgConfirmBtnText: { color: '#000000', fontSize: 14, fontWeight: '800' },
  storageSectionSubtitle: { fontSize: 13, color: Colors.textSecondary, marginBottom: 14, lineHeight: 18 },
  storageManagerCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#26292c', marginBottom: 20 },
  storageSubHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  storageSubTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  storageCountBadge: { backgroundColor: 'rgba(234, 225, 21, 0.12)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(234, 225, 21, 0.25)' },
  storageCountBadgeText: { color: Colors.primary, fontSize: 12, fontWeight: '700' },
  storageEmptyBox: { paddingVertical: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#121416', borderRadius: 12, borderWidth: 1, borderColor: '#202326', marginBottom: 4 },
  storageEmptyText: { color: Colors.textSecondary, fontSize: 12 },
  storageItemCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#121416', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#202326' },
  storageItemIconWrapper: { width: 36, height: 36, borderRadius: 8, backgroundColor: 'rgba(234, 225, 21, 0.08)', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  storageItemContent: { flex: 1, marginRight: 8 },
  storageItemName: { fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 2 },
  storageItemMeta: { fontSize: 11, color: Colors.textSecondary, lineHeight: 15 },
  storageDeleteBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: 'rgba(239, 68, 68, 0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.25)' },
  storageDivider: { height: 1, backgroundColor: '#26292c', marginVertical: 14 },
  menuSummaryCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#2A2E33', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  menuSummaryLeft: { flex: 1, paddingRight: 10 },
  menuSummaryLabel: { fontSize: 11, fontWeight: '800', color: '#8A929A', letterSpacing: 0.8, marginBottom: 4, textTransform: 'uppercase' },
  menuSummaryValue: { fontSize: 15, fontWeight: '700', color: Colors.text },
  menuSummarySubValue: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  menuOptionsContainer: { gap: 12, marginTop: 4 },
  menuOptionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#2A2E33', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 2 },
  menuOptionIconBox: { width: 46, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  menuOptionContent: { flex: 1, marginRight: 8 },
  menuOptionTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, marginBottom: 3 },
  menuOptionSubtitle: { fontSize: 12, color: Colors.textSecondary, lineHeight: 16 },
  subScreenHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, marginTop: 4 },
  subScreenBackBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.surface, borderWidth: 1, borderColor: '#2A2E33', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  subScreenHeaderTitle: { fontSize: 20, fontWeight: '800', color: Colors.text },
  minSectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, paddingHorizontal: 2 },
  minSectionTitle: { fontSize: 12, fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.8 },
  minCardsCol: { gap: 10 },
  minActionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#2A2E33', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 2 },
  minIconBox: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  minActionContent: { flex: 1 },
  minActionTitle: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: 2 },
  minActionSub: { fontSize: 12, color: Colors.textSecondary },
  minActionPill: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(234, 225, 21, 0.35)', backgroundColor: 'rgba(234, 225, 21, 0.08)' },
  minActionPillText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  minStorageCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#2A2E33' },
  minStorageSubHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  minStorageSubTitle: { fontSize: 13, fontWeight: '700', color: Colors.text },
  minStorageBadge: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, backgroundColor: '#141618', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#25282B' },
  minStorageRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#121416', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 8, borderWidth: 1, borderColor: '#202326' },
  minGroupIconBox: { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(234, 225, 21, 0.08)', alignItems: 'center', justifyContent: 'center', marginRight: 10, borderWidth: 1, borderColor: 'rgba(234, 225, 21, 0.2)' },
  storageItemInModal: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#141618', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 12, marginBottom: 8, borderWidth: 1, borderColor: '#24282C' },
  modalDeleteAllGroupBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(239, 68, 68, 0.08)', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.25)', marginTop: 8, marginBottom: 8, width: '100%' },
  modalDeleteAllGroupBtnText: { fontSize: 12, fontWeight: '700', color: Colors.error },
  minItemTitle: { fontSize: 13, fontWeight: '700', color: Colors.text, marginBottom: 1 },
  minItemSub: { fontSize: 11, color: Colors.textSecondary },
  minDeleteBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(239, 68, 68, 0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.25)' },
  minDivider: { height: 1, backgroundColor: '#25282B', marginVertical: 12 },
  minEmptyText: { fontSize: 12, color: Colors.textSecondary, paddingVertical: 4, marginBottom: 6 },
  syncMiniBadge: { backgroundColor: 'rgba(76, 175, 80, 0.15)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginLeft: 8, borderWidth: 1, borderColor: 'rgba(76, 175, 80, 0.3)' },
  syncMiniBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.success },
  gitHubSyncCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#2A2E33', marginBottom: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 2 },
  gitHubSyncHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  gitHubSyncIconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(234, 225, 21, 0.12)', borderWidth: 1, borderColor: 'rgba(234, 225, 21, 0.25)', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  gitHubSyncTitle: { fontSize: 14, fontWeight: '700', color: Colors.text, flexShrink: 1, marginRight: 8 },
  gitHubSyncSubRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  gitHubSyncSub: { fontSize: 11, color: Colors.textSecondary, marginLeft: 4 },
  gitHubStatusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  gitHubStatusBadgeText: { fontSize: 10, fontWeight: '700' },
  gitHubSyncActionsContainer: { gap: 8 },
  gitHubSyncPrimaryBtn: { width: '100%', backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 11, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 2 },
  gitHubSyncPrimaryBtnText: { fontSize: 14, fontWeight: '800', color: '#000000' },
  gitHubSyncSecondaryRow: { flexDirection: 'row', gap: 8 },
  gitHubSyncSecondaryBtn: { flex: 1, backgroundColor: '#16191B', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: '#2A2E33' },
  gitHubSyncSecondaryBtnText: { fontSize: 12, fontWeight: '700', color: Colors.text },
  gitHubInputContainer: { width: '100%' },
  gitHubFeedbackBox: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, marginBottom: 12, width: '100%' },
  gitHubFeedbackText: { flex: 1, fontSize: 12, fontWeight: '600', lineHeight: 16 },
  gitHubTestBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 11, paddingHorizontal: 16, borderRadius: 10, backgroundColor: 'rgba(234, 225, 21, 0.08)', borderWidth: 1, borderColor: 'rgba(234, 225, 21, 0.3)', width: '100%', marginBottom: 4 },
  gitHubTestBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  gitHubSaveBtn: { flex: 1, backgroundColor: Colors.primary, flexDirection: 'row', paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4 },
  gitHubSaveBtnText: { color: '#000000', fontSize: 14, fontWeight: '800' },
  syncProgressBarTrack: { width: '100%', height: 8, backgroundColor: '#141618', borderRadius: 4, overflow: 'hidden', borderWidth: 1, borderColor: '#25282B', marginBottom: 16 },
  syncProgressBarFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 4 },
  syncStatusCard: { width: '100%', backgroundColor: '#121416', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: '#202326', alignItems: 'center', marginBottom: 14 },
  syncStepMessage: { fontSize: 14, fontWeight: '700', color: Colors.text, textAlign: 'center' },
  syncStepDetail: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center', marginTop: 4 },
  syncWarningSubtext: { fontSize: 11, color: '#656b73', textAlign: 'center', lineHeight: 15 },
  upToDateInfoCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(76, 175, 80, 0.08)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(76, 175, 80, 0.25)', marginBottom: 20, width: '100%' },
  upToDateInfoText: { flex: 1, fontSize: 13, color: Colors.text, lineHeight: 18, fontWeight: '600' },
  forceSyncBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, marginTop: 10 },
  forceSyncBtnText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  cardNotificationDot: { position: 'absolute', top: 6, right: 6, width: 9, height: 9, borderRadius: 4.5, backgroundColor: '#FF3B30', borderWidth: 1.5, borderColor: Colors.surface },
  menuUpdateBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 59, 48, 0.15)', borderWidth: 1, borderColor: 'rgba(255, 59, 48, 0.35)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, marginLeft: 8 },
  menuUpdateBadgeDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#FF3B30', marginRight: 4 },
  menuUpdateBadgeText: { fontSize: 10, fontWeight: '700', color: '#FF5252' },
  updateAlertBanner: { backgroundColor: 'rgba(234, 225, 21, 0.08)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(234, 225, 21, 0.3)', padding: 14, marginBottom: 16 },
  updateAlertContent: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  updateAlertIconBox: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  updateAlertTitle: { fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 2 },
  updateAlertSubtitle: { fontSize: 12, color: Colors.textSecondary, lineHeight: 16 },
  updateAlertActionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14 },
  updateAlertActionBtnText: { fontSize: 13, fontWeight: '700', color: '#000000' },
  novasQuestoesInfoCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', backgroundColor: '#141618', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 10, borderWidth: 1, borderColor: '#25282B', marginBottom: 20, width: '100%' },
  novasQuestoesStatItem: { alignItems: 'center', flex: 1 },
  novasQuestoesStatValue: { fontSize: 16, fontWeight: '800', color: Colors.text },
  novasQuestoesStatLabel: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary, marginTop: 2, textAlign: 'center' },
  novasQuestoesStatDivider: { width: 1, height: 32, backgroundColor: '#25282B' },
  credenciaisInfoBox: { width: '100%', backgroundColor: '#141618', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#25282B', marginBottom: 20 },
  credenciaisInfoRow: { flexDirection: 'row', alignItems: 'center' },
  credenciaisInfoText: { fontSize: 13, fontWeight: '600', color: Colors.text, flex: 1 },
  syncErrorDetailsBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(239, 68, 68, 0.08)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.25)', marginBottom: 20, width: '100%' },
  syncErrorDetailsText: { flex: 1, fontSize: 13, color: '#ff8a80', lineHeight: 18, fontWeight: '600' },
  selectiveImageToggleRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#141618', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: '#25282B', marginBottom: 10 },
  selectiveImageToggleTitle: { fontSize: 13, fontWeight: '700', color: Colors.text },
  selectiveImageToggleSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  selectiveItemCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.background, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1.5, borderColor: '#26292c' },
  selectiveItemCardSelected: { borderColor: Colors.primary, backgroundColor: 'rgba(234, 225, 21, 0.05)' },
  selectiveItemName: { fontSize: 14, fontWeight: '700', color: Colors.text, flexShrink: 1 },
  selectiveItemNameSelected: { color: Colors.primary },
  selectiveItemVersion: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  badgeAtualizacao: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.primary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginLeft: 6 },
  badgeAtualizacaoText: { fontSize: 9, fontWeight: '800', color: '#000000', letterSpacing: 0.3 },
  badgeNovo: { backgroundColor: 'rgba(96, 165, 250, 0.15)', borderWidth: 1, borderColor: 'rgba(96, 165, 250, 0.35)', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, marginLeft: 6 },
  badgeNovoText: { fontSize: 9, fontWeight: '800', color: '#60A5FA', letterSpacing: 0.3 },
  badgeInstalado: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.06)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.15)', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, marginLeft: 6 },
  badgeInstaladoText: { fontSize: 9, fontWeight: '600', color: Colors.textSecondary, letterSpacing: 0.3 },
  warningIconCircle: { width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(255, 167, 38, 0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255, 167, 38, 0.3)' },
  confirmResetBtn: { flex: 1, backgroundColor: '#FFA726', flexDirection: 'row', paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', shadowColor: '#FFA726', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  confirmResetBtnText: { color: '#000000', fontSize: 14, fontWeight: '700' },
  weekProgressBarBg: { height: 4, backgroundColor: '#202428', borderRadius: 2, overflow: 'hidden' },
  weekProgressBarFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 2 },
  accordionCard: { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: '#2A2E33', marginBottom: 12, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 2 },
  accordionHeader: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  accordionHeaderOpen: { borderBottomWidth: 1, borderBottomColor: '#24282D', backgroundColor: 'rgba(255, 255, 255, 0.02)' },
  accordionIconBox: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  accordionHeaderContent: { flex: 1, marginRight: 8 },
  accordionTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, marginBottom: 2 },
  accordionSubtitle: { fontSize: 12, color: Colors.textSecondary },
  accordionBody: { padding: 16, backgroundColor: '#131517' },
  gitHubSyncCardInner: { width: '100%' },
  minStorageCardInner: { width: '100%' },
  emptyDayContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
    backgroundColor: '#181A1D',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#26292C',
    marginTop: 8,
    marginBottom: 8,
  },
  emptyDayTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#E1E4EA',
    marginTop: 12,
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyDaySub: {
    fontSize: 12,
    color: '#8E959E',
    textAlign: 'center',
    lineHeight: 18,
  },
  diagModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    padding: 16,
  },
  diagModalContainer: {
    backgroundColor: '#1E232A',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2E3540',
    padding: 18,
  },
  diagModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  diagModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  diagStatCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    alignItems: 'center',
  },
  diagStatLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  diagStatValue: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.text,
  },
  diagStatSub: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  diagSectionHeader: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textSecondary,
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 4,
  },
  diagItemCard: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 10,
    marginBottom: 8,
  },
  diagItemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
    flex: 1,
    marginRight: 8,
  },
  diagBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  diagBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  diagItemMeta: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  diagItemSubMeta: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  diagSessionText: {
    fontSize: 9.5,
    color: Colors.textMuted,
    marginTop: 2,
  },
  diagEmptyBox: {
    padding: 18,
    alignItems: 'center',
  },
  diagEmptyText: {
    color: Colors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
  },
  diagCloseBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  diagCloseBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  appearanceCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 2,
  },
  appearanceRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  appearanceSectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  appearanceCurrentValue: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  themeModeSelectorRow: {
    flexDirection: 'row',
    gap: 8,
  },
  themeModeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: '#16191B',
    borderWidth: 1,
    borderColor: '#2A2E33',
  },
  themeModeChipActive: {
    borderWidth: 1.5,
  },
  themeModeChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  appearanceDivider: {
    height: 1,
    backgroundColor: '#25282B',
    marginVertical: 16,
  },
  accentColorsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingTop: 4,
    paddingBottom: 2,
  },
  accentCircleTouchTarget: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  accentCircleActive: {
    borderWidth: 2,
  },
  accentCircleColor: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
});