import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { storage } from '@/services/storage';
import {
  getAtividadesPorData,
  toggleAtividadeStatus,
  AtividadeAgenda,
} from '@/services/database';
import ModalNovaAtividade from '@/components/cronograma/ModalNovaAtividade';

// Limite ideal diário de carga cognitiva
const BASE_DAILY_BUDGET = 15;

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
  const [loading, setLoading] = useState<boolean>(true);
  const [modalNovaVisible, setModalNovaVisible] = useState<boolean>(false);

  // Busca o nome do usuário salvo localmente ou fallback
  const userName = storage.getString('@athena_user_name') || '';

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
      return `${saudacao}, ${clean}!`;
    }
    return `${saudacao}, Dr.!`;
  };

  const carregarAgenda = useCallback(async () => {
    setLoading(true);
    try {
      const dados = await getAtividadesPorData(dataSelecionada);
      setAtividades(dados);
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

  // Cálculos do Orçamento de Energia
  const cargaTotalDoDia = useMemo(() => {
    return atividades.reduce((acc, curr) => acc + (curr.feedback_cansaco || 0), 0);
  }, [atividades]);

  const cargaConcluida = useMemo(() => {
    return atividades
      .filter((a) => a.concluida)
      .reduce((acc, curr) => acc + (curr.feedback_cansaco || 0), 0);
  }, [atividades]);

  const atividadesConcluidas = useMemo(() => {
    return atividades.filter((a) => a.concluida).length;
  }, [atividades]);

  const totalAtividades = atividades.length;

  // Define a cor baseada no consumo (Vermelho se estourar, Amarelo se perto do limite, Verde/Primary normal)
  const isOverloaded = cargaTotalDoDia > BASE_DAILY_BUDGET;
  const energyBarColor = isOverloaded
    ? '#EF4444'
    : cargaTotalDoDia >= 12
    ? '#FACC15'
    : Colors.primary;

  // Gera os dias da janela visível (15 dias centralizados no dia de hoje)
  const diasVisiveis = useMemo(() => gerarDiasVisiveis(), []);

  // Função para facilitar a formatação de "Hoje" ou data extensa no header
  const getHeaderDateText = () => {
    const hoje = toLocalDateStr(new Date());
    if (dataSelecionada === hoje) return 'Hoje';

    const data = new Date(dataSelecionada + 'T12:00:00Z');
    return data.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  // Renderizador de cada linha da timeline vertical
  const renderItemTimeline = ({ item, index }: { item: AtividadeAgenda; index: number }) => {
    const isLast = index === atividades.length - 1;

    return (
      <View style={styles.timelineRow}>
        {/* Coluna da Esquerda: Horário e Marcador Clicável */}
        <View style={styles.timeColumn}>
          <Text style={styles.timeText}>{item.hora_inicio || '--:--'}</Text>
          <TouchableOpacity
            style={[styles.timeDot, item.concluida && styles.timeDotCompleted]}
            onPress={() => handleToggle(item)}
            activeOpacity={0.7}
          >
            {item.concluida && <Ionicons name="checkmark" size={11} color="#000000" />}
          </TouchableOpacity>
          {!isLast && <View style={styles.timeLine} />}
        </View>

        {/* Coluna da Direita: Card Clicável da Atividade */}
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

      {/* 1. Header (Saudação e Botão Calendário) */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{getGreetingText()}</Text>
          <Text style={styles.dateSubtitle}>{getHeaderDateText()}</Text>
        </View>
        <TouchableOpacity
          style={styles.calendarButton}
          onPress={() => setDataSelecionada(toLocalDateStr(new Date()))}
          activeOpacity={0.7}
        >
          <Ionicons name="calendar-outline" size={20} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* 2. Seletor de Semana Horizontal */}
      <View style={styles.weekSelector}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={diasVisiveis}
          keyExtractor={(item) => item.dataISO}
          initialScrollIndex={7} // Começa centralizado no dia de hoje
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
                <Text style={[styles.dayWeekText, isSelected && styles.dayTextActive]}>
                  {item.diaSemana}
                </Text>
                <Text style={[styles.dayMonthText, isSelected && styles.dayTextActive]}>
                  {item.diaMes}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* 3. Card de Orçamento de Energia (Carga Mental Diária HUD) */}
      <View style={styles.energyCard}>
        <View style={styles.energyHeader}>
          <View style={styles.energyTitleRow}>
            <Ionicons name="flash" size={17} color={energyBarColor} style={{ marginRight: 6 }} />
            <Text style={styles.energyTitle}>Carga Mental Diária</Text>
          </View>
          <Text style={[styles.energyFraction, { color: energyBarColor }]}>
            {cargaTotalDoDia} / {BASE_DAILY_BUDGET} pts
          </Text>
        </View>

        {/* Barra de Progresso do Orçamento de Energia */}
        <View style={styles.energyTrack}>
          <View
            style={[
              styles.energyFill,
              {
                backgroundColor: energyBarColor,
                width: `${Math.min((cargaTotalDoDia / BASE_DAILY_BUDGET) * 100, 100)}%`,
              },
            ]}
          />
        </View>

        <View style={styles.energyFooterRow}>
          <Text style={styles.energySubtitle}>
            {cargaConcluida} pontos gastos • {atividadesConcluidas}/{totalAtividades} concluídas
          </Text>
          {isOverloaded && (
            <View style={styles.overloadBadge}>
              <Text style={styles.overloadBadgeText}>SOBRECARGA</Text>
            </View>
          )}
        </View>
      </View>

      {/* 4. Timeline Vertical (Agenda Diária) */}
      <FlatList
        data={atividades}
        keyExtractor={(item) => item.id}
        renderItem={renderItemTimeline}
        contentContainerStyle={styles.timelineContainer}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="calendar-outline" size={40} color="#383D42" style={{ marginBottom: 12 }} />
              <Text style={styles.emptyTitle}>Dia livre! Nenhuma atividade agendada</Text>
              <Text style={styles.emptySubtitle}>
                Toque no botão + abaixo para adicionar uma tarefa ou agendar um bloco de estudos.
              </Text>
            </View>
          ) : null
        }
      />

      {/* 5. Floating Action Button (FAB) para Adicionar Nova Tarefa */}
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
    </SafeAreaView>
  );
}

// Estilos minimalistas no padrão Notion Dark
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e2124',
  },
  greeting: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.5,
  },
  dateSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
    textTransform: 'capitalize',
  },
  calendarButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: '#2e3235',
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* 2. Seletor de Semana Horizontal */
  weekSelector: {
    marginBottom: 20,
    marginHorizontal: -16, // margem negativa para o scroll ir até a borda da tela
  },
  weekSelectorList: {
    paddingHorizontal: 12,
  },
  dayPill: {
    width: 52,
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: Colors.surface,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#2e3235',
  },
  dayPillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  dayWeekText: {
    fontSize: 11,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    fontWeight: '700',
    marginBottom: 4,
  },
  dayMonthText: {
    fontSize: 16,
    color: Colors.text,
    fontWeight: 'bold',
  },
  dayTextActive: {
    color: '#000000',
  },

  /* 3. Card de Orçamento de Energia (HUD) */
  energyCard: {
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2e3235',
    marginBottom: 16,
  },
  energyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  energyTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  energyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  energyFraction: {
    fontSize: 15,
    fontWeight: '800',
  },
  energyTrack: {
    height: 7,
    backgroundColor: '#1b1d1f',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  energyFill: {
    height: '100%',
    borderRadius: 4,
  },
  energyFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  energySubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  overloadBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  overloadBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#EF4444',
    letterSpacing: 0.5,
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
    width: 54,
    alignItems: 'center',
    marginRight: 10,
  },
  timeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  timeDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#43484e',
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  timeDotCompleted: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  timeLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#282c30',
    marginTop: 2,
    zIndex: 0,
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