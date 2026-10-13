import React, { useState, useEffect } from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';

export interface TopicAccordionBodyProps {
  isExpanded: boolean;
  children: React.ReactNode;
}

export function TopicAccordionBody({ isExpanded, children }: TopicAccordionBodyProps) {
  // Guarda a altura real do conteúdo quando ele for medido
  const [contentHeight, setContentHeight] = useState(0);

  // O valor animado da altura. Se não estiver medido, começamos com 0
  const height = useSharedValue(0);

  // Reage à mudança do botão "expandir"
  useEffect(() => {
    if (contentHeight > 0) {
      height.value = withTiming(isExpanded ? contentHeight : 0, {
        duration: 300,
        easing: Easing.out(Easing.exp), // Efeito de mola suave
      });
    }
  }, [isExpanded, contentHeight]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      height: height.value,
      opacity: height.value > 0 ? 1 : 0, // Faz o conteúdo surgir suavemente
      overflow: 'hidden',
    };
  });

  const onLayout = (event: LayoutChangeEvent) => {
    const measuredHeight = event.nativeEvent.layout.height;
    // Pega a altura do conteúdo real para saber até onde abrir
    if (measuredHeight > 0 && contentHeight !== measuredHeight) {
      setContentHeight(measuredHeight);
      // Se nasceu já expandido, ajusta direto
      if (isExpanded) {
        height.value = measuredHeight;
      }
    }
  };

  return (
    <Animated.View style={animatedStyle}>
      {/* Container posicionado de forma absoluta que permite a medição exata do conteúdo interno */}
      <View style={styles.absoluteMeasurer} onLayout={onLayout}>
        {children}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  absoluteMeasurer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
});

