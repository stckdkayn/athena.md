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
import { Colors } from '@/constants/Colors';
import { Fonts } from '@/constants/Typography';
import { CATEGORIA_CORES } from '@/app/(tabs)/index';

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

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

        <View style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={{ flex: 1, marginRight: 12 }}>
              {(area || especialidade) && (
                <View style={styles.tagsRow}>
                  {area && (
                    <View style={styles.areaBadge}>
                      <Text style={styles.areaBadgeText}>{area.toUpperCase()}</Text>
                    </View>
                  )}
                  {especialidade && (
                    <View style={styles.especialidadeBadge}>
                      <Text style={styles.especialidadeBadgeText}>{especialidade}</Text>
                    </View>
                  )}
                  {typeof semanaNumero === 'number' && semanaNumero > 0 && (
                    <View style={styles.semanaBadge}>
                      <Text style={styles.semanaBadgeText}>Semana {semanaNumero}</Text>
                    </View>
                  )}
                </View>
              )}
              <Text style={styles.title} numberOfLines={2}>
                {topicoTitulo}
              </Text>
            </View>

            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {/* Box de Detalhes Ricos do Cronograma */}
            <View style={styles.detailsBox}>
              {/* Material / Label */}
              {!!label && (
                <View style={styles.infoRow}>
                  <View style={styles.infoIconBox}>
                    <Feather name="bookmark" size={16} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>Material / Aula</Text>
                    <Text style={styles.infoValue}>{label}</Text>
                  </View>
                </View>
              )}

              {/* Capítulo / Subtema (Detalhe) */}
              {!!detalhe && (
                <View style={styles.infoRow}>
                  <View style={styles.infoIconBox}>
                    <Feather name="file-text" size={16} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>Capítulo / Assunto</Text>
                    <Text style={styles.infoValue}>{detalhe}</Text>
                  </View>
                </View>
              )}

              {/* Meta de Questões e Banco */}
              {(!!metaQuestoes || !!temaQuestoes) && (
                <View style={styles.infoRow}>
                  <View style={styles.infoIconBox}>
                    <Ionicons name="checkbox-outline" size={16} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>Fixação de Questões</Text>
                    <Text style={styles.infoValue}>
                      {metaQuestoes ? `Meta de ${metaQuestoes} questões` : ''}
                      {metaQuestoes && temaQuestoes ? ' • ' : ''}
                      {temaQuestoes || ''}
                    </Text>
                  </View>
                </View>
              )}

              {/* Horário Agendado / Duração */}
              {item.hora_inicio ? (
                <View style={styles.infoRow}>
                  <View style={styles.infoIconBox}>
                    <Feather name="clock" size={16} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>Horário Programado</Text>
                    <Text style={styles.infoValue}>
                      {item.hora_inicio} {item.hora_fim ? `às ${item.hora_fim}` : ''}
                      {item.duracao_minutos ? ` (${item.duracao_minutos} min)` : ''}
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* Status */}
              <View style={[styles.infoRow, { borderBottomWidth: 0, paddingBottom: 0 }]}>
                <View style={styles.infoIconBox}>
                  <Ionicons
                    name={item.concluida ? 'checkmark-circle' : 'ellipse-outline'}
                    size={16}
                    color={item.concluida ? Colors.success : Colors.textSecondary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>Status</Text>
                  <Text style={[styles.infoValue, { color: item.concluida ? Colors.success : Colors.textSecondary }]}>
                    {item.concluida ? 'Concluída' : 'Pendente'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Botão Praticar Questões (CTA Principal se for questões) */}
            {(item.icone === 'check-square' || item.passo_tipo === 'questoes' || !!metaQuestoes) && (
              <TouchableOpacity
                style={styles.praticarCta}
                onPress={() => {
                  onClose();
                  onStartQuiz(item);
                }}
                activeOpacity={0.85}
              >
                <Feather name="play-circle" size={18} color="#000" style={{ marginRight: 8 }} />
                <Text style={styles.praticarCtaText}>Iniciar Treino de Questões</Text>
              </TouchableOpacity>
            )}

            {/* Seletor de Dia Expandido */}
            {showSeletorDia && (
              <View style={styles.remanejarBox}>
                <Text style={styles.remanejarHeaderTitle}>Escolha o novo dia da semana:</Text>
                <View style={styles.diasGrid}>
                  {DIAS_SEMANA_NOMES.map((d) => (
                    <TouchableOpacity
                      key={d.id}
                      style={[
                        styles.diaPill,
                        diaSemana === d.id && styles.diaPillActive,
                      ]}
                      onPress={() => handleSelecionarDia(d.id)}
                      disabled={isMoving}
                    >
                      <Text style={[styles.diaPillText, diaSemana === d.id && styles.diaPillTextActive]}>
                        {d.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Seletor de Semana Expandido */}
            {showSeletorSemana && (
              <View style={styles.remanejarBox}>
                <Text style={styles.remanejarHeaderTitle}>Mover para qual semana?</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.semanasScroll}>
                  {Array.from({ length: 45 }, (_, i) => i + 1).map((sNum) => (
                    <TouchableOpacity
                      key={sNum}
                      style={[
                        styles.semanaPill,
                        semanaNumero === sNum && styles.semanaPillActive,
                      ]}
                      onPress={() => handleSelecionarSemana(sNum)}
                      disabled={isMoving}
                    >
                      <Text style={[styles.semanaPillText, semanaNumero === sNum && styles.semanaPillTextActive]}>
                        Semana {sNum}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Ações de Remanejamento (Residência) */}
            {isResidencia ? (
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={[styles.remanejarBtn, showSeletorDia && styles.remanejarBtnActive]}
                  onPress={() => {
                    setShowSeletorDia(!showSeletorDia);
                    setShowSeletorSemana(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="calendar-outline" size={17} color={showSeletorDia ? '#000' : Colors.primary} style={{ marginRight: 6 }} />
                  <Text style={[styles.remanejarBtnText, showSeletorDia && styles.remanejarBtnTextActive]}>
                    Mover de Dia
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.remanejarBtn, showSeletorSemana && styles.remanejarBtnActive]}
                  onPress={() => {
                    setShowSeletorSemana(!showSeletorSemana);
                    setShowSeletorDia(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="repeat-outline" size={17} color={showSeletorSemana ? '#000' : Colors.primary} style={{ marginRight: 6 }} />
                  <Text style={[styles.remanejarBtnText, showSeletorSemana && styles.remanejarBtnTextActive]}>
                    Mover de Semana
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* Ações para Atividades Pessoais / Não Residência */
              <View style={styles.actionsRow}>
                {onEditAtividade && (
                  <TouchableOpacity
                    style={styles.editBtn}
                    onPress={() => {
                      onClose();
                      onEditAtividade(item);
                    }}
                    activeOpacity={0.8}
                  >
                    <Feather name="edit-2" size={16} color={Colors.text} style={{ marginRight: 6 }} />
                    <Text style={styles.editBtnText}>Editar Evento</Text>
                  </TouchableOpacity>
                )}

                {onDeleteAtividade && (
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => {
                      onClose();
                      onDeleteAtividade(item);
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="trash-outline" size={16} color="#EF4444" style={{ marginRight: 6 }} />
                    <Text style={styles.deleteBtnText}>Excluir Evento</Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
  },
  sheetContainer: {
    backgroundColor: Colors.surface,
    width: '100%',
    maxHeight: '85%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    borderWidth: 1,
    borderColor: '#2e3235',
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
    backgroundColor: 'rgba(234, 225, 21, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(234, 225, 21, 0.25)',
  },
  areaBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: Fonts.extraBold,
    color: Colors.primary,
    letterSpacing: 0.5,
  },
  especialidadeBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  especialidadeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: Fonts.bold,
    color: Colors.text,
  },
  semanaBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  semanaBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: Fonts.bold,
    color: '#60A5FA',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: Fonts.bold,
    color: Colors.text,
    lineHeight: 24,
  },
  scrollContent: {
    paddingBottom: 10,
  },
  detailsBox: {
    backgroundColor: '#1b1d1f',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2e3235',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingBottom: 12,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#282b2e',
    gap: 12,
  },
  infoIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#232628',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  infoLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
    fontFamily: Fonts.semiBold,
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  infoValue: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '600',
    fontFamily: Fonts.semiBold,
    lineHeight: 20,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 4,
  },
  toggleBtnCompleted: {
    backgroundColor: '#282b2e',
  },
  toggleBtnText: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: Fonts.extraBold,
    color: '#000',
  },
  toggleBtnTextCompleted: {
    color: Colors.text,
  },
  praticarCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 16,
  },
  praticarCtaText: {
    fontSize: 15,
    fontWeight: '800',
    fontFamily: Fonts.extraBold,
    color: '#000',
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
    borderRadius: 12,
    backgroundColor: '#1b1d1f',
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  remanejarBtnActive: {
    backgroundColor: Colors.primary,
  },
  remanejarBtnText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Fonts.bold,
    color: Colors.primary,
  },
  remanejarBtnTextActive: {
    color: '#000',
  },
  editBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#1b1d1f',
    borderWidth: 1,
    borderColor: '#383d42',
  },
  editBtnText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Fonts.bold,
    color: Colors.text,
  },
  deleteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#EF444415',
    borderWidth: 1,
    borderColor: '#EF444440',
  },
  deleteBtnText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Fonts.bold,
    color: '#EF4444',
  },
  remanejarBox: {
    backgroundColor: '#1b1d1f',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#2e3235',
  },
  remanejarHeaderTitle: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
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
    borderRadius: 10,
    backgroundColor: '#232628',
    borderWidth: 1,
    borderColor: '#2e3235',
  },
  diaPillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  diaPillText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
    fontFamily: Fonts.semiBold,
  },
  diaPillTextActive: {
    color: '#000',
    fontWeight: '800',
    fontFamily: Fonts.extraBold,
  },
  semanasScroll: {
    flexDirection: 'row',
    gap: 8,
  },
  semanaPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#232628',
    borderWidth: 1,
    borderColor: '#2e3235',
  },
  semanaPillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  semanaPillText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
    fontFamily: Fonts.semiBold,
  },
  semanaPillTextActive: {
    color: '#000',
    fontWeight: '800',
    fontFamily: Fonts.extraBold,
  },
});
