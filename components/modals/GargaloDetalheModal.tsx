import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';

// Tipagens (Ajuste a importação de FocoMetrica etc., do seu serviço/tela se precisar)
interface MicroFocoMetrica {
  nome: string;
  total: number;
  acertos: number;
  taxa: number;
}

export interface FocoMetrica {
  nome: string;
  total: number;
  acertos: number;
  taxa: number;
  microFocos?: MicroFocoMetrica[];
}

export interface BottleneckTheme {
  tema: string;
  especialidade: string;
  total: number;
  acertos: number;
  taxa: number;
  focos: FocoMetrica[];
}

interface GargaloDetalheModalProps {
  visible: boolean;
  onClose: () => void;
  gargalo: BottleneckTheme | null;
  onPrepararTreino: (foco: FocoMetrica) => void;
}

export function GargaloDetalheModal({ visible, onClose, gargalo, onPrepararTreino }: GargaloDetalheModalProps) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isLandscape = windowWidth > windowHeight;

  if (!gargalo) return null;

  // Helper local de cor para a taxa
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
      <View style={styles.modalOverlay}>
        <TouchableOpacity
          style={styles.modalBackdropTouch}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={[styles.gargaloModalCard, isLandscape && { maxHeight: '90%', maxWidth: 540 }]}>
          {/* Cabeçalho do Modal */}
          <View style={styles.gargaloModalHeader}>
            <View style={styles.gargaloModalTitleCol}>
              <View style={styles.gargaloModalTagRow}>
                <View style={styles.gargaloModalBadge}>
                  <Ionicons name="alert-circle" size={13} color={Colors.error} style={{ marginRight: 4 }} />
                  <Text style={styles.gargaloModalBadgeText}>Gargalo de Rendimento</Text>
                </View>
              </View>
              <Text style={styles.gargaloModalTema} numberOfLines={2}>
                {gargalo.tema}
              </Text>
              <Text style={styles.gargaloModalEspecialidade} numberOfLines={1}>
                {gargalo.especialidade}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.gargaloModalCloseBtn}
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Resumo Geral do Tema */}
          <View style={styles.gargaloModalSummaryRow}>
            <View style={styles.gargaloModalSummaryItem}>
              <Text style={styles.gargaloModalSummaryLabel}>Total</Text>
              <Text style={styles.gargaloModalSummaryVal}>{gargalo.total}</Text>
            </View>
            <View style={styles.gargaloModalSummaryDivider} />
            <View style={styles.gargaloModalSummaryItem}>
              <Text style={styles.gargaloModalSummaryLabel}>Acertos</Text>
              <Text style={[styles.gargaloModalSummaryVal, { color: Colors.success }]}>
                {gargalo.acertos}
              </Text>
            </View>
            <View style={styles.gargaloModalSummaryDivider} />
            <View style={styles.gargaloModalSummaryItem}>
              <Text style={styles.gargaloModalSummaryLabel}>Erros</Text>
              <Text style={[styles.gargaloModalSummaryVal, { color: Colors.error }]}>
                {gargalo.total - gargalo.acertos}
              </Text>
            </View>
            <View style={styles.gargaloModalSummaryDivider} />
            <View style={styles.gargaloModalSummaryItem}>
              <Text style={styles.gargaloModalSummaryLabel}>Taxa Geral</Text>
              <Text
                style={[styles.gargaloModalSummaryVal, { color: gargalo.taxa < 50 ? Colors.error : '#F59E0B' }]}
              >
                {gargalo.taxa}%
              </Text>
            </View>
          </View>

          {/* Subtítulo da seção de focos */}
          <View style={styles.gargaloModalFocosHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="pulse-outline" size={16} color={Colors.primary} style={{ marginRight: 6 }} />
              <Text style={styles.gargaloModalFocosTitle}>Desempenho por Foco Clínico</Text>
            </View>
          </View>

          {/* Lista com scroll dos focos */}
          <ScrollView
            style={styles.gargaloModalScroll}
            contentContainerStyle={styles.gargaloModalScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {gargalo.focos.length > 0 ? (
              gargalo.focos.map((foco, fIdx) => {
                const corTaxa = getFocoRateColor(foco.taxa);
                const errosFoco = foco.total - foco.acertos;

                return (
                  <TouchableOpacity
                    key={`${foco.nome}-${fIdx}`}
                    style={styles.gargaloModalFocoCard}
                    activeOpacity={0.7}
                    onPress={() => onPrepararTreino(foco)}
                  >
                    <View style={styles.gargaloModalFocoTop}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <View style={styles.gargaloModalFocoNomeRow}>
                          <Text style={styles.gargaloModalFocoNome} numberOfLines={1}>
                            {foco.nome}
                          </Text>
                        </View>
                        <View style={styles.gargaloModalFocoCounters}>
                          <Text style={styles.gargaloModalFocoHitText}>
                            {foco.acertos} {foco.acertos === 1 ? 'acerto' : 'acertos'}
                          </Text>
                          <Text style={styles.gargaloModalFocoDot}>•</Text>
                          <Text style={styles.gargaloModalFocoErrText}>
                            {errosFoco} {errosFoco === 1 ? 'erro' : 'erros'}
                          </Text>
                          <Text style={styles.gargaloModalFocoDot}>•</Text>
                          <Text style={styles.gargaloModalFocoTotalText}>
                            {foco.total} {foco.total === 1 ? 'questão' : 'questões'}
                          </Text>
                        </View>
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={[styles.gargaloModalFocoRateBadge, { borderColor: corTaxa }]}>
                          <Text style={[styles.gargaloModalFocoRateText, { color: corTaxa }]}>
                            {foco.taxa}%
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} style={{ marginLeft: 8 }} />
                      </View>
                    </View>

                    {/* Barra de progresso visual */}
                    <View style={styles.gargaloModalProgressBarBg}>
                      <View
                        style={[
                          styles.gargaloModalProgressBarFill,
                          { width: `${Math.max(foco.taxa, 0)}%`, backgroundColor: corTaxa },
                        ]}
                      />
                    </View>

                    {/* Detalhamento de Micro-focos quando disponíveis */}
                    {foco.microFocos && foco.microFocos.length > 0 && (
                      <View style={styles.gargaloModalMicroFocosWrapper}>
                        <View style={styles.gargaloModalMicroFocosHeader}>
                          <Ionicons name="git-commit-outline" size={12} color={Colors.primary} style={{ marginRight: 4 }} />
                          <Text style={styles.gargaloModalMicroFocosHeaderText}>
                            Micro-focos ({foco.microFocos.length})
                          </Text>
                        </View>
                        <View style={styles.gargaloModalMicroFocosGrid}>
                          {foco.microFocos.map((mf, mIdx) => {
                            const mfCor = getFocoRateColor(mf.taxa);
                            return (
                              <View key={`${mf.nome}-${mIdx}`} style={styles.gargaloModalMicroFocoChip}>
                                <Text style={styles.gargaloModalMicroFocoChipText} numberOfLines={1}>{mf.nome}</Text>
                                <View style={[styles.gargaloModalMicroFocoBadge, { borderColor: mfCor }]}>
                                  <Text style={[styles.gargaloModalMicroFocoBadgeText, { color: mfCor }]}>
                                    {mf.acertos}/{mf.total} ({mf.taxa}%)
                                  </Text>
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })
            ) : (
              <View style={styles.gargaloModalEmpty}>
                <Text style={styles.gargaloModalEmptyText}>Nenhum foco clínico registrado para este tema.</Text>
              </View>
            )}
          </ScrollView>

          <TouchableOpacity style={styles.gargaloModalBottomBtn} activeOpacity={0.8} onPress={onClose}>
            <Text style={styles.gargaloModalBottomBtnText}>Fechar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.78)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalBackdropTouch: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  gargaloModalCard: { width: '100%', maxWidth: 440, maxHeight: '84%', backgroundColor: '#1A1D20', borderRadius: 20, borderWidth: 1, borderColor: '#2E3338', padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 10 },
  gargaloModalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 },
  gargaloModalTitleCol: { flex: 1, marginRight: 10 },
  gargaloModalTagRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap', gap: 6 },
  gargaloModalBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(239, 68, 68, 0.15)', borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  gargaloModalBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.error },
  gargaloModalEspecialidade: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginTop: 2 },
  gargaloModalTema: { fontSize: 18, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.3 },
  gargaloModalCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#262A2E', alignItems: 'center', justifyContent: 'center' },
  gargaloModalSummaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#121416', borderRadius: 12, borderWidth: 1, borderColor: '#23272B', paddingVertical: 10, paddingHorizontal: 12, marginBottom: 14 },
  gargaloModalSummaryItem: { flex: 1, alignItems: 'center' },
  gargaloModalSummaryLabel: { fontSize: 10, fontWeight: '600', color: Colors.textSecondary, textTransform: 'uppercase', marginBottom: 2 },
  gargaloModalSummaryVal: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  gargaloModalSummaryDivider: { width: 1, height: 24, backgroundColor: '#23272B' },
  gargaloModalFocosHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  gargaloModalFocosTitle: { fontSize: 13, fontWeight: '700', color: Colors.primary, textTransform: 'uppercase', letterSpacing: 0.5 },
  gargaloModalScroll: { flexShrink: 1, marginBottom: 14 },
  gargaloModalScrollContent: { paddingBottom: 4, gap: 10 },
  gargaloModalFocoCard: { backgroundColor: '#121416', borderRadius: 12, borderWidth: 1, borderColor: '#25292D', padding: 12 },
  gargaloModalFocoTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  gargaloModalFocoNomeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  gargaloModalFocoNome: { fontSize: 14, fontWeight: '700', color: '#FFFFFF', marginBottom: 3 },
  gargaloModalFocoCounters: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  gargaloModalFocoHitText: { fontSize: 11, fontWeight: '600', color: Colors.success },
  gargaloModalFocoDot: { fontSize: 11, color: Colors.textSecondary, marginHorizontal: 5 },
  gargaloModalFocoErrText: { fontSize: 11, fontWeight: '600', color: Colors.error },
  gargaloModalFocoTotalText: { fontSize: 11, fontWeight: '500', color: Colors.textSecondary },
  gargaloModalFocoRateBadge: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: 'rgba(0, 0, 0, 0.4)' },
  gargaloModalFocoRateText: { fontSize: 12, fontWeight: '800' },
  gargaloModalProgressBarBg: { height: 6, width: '100%', backgroundColor: '#262A2E', borderRadius: 3, overflow: 'hidden' },
  gargaloModalProgressBarFill: { height: '100%', borderRadius: 3 },
  gargaloModalMicroFocosWrapper: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#1F2327' },
  gargaloModalMicroFocosHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  gargaloModalMicroFocosHeaderText: { fontSize: 10, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 },
  gargaloModalMicroFocosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  gargaloModalMicroFocoChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#181B1E', borderRadius: 8, borderWidth: 1, borderColor: '#2A2E33', paddingVertical: 4, paddingHorizontal: 8, gap: 6 },
  gargaloModalMicroFocoChipText: { fontSize: 11, fontWeight: '600', color: '#D1D5DB' },
  gargaloModalMicroFocoBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)' },
  gargaloModalMicroFocoBadgeText: { fontSize: 10, fontWeight: '700' },
  gargaloModalEmpty: { paddingVertical: 20, alignItems: 'center' },
  gargaloModalEmptyText: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center' },
  gargaloModalBottomBtn: { backgroundColor: '#262A2E', borderRadius: 12, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#33383D' },
  gargaloModalBottomBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});
