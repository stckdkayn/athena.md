import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useAppTheme } from '@/context/ThemeContext';

export interface ThemeDistributionSegment {
  name: string;
  count: number;
  percent: number;
  color: string;
}

interface ThemeDonutChartProps {
  segments: ThemeDistributionSegment[];
  total: number;
  size?: number;
  strokeWidth?: number;
  showCenterText?: boolean;
  centerValue?: string | number;
  centerLabel?: string;
}

export default function ThemeDonutChart({
  segments,
  total,
  size = 72,
  strokeWidth = 7,
  showCenterText = true,
  centerValue,
  centerLabel = 'questões',
}: ThemeDonutChartProps) {
  const { isDark, colors } = useAppTheme();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Se não houver dados no período
  if (total === 0 || segments.length === 0) {
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
        {showCenterText && (
          <View style={[StyleSheet.absoluteFill, styles.centerBox]}>
            <Text style={[styles.centerTotal, { color: colors.textSecondary }]}>0</Text>
            <Text style={[styles.centerLabel, { color: colors.textMuted }]}>questões</Text>
          </View>
        )}
      </View>
    );
  }

  // Calcula comprimentos e offsets cumulativos para cada fatia do anel
  let accumulated = 0;
  const arcs = segments.map((seg) => {
    const strokeLength = (seg.count / total) * circumference;
    const offset = -accumulated;
    accumulated += strokeLength;
    return {
      ...seg,
      strokeLength,
      offset,
    };
  });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        {/* Trilho de fundo sutil */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'}
          strokeWidth={strokeWidth}
          fill="transparent"
        />

        {/* Segmentos de temas */}
        {arcs.map((arc, i) => (
          arc.strokeLength > 0 && (
            <Circle
              key={`theme-arc-${arc.name}-${i}`}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={arc.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${arc.strokeLength} ${circumference}`}
              strokeDashoffset={arc.offset}
              strokeLinecap="butt"
              fill="transparent"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          )
        ))}
      </Svg>

      {/* Conteúdo central do donut */}
      {showCenterText && (
        <View style={[StyleSheet.absoluteFill, styles.centerBox]} pointerEvents="none">
          <Text style={[styles.centerTotal, { color: colors.text }]} numberOfLines={1}>
            {centerValue !== undefined ? centerValue : total}
          </Text>
          {centerLabel ? (
            <Text style={[styles.centerLabel, { color: colors.textMuted }]} numberOfLines={1}>
              {centerLabel}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centerBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerTotal: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.3,
    lineHeight: 16,
  },
  centerLabel: {
    fontSize: 8.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 1,
  },
});
