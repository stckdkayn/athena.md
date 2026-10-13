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
import { Colors } from '@/constants/Colors';

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
  visible, onClose, targetTreinoGargalo,
  selectedMicroFocos, onToggleMicroFoco, onToggleTodos, todosMarcados,
  totalQuestoesSelecionadas, treinoFocadoLimit, setTreinoFocadoLimit,
  onUserEditLimit, onExecutarTreino, carregandoTreino
}: TreinoFocadoModalProps) {

  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isLandscape = windowWidth > windowHeight;

  if (!targetTreinoGargalo) return null;

  const getFocoRateColor = (taxa: number): string => {
    if (taxa > 75) return Colors.success;
    if (taxa >= 60) return Colors.primary;
    return Colors.error;
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
        style={styles.modalOverlay}
      >
        <TouchableOpacity
          style={styles.modalBackdropTouch}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={[styles.confirmModalCard, isLandscape && { maxWidth: 480 }]}>
          {/* Header */}
          <View style={styles.confirmModalHeaderRow}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <View style={styles.confirmModalTagRow}>
                <Ionicons name="flash" size={13} color={Colors.primary} style={{ marginRight: 4 }} />
                <Text style={styles.confirmModalTagText}>TREINO FOCADO</Text>
              </View>
              <Text style={styles.confirmModalTitle} numberOfLines={1}>
                {targetTreinoGargalo.foco}
              </Text>
              <Text style={styles.confirmModalSubtitle} numberOfLines={1}>
                {targetTreinoGargalo.tema} • {targetTreinoGargalo.especialidade}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.confirmModalCloseBtn}
              onPress={onClose}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          {/* Micro-focos */}
          {targetTreinoGargalo.microFocosOptions.length > 0 ? (
            <View style={styles.microFocosSection}>
              <View style={styles.microFocosSectionHeader}>
                <Text style={styles.microFocosSectionTitle}>
                  Micro-focos ({selectedMicroFocos.length}/{targetTreinoGargalo.microFocosOptions.length + (targetTreinoGargalo.geralQuestionIds.length > 0 ? 1 : 0)})
                </Text>
                <TouchableOpacity onPress={onToggleTodos} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.toggleAllBtnText}>
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
                  const corTaxa = opt.taxaGargalo !== undefined ? getFocoRateColor(opt.taxaGargalo) : Colors.primary;

                  return (
                    <TouchableOpacity
                      key={`${opt.nome}-${oIdx}`}
                      style={[styles.microFocoCheckboxRow, isSelected && styles.microFocoCheckboxRowSelected]}
                      activeOpacity={0.7}
                      onPress={() => onToggleMicroFoco(opt.nome)}
                    >
                      <Ionicons
                        name={isSelected ? 'checkbox' : 'square-outline'}
                        size={18}
                        color={isSelected ? Colors.primary : '#64748B'}
                      />
                      <View style={{ flex: 1, marginLeft: 8 }}>
                        <Text style={[styles.microFocoCheckboxLabel, isSelected && styles.microFocoCheckboxLabelSelected]} numberOfLines={1}>
                          {opt.nome}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {opt.taxaGargalo !== undefined && (
                          <View style={[styles.microFocoTaxaBadge, { borderColor: corTaxa }]}>
                            <Text style={[styles.microFocoTaxaBadgeText, { color: corTaxa }]}>{opt.taxaGargalo}%</Text>
                          </View>
                        )}
                        <Text style={styles.microFocoQtdText}>{opt.questoesCount} {opt.questoesCount === 1 ? 'questão' : 'questões'}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}

                {/* Questões gerais */}
                {targetTreinoGargalo.geralQuestionIds.length > 0 && (
                  <TouchableOpacity
                    style={[styles.microFocoCheckboxRow, selectedMicroFocos.includes('__geral__') && styles.microFocoCheckboxRowSelected]}
                    activeOpacity={0.7}
                    onPress={() => onToggleMicroFoco('__geral__')}
                  >
                    <Ionicons
                      name={selectedMicroFocos.includes('__geral__') ? 'checkbox' : 'square-outline'}
                      size={18}
                      color={selectedMicroFocos.includes('__geral__') ? Colors.primary : '#64748B'}
                    />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={[styles.microFocoCheckboxLabel, selectedMicroFocos.includes('__geral__') && styles.microFocoCheckboxLabelSelected]} numberOfLines={1}>
                        Questões gerais do foco
                      </Text>
                    </View>
                    <Text style={styles.microFocoQtdText}>
                      {targetTreinoGargalo.geralQuestionIds.length} {targetTreinoGargalo.geralQuestionIds.length === 1 ? 'questão' : 'questões'}
                    </Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            </View>
          ) : (
            <View style={styles.microFocoSingleNote}>
              <Ionicons name="information-circle-outline" size={16} color="#94A3B8" style={{ marginRight: 6 }} />
              <Text style={styles.microFocoSingleNoteText}>
                Todas as {targetTreinoGargalo.allQuestionsCount} questões disponíveis para este foco serão incluídas no treino.
              </Text>
            </View>
          )}

          {/* Rodapé: Iniciar Treino */}
          <View style={styles.confirmModalFooterRow}>
            <TouchableOpacity
              style={[styles.confirmModalActionBtn, (totalQuestoesSelecionadas === 0 || carregandoTreino) && { opacity: 0.4 }]}
              onPress={onExecutarTreino}
              disabled={totalQuestoesSelecionadas === 0 || carregandoTreino}
              activeOpacity={0.85}
            >
              {carregandoTreino ? (
                <ActivityIndicator size="small" color="#000000" />
              ) : (
                <>
                  <Ionicons name="play" size={16} color="#000000" style={{ marginRight: 6 }} />
                  <Text style={styles.confirmModalActionText}>Iniciar Treino</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.confirmLimitBox}>
              <Text style={styles.confirmLimitLabel}>QUESTÕES</Text>
              <TextInput
                style={styles.confirmLimitInput}
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
                placeholderTextColor={Colors.textSecondary}
              />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.78)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalBackdropTouch: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  microFocosSection: { width: '100%', marginBottom: 12 },
  microFocosSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 2 },
  microFocosSectionTitle: { fontSize: 12, fontWeight: '700', color: '#E2E8F0', textTransform: 'uppercase', letterSpacing: 0.5 },
  toggleAllBtnText: { fontSize: 12, fontWeight: '600', color: Colors.primary },
  microFocosScroll: { maxHeight: 180, width: '100%' },
  microFocosScrollContent: { gap: 6, paddingVertical: 2 },
  microFocoCheckboxRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#131518', borderWidth: 1, borderColor: '#22262B', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12 },
  microFocoCheckboxRowSelected: { backgroundColor: 'rgba(234, 225, 21, 0.06)', borderColor: 'rgba(234, 225, 21, 0.35)' },
  microFocoCheckboxLabel: { fontSize: 13, fontWeight: '500', color: '#94A3B8' },
  microFocoCheckboxLabelSelected: { fontWeight: '700', color: '#FFFFFF' },
  microFocoTaxaBadge: { borderWidth: 1, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)' },
  microFocoTaxaBadgeText: { fontSize: 10, fontWeight: '700' },
  microFocoQtdText: { fontSize: 11, color: '#64748B' },
  microFocoSingleNote: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#131518', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#22262B', marginBottom: 10, width: '100%' },
  microFocoSingleNoteText: { fontSize: 12, color: '#94A3B8', flex: 1, lineHeight: 16 },
  confirmModalCard: { width: '100%', maxWidth: 420, backgroundColor: '#181A1D', borderRadius: 20, borderWidth: 1.5, borderColor: '#34383C', paddingHorizontal: 18, paddingTop: 16, paddingBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 10 },
  confirmModalHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12, width: '100%' },
  confirmModalTagRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  confirmModalTagText: { fontSize: 10, fontWeight: '800', color: Colors.primary, letterSpacing: 0.8 },
  confirmModalTitle: { fontSize: 17, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.3 },
  confirmModalSubtitle: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  confirmModalCloseBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#24282D', alignItems: 'center', justifyContent: 'center' },
  confirmModalFooterRow: { flexDirection: 'row', alignItems: 'center', width: '100%', gap: 10, marginTop: 12 },
  confirmModalActionBtn: { flex: 1, flexDirection: 'row', height: 50, borderRadius: 12, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  confirmModalActionText: { fontSize: 14, fontWeight: '800', color: '#000000' },
  confirmLimitBox: { width: 76, height: 50, backgroundColor: '#121416', borderRadius: 12, borderWidth: 1.5, borderColor: '#2e3235', alignItems: 'center', justifyContent: 'center', paddingVertical: 2, paddingHorizontal: 4 },
  confirmLimitLabel: { fontSize: 8.5, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 0.5, marginBottom: 1 },
  confirmLimitInput: { fontSize: 18, fontWeight: '800', color: Colors.primary, textAlign: 'center', padding: 0, margin: 0, width: '100%' },
});
