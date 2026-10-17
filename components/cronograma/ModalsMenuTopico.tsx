import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  StyleSheet,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ActiveThemeColors } from '@/constants/Colors';
import { useAppTheme } from '@/context/ThemeContext';
import {
  CronogramaTopico,
  DiaSemana,
  DIAS_SEMANA_LISTA,
  CronogramaSemana,
  CronogramaProgresso,
  calcularProgressoSemana,
} from '@/services/scheduleService';
import CircularProgressRing from '@/components/CircularProgressRing';

export interface ModalsMenuTopicoProps {
  // Estados de visibilidade (gerenciados pelo pai)
  topicoMenuAberto: {
    topico: CronogramaTopico;
    semanaOrigemNumero: number;
    currentDay: DiaSemana;
  } | null;
  setTopicoMenuAberto: (
    val: { topico: CronogramaTopico; semanaOrigemNumero: number; currentDay: DiaSemana } | null
  ) => void;

  showMoveDayModal: { topico: CronogramaTopico; currentDay: DiaSemana } | null;
  setShowMoveDayModal: (val: { topico: CronogramaTopico; currentDay: DiaSemana } | null) => void;

  showEscolherSemanaModal: {
    topico: CronogramaTopico;
    semanaOrigemNumero: number;
    currentDay: DiaSemana;
  } | null;
  setShowEscolherSemanaModal: (
    val: { topico: CronogramaTopico; semanaOrigemNumero: number; currentDay: DiaSemana } | null
  ) => void;

  semanasList: CronogramaSemana[]; // Para o modal de escolher semana
  progresso: CronogramaProgresso; // Para calcular o anel de progresso na escolha de semana

  // Callbacks de Ação (A execução fica no pai, o filho só avisa "O usuário clicou")
  onMoveToDay: (topicoId: string, targetDay: DiaSemana) => void;
  onConfirmMoverSemana: (semanaDestinoNum: number) => void;
  onRequestDeleteTopico: (topico: CronogramaTopico, semanaOrigemNumero: number) => void;
  onRequestEditLembrete?: (topico: CronogramaTopico, semanaOrigemNumero: number) => void;
}

