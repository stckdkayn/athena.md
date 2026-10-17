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
import { ActiveThemeColors } from '@/constants/Colors';
import { useAppTheme } from '@/context/ThemeContext';
import ThemeDonutChart, { ThemeDistributionSegment } from '@/components/ThemeDonutChart';

export interface TemaDetalhadoItem {
  nome: string;
  especialidade?: string;
  total: number;
  acertos: number;
  taxa: number; // % de acertos
  percentualVolume: number; // % em relação ao total de questões feitas no período
  color: string;
}

interface TemasDetalheModalProps {
  visible: boolean;
  onClose: () => void;
  temas: TemaDetalhadoItem[];
  totalQuestoes: number;
  totalAcertos: number;
  taxaGlobal: number;
  timeRangeLabel: string;
}

export function TemasDetalheModal({
  visible,
  onClose,
  temas,
  totalQuestoes,
  totalAcertos,
  taxaGlobal,
  timeRangeLabel,
}: TemasDetalheModalProps) {
  const { colors: theme, isDark } = useAppTheme();
  const styles = React.useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isLandscape = windowWidth > windowHeight;


  // Segmentos para o gráfico em anel maior
  // Top 5 temas + Outros se houver mais de 5
  const chartSegments: ThemeDistributionSegment[] = React.useMemo(() => {
    if (temas.length === 0) return [];
    if (temas.length <= 5) {
      return temas.map((t) => ({
        name: t.nome,
        count: t.total,
        percent: t.percentualVolume,
        color: t.color,
      }));
    }
    const top4 = temas.slice(0, 4).map((t) => ({
      name: t.nome,
      count: t.total,
      percent: t.percentualVolume,
      color: t.color,
    }));
    const outrosCount = temas.slice(4).reduce((sum, t) => sum + t.total, 0);
    const outrosPct = totalQuestoes > 0 ? Math.round((outrosCount / totalQuestoes) * 100) : 0;
    return [
      ...top4,
      {
        name: 'Outros temas',
        count: outrosCount,
        percent: outrosPct,
        color: '#64748B',
      },
    ];
  }, [temas, totalQuestoes]);

  // Cor do badge de taxa de acerto
  const getTaxaCor = (taxa: number): string => {
    if (taxa >= 75) return '#10B981';
    if (taxa >= 50) return '#F59E0B';
    return '#EF4444';
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
        <View style={[styles.modalCard, isLandscape && { maxHeight: '90%', maxWidth: 540 }]}>
          {/* Cabeçalho do Modal */}
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleCol}>
              <View style={styles.modalBadgeRow}>
                <View style={styles.modalBadge}>
                  <Ionicons name="pie-chart" size={13} color="#EAE115" style={{ marginRight: 4 }} />
                  <Text style={styles.modalBadgeText}>Distribuição de Temas</Text>
                </View>
                <Text style={styles.periodoTag}>{timeRangeLabel}</Text>
              </View>

              <Text style={styles.modalTitle}>
                Temas Praticados
              </Text>
              <Text style={styles.modalSubtitle}>
                {totalQuestoes} {totalQuestoes === 1 ? 'questão resolvida' : 'questões resolvidas'} • {totalAcertos} acertos ({taxaGlobal}%)
              </Text>
            </View>

            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.modalScrollView}
            contentContainerStyle={styles.modalScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Seção Gráfica Ampliada */}
            {totalQuestoes > 0 && chartSegments.length > 0 ? (
              <View style={styles.chartSectionBox}>
                <View style={styles.donutWrapper}>
                  <ThemeDonutChart
                    segments={chartSegments}
                    total={totalQuestoes}
                    size={110}
                    strokeWidth={11}
                    showCenterText={true}
                    centerLabel="questões"
                  />
                </View>

                {/* Resumo lateral de métricas */}
                <View style={styles.chartSummaryCol}>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Total de Temas</Text>
                    <Text style={styles.summaryValue}>{temas.length}</Text>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Maior Volume</Text>
                    <Text style={styles.summaryValue} numberOfLines={1}>
                      {temas[0]?.nome || '--'}
                    </Text>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Aproveitamento</Text>
                    <Text style={[styles.summaryValue, { color: getTaxaCor(taxaGlobal) }]}>
                      {taxaGlobal}%
                    </Text>
                  </View>
                </View>
              </View>
            ) : null}

            {/* Cabeçalho da Lista de Temas */}
            <View style={styles.listHeaderRow}>
              <Text style={styles.listSectionTitle}>
                TODOS OS TEMAS ({temas.length})
              </Text>
              <Text style={styles.listSectionHint}>
                Ordenados por volume
              </Text>
            </View>

            {/* Lista Completa de Temas */}
            {temas.length > 0 ? (
              <View style={styles.temasList}>
                {temas.map((item, idx) => {
                  const corTaxa = getTaxaCor(item.taxa);
                  return (
                    <View key={`tema-detalhe-${item.nome}-${idx}`} style={styles.temaCardItem}>
                      <View style={styles.temaItemTopRow}>
                        <View style={styles.temaItemNameCol}>
                          <View style={styles.temaTitleWithDot}>
                            <View style={[styles.temaDot, { backgroundColor: item.color }]} />
                            <Text style={styles.temaItemNome} numberOfLines={1}>
                              {item.nome}
                            </Text>
                          </View>
                          {item.especialidade ? (
                            <Text style={styles.temaItemEsp} numberOfLines={1}>
                              {item.especialidade}
                            </Text>
                          ) : null}
                        </View>

                        {/* Badge de Taxa de Acerto */}
                        <View style={[styles.taxaBadge, { borderColor: corTaxa, backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.8)' }]}>
                          <Text style={[styles.taxaBadgeText, { color: corTaxa }]}>
                            {item.taxa}% acerto
                          </Text>
                        </View>
                      </View>

                      {/* Barra de Progresso de Acertos do Tema */}
                      <View style={styles.progressTrack}>
                        <View
                          style={[
                            styles.progressFill,
                            {
                              width: `${Math.min(100, item.taxa)}%`,
                              backgroundColor: corTaxa,
                            },
                          ]}
                        />
                      </View>

                      {/* Rodapé do Item: Volume e Acertos */}
                      <View style={styles.temaItemFooter}>
                        <Text style={styles.temaItemVolumeText}>
                          {item.total} {item.total === 1 ? 'questão' : 'questões'} ({item.percentualVolume}% do volume)
                        </Text>
                        <Text style={styles.temaItemAcertosText}>
                          {item.acertos} de {item.total} certas
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <Ionicons name="folder-open-outline" size={36} color={theme.textMuted} style={{ marginBottom: 8 }} />
                <Text style={styles.emptyTitle}>Nenhum tema registrado</Text>
                <Text style={styles.emptySubtitle}>
                  Pratique questões para mapear os temas respondidos neste período.
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(theme: ActiveThemeColors, isDark: boolean) {
  return StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
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
    modalCard: {
      width: '100%',
      maxWidth: 480,
      maxHeight: '85%',
      backgroundColor: theme.surfaceCard || theme.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.border,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.4 : 0.15,
      shadowRadius: 20,
      elevation: 8,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.borderSubtle,
    },
    modalTitleCol: {
      flex: 1,
      marginRight: 12,
    },
    modalBadgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 6,
    },
    modalBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(234, 225, 21, 0.12)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: 'rgba(234, 225, 21, 0.25)',
    },
    modalBadgeText: {
      fontSize: 10,
      fontWeight: '800',
      color: '#EAE115',
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    periodoTag: {
      fontSize: 10.5,
      fontWeight: '600',
      color: theme.textSecondary,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '900',
      color: theme.text,
      letterSpacing: -0.3,
      marginBottom: 2,
    },
    modalSubtitle: {
      fontSize: 12,
      color: theme.textSecondary,
      lineHeight: 16,
    },
    modalCloseBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalScrollView: {
      flexGrow: 1,
    },
    modalScrollContent: {
      padding: 16,
      paddingBottom: 24,
    },
    chartSectionBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.backgroundSecondary,
      borderRadius: 14,
      padding: 14,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: theme.borderSubtle,
    },
    donutWrapper: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingRight: 14,
    },
    chartSummaryCol: {
      flex: 1,
      justifyContent: 'space-around',
      gap: 8,
    },
    summaryItem: {
      justifyContent: 'center',
    },
    summaryLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: theme.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    summaryValue: {
      fontSize: 14,
      fontWeight: '800',
      color: theme.text,
      marginTop: 1,
    },
    summaryDivider: {
      height: 1,
      backgroundColor: theme.borderSubtle,
      width: '100%',
    },
    listHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
      paddingHorizontal: 2,
    },
    listSectionTitle: {
      fontSize: 10.5,
      fontWeight: '800',
      color: theme.textSecondary,
      letterSpacing: 0.5,
    },
    listSectionHint: {
      fontSize: 10,
      color: theme.textMuted,
    },
    temasList: {
      gap: 10,
    },
    temaCardItem: {
      backgroundColor: isDark ? theme.backgroundSecondary : '#FAFAF9',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0.15 : 0.03,
      shadowRadius: 3,
      elevation: 1,
    },
    temaItemTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 8,
    },
    temaItemNameCol: {
      flex: 1,
      marginRight: 10,
    },
    temaTitleWithDot: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    temaDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    temaItemNome: {
      fontSize: 13.5,
      fontWeight: '700',
      color: theme.text,
      flex: 1,
    },
    temaItemEsp: {
      fontSize: 11,
      color: theme.textSecondary,
      fontWeight: '500',
      marginTop: 2,
      marginLeft: 14,
    },
    taxaBadge: {
      borderWidth: 1.5,
      borderRadius: 7,
      paddingHorizontal: 7,
      paddingVertical: 2.5,
    },
    taxaBadgeText: {
      fontSize: 11,
      fontWeight: '800',
    },
    progressTrack: {
      height: 4,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
      borderRadius: 2,
      overflow: 'hidden',
      marginBottom: 8,
    },
    progressFill: {
      height: '100%',
      borderRadius: 2,
    },
    temaItemFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    temaItemVolumeText: {
      fontSize: 10.5,
      color: theme.textSecondary,
      fontWeight: '500',
    },
    temaItemAcertosText: {
      fontSize: 10.5,
      color: theme.textMuted,
      fontWeight: '600',
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 30,
    },
    emptyTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.text,
      marginBottom: 4,
    },
    emptySubtitle: {
      fontSize: 11.5,
      color: theme.textMuted,
      textAlign: 'center',
      maxWidth: 240,
      lineHeight: 16,
    },
  });
}
