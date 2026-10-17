import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useAppTheme } from '@/context/ThemeContext';

interface MemoryDonutChartProps {
  longoPrazo: number; // Retidas (Verde)
  consolidando: number; // Em Treino (Laranja)
  pendentes: number; // Vencidas (Vermelho)
  size?: number;
  strokeWidth?: number;
}

export default function MemoryDonutChart({
  longoPrazo,
  consolidando,
  pendentes,
  size = 86,
  strokeWidth = 8,
}: MemoryDonutChartProps) {
  const { isDark, colors } = useAppTheme();
  const total = longoPrazo + consolidando + pendentes;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Se não houver itens cadastrados no algoritmo
  if (total === 0) {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}
            strokeWidth={strokeWidth}
            fill="transparent"
          />
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.centerBox]}>
          <Text style={[styles.centerTotal, { color: colors.textSecondary }]}>0</Text>
          <Text style={[styles.centerLabel, { color: colors.textMuted }]}>itens</Text>
        </View>
      </View>
    );
  }

  // Comprimentos proporcionais dos arcos
  const l1 = (longoPrazo / total) * circumference;
  const l2 = (consolidando / total) * circumference;
  const l3 = (pendentes / total) * circumference;

  // Offsets com rotação de -90deg para começar no topo (12 horas)
  const offset1 = 0;
  const offset2 = -l1;
  const offset3 = -(l1 + l2);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        {/* Trilho de fundo */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'}
          strokeWidth={strokeWidth}
          fill="transparent"
        />

        {/* 1. Retidas (Verde #10B981) */}
        {longoPrazo > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#10B981"
            strokeWidth={strokeWidth}
            strokeDasharray={`${l1} ${circumference}`}
            strokeDashoffset={offset1}
            strokeLinecap="butt"
            fill="transparent"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}

        {/* 2. Em Treino (Laranja #F59E0B) */}
        {consolidando > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#F59E0B"
            strokeWidth={strokeWidth}
            strokeDasharray={`${l2} ${circumference}`}
            strokeDashoffset={offset2}
            strokeLinecap="butt"
            fill="transparent"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}

        {/* 3. Vencidas (Vermelho #EF4444) */}
        {pendentes > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#EF4444"
            strokeWidth={strokeWidth}
            strokeDasharray={`${l3} ${circumference}`}
            strokeDashoffset={offset3}
            strokeLinecap="butt"
            fill="transparent"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </Svg>

      {/* Conteúdo Central: Total e Rótulo */}
      <View style={[StyleSheet.absoluteFill, styles.centerBox]} pointerEvents="none">
        <Text style={[styles.centerTotal, { color: colors.text }]}>{total}</Text>
        <Text style={[styles.centerLabel, { color: colors.textSecondary }]}>itens</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centerBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerTotal: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  centerLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginTop: -1,
  },
});