export function ModalsMenuTopico({
  topicoMenuAberto,
  setTopicoMenuAberto,
  showMoveDayModal,
  setShowMoveDayModal,
  showEscolherSemanaModal,
  setShowEscolherSemanaModal,
  semanasList,
  progresso,
  onMoveToDay,
  onConfirmMoverSemana,
  onRequestDeleteTopico,
  onRequestEditLembrete,
}: ModalsMenuTopicoProps) {
  const { colors: theme, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);

  return (
    <>
      {/* 1. Modal: Menu Principal de Opções (3 Pontos) */}
      <Modal
        visible={topicoMenuAberto !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setTopicoMenuAberto(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setTopicoMenuAberto(null)}
        >
          <View style={styles.modalSheetBox} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.modalSheetTitle} numberOfLines={1}>
                  {topicoMenuAberto?.topico.titulo}
                </Text>
                <Text style={styles.modalSheetSub}>
                  {topicoMenuAberto?.topico.isLembrete
                    ? 'Opções do Lembrete'
                    : topicoMenuAberto?.topico.isRevisao
                    ? `Opções de Revisão (${topicoMenuAberto.topico.revisaoIntervaloLabel || 'Rev'})`
                    : 'Opções do Tópico'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setTopicoMenuAberto(null)}>
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Editar Lembrete (Apenas para Lembretes) */}
            {topicoMenuAberto?.topico.isLembrete && onRequestEditLembrete && (
              <TouchableOpacity
                style={styles.actionMenuRow}
                onPress={() => {
                  if (topicoMenuAberto) {
                    const target = { ...topicoMenuAberto };
                    setTopicoMenuAberto(null);
                    onRequestEditLembrete(target.topico, target.semanaOrigemNumero);
                  }
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.actionMenuIconCircle, { backgroundColor: theme.primarySubtle }]}>
                  <Ionicons name="pencil-outline" size={18} color={theme.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionMenuTitle}>Editar Lembrete</Text>
                  <Text style={styles.actionMenuDesc}>Alterar título, detalhes ou dia da semana</Text>
                </View>
              </TouchableOpacity>
            )}

            {/* Mover para outro dia / Encaixar em um dia */}
            <TouchableOpacity
              style={[
                styles.actionMenuRow,
                topicoMenuAberto?.topico.isRevisao && { borderBottomWidth: 0 },
              ]}
              onPress={() => {
                if (topicoMenuAberto) {
                  const target = { ...topicoMenuAberto };
                  setTopicoMenuAberto(null);
                  setShowMoveDayModal({
                    topico: target.topico,
                    currentDay: target.currentDay,
                  });
                }
              }}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.actionMenuIconCircle,
                  topicoMenuAberto?.topico.isRevisao && { backgroundColor: 'rgba(167, 139, 250, 0.2)' },
                ]}
              >
                <Ionicons
                  name={topicoMenuAberto?.topico.isRevisao ? 'calendar-outline' : 'swap-horizontal'}
                  size={18}
                  color={topicoMenuAberto?.topico.isRevisao ? '#A78BFA' : theme.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionMenuTitle}>
                  {topicoMenuAberto?.topico.isRevisao ? 'Mudar Dia da Revisão' : 'Mudar Dia da Semana'}
                </Text>
                <Text style={styles.actionMenuDesc}>
                  {topicoMenuAberto?.currentDay
                    ? `Atualmente alocado para ${DIAS_SEMANA_LISTA.find((d) => d.id === topicoMenuAberto?.currentDay)?.label}`
                    : 'Escolha em qual dia da semana estudar'}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Mover para outra semana (Apenas tópicos nativos) */}
            {!topicoMenuAberto?.topico.isRevisao && (
              <TouchableOpacity
                style={styles.actionMenuRow}
                onPress={() => {
                  if (topicoMenuAberto) {
                    const target = { ...topicoMenuAberto };
                    setTopicoMenuAberto(null);
                    setShowEscolherSemanaModal({
                      topico: target.topico,
                      semanaOrigemNumero: target.semanaOrigemNumero,
                      currentDay: target.currentDay,
                    });
                  }
                }}
                activeOpacity={0.7}
              >
                <View style={styles.actionMenuIconCircle}>
                  <Ionicons name="calendar-outline" size={18} color="#3B82F6" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionMenuTitle}>Mudar Semana</Text>
                  <Text style={styles.actionMenuDesc}>
                    Mover este tema para outra semana mantendo seus dias
                  </Text>
                </View>
              </TouchableOpacity>
            )}

            {/* Excluir Tópico (Apenas tópicos nativos) */}
            {!topicoMenuAberto?.topico.isRevisao && (
              <TouchableOpacity
                style={[styles.actionMenuRow, { borderBottomWidth: 0 }]}
                onPress={() => {
                  if (topicoMenuAberto) {
                    const target = { ...topicoMenuAberto };
                    setTopicoMenuAberto(null);
                    onRequestDeleteTopico(target.topico, target.semanaOrigemNumero);
                  }
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.actionMenuIconCircle, { backgroundColor: isDark ? 'rgba(255, 76, 76, 0.15)' : 'rgba(239, 68, 68, 0.12)' }]}>
                  <Ionicons name="trash-outline" size={18} color={theme.error} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.actionMenuTitle, { color: theme.error }]}>Remover do Cronograma</Text>
                  <Text style={styles.actionMenuDesc}>Apagar este tema e limpar seu histórico</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 2. Modal: Escolher Novo Dia */}
      <Modal
        visible={showMoveDayModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMoveDayModal(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowMoveDayModal(null)}
        >
          <View style={styles.modalSheetBox} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeaderRow}>
              <View>
                <Text style={styles.modalSheetTitle}>
                  {showMoveDayModal?.topico.isRevisao ? 'Mover Revisão de Dia' : 'Mover Tópico de Dia'}
                </Text>
                <Text style={styles.modalSheetSub} numberOfLines={1}>
                  {showMoveDayModal?.topico.titulo}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowMoveDayModal(null)}>
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 380 }}>

              {DIAS_SEMANA_LISTA.map((dia) => {
                const isCurrent = showMoveDayModal?.currentDay === dia.id;
                return (
                  <TouchableOpacity
                    key={dia.id}
                    style={[styles.dayOptionRow, isCurrent && styles.dayOptionRowCurrent]}
                    onPress={() => {
                      if (showMoveDayModal) {
                        onMoveToDay(showMoveDayModal.topico.id, dia.id);
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.dayOptionLeft}>
                      <Ionicons
                        name="calendar-outline"
                        size={18}
                        color={
                          isCurrent
                            ? showMoveDayModal?.topico.isRevisao
                              ? '#A78BFA'
                              : theme.primary
                            : theme.textSecondary
                        }
                      />
                      <Text style={[styles.dayOptionLabel, isCurrent && styles.dayOptionLabelCurrent]}>
                        {dia.label}
                      </Text>
                    </View>
                    {isCurrent ? (
                      <Text
                        style={[
                          styles.currentDayTag,
                          showMoveDayModal?.topico.isRevisao && { color: '#A78BFA', borderColor: '#A78BFA' },
                        ]}
                      >
                        Atual
                      </Text>
                    ) : (
                      <Ionicons name="arrow-forward" size={16} color={theme.textSecondary} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 3. Modal: Escolher Nova Semana */}
      <Modal
        visible={showEscolherSemanaModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowEscolherSemanaModal(null);
        }}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            setShowEscolherSemanaModal(null);
          }}
        >
          <View style={[styles.modalSheetBox, { maxHeight: '80%' }]} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalSheetTitle} numberOfLines={1}>
                  Mover para qual Semana?
                </Text>
                <Text style={styles.modalSheetSub}>
                  O tema manterá seus cards distribuídos nos mesmos dias
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setShowEscolherSemanaModal(null);
                }}
              >
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={semanasList}
              keyExtractor={(s) => `move_s_${s.numero}`}
              contentContainerStyle={{ paddingVertical: 8 }}
              renderItem={({ item: s }) => {
                const isCurrent = s.numero === showEscolherSemanaModal?.semanaOrigemNumero;
                const st = calcularProgressoSemana(s, progresso);
                return (
                  <TouchableOpacity
                    style={[
                      styles.weekOverviewCard,
                      isCurrent && styles.weekOverviewCardSelected,
                    ]}
                    onPress={() => onConfirmMoverSemana(s.numero)}
                    activeOpacity={0.7}
                    disabled={isCurrent}
                  >
                    <View style={styles.weekOverviewLeft}>
                      <Text style={[styles.weekOverviewTitle, isCurrent && { color: theme.primary }]}>
                        Semana {s.numero}
                      </Text>
                      <Text style={styles.weekOverviewTopicsCount}>
                        {s.topicos?.length || 0} tópicos programados
                      </Text>
                    </View>

                    <View style={styles.weekOverviewRight}>
                      <CircularProgressRing progress={st.porcentagem} size={34} strokeWidth={3} />
                      {isCurrent ? (
                        <Text style={[styles.currentDayTag, { marginLeft: 8 }]}>Atual</Text>
                      ) : (
                        <Ionicons name="arrow-forward" size={16} color={theme.textSecondary} style={{ marginLeft: 8 }} />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

function createStyles(theme: ActiveThemeColors, isDark: boolean) {
  return StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: isDark ? 'rgba(0, 0, 0, 0.78)' : 'rgba(0, 0, 0, 0.45)',
      justifyContent: 'flex-end',
    },
    modalSheetBox: {
      backgroundColor: theme.surfaceCard || theme.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      paddingBottom: 32,
      borderTopWidth: 1,
      borderColor: theme.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: isDark ? 0.35 : 0.08,
      shadowRadius: 12,
      elevation: 6,
    },
    modalHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.borderSubtle,
    },
    modalSheetTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: theme.text,
    },
    modalSheetSub: {
      fontSize: 12,
      color: theme.textSecondary,
      marginTop: 2,
    },
    actionMenuRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: theme.borderSubtle,
      gap: 14,
    },
    actionMenuIconCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionMenuTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.text,
      marginBottom: 2,
    },
    actionMenuDesc: {
      fontSize: 11,
      color: theme.textSecondary,
    },
    dayOptionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 10,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 8,
    },
    dayOptionRowCurrent: {
      borderColor: theme.primaryBorder,
      borderWidth: 1,
      backgroundColor: theme.primarySubtle,
    },
    dayOptionLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    dayOptionLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.text,
    },
    dayOptionLabelCurrent: {
      color: theme.primary,
      fontWeight: '700',
    },
    currentDayTag: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.primary,
      backgroundColor: theme.primarySubtle,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
    },
    weekOverviewCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.surface,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: theme.border,
    },
    weekOverviewCardSelected: {
      borderColor: theme.primaryBorder,
      backgroundColor: theme.primarySubtle,
    },
    weekOverviewLeft: {
      flex: 1,
    },
    weekOverviewTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.text,
      marginBottom: 3,
    },
    weekOverviewTopicsCount: {
      fontSize: 12,
      color: theme.textSecondary,
    },
    weekOverviewRight: {
      flexDirection: 'row',
      alignItems: 'center',
    },
  });
}

