import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { LineChart } from 'react-native-chart-kit';
import { useAppTheme } from '@/context/ThemeContext';
import { ActiveThemeColors } from '@/constants/Colors';
import { getDatabase } from '@/services/database';

const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

interface MesTemplate {
  ano: number;
  mes: number;
  label: string;
  totalQuestoes: number;
  totalAcertos: number;
}

function gerarTemplateUltimos6Meses(): MesTemplate[] {
  const meses: MesTemplate[] = [];
  const agora = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    meses.push({
      ano: d.getFullYear(),
      mes: d.getMonth(),
      label: MESES_ABREV[d.getMonth()],
      totalQuestoes: 0,
      totalAcertos: 0,
    });
  }
  return meses;
}

function hexToRgba(hex: string, opacity: number = 1): string {
  if (!hex) return `rgba(55, 53, 47, ${opacity})`;
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex;
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    const r = parseInt(cleanHex[0] + cleanHex[0], 16);
    const g = parseInt(cleanHex[1] + cleanHex[1], 16);
    const b = parseInt(cleanHex[2] + cleanHex[2], 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  if (cleanHex.length === 6) {
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  return hex;
}

export interface EvolucaoMensalChartProps {
  style?: any;
}

export default function EvolucaoMensalChart({ style }: EvolucaoMensalChartProps) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { width: windowWidth } = useWindowDimensions();

  // Largura dinâmica calculada a partir do layout do card para evitar cortes
  const [containerWidth, setContainerWidth] = useState<number>(windowWidth - 56);

  const [chartData, setChartData] = useState<{
    labels: string[];
    dataQuestoes: number[];
    dataAcertos: number[];
    totalQuestoes: number;
    totalAcertos: number;
    taxaGlobal: number;
  }>({
    labels: gerarTemplateUltimos6Meses().map((m) => m.label),
    dataQuestoes: [0, 0, 0, 0, 0, 0],
    dataAcertos: [0, 0, 0, 0, 0, 0],
    totalQuestoes: 0,
    totalAcertos: 0,
    taxaGlobal: 0,
  });

  const carregarDados = useCallback(async () => {
    try {
      const database = getDatabase();
      const meses = gerarTemplateUltimos6Meses();
      const agora = new Date();
      const seisMesesAtras = new Date(agora.getFullYear(), agora.getMonth() - 5, 1, 0, 0, 0, 0).getTime();

      // Consulta todos os registros de progresso dos últimos 6 meses com dados de acerto
      const rows = await database.getAllAsync<{ timestamp?: number; data?: string; correta?: number | boolean }>(
        `SELECT timestamp, data, correta FROM progresso WHERE timestamp >= ? OR timestamp IS NULL;`,
        [seisMesesAtras]
      );

      if (rows && rows.length > 0) {
        for (const r of rows) {
          let d: Date | null = null;
          if (r.timestamp && typeof r.timestamp === 'number') {
            d = new Date(r.timestamp);
          } else if (r.data) {
            d = new Date(r.data);
          }
          if (!d || isNaN(d.getTime())) continue;

          const ano = d.getFullYear();
          const mes = d.getMonth();

          const match = meses.find((m) => m.ano === ano && m.mes === mes);
          if (match) {
            match.totalQuestoes += 1;
            const isCorreta = r.correta === 1 || r.correta === true || String(r.correta) === '1';
            if (isCorreta) {
              match.totalAcertos += 1;
            }
          }
        }
      }

      const totalQuestoes = meses.reduce((acc, m) => acc + m.totalQuestoes, 0);
      const totalAcertos = meses.reduce((acc, m) => acc + m.totalAcertos, 0);
      const taxaGlobal = totalQuestoes > 0 ? Math.round((totalAcertos / totalQuestoes) * 100) : 0;

      setChartData({
        labels: meses.map((m) => m.label),
        dataQuestoes: meses.map((m) => m.totalQuestoes),
        dataAcertos: meses.map((m) => m.totalAcertos),
        totalQuestoes,
        totalAcertos,
        taxaGlobal,
      });
    } catch (err) {
      console.warn('[EvolucaoMensalChart] Erro ao carregar histórico:', err);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carregarDados();
    }, [carregarDados])
  );

  const activeColor = colors.primary;
  const acertosColor = '#10B981';

  const lineChartConfig = useMemo(() => {
    const cardBg = colors.surfaceCard || colors.surface;
    return {
      backgroundColor: cardBg,
      backgroundGradientFrom: cardBg,
      backgroundGradientTo: cardBg,
      decimalPlaces: 0,
      color: (opacity = 1) => hexToRgba(activeColor, opacity),
      labelColor: () => colors.textSecondary,
      propsForDots: {
        r: '4',
        strokeWidth: '1.5',
        stroke: cardBg,
      },
      propsForBackgroundLines: {
        stroke: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
        strokeDasharray: '4, 4',
      },
      propsForHorizontalLabels: {
        fontSize: 10,
      },
      propsForVerticalLabels: {
        fontSize: 10,
      },
      formatYLabel: (y: string) => Math.round(Number(y)).toString(),
    };
  }, [colors, isDark, activeColor]);

  // Largura do gráfico ajustada com base no card
  const chartWidth = Math.max(containerWidth, 290);

  return (
    <View style={[styles.sectionCard, style]}>
      {/* Cabeçalho sem o badge de questões */}
      <View style={styles.cardHeaderRow}>
        <View style={styles.titleWithIcon}>
          <Ionicons name="trending-up-outline" size={18} color={activeColor} style={{ marginRight: 8 }} />
          <Text style={styles.sectionTitle}>Evolução Semestral</Text>
        </View>
      </View>

      <Text style={styles.sectionDesc}>
        Comparativo entre volume de questões e taxa de acertos.
      </Text>

      {/* Legenda das duas linhas */}
      <View style={styles.legendContainer}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: activeColor }]} />
          <Text style={styles.legendLabel}>
            Questões: <Text style={styles.legendValue}>{chartData.totalQuestoes}</Text>
          </Text>
        </View>

        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: acertosColor }]} />
          <Text style={styles.legendLabel}>
            Acertos: <Text style={styles.legendValue}>{chartData.totalAcertos}</Text>
            {chartData.totalQuestoes > 0 ? (
              <Text style={styles.legendPercent}> ({chartData.taxaGlobal}%)</Text>
            ) : null}
          </Text>
        </View>
      </View>

      {/* Container do Gráfico */}
      <View
        style={styles.chartWrapper}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          if (w > 0 && Math.abs(w - containerWidth) > 5) {
            setContainerWidth(w);
          }
        }}
      >
        <LineChart
          data={{
            labels: chartData.labels,
            datasets: [
              // Linha 1: Volume de Questões
              {
                data: chartData.dataQuestoes,
                color: (opacity = 1) => hexToRgba(activeColor, opacity),
                strokeWidth: 2.5,
              },
              // Linha 2: Desempenho / Acertos (se iguala à linha de questões com 100% de acertos)
              {
                data: chartData.dataAcertos,
                color: (opacity = 1) => hexToRgba(acertosColor, opacity),
                strokeWidth: 2.5,
              },
            ],
          }}
          width={chartWidth}
          height={185}
          bezier
          fromZero
          segments={4}
          withInnerLines={true}
          withOuterLines={false}
          withVerticalLines={false}
          chartConfig={lineChartConfig}
          style={styles.lineChart}
        />
      </View>
    </View>
  );
}

function createStyles(colors: ActiveThemeColors, isDark: boolean) {
  return StyleSheet.create({
    sectionCard: {
      backgroundColor: colors.surfaceCard || colors.surface,
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.25 : 0.05,
      shadowRadius: 8,
      elevation: 2,
    },
    cardHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    titleWithIcon: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.text,
    },
    sectionDesc: {
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: 10,
      lineHeight: 16,
    },
    legendContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      marginBottom: 8,
      paddingHorizontal: 2,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    legendDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    legendLabel: {
      fontSize: 11.5,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    legendValue: {
      color: colors.text,
      fontWeight: '800',
    },
    legendPercent: {
      color: '#10B981',
      fontWeight: '700',
      fontSize: 10.5,
    },
    chartWrapper: {
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
    },
    lineChart: {
      marginVertical: 4,
      borderRadius: 12,
      marginLeft: -10, // Compensa o padding esquerdo excessivo do Y-axis da lib
      paddingRight: 42, // Garante que o último mês e os pontos à direita nunca fiquem cortados
    },
  });
}
