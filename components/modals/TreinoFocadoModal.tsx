import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/context/ThemeContext';

// Tipagem idêntica à do index.tsx
export interface MicroFocoTreinoOption {
  nome: string;
  totalGargalo?: number;
  acertosGargalo?: number;
  taxaGargalo?: number;
  questoesCount: number;
  questionIds: string[];
}

export interface TargetTreinoGargalo {
  tema: string;
  especialidade: string;
  foco: string;
  microFocosOptions: MicroFocoTreinoOption[];
  geralQuestionIds: string[];
  allQuestionIds: string[];
  allQuestionsCount: number;
}

interface TreinoFocadoModalProps {
  visible: boolean;
  onClose: () => void;
  targetTreinoGargalo: TargetTreinoGargalo | null;
  selectedMicroFocos: string[];
  onToggleMicroFoco: (nome: string) => void;
  onToggleTodos: () => void;
  todosMarcados: boolean;
  totalQuestoesSelecionadas: number;
  treinoFocadoLimit: string;
  setTreinoFocadoLimit: (val: string) => void;
  onUserEditLimit: () => void;
  onExecutarTreino: () => void;
  carregandoTreino: boolean;
}

export function TreinoFocadoModal({
  visible,
  onClose,
  targetTreinoGargalo,
  selectedMicroFocos,
  onToggleMicroFoco,
  onToggleTodos,
  todosMarcados,
  totalQuestoesSelecionadas,
  treinoFocadoLimit,
  setTreinoFocadoLimit,
  onUserEditLimit,
  onExecutarTreino,
  carregandoTreino,
}: TreinoFocadoModalProps) {
  const { theme, isDark } = useAppTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isLandscape = windowWidth > windowHeight;

  if (!targetTreinoGargalo) return null;

  const getFocoRateColor = (taxa: number): string => {
    if (taxa > 75) return theme.success;
    if (taxa >= 60) return theme.primary;
    return theme.error;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[
          styles.modalOverlay,
          { backgroundColor: isDark ? 'rgba(0, 0, 0, 0.78)' : 'rgba(0, 0, 0, 0.45)' },
        ]}
      >
        <TouchableOpacity
          style={styles.modalBackdropTouch}
          activeOpacity={1}
          onPress={onClose}
        />
        <View
          style={[
            styles.confirmModalCard,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
            isLandscape && { maxWidth: 480 },
          ]}
        >
          {/* Header */}
          <View style={styles.confirmModalHeaderRow}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <View style={styles.confirmModalTagRow}>
                <Ionicons name="flash" size={13} color={theme.primary} style={{ marginRight: 4 }} />
                <Text style={[styles.confirmModalTagText, { color: theme.primary }]}>TREINO FOCADO</Text>
              </View>
              <Text style={[styles.confirmModalTitle, { color: theme.text }]} numberOfLines={1}>
                {targetTreinoGargalo.foco}
              </Text>
              <Text style={[styles.confirmModalSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                {targetTreinoGargalo.tema} • {targetTreinoGargalo.especialidade}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.confirmModalCloseBtn, { backgroundColor: theme.primarySubtle }]}
              onPress={onClose}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={18} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Micro-focos */}
          {targetTreinoGargalo.microFocosOptions.length > 0 ? (
            <View style={styles.microFocosSection}>
              <View style={styles.microFocosSectionHeader}>
                <Text style={[styles.microFocosSectionTitle, { color: theme.textSecondary }]}>
                  Micro-focos ({selectedMicroFocos.length}/
                  {targetTreinoGargalo.microFocosOptions.length +
                    (targetTreinoGargalo.geralQuestionIds.length > 0 ? 1 : 0)})
                </Text>
                <TouchableOpacity onPress={onToggleTodos} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={[styles.toggleAllBtnText, { color: theme.primary }]}>
                    {todosMarcados ? 'Desmarcar todos' : 'Marcar todos'}
                  </Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.microFocosScroll}
                contentContainerStyle={styles.microFocosScrollContent}
                showsVerticalScrollIndicator={true}
                nestedScrollEnabled
              >
                {targetTreinoGargalo.microFocosOptions.map((opt, oIdx) => {
                  const isSelected = selectedMicroFocos.includes(opt.nome);
                  const corTaxa = opt.taxaGargalo !== undefined ? getFocoRateColor(opt.taxaGargalo) : theme.primary;

                  return (
                    <TouchableOpacity
                      key={`${opt.nome}-${oIdx}`}
                      style={[
                        styles.microFocoCheckboxRow,
                        {
                          backgroundColor: isDark ? theme.surfaceCard : '#FFFFFF',
                          borderColor: theme.border,
                        },
                        isSelected && {
                          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : theme.primarySubtle,
                          borderColor: theme.border,
                        },
                      ]}
                      activeOpacity={0.7}
                      onPress={() => onToggleMicroFoco(opt.nome)}
                    >
                      <Ionicons
                        name={isSelected ? 'checkbox' : 'square-outline'}
                        size={18}
                        color={isSelected ? theme.primary : theme.textSecondary}
                      />
                      <View style={{ flex: 1, marginLeft: 8 }}>
                        <Text
                          style={[
                            styles.microFocoCheckboxLabel,
                            { color: theme.textSecondary },
                            isSelected && [styles.microFocoCheckboxLabelSelected, { color: theme.text }],
                          ]}
                          numberOfLines={1}
                        >
                          {opt.nome}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {opt.taxaGargalo !== undefined && (
                          <View
                            style={[
                              styles.microFocoTaxaBadge,
                              {
                                borderColor: corTaxa,
                                backgroundColor: isDark ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.04)',
                              },
                            ]}
                          >
                            <Text style={[styles.microFocoTaxaBadgeText, { color: corTaxa }]}>
                              {opt.taxaGargalo}%
                            </Text>
                          </View>
                        )}
                        <Text style={[styles.microFocoQtdText, { color: theme.textSecondary }]}>
                          {opt.questoesCount} {opt.questoesCount === 1 ? 'questão' : 'questões'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}

                {/* Questões gerais */}
                {targetTreinoGargalo.geralQuestionIds.length > 0 && (
                  <TouchableOpacity
                    style={[
                      styles.microFocoCheckboxRow,
                      {
                        backgroundColor: isDark ? theme.surfaceCard : '#FFFFFF',
                        borderColor: theme.border,
                      },
                      selectedMicroFocos.includes('__geral__') && {
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : theme.primarySubtle,
                        borderColor: theme.border,
                      },
                    ]}
                    activeOpacity={0.7}
                    onPress={() => onToggleMicroFoco('__geral__')}
                  >
                    <Ionicons
                      name={selectedMicroFocos.includes('__geral__') ? 'checkbox' : 'square-outline'}
                      size={18}
                      color={selectedMicroFocos.includes('__geral__') ? theme.primary : theme.textSecondary}
                    />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text
                        style={[
                          styles.microFocoCheckboxLabel,
                          { color: theme.textSecondary },
                          selectedMicroFocos.includes('__geral__') && [
                            styles.microFocoCheckboxLabelSelected,
                            { color: theme.text },
                          ],
                        ]}
                        numberOfLines={1}
                      >
                        Questões gerais do foco
                      </Text>
                    </View>
                    <Text style={[styles.microFocoQtdText, { color: theme.textSecondary }]}>
                      {targetTreinoGargalo.geralQuestionIds.length}{' '}
                      {targetTreinoGargalo.geralQuestionIds.length === 1 ? 'questão' : 'questões'}
                    </Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            </View>
          ) : (
            <View
              style={[
                styles.microFocoSingleNote,
                {
                  backgroundColor: isDark ? theme.surfaceCard : '#FFFFFF',
                  borderColor: theme.border,
                },
              ]}
            >
              <Ionicons
                name="information-circle-outline"
                size={16}
                color={theme.textSecondary}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.microFocoSingleNoteText, { color: theme.textSecondary }]}>
                Todas as {targetTreinoGargalo.allQuestionsCount} questões disponíveis para este foco serão incluídas no treino.
              </Text>
            </View>
          )}

          {/* Rodapé: Iniciar Treino */}
          <View style={styles.confirmModalFooterRow}>
            <TouchableOpacity
              style={[
                styles.confirmModalActionBtn,
                { backgroundColor: theme.primary },
                (totalQuestoesSelecionadas === 0 || carregandoTreino) && { opacity: 0.4 },
              ]}
              onPress={onExecutarTreino}
              disabled={totalQuestoesSelecionadas === 0 || carregandoTreino}
              activeOpacity={0.7}
            >
              {carregandoTreino ? (
                <ActivityIndicator size="small" color={isDark ? '#000000' : '#FFFFFF'} />
              ) : (
                <>
                  <Ionicons
                    name="play"
                    size={16}
                    color={isDark ? '#000000' : '#FFFFFF'}
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[
                      styles.confirmModalActionText,
                      { color: isDark ? '#000000' : '#FFFFFF' },
                    ]}
                  >
                    Iniciar Treino
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <View
              style={[
                styles.confirmLimitBox,
                {
                  backgroundColor: isDark ? '#121416' : '#FFFFFF',
                  borderColor: theme.border,
                },
              ]}
            >
              <Text style={[styles.confirmLimitLabel, { color: theme.textSecondary }]}>QUESTÕES</Text>
              <TextInput
                style={[styles.confirmLimitInput, { color: theme.primary }]}
                value={treinoFocadoLimit}
                onChangeText={(text) => {
                  onUserEditLimit();
                  setTreinoFocadoLimit(text.replace(/[^0-9]/g, ''));
                }}
                onBlur={() => {
                  if (!treinoFocadoLimit.trim() || parseInt(treinoFocadoLimit, 10) <= 0) {
                    setTreinoFocadoLimit(String(totalQuestoesSelecionadas || 1));
                  }
                }}
                keyboardType="number-pad"
                maxLength={3}
                selectTextOnFocus
                placeholder={String(totalQuestoesSelecionadas || 10)}
                placeholderTextColor={theme.textSecondary}
              />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalBackdropTouch: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  microFocosSection: {
    width: '100%',
    marginBottom: 12,
  },
  microFocosSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  microFocosSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  toggleAllBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
  microFocosScroll: {
    maxHeight: 180,
    width: '100%',
  },
  microFocosScrollContent: {
    gap: 6,
    paddingVertical: 2,
  },
  microFocoCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  microFocoCheckboxLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  microFocoCheckboxLabelSelected: {
    fontWeight: '700',
  },
  microFocoTaxaBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  microFocoTaxaBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  microFocoQtdText: {
    fontSize: 11,
  },
  microFocoSingleNote: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    marginBottom: 10,
    width: '100%',
  },
  microFocoSingleNoteText: {
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
  confirmModalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 16,
    elevation: 0,
    shadowOpacity: 0,
  },
  confirmModalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
    width: '100%',
  },
  confirmModalTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  confirmModalTagText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  confirmModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  confirmModalSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  confirmModalCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmModalFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 10,
    marginTop: 12,
  },
  confirmModalActionBtn: {
    flex: 1,
    flexDirection: 'row',
    height: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmModalActionText: {
    fontSize: 14,
    fontWeight: '800',
  },
  confirmLimitBox: {
    width: 76,
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  confirmLimitLabel: {
    fontSize: 8.5,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 1,
  },
  confirmLimitInput: {
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
    padding: 0,
    margin: 0,
    width: '100%',
  },
});
