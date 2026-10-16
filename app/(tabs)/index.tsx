import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Colors, CATEGORIA_CORES } from '@/constants/Colors';
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
} from '@/services/database';
import { getSemanaDoCronogramaPorData } from '@/services/scheduleService';
import { gerarPlanoDiario, verificarEPlanejarAutomaticamente, sincronizarLimitesHorarioUtil } from '@/services/schedulerService';
import ModalNovaAtividade from '@/components/cronograma/ModalNovaAtividade';
import ModalCalendarioMensal from '@/components/cronograma/ModalCalendarioMensal';
import ModalDetalhesAtividade from '@/components/cronograma/ModalDetalhesAtividade';
import ModalBuscaUniversal from '@/components/cronograma/ModalBuscaUniversal';
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
  const router = useRouter();
  const [atividades, setAtividades] = useState<AtividadeAgenda[]>([]);
  const [blocosEstudo, setBlocosEstudo] = useState<DbBlocoEstudo[]>([]);
  const [dataSelecionada, setDataSelecionada] = useState<string>(() => toLocalDateStr(new Date()));
  const [loading, setLoading] = useState<boolean>(true);
  const [modalNovaVisible, setModalNovaVisible] = useState<boolean>(false);
  const [atividadeParaEditar, setAtividadeParaEditar] = useState<AtividadeAgenda | null>(null);
  const [calendarVisible, setCalendarVisible] = useState<boolean>(false);
  const [atividadeDetalhes, setAtividadeDetalhes] = useState<any | null>(null);
  const [searchModalVisible, setSearchModalVisible] = useState<boolean>(false);

  // Busca o nome do usuário salvo localmente ou fallback
  const userName = storage.getString('@athena_user_name') || '';

  // Lógica de Saudação (Sol/Lua com Ionicons Preenchidos)
  const getGreeting = () => {
    const hour = new Date().getHours();
    const nome = userName && userName.trim() ? userName.trim() : 'Dr.';
    if (hour >= 5 && hour < 18) return { text: hour < 12 ? `Bom dia, ${nome}!` : `Boa tarde, ${nome}!`, icon: 'sunny' as const };
    return { text: `Boa noite, ${nome}!`, icon: 'moon' as const };
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

  // Lógica de Cálculo da Segunda-feira da Semana com o número contínuo do cronograma
  const getWeekLabel = (dateString: string) => {
    const target = new Date(dateString + 'T12:00:00Z');
    const day = target.getDay();

    // Calcula quantos dias voltar para chegar na Segunda-feira
    // No JS, Domingo é 0. Então se for Domingo, volta 6 dias. Senão, volta (day - 1)
    const diffToMonday = day === 0 ? -6 : 1 - day;

    const monday = new Date(target.getTime());
    monday.setDate(target.getDate() + diffToMonday);

    const dayStr = monday.getDate();
    const monthStr = monday.toLocaleDateString('pt-BR', { month: 'long' });

    const semanaNum = getSemanaDoCronogramaPorData(dateString);

    return `Semana ${semanaNum} • ${dayStr} de ${monthStr}`;
  };

  const carregarAgenda = useCallback(async () => {
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
          let icone = 'book-open';
          if (b.tipo === 'questoes') icone = 'check-square';
          else if (b.tipo === 'flashcards') icone = 'layers';
          else if (b.tipo === 'videoaula') icone = 'play-circle';
          else if (b.tipo === 'leitura') icone = 'book-open';

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
          let icone = 'book-open';
          if (p.tipo === 'aulas' || p.tipo === 'aulas_bonus') icone = 'play-circle';
          else if (p.tipo === 'questoes') icone = 'check-square';
          else if (p.tipo === 'flashcards') icone = 'layers';

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
    }
  }, [dataSelecionada]);

  // Busca as atividades sempre que a tela ganha foco ou a data muda
  useFocusEffect(
    useCallback(() => {
      carregarAgenda();
    }, [carregarAgenda])
  );

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
    const blocoId = item.id.replace('bloco_', '');
    const bloco = blocosEstudo.find((b) => b.id === blocoId);
    const tema = bloco?.tema_id || item.titulo.split(' • ')[0];

    storage.set('@athena_cart', JSON.stringify([{ tema }]));
    storage.set('@athena_quiz_limit', '20');
    router.push({ pathname: '/treino/quiz', params: { tema: encodeURIComponent(tema), limite: '20' } });
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
      icone: searchItem.passo_tipo === 'questoes' ? 'check-square' : searchItem.passo_tipo === 'videoaula' ? 'play-circle' : 'book-open',
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
          const dotColor = (isPastDot || timePassed > threshold) ? Colors.primary : '#2E3236';
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
            <Feather name="sunrise" size={20} color={isPastOrCurrent ? Colors.text : '#656B73'} style={{ marginBottom: 4 }} />
            <Text style={[styles.timeText, isPastOrCurrent ? { color: Colors.text } : styles.timeTextPast]}>07:00</Text>
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
              color={isPastOrCurrent ? Colors.text : '#656B73'}
              style={{ marginTop: 2, marginBottom: 4 }}
            />
            <Text style={[styles.timeText, isPastOrCurrent ? { color: Colors.text } : styles.timeTextPast]}>
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
    const corBase = CATEGORIA_CORES[item.tipo] || CATEGORIA_CORES['default'];

    return (
      <View style={styles.timelineRow}>
        <View style={styles.timeColumn}>
          {item.hasAnchorStart && (
            <Feather
              name="sunrise"
              size={20}
              color={(isDayPast || (isToday && currentHour >= 7)) ? Colors.text : '#656B73'}
              style={{ marginBottom: 4 }}
            />
          )}
          {horaItemStr ? (
            <Text style={[styles.timeText, (isPast || isCurrentHour) ? { color: Colors.text } : styles.timeTextPast]}>
              {horaItemStr}
            </Text>
          ) : (
            <View style={styles.noTimeIndicator}>
              <Ionicons name="book-outline" size={13} color={Colors.textSecondary} />
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
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      {/* 1. Header Dinâmico (Sem barra cinza inferior) */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={styles.greeting}>{greeting.text}</Text>
          <Ionicons name={greeting.icon} size={24} color={Colors.primary} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            style={styles.calendarIconButton}
            onPress={() => setSearchModalVisible(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="search" size={20} color={Colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.calendarIconButton}
            onPress={() => setCalendarVisible(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="calendar-number-outline" size={21} color={Colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* NOVO: Título da Semana */}
      <Text style={styles.weekLabel}>{getWeekLabel(dataSelecionada)}</Text>

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
            return (
              <TouchableOpacity
                style={[styles.dayPill, isSelected && styles.dayPillActive]}
                onPress={() => setDataSelecionada(item.dataISO)}
                activeOpacity={0.7}
              >
                <View style={[styles.dayWeekContainer, isSelected && styles.dayWeekContainerActive]}>
                  <Text style={[styles.dayWeekText, isSelected && styles.dayTextActive]}>
                    {item.diaSemana}
                  </Text>
                </View>
                <View style={styles.dayMonthContainer}>
                  <Text style={[styles.dayMonthText, isSelected && styles.dayTextActive]}>
                    {item.diaMes}
                  </Text>
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
              {concluidas} de {total} {total === 1 ? 'atividade completa' : 'atividades completas'} hoje!
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
        <Ionicons name="add" size={28} color="#000000" />
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

      {/* Modal de Pesquisa Universal pelas 45 Semanas */}
      <ModalBuscaUniversal
        visible={searchModalVisible}
        onClose={() => setSearchModalVisible(false)}
        onSelectItem={handleSelectSearchItem}
      />
    </SafeAreaView>
  );
}

// Estilos minimalistas no padrão Notion Dark
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingTop: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  weekLabel: { 
    fontSize: 14, 
    fontWeight: '600', 
    fontFamily: Fonts.semiBold,
    color: '#888', 
    textAlign: 'center', 
    paddingHorizontal: 20, 
    marginBottom: 12,
  },
  greeting: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: Fonts.extraBold,
    color: Colors.text,
    letterSpacing: -0.5,
  },
  calendarIconButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: '#2e3235',
    alignItems: 'center',
    justifyContent: 'center',
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
    backgroundColor: Colors.surface,
    marginHorizontal: 6,
    borderWidth: 1,
    borderColor: '#2e3235',
    overflow: 'hidden',
  },
  dayPillActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  dayWeekContainer: {
    backgroundColor: '#1c1f22',
    width: '100%',
    alignItems: 'center',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#282b2e',
  },
  dayWeekContainerActive: {
    backgroundColor: '#D1CA10',
    borderBottomColor: '#B8B20E',
  },
  dayMonthContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayWeekText: {
    fontSize: 11,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    fontWeight: '700',
    fontFamily: Fonts.bold,
  },
  dayMonthText: {
    fontSize: 16,
    color: Colors.text,
    fontWeight: 'bold',
    fontFamily: Fonts.bold,
  },
  dayTextActive: {
    color: '#000000',
  },

  /* 3. Board Container */
  boardContainer: {
    flex: 1,
    backgroundColor: '#181a1c',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 20,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#282c30',
  },
  boardTitle: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: Fonts.extraBold,
    color: Colors.text,
    marginBottom: 4,
  },
  boardSubtitle: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    marginBottom: 16,
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
    color: Colors.textSecondary,
    marginTop: 2,
    marginBottom: 6,
  },
  timeTextPast: {
    color: '#555A62',
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
    backgroundColor: Colors.primary,
    paddingHorizontal: 4, // Reduzido para caber na coluna
    paddingVertical: 3,
    borderRadius: 8, // Borda um pouco menor para acompanhar o tamanho
  },
  nowDotText: {
    color: '#000000',
    fontSize: 8, // Fonte reduzida para não quebrar linha
    fontWeight: '800',
    fontFamily: Fonts.extraBold,
    letterSpacing: 0.5, // Dá um pequeno respiro entre as letras
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
    borderColor: '#2e3235',
    overflow: 'hidden',
  },
  activityCardCompleted: {
    opacity: 0.5,
    borderColor: '#202325',
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
    color: Colors.text,
  },
  textStrikethrough: {
    textDecorationLine: 'line-through',
    color: Colors.textSecondary,
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
    color: Colors.textSecondary,
  },
  routineBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(234, 225, 21, 0.08)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  routineText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: Fonts.bold,
    color: Colors.primary,
  },
  detailsRow: {
    marginTop: 4,
    marginBottom: 2,
  },
  detailsText: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: Colors.textSecondary,
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
    color: Colors.text,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },

  /* 5. FAB */
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
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
    backgroundColor: Colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
    marginLeft: 'auto',
  },
  praticarBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#000',
  },
});