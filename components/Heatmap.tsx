import React, { useState, useMemo, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Text, TouchableOpacity } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getHeatmapData } from '@/services/streakService';
import { useAppTheme } from '@/context/ThemeContext';
import { ActiveThemeColors } from '@/constants/Colors';

const WEEKS_TO_SHOW = 12;
const DAYS_TO_SHOW = WEEKS_TO_SHOW * 7;

function toLocalDateStr(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDayLabel(dateStr: string): string {
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
    }
  } catch {}
  return dateStr;
}

export interface HeatmapProps {
  onDayPress?: (date: string, count: number) => void;
  style?: any;
}

export default function Heatmap({ onDayPress, style }: HeatmapProps) {
  const { isDark, accentColor, colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const emptySquareBg = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)';
  const emptySquareBorder = isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.04)';

  const [data, setData] = useState<Record<string, number>>({});
  const [selectedDay, setSelectedDay] = useState<{ date: string; count: number } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const heatmapData = await getHeatmapData(DAYS_TO_SHOW);
      setData(heatmapData);
    } catch (err) {
      console.error('[Heatmap] Erro ao carregar dados:', err);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Gera o grid com exatamente 84 dias terminando hoje
  const dates = useMemo(() => {
    const grid: string[] = [];
    const today = new Date();

    for (let i = DAYS_TO_SHOW - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      grid.push(toLocalDateStr(d));
    }
    return grid;
  }, []);

  // Agrupa em colunas de 7 dias (Semanas) da esquerda para a direita
  const columns = useMemo(() => {
    const cols: string[][] = [];
    for (let i = 0; i < WEEKS_TO_SHOW; i++) {
      cols.push(dates.slice(i * 7, (i + 1) * 7));
    }
    return cols;
  }, [dates]);

  // Estatísticas de resumo
  const { totalQuestoes12Semanas, diasAtivos } = useMemo(() => {
    let total = 0;
    let ativos = 0;
    for (const d of dates) {
      const c = data[d] || 0;
      total += c;
      if (c > 0) ativos += 1;
    }
    return { totalQuestoes12Semanas: total, diasAtivos: ativos };
  }, [dates, data]);

  // Define estilo e intensidade da cor baseado na quantidade de questões
  const getSquareStyle = (count: number) => {
    if (!count || count === 0) {
      return {
        backgroundColor: emptySquareBg,
        borderColor: emptySquareBorder,
      };
    }
    if (count < 10) {
      return {
        backgroundColor: accentColor,
        opacity: 0.35,
        borderColor: 'transparent',
      };
    }
    if (count < 25) {
      return {
        backgroundColor: accentColor,
        opacity: 0.7,
        borderColor: 'transparent',
      };
    }
    return {
      backgroundColor: accentColor,
      opacity: 1,
      borderColor: 'transparent',
    };
  };

  const handleSquarePress = (day: string) => {
    const count = data[day] || 0;
    setSelectedDay({ date: day, count });
    if (onDayPress) {
      onDayPress(day, count);
    }
  };

  return (
    <View style={[styles.container, style]}>
      <View style={styles.card}>
        {/* Grid de Contribuição / Heatmap */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          {columns.map((week, weekIndex) => (
            <View key={`week-${weekIndex}`} style={styles.column}>
              {week.map((day, dayIndex) => {
                const count = data[day] || 0;
                const isSelected = selectedDay?.date === day;

                return (
                  <TouchableOpacity
                    key={`day-${dayIndex}-${day}`}
                    activeOpacity={0.7}
                    onPress={() => handleSquarePress(day)}
                    style={[
                      styles.square,
                      getSquareStyle(count),
                      isSelected && {
                        borderWidth: 1.5,
                        borderColor: isDark ? '#FFFFFF' : '#37352F',
                        transform: [{ scale: 1.15 }],
                      },
                    ]}
                  />
                );
              })}
            </View>
          ))}
        </ScrollView>

        {/* Feedback / Detalhe ao tocar no dia */}
        {selectedDay && (
          <View style={styles.selectedDayInfo}>
            <Text style={styles.selectedDayText}>
              📅 <Text style={{ fontWeight: '700' }}>{formatDayLabel(selectedDay.date)}</Text>: {selectedDay.count}{' '}
              {selectedDay.count === 1 ? 'questão respondida' : 'questões respondidas'}
            </Text>
          </View>
        )}

        {/* Rodapé enxuto: Dias Ativos na esquerda e Legenda de Intensidade na direita */}
        <View style={styles.footerRow}>
          <Text style={styles.footerStatsText}>
            {diasAtivos} {diasAtivos === 1 ? 'dia ativo' : 'dias ativos'} • {totalQuestoes12Semanas} {totalQuestoes12Semanas === 1 ? 'questão' : 'questões'}
          </Text>

          <View style={styles.legendRow}>
            <Text style={styles.legendLabel}>Menos</Text>
            <View style={[styles.legendSquare, { backgroundColor: emptySquareBg }]} />
            <View style={[styles.legendSquare, { backgroundColor: accentColor, opacity: 0.35 }]} />
            <View style={[styles.legendSquare, { backgroundColor: accentColor, opacity: 0.7 }]} />
            <View style={[styles.legendSquare, { backgroundColor: accentColor, opacity: 1 }]} />
            <Text style={styles.legendLabel}>Mais</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function createStyles(colors: ActiveThemeColors, isDark: boolean) {
  return StyleSheet.create({
    container: {
      marginBottom: 16,
    },
    card: {
      backgroundColor: colors.surfaceCard || colors.surface,
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.25 : 0.05,
      shadowRadius: 8,
      elevation: 2,
    },
    scroll: {
      flexDirection: 'row',
      paddingVertical: 2,
    },
    column: {
      flexDirection: 'column',
      marginRight: 4,
    },
    square: {
      width: 14,
      height: 14,
      borderRadius: 3,
      marginBottom: 4,
      borderWidth: 1,
    },
    selectedDayInfo: {
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: colors.borderSubtle,
      alignItems: 'center',
    },
    selectedDayText: {
      fontSize: 12,
      color: colors.text,
    },
    footerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 10,
      paddingTop: 4,
    },
    footerStatsText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    legendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    legendLabel: {
      fontSize: 10,
      marginHorizontal: 2,
      color: colors.textSecondary,
    },
    legendSquare: {
      width: 10,
      height: 10,
      borderRadius: 2,
    },
  });
}
