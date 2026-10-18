import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { CATEGORIA_CORES } from '@/constants/Colors';
import { Fonts } from '@/constants/Typography';
import { useAppTheme } from '@/context/ThemeContext';

interface Props {
  visible: boolean;
  item: any | null;
  onClose: () => void;
  onToggleStatus?: (item: any) => void;
  onStartQuiz: (item: any) => void;
  onMoveDay: (targetDay: string) => Promise<void>;
  onMoveWeek: (targetWeek: number) => Promise<void>;
  onEditAtividade?: (item: any) => void;
  onDeleteAtividade?: (item: any) => void;
}

const DIAS_SEMANA_NOMES = [
  { id: 'segunda', label: 'Segunda', short: 'Seg' },
  { id: 'terca', label: 'Terça', short: 'Ter' },
  { id: 'quarta', label: 'Quarta', short: 'Qua' },
  { id: 'quinta', label: 'Quinta', short: 'Qui' },
  { id: 'sexta', label: 'Sexta', short: 'Sex' },
  { id: 'sabado', label: 'Sábado', short: 'Sáb' },
  { id: 'domingo', label: 'Domingo', short: 'Dom' },
];

export default function ModalDetalhesAtividade({
  visible,
  item,
  onClose,
  onToggleStatus,
  onStartQuiz,
  onMoveDay,
  onMoveWeek,
  onEditAtividade,
  onDeleteAtividade,
}: Props) {
  const { theme, isDark } = useAppTheme();
  const [showSeletorDia, setShowSeletorDia] = useState(false);
  const [showSeletorSemana, setShowSeletorSemana] = useState(false);
  const [isMoving, setIsMoving] = useState(false);

  if (!item) return null;

  const isResidencia =
    item.id?.startsWith('bloco_') ||
    item.id?.startsWith('passo_') ||
    item.topico_id ||
    item.passo_id;

  const corBase = CATEGORIA_CORES[item.tipo] || CATEGORIA_CORES['default'];

  // Metadados extraídos
  const topicoTitulo = item.topico_titulo || item.titulo || 'Atividade';
  const area = item.topico_area || item.area;
  const especialidade = item.topico_especialidade || item.especialidade;
  const label = item.passo_label || item.label;
  const detalhe = item.passo_detalhe || item.detalhe;
  const metaQuestoes = item.passo_meta_questoes ?? item.meta_questoes;
  const temaQuestoes = item.passo_tema_questoes || item.tema_questoes;
  const semanaNumero = item.topico_semana_id ?? item.semana_numero;
  const diaSemana = item.passo_dia_semana || item.dia_semana || item.assigned_day;

  const handleSelecionarDia = async (diaId: string) => {
    setIsMoving(true);
    try {
      await onMoveDay(diaId);
      setShowSeletorDia(false);
      onClose();
    } catch (e) {
      console.error('Erro ao mover dia:', e);
    } finally {
      setIsMoving(false);
    }
  };

  const handleSelecionarSemana = async (semanaNum: number) => {
    setIsMoving(true);
    try {
      await onMoveWeek(semanaNum);
      setShowSeletorSemana(false);
      onClose();
    } catch (e) {
      console.error('Erro ao mover semana:', e);
    } finally {
      setIsMoving(false);
    }
  };

  const primaryBtnTextColor = isDark ? '#000000' : '#FFFFFF';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View
        style={[
          styles.overlay,
          { backgroundColor: isDark ? 'rgba(0, 0, 0, 0.75)' : 'rgba(0, 0, 0, 0.45)' },
        ]}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

        <View
          style={[
            styles.sheetContainer,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}
        >
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={{ flex: 1, marginRight: 12 }}>
              {(area || especialidade) && (
                <View style={styles.tagsRow}>
                  {area && (
                    <View
                      style={[
                        styles.areaBadge,
                        {
                          backgroundColor: theme.primarySubtle,
                          borderColor: theme.border,
                        },
                      ]}
                    >
                      <Text style={[styles.areaBadgeText, { color: theme.primary }]}>
                        {area.toUpperCase()}
                      </Text>
                    </View>
                  )}
                  {especialidade && (
                    <View
                      style={[
                        styles.especialidadeBadge,
                        {
                          backgroundColor: theme.primarySubtle,
                          borderColor: theme.border,
                        },
                      ]}
                    >
                      <Text style={[styles.especialidadeBadgeText, { color: theme.textSecondary }]}>
                        {especialidade}
                      </Text>
                    </View>
                  )}
                  {typeof semanaNumero === 'number' && semanaNumero > 0 && (
                    <View
                      style={[
                        styles.semanaBadge,
                        {
                          backgroundColor: theme.primarySubtle,
                          borderColor: theme.border,
                        },
                      ]}
                    >
                      <Text style={[styles.semanaBadgeText, { color: theme.primary }]}>
                        Semana {semanaNumero}
                      </Text>
                    </View>
                  )}
                </View>
              )}
              <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
                {topicoTitulo}
              </Text>
            </View>

            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={24} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {/* Box de Detalhes Ricos do Cronograma */}
            <View
              style={[
                styles.detailsBox,
                {
                  backgroundColor: isDark ? theme.surfaceCard : '#FFFFFF',
                  borderColor: theme.border,
                },
              ]}
            >
              {/* Material / Label */}
              {!!label && (
                <View style={[styles.infoRow, { borderBottomColor: theme.border }]}>
                  <View style={[styles.infoIconBox, { backgroundColor: theme.primarySubtle }]}>
                    <Feather name="bookmark" size={16} color={theme.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Material / Aula</Text>
                    <Text style={[styles.infoValue, { color: theme.text }]}>{label}</Text>
                  </View>
                </View>
              )}

              {/* Capítulo / Subtema (Detalhe) */}
              {!!detalhe && (
                <View style={[styles.infoRow, { borderBottomColor: theme.border }]}>
                  <View style={[styles.infoIconBox, { backgroundColor: theme.primarySubtle }]}>
                    <Feather name="file-text" size={16} color={theme.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Capítulo / Assunto</Text>
                    <Text style={[styles.infoValue, { color: theme.text }]}>{detalhe}</Text>
                  </View>
                </View>
              )}

              {/* Meta de Questões e Banco */}
              {(!!metaQuestoes || !!temaQuestoes) && (
                <View style={[styles.infoRow, { borderBottomColor: theme.border }]}>
                  <View style={[styles.infoIconBox, { backgroundColor: theme.primarySubtle }]}>
                    <Ionicons name="checkbox-outline" size={16} color={theme.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Fixação de Questões</Text>
                    <Text style={[styles.infoValue, { color: theme.text }]}>
                      {metaQuestoes ? `Meta de ${metaQuestoes} questões` : ''}
                      {metaQuestoes && temaQuestoes ? ' • ' : ''}
                      {temaQuestoes || ''}
                    </Text>
                  </View>
                </View>
              )}

              {/* Horário Agendado / Duração */}
              {item.hora_inicio ? (
                <View style={[styles.infoRow, { borderBottomColor: theme.border }]}>
                  <View style={[styles.infoIconBox, { backgroundColor: theme.primarySubtle }]}>
                    <Feather name="clock" size={16} color={theme.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Horário Programado</Text>
                    <Text style={[styles.infoValue, { color: theme.text }]}>
                      {item.hora_inicio} {item.hora_fim ? `às ${item.hora_fim}` : ''}
                      {item.duracao_minutos ? ` (${item.duracao_minutos} min)` : ''}
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* Local do Evento / Atividade */}
              {!!item.local && (
                <View style={[styles.infoRow, { borderBottomColor: theme.border }]}>
                  <View style={[styles.infoIconBox, { backgroundColor: theme.primarySubtle }]}>
                    <Ionicons name="location-outline" size={16} color={theme.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Local</Text>
                    <Text style={[styles.infoValue, { color: theme.text }]}>{item.local}</Text>
                  </View>
                </View>
              )}

              {/* Detalhes / Anotações */}
              {!!item.detalhes && item.detalhes !== detalhe && (
                <View style={[styles.infoRow, { borderBottomColor: theme.border }]}>
                  <View style={[styles.infoIconBox, { backgroundColor: theme.primarySubtle }]}>
                    <Ionicons name="document-text-outline" size={16} color={theme.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Anotações / Descrição</Text>
                    <Text style={[styles.infoValue, { color: theme.text }]}>{item.detalhes}</Text>
                  </View>
                </View>
              )}

              {/* Status */}
              <View style={[styles.infoRow, { borderBottomWidth: 0, paddingBottom: 0 }]}>
                {item.concluida ? (
                  <TouchableOpacity
                    style={[
                      styles.infoIconBox,
                      {
                        backgroundColor: 'rgba(16, 185, 129, 0.12)',
                        borderWidth: 1,
                        borderColor: 'rgba(16, 185, 129, 0.3)',
                      },
                    ]}
                    onPress={() => onToggleStatus?.(item)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color={theme.success}
                    />
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.infoIconBox, { backgroundColor: theme.primarySubtle }]}>
                    <Ionicons
                      name="ellipse-outline"
                      size={16}
                      color={theme.textSecondary}
                    />
                  </View>
                )}
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <TouchableOpacity
                    activeOpacity={item.concluida ? 0.7 : 1}
                    disabled={!item.concluida}
                    onPress={() => onToggleStatus?.(item)}
                  >
                    <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Status</Text>
                    <Text style={[styles.infoValue, { color: item.concluida ? theme.success : theme.textSecondary }]}>
                      {item.concluida ? 'Concluída' : 'Pendente'}
                    </Text>
                  </TouchableOpacity>

                  {item.concluida && (
                    <TouchableOpacity
                      style={[
                        styles.reabrirBadge,
                        {
                          backgroundColor: isDark ? '#202428' : theme.surface,
                          borderColor: theme.border,
                        },
                      ]}
                      onPress={() => onToggleStatus?.(item)}
                      activeOpacity={0.7}
                    >
                      <Feather name="rotate-ccw" size={11} color={theme.textSecondary} style={{ marginRight: 4 }} />
                      <Text style={[styles.reabrirBadgeText, { color: theme.textSecondary }]}>Desmarcar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>

            {/* Botão Praticar Questões (CTA Principal se for questões) */}
            {(item.icone === 'check-square' || item.passo_tipo === 'questoes' || !!metaQuestoes) && (
              <TouchableOpacity
                style={[styles.praticarCta, { backgroundColor: theme.primary }]}
                onPress={() => {
                  onClose();
                  onStartQuiz(item);
                }}
                activeOpacity={0.7}
              >
                <Feather name="play-circle" size={18} color={primaryBtnTextColor} style={{ marginRight: 8 }} />
                <Text style={[styles.praticarCtaText, { color: primaryBtnTextColor }]}>
                  Iniciar Treino de Questões
                </Text>
              </TouchableOpacity>
            )}

            {/* Seletor de Dia Expandido */}
            {showSeletorDia && (
              <View
                style={[
                  styles.remanejarBox,
                  {
                    backgroundColor: isDark ? theme.surfaceCard : '#FFFFFF',
                    borderColor: theme.border,
                  },
                ]}
              >
                <Text style={[styles.remanejarHeaderTitle, { color: theme.textSecondary }]}>
                  Escolha o novo dia da semana:
                </Text>
                <View style={styles.diasGrid}>
                  {DIAS_SEMANA_NOMES.map((d) => {
                    const isActive = diaSemana === d.id;
                    return (
                      <TouchableOpacity
                        key={d.id}
                        style={[
                          styles.diaPill,
                          {
                            backgroundColor: isDark ? theme.surfaceCard : theme.surface,
                            borderColor: theme.border,
                          },
                          isActive && {
                            backgroundColor: theme.primary,
                            borderColor: theme.primary,
                          },
                        ]}
                        onPress={() => handleSelecionarDia(d.id)}
                        disabled={isMoving}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.diaPillText,
                            { color: theme.textSecondary },
                            isActive && {
                              color: primaryBtnTextColor,
                              fontWeight: '800',
                              fontFamily: Fonts.extraBold,
                            },
                          ]}
                        >
                          {d.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Seletor de Semana Expandido */}
            {showSeletorSemana && (
              <View
                style={[
                  styles.remanejarBox,
                  {
                    backgroundColor: isDark ? theme.surfaceCard : '#FFFFFF',
                    borderColor: theme.border,
                  },
                ]}
              >
                <Text style={[styles.remanejarHeaderTitle, { color: theme.textSecondary }]}>
                  Mover para qual semana?
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.semanasScroll}>
                  {Array.from({ length: 45 }, (_, i) => i + 1).map((sNum) => {
                    const isActive = semanaNumero === sNum;
                    return (
                      <TouchableOpacity
                        key={sNum}
                        style={[
                          styles.semanaPill,
                          {
                            backgroundColor: isDark ? theme.surfaceCard : theme.surface,
                            borderColor: theme.border,
                          },
                          isActive && {
                            backgroundColor: theme.primary,
                            borderColor: theme.primary,
                          },
                        ]}
                        onPress={() => handleSelecionarSemana(sNum)}
                        disabled={isMoving}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.semanaPillText,
                            { color: theme.textSecondary },
                            isActive && {
                              color: primaryBtnTextColor,
                              fontWeight: '800',
                              fontFamily: Fonts.extraBold,
                            },
                          ]}
                        >
                          Semana {sNum}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Ações de Remanejamento (Residência) */}
            {isResidencia ? (
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={[
                    styles.remanejarBtn,
                    {
                      backgroundColor: isDark ? theme.surfaceCard : '#FFFFFF',
                      borderColor: theme.border,
                    },
                    showSeletorDia && {
                      backgroundColor: theme.primary,
                      borderColor: theme.primary,
                    },
                  ]}
                  onPress={() => {
                    setShowSeletorDia(!showSeletorDia);
                    setShowSeletorSemana(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="calendar-outline"
                    size={17}
                    color={showSeletorDia ? primaryBtnTextColor : theme.primary}
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[
                      styles.remanejarBtnText,
                      { color: showSeletorDia ? primaryBtnTextColor : theme.primary },
                    ]}
                  >
                    Mover de Dia
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.remanejarBtn,
                    {
                      backgroundColor: isDark ? theme.surfaceCard : '#FFFFFF',
                      borderColor: theme.border,
                    },
                    showSeletorSemana && {
                      backgroundColor: theme.primary,
                      borderColor: theme.primary,
                    },
                  ]}
                  onPress={() => {
                    setShowSeletorSemana(!showSeletorSemana);
                    setShowSeletorDia(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="repeat-outline"
                    size={17}
                    color={showSeletorSemana ? primaryBtnTextColor : theme.primary}
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[
                      styles.remanejarBtnText,
                      { color: showSeletorSemana ? primaryBtnTextColor : theme.primary },
                    ]}
                  >
                    Mover de Semana
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* Ações para Atividades Pessoais / Não Residência */
              <View style={styles.actionsRow}>
                {onEditAtividade && (
                  <TouchableOpacity
                    style={[
                      styles.editBtn,
                      {
                        backgroundColor: isDark ? theme.surfaceCard : '#FFFFFF',
                        borderColor: theme.border,
                      },
                    ]}
                    onPress={() => {
                      onClose();
                      onEditAtividade(item);
                    }}
                    activeOpacity={0.7}
                  >
                    <Feather name="edit-2" size={16} color={theme.text} style={{ marginRight: 6 }} />
                    <Text style={[styles.editBtnText, { color: theme.text }]}>Editar Evento</Text>
                  </TouchableOpacity>
                )}

                {onDeleteAtividade && (
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => {
                      onClose();
                      onDeleteAtividade(item);
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash-outline" size={16} color={theme.error} style={{ marginRight: 6 }} />
                    <Text style={[styles.deleteBtnText, { color: theme.error }]}>Excluir Evento</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
  },
  sheetContainer: {
    width: '100%',
    maxHeight: '85%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    borderWidth: 1,
    elevation: 0,
    shadowOpacity: 0,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  tagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  areaBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  areaBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: Fonts.bold,
    letterSpacing: 0.5,
  },
  especialidadeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  especialidadeBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: Fonts.semiBold,
  },
  semanaBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  semanaBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: Fonts.bold,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: Fonts.bold,
    lineHeight: 24,
  },
  scrollContent: {
    paddingBottom: 10,
  },
  detailsBox: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingBottom: 12,
    marginBottom: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  infoIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: Fonts.semiBold,
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: Fonts.semiBold,
    lineHeight: 20,
  },
  statusIconBtnCompleted: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  reabrirBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  reabrirBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: Fonts.semiBold,
  },
  praticarCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 16,
    elevation: 0,
    shadowOpacity: 0,
  },
  praticarCtaText: {
    fontSize: 15,
    fontWeight: '800',
    fontFamily: Fonts.extraBold,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  remanejarBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  remanejarBtnText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Fonts.bold,
  },
  editBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  editBtnText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Fonts.bold,
  },
  deleteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  deleteBtnText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Fonts.bold,
  },
  remanejarBox: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
  },
  remanejarHeaderTitle: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: Fonts.bold,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  diasGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  diaPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  diaPillText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: Fonts.semiBold,
  },
  semanasScroll: {
    flexDirection: 'row',
    gap: 8,
  },
  semanaPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  semanaPillText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: Fonts.semiBold,
  },
});
