import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { storage } from '@/services/storage';
import {
  getAtividadesPorData,
  upsertAtividadeAgenda,
  AtividadeAgenda,
} from '@/services/database';

function toLocalDateStr(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const NOMES_MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export default function DashboardScreen() {
  const [atividades, setAtividades] = useState<AtividadeAgenda[]>([]);
  const [dataSelecionada, setDataSelecionada] = useState<string>(() => toLocalDateStr(new Date()));
  const [loading, setLoading] = useState<boolean>(true);

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

  // Busca as atividades sempre que a tela ganha foco ou a data muda
  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const carregarAgenda = async () => {
        setLoading(true);
        try {
          const dados = await getAtividadesPorData(dataSelecionada);
          if (isActive) {
            setAtividades(dados);
          }
        } catch (error) {
          console.error('[Dashboard] Erro ao carregar agenda:', error);
        } finally {
          if (isActive) setLoading(false);
        }
      };

      carregarAgenda();

      return () => {
        isActive = false;
      };
    }, [dataSelecionada])
  );

  // Alterna o status de concluída de uma atividade
  const toggleConcluirAtividade = async (item: AtividadeAgenda) => {
    const novaConcluida = !item.concluida;
    const atualizada: AtividadeAgenda = {
      ...item,
      concluida: novaConcluida,
    };

    // Atualização otimista
    setAtividades((prev) =>
      prev.map((a) => (a.id === item.id ? atualizada : a))
    );

    try {
      await upsertAtividadeAgenda(atualizada);
    } catch (err) {
      console.error('[Dashboard] Erro ao atualizar status da atividade:', err);
    }
  };

  // Cálculos para o Card de Progresso
  const atividadesConcluidas = atividades.filter((a) => a.concluida).length;
  const totalAtividades = atividades.length;
  const progressoPorcentagem = totalAtividades > 0 ? Math.round((atividadesConcluidas / totalAtividades) * 100) : 0;

  // Gera os 7 dias da semana correspondente à dataSelecionada
  const diasDaSemana = useMemo(() => {
    const parts = dataSelecionada.split('-');
    const refDate = parts.length === 3
      ? new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10))
      : new Date();

    const dayOfWeek = refDate.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(refDate);
    monday.setDate(refDate.getDate() + diffToMonday);

    const dias = [];
    const NOMES_DIAS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];
    const todayStr = toLocalDateStr(new Date());

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dStr = toLocalDateStr(d);
      dias.push({
        dateStr: dStr,
        dayNumber: d.getDate(),
        dayAbbr: NOMES_DIAS[i],
        isToday: dStr === todayStr,
        isSelected: dStr === dataSelecionada,
      });
    }
    return dias;
  }, [dataSelecionada]);

  // Texto descritivo do mês/semana
  const labelSemana = useMemo(() => {
    const parts = dataSelecionada.split('-');
    if (parts.length === 3) {
      const mesIdx = parseInt(parts[1], 10) - 1;
      const ano = parts[0];
      return `${NOMES_MESES[mesIdx]} de ${ano}`;
    }
    return 'Semana atual';
  }, [dataSelecionada]);

  // Função para renderizar cada item da timeline (marcador na esquerda, card na direita)
  const renderItemTimeline = ({ item, index }: { item: AtividadeAgenda; index: number }) => {
    const isLast = index === atividades.length - 1;

    return (
      <View style={styles.timelineRow}>
        {/* Coluna da Esquerda: Horário e Marcador */}
        <View style={styles.timeColumn}>
          <Text style={styles.timeText}>{item.hora_inicio || '--:--'}</Text>
          <TouchableOpacity
            style={[styles.timeDot, item.concluida && styles.timeDotCompleted]}
            onPress={() => toggleConcluirAtividade(item)}
            activeOpacity={0.7}
          >
            {item.concluida && <Ionicons name="checkmark" size={10} color="#000000" />}
          </TouchableOpacity>
          {!isLast && <View style={styles.timeLine} />}
        </View>

        {/* Coluna da Direita: Card da Atividade */}
        <TouchableOpacity
          style={[styles.activityCard, item.concluida && styles.activityCardCompleted]}
          onPress={() => toggleConcluirAtividade(item)}
          activeOpacity={0.8}
        >
          <View style={styles.activityHeaderRow}>
            <Text style={[styles.activityTitle, item.concluida && styles.activityTitleCompleted]}>
              {item.titulo}
            </Text>
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>{item.tipo.toUpperCase()}</Text>
            </View>
          </View>

          {item.hora_fim && (
            <View style={styles.activityMetaRow}>
              <Ionicons name="time-outline" size={13} color={Colors.textSecondary} style={{ marginRight: 4 }} />
              <Text style={styles.activityMetaText}>
                {item.hora_inicio} - {item.hora_fim}
              </Text>
            </View>
          )}

          {typeof item.feedback_cansaco === 'number' && item.feedback_cansaco > 0 && (
            <View style={styles.activityCansacoRow}>
              <Ionicons name="flash-outline" size={12} color={Colors.primary} style={{ marginRight: 4 }} />
              <Text style={styles.activityCansacoText}>
                Demanda: {item.feedback_cansaco}/5
              </Text>
            </View>
          )}
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
          <Text style={styles.headerSubtitle}>{labelSemana}</Text>
        </View>
        <TouchableOpacity
          style={styles.calendarButton}
          onPress={() => setDataSelecionada(toLocalDateStr(new Date()))}
          activeOpacity={0.7}
        >
          <Ionicons name="calendar-outline" size={20} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* 2. Seletor de Semana (Pílulas de Dias) */}
      <View style={styles.weekSelectorContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.weekSelectorContent}
        >
          {diasDaSemana.map((dia) => (
            <TouchableOpacity
              key={dia.dateStr}
              style={[
                styles.dayPill,
                dia.isSelected && styles.dayPillSelected,
              ]}
              onPress={() => setDataSelecionada(dia.dateStr)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.dayPillAbbr,
                  dia.isSelected ? styles.dayPillTextSelected : styles.dayPillTextInactive,
                ]}
              >
                {dia.dayAbbr}
              </Text>
              <Text
                style={[
                  styles.dayPillNumber,
                  dia.isSelected ? styles.dayPillTextSelected : styles.dayPillTextInactive,
                ]}
              >
                {dia.dayNumber}
              </Text>
              {dia.isToday && !dia.isSelected && <View style={styles.todayIndicatorDot} />}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* 3. Card de Progresso Diário */}
      <View style={styles.progressCard}>
        <View style={styles.progressCardHeader}>
          <View style={styles.progressTitleRow}>
            <Ionicons name="checkbox-outline" size={18} color={Colors.primary} style={{ marginRight: 8 }} />
            <Text style={styles.progressCardTitle}>Meta Diária</Text>
          </View>
          {totalAtividades > 0 && (
            <Text style={styles.progressPercentageText}>{progressoPorcentagem}%</Text>
          )}
        </View>

        <Text style={styles.progressText}>
          {totalAtividades > 0
            ? `Hoje você completou ${atividadesConcluidas} de ${totalAtividades} atividades`
            : 'Nenhuma atividade agendada para hoje'}
        </Text>

        {totalAtividades > 0 && (
          <View style={styles.progressBarTrack}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${progressoPorcentagem}%` },
              ]}
            />
          </View>
        )}
      </View>

      {/* 4. Timeline Vertical (Agenda) */}
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
              <Text style={styles.emptyTitle}>Nenhuma atividade para hoje</Text>
              <Text style={styles.emptySubtitle}>
                Toque no botão + para adicionar um novo compromisso ou estudo ao seu cronograma.
              </Text>
            </View>
          ) : null
        }
      />

      {/* 5. Floating Action Button (FAB) para adicionar nova tarefa */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.85}
        onPress={() => {
          // Ação para criar nova atividade na agenda
        }}
      >
        <Ionicons name="add" size={28} color="#000000" />
      </TouchableOpacity>
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
  headerSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
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

  /* 2. Pílulas de Semana */
  weekSelectorContainer: {
    marginVertical: 14,
  },
  weekSelectorContent: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 2,
  },
  dayPill: {
    width: 46,
    height: 64,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: '#2e3235',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  dayPillSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  dayPillAbbr: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  dayPillNumber: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 4,
  },
  dayPillTextSelected: {
    color: '#000000',
  },
  dayPillTextInactive: {
    color: Colors.textSecondary,
  },
  todayIndicatorDot: {
    position: 'absolute',
    bottom: 5,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.primary,
  },

  /* 3. Card de Progresso */
  progressCard: {
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2e3235',
    marginBottom: 16,
  },
  progressCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  progressPercentageText: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.primary,
  },
  progressText: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: '#1b1d1f',
    borderRadius: 3,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 3,
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
    width: 16,
    height: 16,
    borderRadius: 8,
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2e3235',
  },
  activityCardCompleted: {
    opacity: 0.55,
    borderColor: '#222628',
  },
  activityHeaderRow: {
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
  activityTitleCompleted: {
    textDecorationLine: 'line-through',
    color: Colors.textSecondary,
  },
  typeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(234, 225, 21, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(234, 225, 21, 0.25)',
  },
  typeBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: 0.5,
  },
  activityMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  activityMetaText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  activityCansacoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  activityCansacoText: {
    fontSize: 11,
    color: Colors.primary,
    fontWeight: '600',
  },

  /* Empty state */
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