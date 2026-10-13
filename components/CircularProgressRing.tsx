import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';

interface CircularProgressRingProps {
  progress: number; // 0 a 100
  size?: number;
  strokeWidth?: number;
  color?: string;
  backgroundColor?: string;
  completedColor?: string;
  showText?: boolean;
}

export default function CircularProgressRing({
  progress,
  size = 38,
  strokeWidth = 3.5,
  color = Colors.primary,
  backgroundColor = '#26292C',
  completedColor,
  showText = true,
}: CircularProgressRingProps) {
  const clampedProgress = Math.min(100, Math.max(0, Math.round(progress)));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (circumference * clampedProgress) / 100;
  const isCompleted = clampedProgress === 100;
  const activeColor = isCompleted ? (completedColor || '#10B981') : color;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        {/* Trilho de Fundo */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={backgroundColor}
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        {/* Anel de Progresso */}
        {clampedProgress > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={activeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </Svg>

      {showText && (
        <View
          style={[StyleSheet.absoluteFill, styles.centerTextContainer]}
          pointerEvents="none"
        >
          {isCompleted ? (
            <Ionicons name="checkmark" size={size * 0.38} color={completedColor || '#10B981'} />
          ) : (
            <Text
              style={[
                styles.progressText,
                {
                  fontSize: clampedProgress === 100 ? size * 0.22 : size * 0.25,
                  color: clampedProgress > 0 ? '#FFFFFF' : '#8E959E',
                },
              ]}
              numberOfLines={1}
            >
              {clampedProgress}%
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centerTextContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressText: {
    fontWeight: '700',
    textAlign: 'center',
  },
});
