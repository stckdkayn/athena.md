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
  count: number;
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
      count: 0,
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
  const { colors, isDark, accentColor } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { width: windowWidth } = useWindowDimensions();

  const [chartData, setChartData] = useState<{ labels: string[]; data: number[]; total: number }>({
    labels: gerarTemplateUltimos6Meses().map((m) => m.label),
    data: [0, 0, 0, 0, 0, 0],
    total: 0,
  });

  const carregarDados = useCallback(async () => {
    try {
      const database = getDatabase();
      const meses = gerarTemplateUltimos6Meses();
      const agora = new Date();
      const seisMesesAtras = new Date(agora.getFullYear(), agora.getMonth() - 5, 1, 0, 0, 0, 0).getTime();

      // Consulta todos os registros de progresso dos últimos 6 meses
      const rows = await database.getAllAsync<{ timestamp?: number; data?: string }>(
        `SELECT timestamp, data FROM progresso WHERE timestamp >= ? OR timestamp IS NULL;`,
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
            match.count += 1;
          }
        }
      }

      const total = meses.reduce((acc, m) => acc + m.count, 0);

      setChartData({
        labels: meses.map((m) => m.label),
        data: meses.map((m) => m.count),
        total,
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

  const chartWidth = Math.max(windowWidth - 64, 280);
  const activeColor = accentColor || colors.primary;

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
        strokeWidth: '2',
        stroke: activeColor,
        fill: cardBg,
      },
      propsForBackgroundLines: {
        stroke: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
        strokeDasharray: '4, 4',
      },
    };
  }, [colors, isDark, activeColor]);

  return (
    <View style={[styles.sectionCard, style]}>
      <View style={styles.cardHeaderRow}>
        <View style={styles.titleWithIcon}>
          <Ionicons name="trending-up-outline" size={18} color={activeColor} style={{ marginRight: 8 }} />
          <Text style={styles.sectionTitle}>Evolução dos Últimos 6 Meses</Text>
        </View>
        <View style={styles.cardBadge}>
          <Text style={styles.cardBadgeText}>
            {chartData.total} {chartData.total === 1 ? 'questão' : 'questões'}
          </Text>
        </View>
      </View>

      <Text style={styles.sectionDesc}>
        Volume de questões praticadas mês a mês.
      </Text>

      <View style={styles.chartWrapper}>
        <LineChart
          data={{
            labels: chartData.labels,
            datasets: [
              {
                data: chartData.data,
                color: (opacity = 1) => hexToRgba(activeColor, opacity),
                strokeWidth: 2.5,
              },
            ],
          }}
          width={chartWidth}
          height={190}
          bezier
          fromZero
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
      marginBottom: 12,
      lineHeight: 16,
    },
    cardBadge: {
      backgroundColor: colors.primarySubtle,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.primaryBorder,
    },
    cardBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.primary,
      textTransform: 'uppercase',
    },
    chartWrapper: {
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    lineChart: {
      marginVertical: 4,
      borderRadius: 12,
      paddingRight: 36, // Garante que o último mês (ex: Out) não seja cortado na borda direita
    },
  });
}
