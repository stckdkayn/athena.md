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

  const isLightColor =
    corBase?.toLowerCase() === Colors.primary.toLowerCase() ||
    corBase?.toLowerCase() === '#eae119' ||
    corBase?.toLowerCase() === '#facc15';
  const playIconColor = isLightColor ? '#121214' : '#FFFFFF';

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
          { transform: [{ translateX }] },
        ]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          onPress={onPress}
          activeOpacity={0.8}
          style={{ flex: 1 }}
        >
          <LinearGradient
            colors={
              item.concluida
                ? [`${corBase}12`, '#1b1d1f', '#1b1d1f']
                : [`${corBase}25`, Colors.surface, Colors.surface]
            }
            locations={[0, 0.55, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.activityCard, item.concluida && styles.activityCardCompleted]}
          >
            <View style={styles.cardContentRow}>
              <View style={styles.cardMainContent}>
                <Text
                  style={[
                    styles.activityTitle,
                    item.concluida && styles.textStrikethrough,
                  ]}
                  numberOfLines={2}
                >
                  {item.titulo}
                </Text>

                {/* Subtítulo: Label (Material / Tipo de Atividade) */}
                {!!item.detalhes && (
                  <View style={styles.detailsRow}>
                    <Text style={styles.detailsText} numberOfLines={2}>
                      {item.detalhes}
                    </Text>
                  </View>
                )}

                {/* Linha Meta: Horários, Indicador de Rotina e Botão Praticar */}
                <View style={styles.metaRow}>
                  {item.hora_fim ? (
                    <View style={styles.timeRangeBox}>
                      <Ionicons
                        name="time-outline"
                        size={12}
                        color={Colors.textSecondary}
                        style={{ marginRight: 4 }}
                      />
                      <Text style={styles.timeRangeText}>
                        {item.hora_inicio} - {item.hora_fim}
                      </Text>
                    </View>
                  ) : null}

                  {item.isVirtual && (
                    <View style={styles.routineBox}>
                      <Ionicons
                        name="repeat"
                        size={11}
                        color={Colors.primary}
                        style={{ marginRight: 3 }}
                      />
                      <Text style={styles.routineText}>Rotina</Text>
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
                  <View style={[styles.playButtonCircle, { backgroundColor: corBase }]}>
                    <Ionicons
                      name="play"
                      size={14}
                      color={playIconColor}
                      style={{ marginLeft: 2 }}
                    />
                  </View>
                  <Text style={[styles.iniciarUnderText, { color: corBase }]}>iniciar</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.cardRightIconWrapper}>
                  {isAulas ? (
                    <Ionicons name="laptop-outline" size={28} color={corBase} />
                  ) : isApostila ? (
                    <Ionicons name="library-outline" size={28} color={corBase} />
                  ) : isFlashcards ? (
                    <Ionicons name="flash-outline" size={28} color={corBase} />
                  ) : item.icone === 'calendar' ? (
                    <Ionicons name="calendar-outline" size={26} color={corBase} />
                  ) : (
                    <Feather
                      name={(item.icone as any) || 'circle'}
                      size={26}
                      color={corBase}
                    />
                  )}
                </View>
              )}
            </View>
          </LinearGradient>
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
    backgroundColor: '#181a1c',
    borderRadius: 14,
  },
  activityCard: {
    flex: 1,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2e3235',
    overflow: 'hidden',
  },
  activityCardCompleted: {
    opacity: 0.5,
    borderColor: '#202325',
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
    color: Colors.text,
  },
  textStrikethrough: {
    textDecorationLine: 'line-through',
    color: Colors.textSecondary,
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
    color: Colors.textSecondary,
  },
  routineBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(234, 225, 21, 0.08)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  routineText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: Fonts.bold,
    color: Colors.primary,
  },
  detailsRow: {
    marginTop: 4,
    marginBottom: 2,
  },
  detailsText: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  cardRightQuestoesWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 46,
    paddingLeft: 6,
    paddingVertical: 2,
  },
  playButtonCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.2,
    shadowRadius: 2.5,
    elevation: 2,
  },
  iniciarUnderText: {
    fontSize: 10,
    fontFamily: Fonts.bold,
    fontWeight: '700',
    marginTop: 3,
    letterSpacing: 0.2,
  },
});
