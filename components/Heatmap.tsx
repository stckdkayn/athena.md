import React, { useState, useMemo, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { getHeatmapData } from '@/services/streakService';
import { useAppTheme } from '@/context/ThemeContext';

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
  const colorScheme = useColorScheme();

  const { isDark, accentColor, colors } = useAppTheme();

  const textColor = colors.text;
  const textSecondaryColor = colors.textSecondary;
  const borderColor = colors.border;
  const emptySquareBg = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.06)';

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
        borderColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)',
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
      {/* Cabeçalho do Heatmap */}
      <View style={styles.headerRow}>
        <View style={styles.titleRow}>
          <Ionicons name="flame" size={18} color={accentColor} style={{ marginRight: 8 }} />
          <Text style={[styles.title, { color: textColor }]}>Consistência</Text>
        </View>
        <View style={styles.badgeContainer}>
          <Text style={[styles.badgeText, { color: accentColor }]}>
            {diasAtivos} {diasAtivos === 1 ? 'dia ativo' : 'dias ativos'}
          </Text>
        </View>
      </View>

      <Text style={[styles.subtitle, { color: textSecondaryColor }]}>
        {totalQuestoes12Semanas} questões resolvidas nas últimas 12 semanas
      </Text>

      {/* Grid de Contribuição / Heatmap */}
      <View style={styles.gridCard}>
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
                        borderColor: '#FFFFFF',
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

        {/* Rodapé com Legenda de Intensidade */}
        <View style={styles.legendRow}>
          <Text style={[styles.legendLabel, { color: textSecondaryColor }]}>Menos</Text>
          <View style={[styles.legendSquare, { backgroundColor: emptySquareBg }]} />
          <View style={[styles.legendSquare, { backgroundColor: accentColor, opacity: 0.35 }]} />
          <View style={[styles.legendSquare, { backgroundColor: accentColor, opacity: 0.7 }]} />
          <View style={[styles.legendSquare, { backgroundColor: accentColor, opacity: 1 }]} />
          <Text style={[styles.legendLabel, { color: textSecondaryColor }]}>Mais</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    marginBottom: 12,
  },
  badgeContainer: {
    backgroundColor: 'rgba(234, 225, 21, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(234, 225, 21, 0.25)',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  gridCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#232628',
  },
  scroll: {
    flexDirection: 'row',
    paddingVertical: 4,
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
    borderTopColor: '#2a2e30',
    alignItems: 'center',
  },
  selectedDayText: {
    fontSize: 12,
    color: '#E0E0E0',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 10,
    gap: 4,
  },
  legendLabel: {
    fontSize: 10,
    marginHorizontal: 2,
  },
  legendSquare: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
});
