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
import { useFocusEffect } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { storage } from '@/services/storage';
import {
  getAtividadesPorData,
  toggleAtividadeStatus,
  AtividadeAgenda,
} from '@/services/database';
import { getAdjustedDailyBudget } from '@/services/scheduleService';
import ModalNovaAtividade from '@/components/cronograma/ModalNovaAtividade';

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
  const [atividades, setAtividades] = useState<AtividadeAgenda[]>([]);
  const [dataSelecionada, setDataSelecionada] = useState<string>(() => toLocalDateStr(new Date()));
  const [limiteDiario, setLimiteDiario] = useState<number>(15);
  const [loading, setLoading] = useState<boolean>(true);
  const [modalNovaVisible, setModalNovaVisible] = useState<boolean>(false);
  const [calendarVisible, setCalendarVisible] = useState<boolean>(false);

  // Busca o nome do usuário salvo localmente ou fallback
  const userName = storage.getString('@athena_user_name') || '';

  // Lógica de Saudação (Sol/Lua com Feather Icons)
  const getGreeting = () => {
    const hour = new Date().getHours();
    const nome = userName && userName.trim() ? userName.trim() : 'Dr.';
    if (hour >= 5 && hour < 12) return { text: `Bom dia, ${nome}!`, icon: 'sunrise' as const };
    if (hour >= 12 && hour < 18) return { text: `Boa tarde, ${nome}!`, icon: 'sun' as const };
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

    const weekDays = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    if (diffDays > 1 && diffDays < 7) return `Próxima ${weekDays[target.getDay()]}`;

    return target.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
  };

  const carregarAgenda = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Busca as atividades do dia selecionado
      const dados = await getAtividadesPorData(dataSelecionada);
      setAtividades(dados);

      // 2. Calcula a data do dia anterior (para verificar eventual "dívida de cansaço")
      const dataAtual = new Date(dataSelecionada + 'T12:00:00Z');
      dataAtual.setDate(dataAtual.getDate() - 1);
      const dataAnteriorISO = toLocalDateStr(dataAtual);

      // 3. Busca o orçamento ajustado (limite dinâmico)
      const orcamentoAjustado = await getAdjustedDailyBudget(dataSelecionada, dataAnteriorISO);
      setLimiteDiario(orcamentoAjustado);
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

  // Alterna o status de concluída (materializando tarefas virtuais se necessário)
  const handleToggle = async (atividade: AtividadeAgenda) => {
    // Atualização otimista imediata para feedback instantâneo na UI
    const novoStatus = !atividade.concluida;
    setAtividades((prev) =>
      prev.map((a) => (a.id === atividade.id ? { ...a, concluida: novoStatus } : a))
    );

    try {
      await toggleAtividadeStatus(atividade);
      await carregarAgenda(); // Recarrega para refletir a materialização
    } catch (err) {
      console.error('[Dashboard] Erro ao alternar status da atividade:', err);
      carregarAgenda();
    }
  };

  // Variáveis para o contador de atividades
  const concluidas = useMemo(() => atividades.filter((a) => a.concluida).length, [atividades]);
  const total = atividades.length;

  // Gera os dias da janela visível (15 dias centralizados no dia de hoje)
  const diasVisiveis = useMemo(() => gerarDiasVisiveis(), []);

  // Referência para o auto-scroll
  const flatListRef = useRef<FlatList>(null);

  // Processamento da Timeline (Injetando âncoras e o marcador 'Agora')
  const timelineItems = useMemo(() => {
    const todayStr = toLocalDateStr(new Date());
    const isToday = dataSelecionada === todayStr;
    const currentHour = new Date().getHours();
    const currentMin = new Date().getMinutes();
    const currentTimeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}`;

    let items: any[] = [...atividades];

    // Injeta âncora de início
    items.push({ id: 'ancora_6h', type: 'anchor', time: '06:00', icon: 'sunrise' as const });
    // Injeta âncora de fim
    items.push({ id: 'ancora_22h', type: 'anchor', time: '22:00', icon: 'moon' as const });

    // Se for o dia de hoje, injeta o marcador "Agora"
    if (isToday) {
      items.push({ id: 'marcador_agora', type: 'now_marker', time: currentTimeStr });
    }

    // Ordena tudo pelo horário
    items.sort((a, b) => {
      const horaA = a.hora_inicio || a.time || '24:00';
      const horaB = b.hora_inicio || b.time || '24:00';
      return horaA.localeCompare(horaB);
    });

    return items;
  }, [atividades, dataSelecionada]);

  // Efeito de auto-scroll para o momento atual (se for hoje)
  useEffect(() => {
    if (timelineItems.length > 0 && flatListRef.current) {
      const todayStr = toLocalDateStr(new Date());
      const isToday = dataSelecionada === todayStr;
      if (isToday) {
        const indexAgora = timelineItems.findIndex((i) => i.id === 'marcador_agora');
        if (indexAgora > 0) {
          const timer = setTimeout(() => {
            flatListRef.current?.scrollToIndex({
              index: Math.max(0, indexAgora - 1),
              animated: true,
            });
          }, 350);
          return () => clearTimeout(timer);
        }
      }
    }
  }, [timelineItems, dataSelecionada]);

  // Renderizador de cada linha da timeline vertical (com bolinhas, âncoras e marcador "Agora")
  const renderItemTimeline = ({ item }: { item: any }) => {
    const horaItemStr = item.hora_inicio || item.time || '00:00';
    const hourItemNum = parseInt(horaItemStr.split(':')[0], 10);
    const todayStr = toLocalDateStr(new Date());
    const isPast =
      dataSelecionada < todayStr ||
      (dataSelecionada === todayStr && hourItemNum < new Date().getHours());
    const circleColor = item.concluida
      ? Colors.primary
      : isPast
      ? '#484D54'
      : Colors.primary;

    // 1. Renderiza âncoras fixas (6h e 22h)
    if (item.type === 'anchor') {
      return (
        <View style={styles.anchorRow}>
          <View style={styles.timeColumn}>
            <Feather name={item.icon} size={18} color="#656B73" />
          </View>
          <View style={styles.anchorDivider} />
        </View>
      );
    }

    // 2. Renderiza o Marcador "Agora"
    if (item.type === 'now_marker') {
      return (
        <View style={styles.nowMarkerRow}>
          <View style={styles.nowMarkerPill}>
            <Text style={styles.nowMarkerText}>Agora</Text>
          </View>
          <View style={styles.nowMarkerLine} />
        </View>
      );
    }

    // 3. Renderiza a Atividade Normal (usando as bolinhas de horário)
    return (
      <View style={styles.timelineRow}>
        <View style={styles.timeColumn}>
          <Text style={[styles.timeText, isPast && styles.timeTextPast]}>{horaItemStr}</Text>
          <View style={[styles.timeCircle, { backgroundColor: circleColor }]} />
        </View>

        <TouchableOpacity
          style={[styles.activityCard, item.concluida && styles.activityCardCompleted]}
          onPress={() => handleToggle(item)}
          activeOpacity={0.75}
        >
          <View style={styles.cardHeader}>
            <Text
              style={[
                styles.activityTitle,
                item.concluida && styles.textStrikethrough,
              ]}
              numberOfLines={2}
            >
              {item.titulo}
            </Text>

            <View style={styles.badgesRow}>
              {/* Badge de Demanda Cognitiva */}
              {typeof item.feedback_cansaco === 'number' && item.feedback_cansaco > 0 && (
                <View style={styles.energyBadge}>
                  <Text style={styles.energyBadgeText}>⚡ {item.feedback_cansaco}</Text>
                </View>
              )}

              {/* Badge de Categoria */}
              <View style={styles.typeBadge}>
                <Text style={styles.typeBadgeText}>{item.tipo.toUpperCase()}</Text>
              </View>
            </View>
          </View>

          {/* Linha Meta: Horários e Indicador de Rotina */}
          <View style={styles.metaRow}>
            {item.hora_fim ? (
              <View style={styles.timeRangeBox}>
                <Ionicons name="time-outline" size={12} color={Colors.textSecondary} style={{ marginRight: 4 }} />
                <Text style={styles.timeRangeText}>
                  {item.hora_inicio} - {item.hora_fim}
                </Text>
              </View>
            ) : null}

            {item.isVirtual && (
              <View style={styles.routineBox}>
                <Ionicons name="repeat" size={11} color={Colors.primary} style={{ marginRight: 3 }} />
                <Text style={styles.routineText}>Rotina</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
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
          <Feather name={greeting.icon} size={24} color={Colors.primary} />
        </View>
        <TouchableOpacity
          style={styles.calendarIconButton}
          onPress={() => setCalendarVisible(true)}
          activeOpacity={0.7}
        >
          <Feather name="calendar" size={20} color={Colors.text} />
        </TouchableOpacity>
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
        <Text style={styles.boardTitle}>{getRelativeDateTitle(dataSelecionada)}</Text>
        <Text style={styles.boardSubtitle}>
          Você completou {concluidas}/{total} {total === 1 ? 'atividade programada' : 'atividades programadas'} para {getRelativeDateTitle(dataSelecionada).toLowerCase()}!
        </Text>

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
                  Toque no botão + abaixo para adicionar uma tarefa ou agendar um bloco de estudos.
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
        onPress={() => setModalNovaVisible(true)}
      >
        <Ionicons name="add" size={28} color="#000000" />
      </TouchableOpacity>

      {/* Modal para Adicionar Nova Atividade */}
      <ModalNovaAtividade
        visible={modalNovaVisible}
        onClose={() => setModalNovaVisible(false)}
        onSaveSuccess={carregarAgenda}
        dataInicial={dataSelecionada}
      />

      {/* Modal Temporário do Calendário Mensal */}
      <Modal visible={calendarVisible} transparent animationType="fade" onRequestClose={() => setCalendarVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setCalendarVisible(false)}>
          <View style={styles.calendarModalContent}>
            <Text style={styles.calendarModalTitle}>Navegação Mensal</Text>
            <Text style={styles.calendarModalSubtitle}>
              Selecione um dia (Implementação do react-native-calendars pendente)
            </Text>
            <TouchableOpacity style={styles.closeCalButton} onPress={() => setCalendarVisible(false)}>
              <Text style={styles.closeCalButtonText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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
  greeting: {
    fontSize: 22,
    fontWeight: '800',
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
  },
  dayMonthText: {
    fontSize: 16,
    color: Colors.text,
    fontWeight: 'bold',
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
    color: Colors.text,
    marginBottom: 4,
  },
  boardSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 16,
  },

  /* Modal Calendário */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  calendarModalContent: {
    backgroundColor: Colors.surface,
    padding: 24,
    borderRadius: 20,
    width: '90%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2e3235',
  },
  calendarModalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 8,
  },
  calendarModalSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  closeCalButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
  },
  closeCalButtonText: {
    color: '#000000',
    fontWeight: 'bold',
    fontSize: 15,
  },

  /* 4. Timeline Vertical */
  timelineContainer: {
    paddingBottom: 90,
  },
  timelineRow: {
    flexDirection: 'row',
    marginBottom: 14,
    minHeight: 64,
  },
  timeColumn: {
    width: 50,
    alignItems: 'center',
    marginRight: 10,
    marginTop: 4,
  },
  timeText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  timeTextPast: {
    color: '#555A62',
  },
  timeCircle: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  anchorRow: {
    flexDirection: 'row',
    marginBottom: 18,
    alignItems: 'center',
  },
  anchorDivider: {
    flex: 1,
    height: 1,
    backgroundColor: '#282C30',
    marginLeft: 14,
  },
  nowMarkerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
    marginTop: -4,
  },
  nowMarkerPill: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 12,
    marginLeft: 8,
  },
  nowMarkerText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  nowMarkerLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#3B82F6',
    marginLeft: 12,
    opacity: 0.4,
  },
  activityCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2e3235',
  },
  activityCardCompleted: {
    opacity: 0.5,
    borderColor: '#202325',
    backgroundColor: '#1b1d1f',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  activityTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    flex: 1,
  },
  textStrikethrough: {
    textDecorationLine: 'line-through',
    color: Colors.textSecondary,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  energyBadge: {
    backgroundColor: 'rgba(234, 225, 21, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(234, 225, 21, 0.3)',
  },
  energyBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.primary,
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  typeBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#D1D5DB',
    letterSpacing: 0.4,
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
    color: Colors.primary,
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
    color: Colors.text,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
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
});