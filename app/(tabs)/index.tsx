import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  Modal,
  Image,
  Alert,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Colors, CATEGORIA_CORES, getTopicColor, ActiveThemeColors } from '@/constants/Colors';
import { useAppTheme } from '@/context/ThemeContext';
import { storage } from '@/services/storage';
import {
  getAtividadesPorData,
  toggleAtividadeStatus,
  AtividadeAgenda,
  getPassosPorDiaSemana,
  getPassosAtrasadosPendentes,
  togglePassoConcluido,
  getBlocosEstudoPorData,
  updateStatusBlocoEstudo,
  DbBlocoEstudo,
  moverPassoOuTopicoDeDiaNoBanco,
  moverTopicoDeSemanaNoBanco,
  ItemBuscaCronograma,
  excluirAtividade,
  buscarNoCronogramaCompleto,
} from '@/services/database';
import { getSemanaDoCronogramaPorData } from '@/services/scheduleService';
import { gerarPlanoDiario, verificarEPlanejarAutomaticamente, sincronizarLimitesHorarioUtil } from '@/services/schedulerService';
import { getStreakInfo, StreakInfo } from '@/services/streakService';
import ModalNovaAtividade from '@/components/cronograma/ModalNovaAtividade';
import ModalCalendarioMensal from '@/components/cronograma/ModalCalendarioMensal';
import ModalDetalhesAtividade from '@/components/cronograma/ModalDetalhesAtividade';
import { StreakModal } from '@/components/modals/StreakModal';
import { NomeUsuarioModal } from '@/components/modals/NomeUsuarioModal';
import SwipeableActivityCard from '@/components/cronograma/SwipeableActivityCard';
import { LinearGradient } from 'expo-linear-gradient';
import { Fonts } from '@/constants/Typography';
import { subscribeToICalSync } from '@/services/icsService';

export { CATEGORIA_CORES };

