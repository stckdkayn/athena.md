import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  TouchableOpacity,
  Easing,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/Colors';
import { Fonts } from '@/constants/Typography';
import { AtividadeAgenda } from '@/services/database';
import { useAppTheme } from '@/context/ThemeContext';

interface SwipeableActivityCardProps {
  item: AtividadeAgenda;
  corBase: string;
  onPress: () => void;
  onSwipeComplete: () => void;
  onStartQuiz: (item: AtividadeAgenda) => void;
}

export default function SwipeableActivityCard({
  item,
  corBase,
  onPress,
  onSwipeComplete,
  onStartQuiz,
}: SwipeableActivityCardProps) {
  const { colors: themeColors, isDark } = useAppTheme();
  const translateX = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Apenas captura o gesto se o arrasto for da direita para a esquerda (dx < -10)
        // e o movimento horizontal for predominante em relação ao vertical
        return (
          gestureState.dx < -10 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.5
        );
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dx < 0) {
          // Permite arrastar até -120px para a esquerda
          translateX.setValue(Math.max(-120, gestureState.dx));
        } else {
          translateX.setValue(0);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -65) {
          // Limiar atingido: aciona a conclusão
          onSwipeComplete();
        }
        // Retorna normalmente de forma suave, sem animação de mola
        Animated.timing(translateX, {
          toValue: 0,
          duration: 180,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.timing(translateX, {
          toValue: 0,
          duration: 180,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

  // Opacidade do fundo verde: 0 em repouso (evita vazamento em cantos arredondados)
  const bgOpacity = translateX.interpolate({
    inputRange: [-30, -8, 0],
    outputRange: [1, 0.3, 0],
    extrapolate: 'clamp',
  });

  // Animação de escala e opacidade do ícone de check verde conforme o card é arrastado
  const iconOpacity = translateX.interpolate({
    inputRange: [-80, -20, 0],
    outputRange: [1, 0.4, 0],
    extrapolate: 'clamp',
  });

  const iconScale = translateX.interpolate({
    inputRange: [-80, -20, 0],
    outputRange: [1.15, 0.7, 0.4],
    extrapolate: 'clamp',
  });

  const isQuestoes =
    (item as any).passo_tipo === 'questoes' ||
    item.tipo?.toLowerCase().includes('quest') ||
    item.icone === 'document-text-outline' ||
    item.icone === 'check-square';

  // No modo claro monocromático: ícones e destaques em preto/cinza Notion
  const effectiveCorBase = isDark ? corBase : themeColors.text;
  const playIconColor = '#FFFFFF';

  const isAulas =
    (item as any).passo_tipo === 'videoaula' ||
    (item as any).passo_tipo === 'aulas' ||
    (item as any).passo_tipo === 'aulas_bonus' ||
    item.icone === 'laptop-outline' ||
    item.icone === 'play-circle';

  const isApostila =
    (item as any).passo_tipo === 'leitura' ||
    (item as any).passo_tipo === 'apostila' ||
    item.icone === 'library-outline' ||
    item.icone === 'book-open';

  const isFlashcards =
    (item as any).passo_tipo === 'flashcards' ||
    item.icone === 'flash-outline' ||
    item.icone === 'layers';

  return (
    <View style={styles.cardWrapper}>
      {/* Fundo verde escondido com ícone de check revelado apenas ao arrastar */}
      <Animated.View style={[styles.swipeBackground, { opacity: bgOpacity }]}>
        <Animated.View
          style={[
            styles.checkIconContainer,
            {
              opacity: iconOpacity,
              transform: [{ scale: iconScale }],
            },
          ]}
        >
          <Ionicons name="checkmark" size={26} color="#FFFFFF" />
        </Animated.View>
      </Animated.View>

      {/* Card da atividade com suporte ao gesto de arrasto da direita para a esquerda */}
      <Animated.View
        style={[
          styles.animatedCardContainer,
          { backgroundColor: themeColors.surfaceCard },
          item.concluida && styles.activityCardCompleted,
          { transform: [{ translateX }] },
        ]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          onPress={onPress}
          activeOpacity={0.7}
          style={{ flex: 1 }}
        >
          <View
            style={[
              styles.activityCard,
              {
                backgroundColor: themeColors.surfaceCard,
                borderColor: item.concluida ? themeColors.borderSubtle : themeColors.border,
              },
            ]}
          >
            <View style={styles.cardContentRow}>
              <View style={styles.cardMainContent}>
                <Text
                  style={[
                    styles.activityTitle,
                    { color: themeColors.text },
                    item.concluida && styles.textStrikethrough,
                  ]}
                  numberOfLines={2}
                >
                  {item.titulo}
                </Text>

                {/* Subtítulo: Label (Material / Tipo de Atividade) */}
                {!!item.detalhes && (
                  <View style={styles.detailsRow}>
                    <Text style={[styles.detailsText, { color: themeColors.textSecondary }]} numberOfLines={2}>
                      {item.detalhes}
                    </Text>
                  </View>
                )}

                {/* Linha Meta: Horários, Indicador de Rotina */}
                <View style={styles.metaRow}>
                  {item.hora_fim ? (
                    <View style={styles.timeRangeBox}>
                      <Ionicons
                        name="time-outline"
                        size={12}
                        color={themeColors.textSecondary}
                        style={{ marginRight: 4 }}
                      />
                      <Text style={[styles.timeRangeText, { color: themeColors.textSecondary }]}>
                        {item.hora_inicio} - {item.hora_fim}
                      </Text>
                    </View>
                  ) : null}

                  {item.isVirtual && (
                    <View style={[styles.routineBox, { backgroundColor: themeColors.primarySubtle }]}>
                      <Ionicons
                        name="repeat"
                        size={10}
                        color={themeColors.text}
                        style={{ marginRight: 3 }}
                      />
                      <Text style={[styles.routineText, { color: themeColors.text }]}>ROTINA</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Botão de Play para Questões ou Ícone da Atividade */}
              {isQuestoes ? (
                <TouchableOpacity
                  style={styles.cardRightQuestoesWrapper}
                  onPress={(e) => {
                    e.stopPropagation();
                    onStartQuiz(item);
                  }}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <View style={[styles.playButtonCircle, { backgroundColor: effectiveCorBase }]}>
                    <Ionicons
                      name="play"
                      size={17}
                      color={playIconColor}
                      style={{ marginLeft: 2 }}
                    />
                  </View>
                  <Text style={[styles.iniciarUnderText, { color: themeColors.textSecondary }]}>INICIAR</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.cardRightIconWrapper}>
                  {isAulas ? (
                    <Ionicons name="laptop-outline" size={32} color={effectiveCorBase} />
                  ) : isApostila ? (
                    <Ionicons name="library-outline" size={32} color={effectiveCorBase} />
                  ) : isFlashcards ? (
                    <Ionicons name="flash-outline" size={32} color={effectiveCorBase} />
                  ) : item.icone === 'calendar' ? (
                    <Ionicons name="calendar-outline" size={30} color={effectiveCorBase} />
                  ) : (
                    <Feather
                      name={(item.icone as any) || 'circle'}
                      size={30}
                      color={effectiveCorBase}
                    />
                  )}
                </View>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardWrapper: {
    flex: 1,
    position: 'relative',
    borderRadius: 14,
    overflow: 'hidden',
  },
  swipeBackground: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#10B981', // Verde suave e vibrante de confirmação
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 22,
  },
  checkIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  animatedCardContainer: {
    flex: 1,
    borderRadius: 14,
  },
  activityCard: {
    flex: 1,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    overflow: 'hidden',
  },
  activityCardCompleted: {
    opacity: 0.5,
  },
  cardContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardMainContent: {
    flex: 1,
    marginRight: 12,
  },
  cardRightIconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 4,
    paddingRight: 2,
  },
  activityTitle: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: Fonts.bold,
  },
  textStrikethrough: {
    textDecorationLine: 'line-through',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 10,
  },
  timeRangeBox: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeRangeText: {
    fontSize: 12,
    fontFamily: Fonts.medium,
  },
  routineBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  routineText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: Fonts.bold,
    letterSpacing: 0.4,
  },
  detailsRow: {
    marginTop: 4,
    marginBottom: 2,
  },
  detailsText: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    lineHeight: 16,
  },
  cardRightQuestoesWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 50,
    paddingLeft: 6,
    paddingVertical: 2,
  },
  playButtonCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 0,
    shadowOpacity: 0,
  },
  iniciarUnderText: {
    fontSize: 10,
    fontFamily: Fonts.bold,
    fontWeight: '700',
    marginTop: 3,
    letterSpacing: 0.5,
  },
});