function toLocalDateStr(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const DIAS_SHORT_MAP: Record<string, string> = {
  segunda: 'Seg',
  terca: 'Ter',
  quarta: 'Qua',
  quinta: 'Qui',
  sexta: 'Sex',
  sabado: 'Sáb',
  domingo: 'Dom',
};

// Gera um array com 15 dias (7 dias para trás, o dia atual, e 7 dias para frente)
const gerarDiasVisiveis = () => {
  const dias = [];
  const hoje = new Date();

  for (let i = -7; i <= 7; i++) {
    const data = new Date(hoje);
    data.setDate(hoje.getDate() + i);
    dias.push({
      dataISO: toLocalDateStr(data),
      diaSemana: data.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
      diaMes: data.getDate(),
    });
  }
  return dias;
};

export default function DashboardScreen() {
  const { colors: themeColors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(themeColors, isDark), [themeColors, isDark]);
  const router = useRouter();
  const [atividades, setAtividades] = useState<AtividadeAgenda[]>([]);
  const [blocosEstudo, setBlocosEstudo] = useState<DbBlocoEstudo[]>([]);
  const [dataSelecionada, setDataSelecionada] = useState<string>(() => toLocalDateStr(new Date()));
  const [loading, setLoading] = useState<boolean>(true);
  const [modalNovaVisible, setModalNovaVisible] = useState<boolean>(false);
  const [atividadeParaEditar, setAtividadeParaEditar] = useState<AtividadeAgenda | null>(null);
  const [calendarVisible, setCalendarVisible] = useState<boolean>(false);
  const [atividadeDetalhes, setAtividadeDetalhes] = useState<any | null>(null);

  // Busca inline no cronograma e lista flutuante de resultados
  const [showSearch, setShowSearch] = useState<boolean>(false);
  const [searchText, setSearchText] = useState<string>('');
  const [searchResults, setSearchResults] = useState<ItemBuscaCronograma[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const searchInputRef = useRef<TextInput>(null);

  // Busca em tempo real no cronograma completo ao digitar
  useEffect(() => {
    const trimmed = searchText.trim();
    if (!trimmed) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const data = await buscarNoCronogramaCompleto(trimmed);
        setSearchResults(data);
      } catch (err) {
        console.error('[Dashboard] Erro na busca universal:', err);
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [searchText]);

  // Perfil do usuário, foto e streak
  const [userName, setUserName] = useState<string>(() => storage.getString('@athena_user_name') || '');
  const [userPhoto, setUserPhoto] = useState<string | null>(() => storage.getString('@athena_user_photo') || null);
  const [streakInfo, setStreakInfo] = useState<StreakInfo | null>(null);
  const [modalStreakVisible, setModalStreakVisible] = useState<boolean>(false);
  const [modalNomeVisible, setModalNomeVisible] = useState<boolean>(false);

  // Carrega as informações determinísticas de Streak
  const carregarStreak = useCallback(async () => {
    try {
      const info = await getStreakInfo();
      setStreakInfo(info);
    } catch (e) {
      console.warn('[Dashboard] Erro ao carregar streak:', e);
    }
  }, []);

  // Lógica de Saudação (sem o nome embutido, pois agora fica ao lado do avatar)
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Bom dia';
    if (hour >= 12 && hour < 18) return 'Boa tarde';
    return 'Boa noite';
  };
  const greeting = getGreeting();

  // Lógica de Título Relativo de Datas
  const getRelativeDateTitle = (dateString: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateString + 'T12:00:00Z');
    target.setHours(0, 0, 0, 0);

    const diffTime = target.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 3600 * 24));

    if (diffDays === 0) return 'Hoje';
    if (diffDays === -1) return 'Ontem';
    if (diffDays === 1) return 'Amanhã';

    if (diffDays > 1 && diffDays < 7) {
      const day = target.getDay();
      const weekDays = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
      // Se for Domingo (0) ou Sábado (6), usa masculino
      const prefixo = (day === 0 || day === 6) ? 'Próximo' : 'Próxima';
      return `${prefixo} ${weekDays[day]}`;
    }

    return target.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
  };

  // Lógica de Cálculo do início e fim da semana (Segunda à Domingo) com o número contínuo do cronograma
  const getWeekLabel = (dateString: string) => {
    const target = new Date(dateString + 'T12:00:00Z');
    const day = target.getDay();

    // No JS, Domingo é 0. Então se for Domingo, volta 6 dias. Senão, volta (day - 1)
    const diffToMonday = day === 0 ? -6 : 1 - day;

    const monday = new Date(target.getTime());
    monday.setDate(target.getDate() + diffToMonday);

    const sunday = new Date(monday.getTime());
    sunday.setDate(monday.getDate() + 6);

    const mondayDay = monday.getDate();
    const sundayDay = sunday.getDate();

    const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
    const mondayMonth = capitalize(monday.toLocaleDateString('pt-BR', { month: 'long' }));
    const sundayMonth = capitalize(sunday.toLocaleDateString('pt-BR', { month: 'long' }));

    const semanaNum = getSemanaDoCronogramaPorData(dateString);

    let datasTexto = '';
    if (mondayMonth === sundayMonth) {
      datasTexto = `${mondayDay} à ${sundayDay} de ${mondayMonth}`;
    } else {
      datasTexto = `${mondayDay} de ${mondayMonth} à ${sundayDay} de ${sundayMonth}`;
    }

    return `Semana ${semanaNum} • ${datasTexto}`;
  };

  const isCarregandoAgendaRef = useRef<boolean>(false);

  const carregarAgenda = useCallback(async () => {
    if (isCarregandoAgendaRef.current) return;
    isCarregandoAgendaRef.current = true;
    setLoading(true);
    try {
      // 1. Sincroniza limites de horário útil e auto-planeja o dia selecionado
      await sincronizarLimitesHorarioUtil();
      await verificarEPlanejarAutomaticamente(dataSelecionada);

      // 2. Busca as atividades normais/cadastradas do dia selecionado
      const dadosAgenda = await getAtividadesPorData(dataSelecionada);

      // 3. Busca blocos inteligentes gerados pelo agendador para este dia
      let blocos = await getBlocosEstudoPorData(dataSelecionada);

      // Verificação defensiva: se ainda restar qualquer bloco pendente fora de 07:00 às 22:00, força o replanejamento
      const temForaDosLimites = blocos && blocos.some(
        (b) => b.status === 'pendente' && ((b.hora_inicio && b.hora_inicio < '07:00') || (b.hora_fim && b.hora_fim > '22:00'))
      );
      if (temForaDosLimites) {
        await gerarPlanoDiario(dataSelecionada);
        blocos = await getBlocosEstudoPorData(dataSelecionada);
      }

      setBlocosEstudo(blocos);

      let itensEstudo: AtividadeAgenda[] = [];

      if (blocos && blocos.length > 0) {
        // Se o agendador inteligente já gerou blocos com horários calculados
        itensEstudo = blocos.map((b) => {
          let icone = 'library-outline';
          if (b.tipo === 'questoes') icone = 'document-text-outline';
          else if (b.tipo === 'flashcards') icone = 'flash-outline';
          else if (b.tipo === 'videoaula') icone = 'laptop-outline';
          else if (b.tipo === 'leitura') icone = 'library-outline';

          // TÍTULO: O "detalhe" fica como Título no card
          let tituloCard = b.passo_detalhe || b.passo_tema_questoes || b.topico_titulo || b.titulo || b.tema_id;
          if (typeof tituloCard === 'string') {
            tituloCard = tituloCard.replace('Revisão de Gargalo:', 'Revisão de Tema Crítico:');
          }

          // SUBTÍTULO: O "label" fica como subtítulo, abaixo do título, substituindo o ex: "Leitura Teórica (40 min)"
          const subtituloCard = b.passo_label || (
            b.tipo === 'questoes' ? 'Questões de Fixação' :
            b.tipo === 'videoaula' ? 'Videoaula Teórica' :
            b.tipo === 'flashcards' ? 'Flashcards' : 'Apostila'
          );

          return {
            id: `bloco_${b.id}`,
            data_agendada: b.data_agendada,
            titulo: tituloCard,
            detalhes: subtituloCard,
            tipo: 'Estudos',
            icone,
            concluida: b.status === 'concluido',
            hora_inicio: b.hora_inicio || undefined,
            hora_fim: b.hora_fim || undefined,
            duracao_minutos: b.duracao_minutos,
            passo_id: b.passo_id,
            topico_id: b.topico_id,
            topico_titulo: b.topico_titulo,
            topico_area: b.topico_area,
            topico_especialidade: b.topico_especialidade,
            topico_semana_id: b.topico_semana_id,
            passo_label: b.passo_label,
            passo_detalhe: b.passo_detalhe,
            passo_meta_questoes: b.passo_meta_questoes,
            passo_tema_questoes: b.passo_tema_questoes,
            passo_dia_semana: b.passo_dia_semana,
            passo_tipo: b.tipo,
          };
        });
      } else {
        // Se ainda não gerou blocos, busca a grade teórica do cronograma para pré-visualização
        const [ano, mes, dia] = dataSelecionada.split('-').map(Number);
        const dateObj = new Date(ano, mes - 1, dia);
        const dayIdx = dateObj.getDay();
        const DIAS_SEMANA_MAP: Record<number, string> = {
          0: 'domingo',
          1: 'segunda',
          2: 'terca',
          3: 'quarta',
          4: 'quinta',
          5: 'sexta',
          6: 'sabado',
        };
        const diaSemanaStr = DIAS_SEMANA_MAP[dayIdx] || 'segunda';

        const semanaDaData = getSemanaDoCronogramaPorData(dataSelecionada);
        const hojeStr = toLocalDateStr(new Date());

        let passosResidencia = await getPassosPorDiaSemana(diaSemanaStr, semanaDaData);

        // Se for o dia de HOJE, inclui passos atrasados pendentes (rollover)
        if (dataSelecionada === hojeStr) {
          const atrasados = await getPassosAtrasadosPendentes(semanaDaData, diaSemanaStr);
          const idsAtrasados = new Set(atrasados.map((a) => a.id));
          passosResidencia = [
            ...atrasados,
            ...(passosResidencia || []).filter((p) => !idsAtrasados.has(p.id)),
          ];
        }

        itensEstudo = (passosResidencia || []).map((p) => {
          let icone = 'library-outline';
          if (p.tipo === 'aulas' || p.tipo === 'aulas_bonus') icone = 'laptop-outline';
          else if (p.tipo === 'questoes') icone = 'document-text-outline';
          else if (p.tipo === 'flashcards') icone = 'flash-outline';

          // TÍTULO: O "detalhe" fica como Título no card
          const tituloCard = p.detalhe || p.tema_questoes || p.topico_titulo;

          // SUBTÍTULO: O "label" fica como subtítulo, abaixo do título, substituindo o ex: "Leitura Teórica (40 min)"
          const subtituloCard = p.label || (
            p.tipo === 'questoes' ? 'Questões de Fixação' :
            p.tipo === 'aulas' || p.tipo === 'aulas_bonus' ? 'Aula Principal' :
            p.tipo === 'flashcards' ? 'Flashcards' : 'Apostila'
          );

          return {
            id: `passo_${p.id}`,
            data_agendada: dataSelecionada,
            titulo: tituloCard,
            detalhes: subtituloCard,
            tipo: 'Estudos',
            icone,
            concluida: p.concluido === 1,
            passo_id: p.id,
            topico_id: p.topico_id,
            topico_titulo: p.topico_titulo,
            topico_area: p.topico_area,
            topico_especialidade: p.topico_especialidade,
            topico_semana_id: p.semana_id,
            passo_label: p.label,
            passo_detalhe: p.detalhe,
            passo_meta_questoes: p.meta_questoes,
            passo_tema_questoes: p.tema_questoes,
            passo_dia_semana: p.dia_semana,
            passo_tipo: p.tipo,
          };
        });
      }

      setAtividades([...dadosAgenda, ...itensEstudo]);
    } catch (error) {
      console.error('[Dashboard] Erro ao carregar agenda:', error);
    } finally {
      setLoading(false);
      isCarregandoAgendaRef.current = false;
    }
  }, [dataSelecionada]);

  // Busca as atividades e streak sempre que a tela ganha foco ou a data muda
  useFocusEffect(
    useCallback(() => {
      const savedName = storage.getString('@athena_user_name') || '';
      setUserName(savedName);
      const savedPhoto = storage.getString('@athena_user_photo') || null;
      setUserPhoto(savedPhoto);

      carregarStreak();
      carregarAgenda();
    }, [carregarAgenda, carregarStreak])
  );

  // Manipulação de Foto de Perfil
  const handlePickPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permissão necessária',
          'Precisamos de acesso às suas fotos para atualizar sua imagem de perfil.'
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        setUserPhoto(uri);
        storage.set('@athena_user_photo', uri);
      }
    } catch (e) {
      console.error('[Dashboard] Erro ao selecionar foto:', e);
      Alert.alert('Erro', 'Não foi possível selecionar a foto.');
    }
  };

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permissão necessária',
          'Precisamos de acesso à câmera para tirar sua foto de perfil.'
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        setUserPhoto(uri);
        storage.set('@athena_user_photo', uri);
      }
    } catch (e) {
      console.error('[Dashboard] Erro ao tirar foto:', e);
      Alert.alert('Erro', 'Não foi possível tirar a foto.');
    }
  };

  const handleAvatarPress = () => {
    const buttons: any[] = [
      { text: 'Escolher da Galeria', onPress: handlePickPhoto },
      { text: 'Tirar Foto', onPress: handleTakePhoto },
    ];
    if (userPhoto) {
      buttons.push({
        text: 'Remover Foto',
        style: 'destructive',
        onPress: () => {
          setUserPhoto(null);
          storage.remove('@athena_user_photo');
        },
      });
    }
    buttons.push({ text: 'Cancelar', style: 'cancel' });

    Alert.alert('Foto de Perfil', 'Escolha como deseja alterar sua foto:', buttons);
  };

  // Recarrega automaticamente a timeline se a sincronização do iCal atualizar eventos
  useEffect(() => {
    const unsubscribe = subscribeToICalSync(() => {
      carregarAgenda();
    });
    return () => unsubscribe();
  }, [carregarAgenda]);

  // Alterna o status de concluída (materializando tarefas virtuais ou atualizando SQLite nos passos ou blocos)
  const handleToggle = async (atividade: AtividadeAgenda) => {
    const novoStatus = !atividade.concluida;
    setAtividades((prev) =>
      prev.map((a) => (a.id === atividade.id ? { ...a, concluida: novoStatus } : a))
    );

    try {
      if (atividade.id.startsWith('bloco_')) {
        const blocoId = atividade.id.replace('bloco_', '');
        await updateStatusBlocoEstudo(blocoId, novoStatus ? 'concluido' : 'pendente');
      } else if (atividade.id.startsWith('passo_')) {
        const passoId = parseInt(atividade.id.replace('passo_', ''), 10);
        await togglePassoConcluido(passoId, novoStatus);
      } else {
        await toggleAtividadeStatus(atividade);
      }
      await carregarAgenda();
    } catch (err) {
      console.error('[Dashboard] Erro ao alternar status da atividade:', err);
      carregarAgenda();
    }
  };

  const handleIniciarTreinoBloco = (item: AtividadeAgenda) => {
    const rawId = item.id.replace('bloco_', '');
    const bloco = blocosEstudo.find((b) => b.id === rawId);
    const tema = bloco?.tema_id || (item as any).passo_tema_questoes || item.titulo.split(' • ')[0];
    const metaQuestoes = item.passo_meta_questoes || bloco?.passo_meta_questoes || 20;

    storage.set('@athena_cart', JSON.stringify([{ tema }]));
    storage.set('@athena_quiz_limit', String(metaQuestoes));
    router.push({
      pathname: '/treino/quiz',
      params: {
        tema: encodeURIComponent(tema),
        limite: String(metaQuestoes),
        blocoId: encodeURIComponent(item.id),
      },
    });
  };

  const handleMoveItemDay = async (targetDay: string) => {
    if (!atividadeDetalhes) return;
    const topicoId = atividadeDetalhes.topico_id || (typeof atividadeDetalhes.id === 'string' ? atividadeDetalhes.id.replace('passo_', '').replace('bloco_', '') : '');
    const passoId = atividadeDetalhes.passo_id;
    if (topicoId) {
      await moverPassoOuTopicoDeDiaNoBanco(topicoId, targetDay, passoId);
      await gerarPlanoDiario(dataSelecionada);
      await carregarAgenda();
    }
  };

  const handleMoveItemWeek = async (targetWeek: number) => {
    if (!atividadeDetalhes) return;
    const topicoId = atividadeDetalhes.topico_id;
    if (topicoId) {
      await moverTopicoDeSemanaNoBanco(topicoId, targetWeek);
      await gerarPlanoDiario(dataSelecionada);
      await carregarAgenda();
    }
  };

  const handleSelectSearchItem = (searchItem: ItemBuscaCronograma) => {
    setAtividadeDetalhes({
      id: `passo_${searchItem.passo_id || searchItem.topico_id}`,
      titulo: searchItem.topico_titulo,
      tipo: 'Estudos',
      icone: searchItem.passo_tipo === 'questoes' ? 'document-text-outline' : searchItem.passo_tipo === 'videoaula' ? 'laptop-outline' : searchItem.passo_tipo === 'flashcards' ? 'flash-outline' : 'library-outline',
      concluida: false,
      passo_id: searchItem.passo_id,
      topico_id: searchItem.topico_id,
      topico_titulo: searchItem.topico_titulo,
      topico_area: searchItem.area,
      topico_especialidade: searchItem.especialidade,
      topico_semana_id: searchItem.semana_numero,
      passo_label: searchItem.passo_label,
      passo_detalhe: searchItem.passo_detalhe,
      passo_meta_questoes: searchItem.meta_questoes,
      passo_tema_questoes: searchItem.tema_questoes,
      passo_dia_semana: searchItem.assigned_day,
      passo_tipo: searchItem.passo_tipo,
    });
  };

  // Variáveis para o contador de atividades
  const concluidas = useMemo(() => atividades.filter((a) => a.concluida).length, [atividades]);
  const total = atividades.length;

  // Gera os dias da janela visível (15 dias centralizados no dia de hoje)
  const diasVisiveis = useMemo(() => gerarDiasVisiveis(), []);

  // Referência para o auto-scroll
  const flatListRef = useRef<FlatList>(null);

  // Processamento da Timeline (Injetando âncoras de 07:00 e 22:00)
  const timelineItems = useMemo(() => {
    let items: any[] = [...atividades];

    // Ordena tudo pelo horário
    items.sort((a, b) => {
      const horaA = a.hora_inicio || a.time || '22:00';
      const horaB = b.hora_inicio || b.time || '22:00';
      return horaA.localeCompare(horaB);
    });

    // Unifica a âncora de início: se já existe atividade começando às 07:00,
    // marca ela com hasAnchorStart em vez de injetar uma linha extra de 07:00 com pontilhado duplicado
    const has07hActivity = items.some((a) => (a.hora_inicio || a.time) === '07:00');

    if (has07hActivity) {
      let marked = false;
      items = items.map((a) => {
        if (!marked && (a.hora_inicio || a.time) === '07:00') {
          marked = true;
          return { ...a, hasAnchorStart: true };
        }
        return a;
      });
    } else {
      // Se não há atividade às 07:00, insere a âncora de início de forma independente
      items.unshift({ id: 'ancora_7h', type: 'anchor_start', time: '07:00' });
    }

    // Injeta âncora de fim às 22:00
    items.push({ id: 'ancora_22h', type: 'anchor_end', time: '22:00' });

    // Ordena tudo pelo horário com âncoras nas posições exatas
    items.sort((a, b) => {
      const getHora = (item: any) => {
        if (item.type === 'anchor_start') return '06:59:59';
        if (item.type === 'anchor_end') return '22:00:01';
        return item.hora_inicio || item.time || '22:00';
      };
      return getHora(a).localeCompare(getHora(b));
    });

    return items;
  }, [atividades]);

  // Efeito de auto-scroll para o momento atual (se for hoje)
  useEffect(() => {
    if (timelineItems.length > 0 && flatListRef.current) {
      const todayStr = toLocalDateStr(new Date());
      const isToday = dataSelecionada === todayStr;
      if (isToday) {
        const currentHour = new Date().getHours();
        const currentMin = new Date().getMinutes();
        const currentTimeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}`;

        let targetIndex = timelineItems.findIndex((i) => {
          const itemHora = i.hora_inicio || i.time || '22:00';
          return itemHora >= currentTimeStr;
        });

        if (targetIndex > 0) {
          const timer = setTimeout(() => {
            flatListRef.current?.scrollToIndex({
              index: Math.max(0, targetIndex - 1),
              animated: true,
            });
          }, 350);
          return () => clearTimeout(timer);
        }
      }
    }
  }, [timelineItems, dataSelecionada]);

  // Renderizador de cada linha da timeline vertical (com bolinhas conectoras e pílula "Agora" embutida)
  const renderItemTimeline = ({ item }: { item: any }) => {
    const todayStr = toLocalDateStr(new Date());
    const isToday = dataSelecionada === todayStr;
    const isDayPast = dataSelecionada < todayStr;
    const isDayFuture = dataSelecionada > todayStr;
    const currentHour = new Date().getHours();
    const currentMin = new Date().getMinutes();
    const currentTotalMinutes = currentHour * 60 + currentMin;

    const calcTimePassed = (startHour: number, startMin: number = 0) => {
      if (isDayPast) return 9999;
      if (isDayFuture) return -9999;
      const startMinutes = startHour * 60 + startMin;
      return currentTotalMinutes - startMinutes;
    };

    const renderDottedProgress = (timePassed: number) => (
      <View style={styles.dottedLineContainer}>
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const threshold = i * 10;
          const nextThreshold = (i + 1) * 10;

          const isPastDot = timePassed >= nextThreshold;
          const isNowDot = timePassed >= threshold && timePassed < nextThreshold;

          // Se for hoje e for a bolinha exata do momento, renderiza o "Agora"
          if (isToday && isNowDot) {
            return (
              <View key={i} style={styles.nowDotWrapper}>
                <View style={styles.nowDotPill}>
                  <Text style={styles.nowDotText} numberOfLines={1}>
                    AGORA
                  </Text>
                </View>
              </View>
            );
          }

          // Senão, renderiza a bolinha contínua normal
          const dotColor = (isPastDot || timePassed > threshold) ? themeColors.primary : (isDark ? '#2E3236' : '#D1D5DB');
          return <View key={i} style={[styles.smallDot, { backgroundColor: dotColor }]} />;
        })}
      </View>
    );

    // 1. Renderiza âncoras fixas (07:00 e 22:00)
    if (item.type === 'anchor_start') {
      const timePassed = calcTimePassed(7, 0);
      const isPastOrCurrent = isDayPast || (isToday && currentHour >= 7);
      return (
        <View style={styles.anchorRow}>
          <View style={styles.timeColumn}>
            <Feather name="sunrise" size={20} color={isPastOrCurrent ? themeColors.text : themeColors.textMuted} style={{ marginBottom: 4 }} />
            <Text style={[styles.timeText, isPastOrCurrent ? { color: themeColors.text } : styles.timeTextPast]}>07:00</Text>
            {renderDottedProgress(timePassed)}
          </View>
        </View>
      );
    }

    if (item.type === 'anchor_end') {
      const isPastOrCurrent = isDayPast || (isToday && currentHour >= 22);
      return (
        <View style={styles.anchorRow}>
          <View style={styles.timeColumn}>
            <Ionicons
              name="moon"
              size={20}
              color={isPastOrCurrent ? themeColors.text : themeColors.textMuted}
              style={{ marginTop: 2, marginBottom: 4 }}
            />
            <Text style={[styles.timeText, isPastOrCurrent ? { color: themeColors.text } : styles.timeTextPast]}>
              22:00
            </Text>
          </View>
        </View>
      );
    }

    // 2. Renderiza a Atividade Normal (com trilha contínua e indicador 'Agora' embutido)
    const horaItemStr = item.hora_inicio || item.time || '';
    const [itemHour, itemMin] = horaItemStr ? horaItemStr.split(':').map((v: string) => parseInt(v, 10)) : [12, 0];
    const timePassed = horaItemStr ? calcTimePassed(itemHour, itemMin || 0) : -9999;

    const isPast = horaItemStr ? timePassed >= 60 : false;
    const isCurrentHour = horaItemStr ? (isToday && timePassed >= 0 && timePassed < 60) : false;

    const getCardColor = (it: any): string => {
      // No tema claro: monochrome Notion (#37352F)
      if (!isDark) {
        return themeColors.text;
      }

      // 1. Cor personalizada salva pelo usuário no evento
      if (it.cor) return it.cor;

      // 2. Cores padronizadas por grande área médica / especialidade
      if (it.topico_area || it.topico_especialidade || it.tipo === 'Estudos' || it.tipo === 'Estudo') {
        const topicCol = getTopicColor(
          it.topico_area || undefined,
          it.topico_especialidade || undefined,
          undefined,
          it.topico_titulo || it.titulo || it.detalhes || undefined
        );
        if (topicCol && topicCol !== Colors.primary) return topicCol;
        if (it.passo_tema_questoes || it.passo_detalhe) {
          const temaCol = getTopicColor(undefined, undefined, undefined, it.passo_tema_questoes || it.passo_detalhe || undefined);
          if (temaCol && temaCol !== Colors.primary) return temaCol;
        }
      }

      // 3. Fallback para categorias padrão
      return CATEGORIA_CORES[it.tipo] || CATEGORIA_CORES['default'];
    };

    const corBase = getCardColor(item);

    return (
      <View style={styles.timelineRow}>
        <View style={styles.timeColumn}>
          {item.hasAnchorStart && (
            <Feather
              name="sunrise"
              size={20}
              color={(isDayPast || (isToday && currentHour >= 7)) ? themeColors.text : themeColors.textMuted}
              style={{ marginBottom: 4 }}
            />
          )}
          {horaItemStr ? (
            <Text style={[styles.timeText, (isPast || isCurrentHour) ? { color: themeColors.text } : styles.timeTextPast]}>
              {horaItemStr}
            </Text>
          ) : (
            <View style={styles.noTimeIndicator}>
              <Ionicons name="book-outline" size={13} color={themeColors.textSecondary} />
            </View>
          )}

          {/* Trilha de Progresso do Tempo */}
          {renderDottedProgress(timePassed)}
        </View>

        <View style={{ flex: 1, marginTop: item.hasAnchorStart ? 24 : 0 }}>
          <SwipeableActivityCard
            item={item}
            corBase={corBase}
            onPress={() => setAtividadeDetalhes(item)}
            onSwipeComplete={() => handleToggle(item)}
            onStartQuiz={handleIniciarTreinoBloco}
          />
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={themeColors.background} />

      {/* 1. Header Dinâmico de 2 Linhas */}
      <View style={styles.header}>
        {/* Primeira linha: Foto (à esquerda), Saudação menor em cinza e Nome abaixo */}
        <View style={styles.headerTopRow}>
          <View style={styles.headerProfileGroup}>
            <TouchableOpacity
              style={styles.avatarContainer}
              onPress={handleAvatarPress}
              activeOpacity={0.8}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <View style={styles.avatarCircle}>
                {userPhoto ? (
                  <Image source={{ uri: userPhoto }} style={styles.avatarImage} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    {userName && userName.trim() ? (
                      <Text style={styles.avatarInitials}>
                        {userName.trim().charAt(0).toUpperCase()}
                      </Text>
                    ) : (
                      <Ionicons name="person" size={24} color={themeColors.textSecondary} />
                    )}
                  </View>
                )}
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setModalNomeVisible(true)}
              activeOpacity={0.7}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              style={styles.greetingContainer}
            >
              <Text style={styles.greetingSubtitleText}>{greeting},</Text>
              <Text style={styles.bigGreetingText} numberOfLines={1}>
                {userName && userName.trim() ? userName.trim() : 'Gabriel'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Feature de Streak Alinhada à Direita no Nível do Nome */}
          <TouchableOpacity
            style={[
              styles.streakBadge,
              streakInfo?.activeToday ? styles.streakBadgeActive : styles.streakBadgeInactive,
            ]}
            onPress={() => setModalStreakVisible(true)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={streakInfo?.activeToday ? 'flame' : 'flame-outline'}
              size={18}
              color={streakInfo?.activeToday ? '#FF8800' : '#8E959E'}
            />
            <Text
              style={[
                styles.streakBadgeText,
                streakInfo?.activeToday ? styles.streakBadgeTextActive : styles.streakBadgeTextInactive,
              ]}
            >
              {streakInfo?.streak || 0}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Segunda linha: Lupa à esquerda, Semana centralizada e Calendário à direita */}
        <View style={styles.headerSubRow}>
          <TouchableOpacity
            style={[
              styles.calendarIconButton,
              showSearch && styles.calendarIconButtonActive,
            ]}
            onPress={() => {
              setShowSearch((prev) => {
                const next = !prev;
                if (!next) {
                  setSearchText('');
                  setSearchResults([]);
                }
                return next;
              });
            }}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={showSearch ? 'close' : 'search'}
              size={20}
              color={showSearch ? themeColors.primary : themeColors.text}
            />
          </TouchableOpacity>

          <Text style={styles.weekLabel} numberOfLines={1}>
            {getWeekLabel(dataSelecionada)}
          </Text>

          <TouchableOpacity
            style={styles.calendarIconButton}
            onPress={() => setCalendarVisible(true)}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="calendar-number-outline" size={20} color={themeColors.text} />
          </TouchableOpacity>
        </View>

        {/* Barra Expansível de Pesquisa abaixo do ícone */}
        {showSearch && (
          <View style={styles.searchBarRow}>
            <Ionicons name="search" size={16} color={themeColors.primary} style={styles.searchIcon} />
            <TextInput
              ref={searchInputRef}
              style={styles.searchInput}
              placeholder="Pesquisar tema, especialidade ou aula..."
              placeholderTextColor="#8E959E"
              value={searchText}
              onChangeText={setSearchText}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              autoFocus={true}
            />
            {isSearching && (
              <ActivityIndicator size="small" color={themeColors.primary} style={{ marginRight: 6 }} />
            )}
            {searchText.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchText('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={18} color="#8E959E" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Lista Flutuante para os Resultados */}
        {showSearch && searchText.trim().length > 0 && (
          <View style={styles.floatingResultsContainer}>
            {isSearching && searchResults.length === 0 ? (
              <View style={styles.floatingLoadingBox}>
                <ActivityIndicator size="small" color={themeColors.primary} />
                <Text style={styles.floatingLoadingText}>Buscando matérias e temas...</Text>
              </View>
            ) : searchResults.length > 0 ? (
              <FlatList
                data={searchResults}
                keyExtractor={(item, index) => `${item.topico_id}_${item.passo_id || index}`}
                style={styles.floatingResultsList}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled={true}
                renderItem={({ item }) => {
                  const diaCurto = DIAS_SHORT_MAP[item.assigned_day?.toLowerCase()] || item.assigned_day;

                  return (
                    <TouchableOpacity
                      style={styles.floatingResultCard}
                      onPress={() => {
                        handleSelectSearchItem(item);
                        setShowSearch(false);
                        setSearchText('');
                      }}
                      activeOpacity={0.75}
                    >
                      <View style={styles.floatingResultHeader}>
                        <View style={styles.floatingWeekPill}>
                          <Text style={styles.floatingWeekPillText}>
                            Semana {item.semana_numero} • {diaCurto}
                          </Text>
                        </View>

                        {item.especialidade ? (
                          <Text style={styles.floatingEspecialidadeText} numberOfLines={1}>
                            {item.especialidade}
                          </Text>
                        ) : null}
                      </View>

                      <Text style={styles.floatingTopicTitle} numberOfLines={2}>
                        {item.topico_titulo}
                      </Text>

                      {(item.passo_label || item.passo_detalhe || item.tema_questoes) && (
                        <View style={styles.floatingMatchRow}>
                          <Ionicons
                            name="checkmark-circle-outline"
                            size={13}
                            color={themeColors.primary}
                            style={{ marginRight: 4 }}
                          />
                          <Text style={styles.floatingMatchText} numberOfLines={1}>
                            {item.passo_label || item.passo_detalhe || item.tema_questoes}
                            {item.meta_questoes ? ` • ${item.meta_questoes} questões` : ''}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                }}
              />
            ) : (
              <View style={styles.floatingEmptyBox}>
                <Ionicons name="search-outline" size={32} color="#454B52" style={{ marginBottom: 6 }} />
                <Text style={styles.floatingEmptyTitle}>Nenhum tema encontrado</Text>
                <Text style={styles.floatingEmptySubtitle}>
                  Tente buscar por especialidade (ex: Cardio) ou assunto (ex: PCR).
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* 2. Seletor de Semana Estilo Calendário Folha */}
      <View style={styles.weekSelector}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={diasVisiveis}
          keyExtractor={(item) => item.dataISO}
          initialScrollIndex={7}
          getItemLayout={(data, index) => ({ length: 60, offset: 60 * index, index })}
          onScrollToIndexFailed={() => {}}
          contentContainerStyle={styles.weekSelectorList}
          renderItem={({ item }) => {
            const isSelected = item.dataISO === dataSelecionada;
            const todayStr = toLocalDateStr(new Date());
            const isToday = item.dataISO === todayStr;

            return (
              <TouchableOpacity
                style={[styles.dayPill, isSelected && styles.dayPillActive]}
                onPress={() => setDataSelecionada(item.dataISO)}
                activeOpacity={0.7}
              >
                <View style={[styles.dayWeekContainer, isSelected && styles.dayWeekContainerActive]}>
                  <Text style={[styles.dayWeekText, isSelected && styles.dayWeekTextActive]}>
                    {item.diaSemana}
                  </Text>
                </View>
                <View style={styles.dayMonthContainer}>
                  <Text style={[styles.dayMonthText, isSelected && styles.dayMonthTextActive]}>
                    {item.diaMes}
                  </Text>
                  {isToday && (
                    <View style={[styles.todayIndicatorDot, isSelected && styles.todayIndicatorDotActive]} />
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* 3. Container Board das Atividades */}
      <View style={styles.boardContainer}>
        <View style={styles.boardHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.boardTitle}>{getRelativeDateTitle(dataSelecionada)}</Text>
            <Text style={styles.boardSubtitle}>
              Você completou <Text style={styles.boardSubtitleBold}>{concluidas}</Text> de{' '}
              <Text style={styles.boardSubtitleBold}>{total}</Text>{' '}
              {total === 1 ? 'atividade agendada' : 'atividades agendadas'}!
            </Text>
          </View>
        </View>

        <FlatList
          ref={flatListRef}
          data={timelineItems}
          keyExtractor={(item) => item.id}
          renderItem={renderItemTimeline}
          contentContainerStyle={styles.timelineContainer}
          showsVerticalScrollIndicator={false}
          onScrollToIndexFailed={() => {}}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="calendar-outline" size={38} color="#383D42" style={{ marginBottom: 10 }} />
                <Text style={styles.emptyTitle}>Nenhuma atividade programada</Text>
                <Text style={styles.emptySubtitle}>
                  Toque no botão + abaixo para adicionar uma tarefa pessoal, plantão ou aula.
                </Text>
              </View>
            ) : null
          }
        />
      </View>

      {/* 4. Floating Action Button (FAB) para Adicionar Nova Tarefa */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.85}
        onPress={() => {
          setAtividadeParaEditar(null);
          setModalNovaVisible(true);
        }}
      >
        <Ionicons name="add" size={28} color={themeColors.primary === '#EAE115' ? '#000000' : '#FFFFFF'} />
      </TouchableOpacity>

      {/* Modal para Adicionar ou Editar Atividade */}
      <ModalNovaAtividade
        visible={modalNovaVisible}
        atividadeEmEdicao={atividadeParaEditar}
        onClose={() => {
          setModalNovaVisible(false);
          setAtividadeParaEditar(null);
        }}
        onSaveSuccess={async () => {
          // Replanejamento reativo automático: re-alinha os blocos pendentes de estudo nos novos horários livres
          await gerarPlanoDiario(dataSelecionada);
          await carregarAgenda();
        }}
        dataInicial={dataSelecionada}
      />

      {/* Modal Interativo do Calendário Mensal */}
      <ModalCalendarioMensal
        visible={calendarVisible}
        onClose={() => setCalendarVisible(false)}
        dataAtual={dataSelecionada}
        onDayPress={(novaData) => {
          setDataSelecionada(novaData);
          setCalendarVisible(false);
        }}
      />

      {/* Modal de Detalhes da Atividade / Bloco com Remanejamento */}
      <ModalDetalhesAtividade
        visible={atividadeDetalhes !== null}
        item={atividadeDetalhes}
        onClose={() => setAtividadeDetalhes(null)}
        onToggleStatus={async (it) => {
          await handleToggle(it);
          setAtividadeDetalhes((prev: any) => prev ? { ...prev, concluida: !prev.concluida } : null);
        }}
        onStartQuiz={handleIniciarTreinoBloco}
        onMoveDay={handleMoveItemDay}
        onMoveWeek={handleMoveItemWeek}
        onEditAtividade={(it) => {
          setAtividadeDetalhes(null);
          setAtividadeParaEditar(it);
          setModalNovaVisible(true);
        }}
        onDeleteAtividade={async (it) => {
          setAtividadeDetalhes(null);
          await excluirAtividade(it.id);
          await gerarPlanoDiario(dataSelecionada);
          await carregarAgenda();
        }}
      />

      {/* Modal detalhado de Streak / Ofensiva */}
      <StreakModal
        visible={modalStreakVisible}
        onClose={() => setModalStreakVisible(false)}
        streakInfo={streakInfo}
      />

      {/* Modal para Editar Nome do Usuário */}
      <NomeUsuarioModal
        visible={modalNomeVisible}
        onClose={() => setModalNomeVisible(false)}
        initialName={userName}
        onSave={(novoNome) => setUserName(novoNome)}
      />
    </SafeAreaView>
  );
}

// Estilos minimalistas no padrão Notion Dark
function createStyles(theme: ActiveThemeColors, isDark: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
      paddingTop: 8,
    },
    header: {
      paddingHorizontal: 16,
      marginBottom: 14,
      gap: 12,
      zIndex: 100,
    },
    headerTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerProfileGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    avatarContainer: {
      position: 'relative',
      marginRight: 12,
    },
    avatarCircle: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: theme.surface,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: theme.border,
      overflow: 'hidden',
    },
    avatarImage: {
      width: 50,
      height: 50,
      borderRadius: 25,
    },
    avatarPlaceholder: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: theme.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitials: {
      fontSize: 22,
      fontFamily: Fonts.extraBold,
      fontWeight: '800',
      color: theme.primary,
    },
    greetingContainer: {
      flex: 1,
      justifyContent: 'center',
    },
    greetingSubtitleText: {
      fontSize: 13,
      fontFamily: Fonts.semiBold,
      fontWeight: '600',
      color: theme.textSecondary,
      lineHeight: 16,
    },
    bigGreetingText: {
      fontSize: 22,
      fontFamily: Fonts.extraBold,
      fontWeight: '800',
      color: theme.text,
      letterSpacing: -0.4,
      lineHeight: 26,
      marginTop: -1,
    },
    headerSubRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 2,
    },
    weekLabel: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
      fontFamily: Fonts.semiBold,
      color: theme.textSecondary,
      letterSpacing: -0.2,
      textAlign: 'center',
      paddingHorizontal: 8,
    },
    calendarIconButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    calendarIconButtonActive: {
      backgroundColor: theme.primarySubtle,
      borderColor: theme.primary,
    },
    searchBarRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 12,
      paddingVertical: Platform.OS === 'ios' ? 10 : 6,
      marginTop: 6,
    },
    searchIcon: {
      marginRight: 8,
    },
    searchInput: {
      flex: 1,
      color: theme.text,
      fontSize: 14,
      fontFamily: Fonts.medium,
      paddingVertical: 0,
    },
    floatingResultsContainer: {
      position: 'absolute',
      top: '100%',
      left: 16,
      right: 16,
      maxHeight: 340,
      backgroundColor: theme.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.4 : 0.05,
      shadowRadius: 8,
      elevation: isDark ? 8 : 1,
      zIndex: 9999,
      overflow: 'hidden',
    },
    floatingResultsList: {
      padding: 10,
    },
    floatingResultCard: {
      backgroundColor: theme.backgroundSecondary,
      borderRadius: 12,
      padding: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: theme.border,
    },
    floatingResultHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    floatingWeekPill: {
      backgroundColor: theme.primarySubtle,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: theme.primaryBorder,
    },
    floatingWeekPillText: {
      fontSize: 10,
      fontWeight: '700',
      color: theme.primary,
      fontFamily: Fonts.bold,
      textTransform: 'uppercase',
    },
    floatingEspecialidadeText: {
      fontSize: 11,
      color: theme.textSecondary,
      fontWeight: '600',
      fontFamily: Fonts.semiBold,
    },
    floatingTopicTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.text,
      fontFamily: Fonts.bold,
      marginBottom: 4,
    },
    floatingMatchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 2,
    },
    floatingMatchText: {
      fontSize: 11,
      color: theme.textSecondary,
      fontFamily: Fonts.medium,
    },
    floatingLoadingBox: {
      paddingVertical: 24,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    floatingLoadingText: {
      fontSize: 12,
      color: theme.textSecondary,
      fontFamily: Fonts.medium,
    },
    floatingEmptyBox: {
      paddingVertical: 24,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    floatingEmptyTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.text,
      fontFamily: Fonts.bold,
      marginBottom: 2,
    },
    floatingEmptySubtitle: {
      fontSize: 11,
      color: theme.textSecondary,
      textAlign: 'center',
      fontFamily: Fonts.regular,
    },
    streakBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      height: 36,
      paddingHorizontal: 9,
      borderRadius: 18,
      borderWidth: 1,
    },
    streakBadgeActive: {
      backgroundColor: 'rgba(255, 136, 0, 0.12)',
      borderColor: 'rgba(255, 136, 0, 0.35)',
    },
    streakBadgeInactive: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
    },
    streakBadgeText: {
      fontSize: 13,
      fontFamily: Fonts.bold,
      fontWeight: '800',
    },
    streakBadgeTextActive: {
      color: '#FF8800',
    },
    streakBadgeTextInactive: {
      color: theme.textSecondary,
    },
    calendarIconEmoji: {
      fontSize: 18,
    },

    /* 2. Seletor de Semana Folha */
    weekSelector: {
      marginBottom: 16,
    },
    weekSelectorList: {
      paddingHorizontal: 12,
    },
    dayPill: {
      width: 48,
      height: 60,
      borderRadius: 10,
      backgroundColor: theme.surface,
      marginHorizontal: 6,
      borderWidth: 1,
      borderColor: theme.border,
      overflow: 'hidden',
    },
    dayPillActive: {
      borderColor: theme.primary,
      borderWidth: 1.5,
      backgroundColor: theme.primarySubtle,
    },
    dayWeekContainer: {
      backgroundColor: theme.backgroundSecondary,
      width: '100%',
      alignItems: 'center',
      paddingVertical: 4,
      borderBottomWidth: 1,
      borderBottomColor: theme.borderSubtle,
    },
    dayWeekContainerActive: {
      backgroundColor: theme.primarySubtle,
      borderBottomColor: theme.primaryBorder,
    },
    dayMonthContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingBottom: 2,
    },
    dayWeekText: {
      fontSize: 11,
      color: theme.textSecondary,
      textTransform: 'uppercase',
      fontWeight: '700',
      fontFamily: Fonts.bold,
    },
    dayWeekTextActive: {
      color: theme.primary,
      fontWeight: '800',
    },
    dayMonthText: {
      fontSize: 16,
      color: theme.text,
      fontWeight: 'bold',
      fontFamily: Fonts.bold,
    },
    dayMonthTextActive: {
      color: theme.text,
      fontWeight: '800',
    },
    todayIndicatorDot: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.textSecondary,
      marginTop: 2,
    },
    todayIndicatorDotActive: {
      backgroundColor: theme.primary,
    },

    /* 3. Board Container */
    boardContainer: {
      flex: 1,
      backgroundColor: theme.backgroundSecondary,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: 16,
      paddingTop: 20,
      borderTopWidth: 1,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: theme.border,
    },
    boardTitle: {
      fontSize: 22,
      fontWeight: '800',
      fontFamily: Fonts.extraBold,
      color: theme.text,
      marginBottom: 4,
    },
    boardSubtitle: {
      fontSize: 13,
      fontFamily: Fonts.regular,
      color: theme.textSecondary,
      marginBottom: 8,
    },
    boardSubtitleBold: {
      fontFamily: Fonts.bold,
      fontWeight: '700',
      color: theme.text,
    },

    /* 4. Timeline Vertical */
    timelineContainer: {
      paddingBottom: 90,
    },
    timelineRow: {
      flexDirection: 'row',
      marginBottom: 6,
      minHeight: 64,
    },
    timeColumn: {
      width: 50,
      alignItems: 'center',
      marginRight: 10,
      marginTop: 0,
    },
    timeText: {
      fontSize: 12,
      fontWeight: '700',
      fontFamily: Fonts.bold,
      color: theme.textSecondary,
      marginTop: 2,
      marginBottom: 6,
    },
    timeTextPast: {
      color: theme.textMuted,
    },
    dottedLineContainer: { 
      flex: 1, 
      alignItems: 'center', 
      justifyContent: 'space-evenly', 
      paddingTop: 2,
      paddingBottom: 2, 
      minHeight: 56, 
    },
    smallDot: { 
      width: 6, 
      height: 6, 
      borderRadius: 3, 
      marginVertical: 1.5, 
    },
    nowDotWrapper: {
      marginVertical: 2,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10,
    },
    nowDotPill: {
      backgroundColor: theme.primary,
      paddingHorizontal: 4,
      paddingVertical: 3,
      borderRadius: 8,
    },
    nowDotText: {
      color: theme.primary === '#EAE115' ? '#000000' : '#FFFFFF',
      fontSize: 8,
      fontWeight: '800',
      fontFamily: Fonts.extraBold,
      letterSpacing: 0.5,
    },
    anchorRow: {
      flexDirection: 'row',
      marginBottom: 6,
      alignItems: 'flex-start',
    },
    activityCard: {
      flex: 1,
      padding: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      overflow: 'hidden',
    },
    activityCardCompleted: {
      opacity: 0.5,
      borderColor: theme.borderSubtle,
    },
    cardContentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    cardMainContent: {
      flex: 1,
      marginRight: 12,
    },
    cardRightIconWrapper: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingLeft: 4,
      paddingRight: 2,
    },
    activityTitle: {
      fontSize: 15,
      fontWeight: '700',
      fontFamily: Fonts.bold,
      color: theme.text,
    },
    textStrikethrough: {
      textDecorationLine: 'line-through',
      color: theme.textSecondary,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 6,
      gap: 10,
    },
    timeRangeBox: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    timeRangeText: {
      fontSize: 12,
      fontFamily: Fonts.medium,
      color: theme.textSecondary,
    },
    routineBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.primarySubtle,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    routineText: {
      fontSize: 10,
      fontWeight: '700',
      fontFamily: Fonts.bold,
      color: theme.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    detailsRow: {
      marginTop: 4,
      marginBottom: 2,
    },
    detailsText: {
      fontSize: 12,
      fontFamily: Fonts.medium,
      color: theme.textSecondary,
      lineHeight: 16,
    },
    noTimeIndicator: {
      height: 16,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 4,
    },

    /* Empty State */
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 48,
      paddingHorizontal: 24,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: '700',
      fontFamily: Fonts.bold,
      color: theme.text,
      marginBottom: 6,
    },
    emptySubtitle: {
      fontSize: 13,
      fontFamily: Fonts.regular,
      color: theme.textSecondary,
      textAlign: 'center',
      lineHeight: 18,
    },

    /* 5. FAB */
    fab: {
      position: 'absolute',
      bottom: 24,
      right: 20,
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: theme.primary,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.3 : 0.06,
      shadowRadius: 4,
      elevation: isDark ? 4 : 1,
      borderWidth: isDark ? 0 : 1,
      borderColor: theme.border,
    },

    /* AI Planner & Replan Styles */
    boardHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 8,
    },
    praticarBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.primary,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 4,
      gap: 4,
      marginLeft: 'auto',
    },
    praticarBtnText: {
      fontSize: 10,
      fontWeight: '800',
      color: '#FFFFFF',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
  });
}