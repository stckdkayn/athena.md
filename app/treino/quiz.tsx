import { Colors, ActiveThemeColors } from '@/constants/Colors';
import { useAppTheme } from '@/context/ThemeContext';
import {
  preloadQuestionImages,
  resolveQuestionImageUri,
} from '@/services/imageService';
import {
  clearActiveQuizSession,
  getQuestionEspecialidade,
  getQuestionTema,
  getQuestoesCache,
  getQuestionsByThemes,
  loadActiveQuizSession,
  saveActiveQuizSession,
  classificarGrandeArea,
  GrandeAreaSimulado,
  getAllQuestions,
} from '@/services/questionService';
import { saveProgressRecord, getErroredQuestionIds, logQuestionAnswer } from '@/services/progressService';
import { processQuestionReview, processTopicReview } from '@/services/spacedRepetitionService';
import { concluirAtividadePorId } from '@/services/database';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { storage } from '@/services/storage';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  BackHandler,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Reanimated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Alternative {
  key: string;
  text: string;
}

interface Question {
  id?: string | number;
  id_questao?: string | number;
  origem?: string;
  origin?: string;
  pacote?: string;
  especialidade?: string;
  specialty?: string;
  area?: string;
  tema_principal?: string;
  tema?: string;
  subtema?: string;
  assunto?: string;
  topic?: string;
  foco_da_questao?: string;
  foco?: string;
  micro_foco?: string;
  microfoco?: string;
  subfoco?: string;
  tipo?: string;
  enunciado?: string;
  question?: string;
  texto?: string;
  imagem?: string;
  image?: string;
  tags?: string[];
  alternativas?: Record<string, string> | Array<{ key?: string; letra?: string; texto?: string; text?: string } | string>;
  resposta_correta?: string;
  gabarito?: string;
  correta?: string;
  explicacao?: string;
  comentario?: string;
  justificativa?: string;
  [key: string]: any;
}

interface ProgressRecord {
  id_questao: string | number;
  tema: string;
  especialidade: string;
  foco: string;
  micro_foco?: string;
  correta: boolean;
  resposta_usuario: string;
  gabarito: string;
  data: string;
}

interface UserAnswerRecord {
  selectedAlt: string | null;
  isAnswered: boolean;
  isCorrect?: boolean;
  discardedAlts?: string[];
}

interface ZoomableImageModalProps {
  visible: boolean;
  imageUri: string | null;
  onClose: () => void;
}

const zoomStyles = StyleSheet.create({
  zoomModalSafeArea: {
    flex: 1,
    backgroundColor: '#0a0b0c',
  },
  zoomModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'transparent',
  },
  zoomModalCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(38, 41, 45, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomModalBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a0b0c',
    overflow: 'hidden',
  },
  zoomGestureArea: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomModalImage: {
    width: '100%',
    height: '100%',
  },
  zoomFloatingResetContainer: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
  },
  zoomFloatingResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(24, 27, 30, 0.92)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#373c42',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  zoomFloatingResetText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});

const ZoomableImageModal: React.FC<ZoomableImageModalProps> = ({ visible, imageUri, onClose }) => {
  const containerWidth = useSharedValue(360);
  const containerHeight = useSharedValue(500);

  const imageNaturalWidth = useSharedValue(0);
  const imageNaturalHeight = useSharedValue(0);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const startScale = useSharedValue(1);
  const pinchStartTx = useSharedValue(0);
  const pinchStartTy = useSharedValue(0);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);

  const panStartTx = useSharedValue(0);
  const panStartTy = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      scale.value = 1;
      savedScale.value = 1;
      translateX.value = 0;
      savedTranslateX.value = 0;
      translateY.value = 0;
      savedTranslateY.value = 0;
    }
  }, [visible]);

  useEffect(() => {
    if (imageUri) {
      Image.getSize(
        imageUri,
        (w, h) => {
          if (w > 0 && h > 0) {
            imageNaturalWidth.value = w;
            imageNaturalHeight.value = h;
          }
        },
        () => {
          // Fallback silencioso
        }
      );
    }
  }, [imageUri]);

  // Gesto de Pinça (Pinch) Livre - zoom contínuo e orgânico sem limites fixos ou degraus
  const pinchGesture = Gesture.Pinch()
    .onStart((e) => {
      startScale.value = scale.value;
      pinchStartTx.value = translateX.value;
      pinchStartTy.value = translateY.value;
      focalX.value = e.focalX;
      focalY.value = e.focalY;
    })
    .onUpdate((e) => {
      const newScale = startScale.value * e.scale;
      // Permite zoom fluido sem degraus fixos, com resistência suave abaixo de 1.0x
      if (newScale < 1.0) {
        scale.value = Math.max(0.85, 1.0 - (1.0 - newScale) * 0.4);
      } else {
        scale.value = Math.min(6.0, newScale);
      }

      const deltaX = e.focalX - focalX.value;
      const deltaY = e.focalY - focalY.value;
      translateX.value = pinchStartTx.value + deltaX;
      translateY.value = pinchStartTy.value + deltaY;
    })
    .onEnd(() => {
      if (scale.value < 1.05) {
        // Se soltou com zoom abaixo do tamanho original, reseta suavemente sem bounce
        scale.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) });
        translateX.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.quad) });
        translateY.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.quad) });
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        const finalScale = Math.min(5.0, Math.max(1.0, scale.value));
        scale.value = withTiming(finalScale, { duration: 220, easing: Easing.out(Easing.quad) });
        savedScale.value = finalScale;

        // Limita o deslocamento para que a imagem permaneça contida no visor
        const maxTx = Math.max(0, (containerWidth.value * (finalScale - 1)) / 2);
        const maxTy = Math.max(0, (containerHeight.value * (finalScale - 1)) / 2);
        const boundedX = Math.max(-maxTx, Math.min(maxTx, translateX.value));
        const boundedY = Math.max(-maxTy, Math.min(maxTy, translateY.value));

        translateX.value = withTiming(boundedX, { duration: 220, easing: Easing.out(Easing.quad) });
        translateY.value = withTiming(boundedY, { duration: 220, easing: Easing.out(Easing.quad) });
        savedTranslateX.value = boundedX;
        savedTranslateY.value = boundedY;
      }
    });

  // Gesto de Arraste (Pan) - permite mover a imagem livremente quando ampliada
  const panGesture = Gesture.Pan()
    .averageTouches(true)
    .onStart(() => {
      panStartTx.value = translateX.value;
      panStartTy.value = translateY.value;
    })
    .onUpdate((e) => {
      if (scale.value > 1.02) {
        const nextTx = panStartTx.value + e.translationX;
        const nextTy = panStartTy.value + e.translationY;

        const maxTx = Math.max(0, (containerWidth.value * (scale.value - 1)) / 2);
        const maxTy = Math.max(0, (containerHeight.value * (scale.value - 1)) / 2);

        // Resistência elástica suave ao arrastar além das bordas
        if (nextTx > maxTx) {
          translateX.value = maxTx + (nextTx - maxTx) * 0.25;
        } else if (nextTx < -maxTx) {
          translateX.value = -maxTx + (nextTx + maxTx) * 0.25;
        } else {
          translateX.value = nextTx;
        }

        if (nextTy > maxTy) {
          translateY.value = maxTy + (nextTy - maxTy) * 0.25;
        } else if (nextTy < -maxTy) {
          translateY.value = -maxTy + (nextTy + maxTy) * 0.25;
        } else {
          translateY.value = nextTy;
        }
      }
    })
    .onEnd(() => {
      if (scale.value > 1.02) {
        const maxTx = Math.max(0, (containerWidth.value * (scale.value - 1)) / 2);
        const maxTy = Math.max(0, (containerHeight.value * (scale.value - 1)) / 2);
        const boundedX = Math.max(-maxTx, Math.min(maxTx, translateX.value));
        const boundedY = Math.max(-maxTy, Math.min(maxTy, translateY.value));

        translateX.value = withTiming(boundedX, { duration: 220, easing: Easing.out(Easing.quad) });
        translateY.value = withTiming(boundedY, { duration: 220, easing: Easing.out(Easing.quad) });
        savedTranslateX.value = boundedX;
        savedTranslateY.value = boundedY;
      } else {
        translateX.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.quad) });
        translateY.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.quad) });
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    });

  // Helper de detecção geométrica precisa: verifica se o ponto tocado está dentro da imagem visível
  const isPointInsideImage = (touchX: number, touchY: number) => {
    'worklet';
    const cW = containerWidth.value;
    const cH = containerHeight.value;
    const natW = imageNaturalWidth.value;
    const natH = imageNaturalHeight.value;

    if (cW <= 0 || cH <= 0) return true;

    // Se ainda não temos dimensão natural da imagem, assume que preenche a tela
    let baseW = cW;
    let baseH = cH;

    if (natW > 0 && natH > 0) {
      const contRatio = cW / cH;
      const imgRatio = natW / natH;
      if (imgRatio > contRatio) {
        baseW = cW;
        baseH = cW / imgRatio;
      } else {
        baseH = cH;
        baseW = cH * imgRatio;
      }
    }

    const currentW = baseW * scale.value;
    const currentH = baseH * scale.value;

    const centerX = cW / 2 + translateX.value;
    const centerY = cH / 2 + translateY.value;

    const minX = centerX - currentW / 2;
    const maxX = centerX + currentW / 2;
    const minY = centerY - currentH / 2;
    const maxY = centerY + currentH / 2;

    return touchX >= minX && touchX <= maxX && touchY >= minY && touchY <= maxY;
  };

  // Gesto de Toque Único - fecha o visualizador se clicar em qualquer canto preto fora da imagem
  const singleTapGesture = Gesture.Tap()
    .numberOfTaps(1)
    .maxDuration(350)
    .maxDistance(15)
    .onEnd((e) => {
      if (!isPointInsideImage(e.x, e.y)) {
        runOnJS(onClose)();
      }
    });

  // Gesto de Toque Duplo (Double Tap) - alterna rapidamente entre 1x e 2.5x focado no local tocado
  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(280)
    .onEnd((e) => {
      if (!isPointInsideImage(e.x, e.y)) {
        return;
      }
      if (scale.value > 1.15) {
        // Redefine para 1x de forma suave e linear sem bounce
        scale.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) });
        translateX.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.quad) });
        translateY.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.quad) });
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        // Zoom em 2.5x centrado no ponto tocado sem bounce
        const targetScale = 2.5;
        const originOffsetX = e.x - containerWidth.value / 2;
        const originOffsetY = e.y - containerHeight.value / 2;
        const targetTx = -originOffsetX * (targetScale - 1);
        const targetTy = -originOffsetY * (targetScale - 1);

        const maxTx = Math.max(0, (containerWidth.value * (targetScale - 1)) / 2);
        const maxTy = Math.max(0, (containerHeight.value * (targetScale - 1)) / 2);
        const boundedX = Math.max(-maxTx, Math.min(maxTx, targetTx));
        const boundedY = Math.max(-maxTy, Math.min(maxTy, targetTy));

        scale.value = withTiming(targetScale, { duration: 240, easing: Easing.out(Easing.quad) });
        translateX.value = withTiming(boundedX, { duration: 240, easing: Easing.out(Easing.quad) });
        translateY.value = withTiming(boundedY, { duration: 240, easing: Easing.out(Easing.quad) });
        savedScale.value = targetScale;
        savedTranslateX.value = boundedX;
        savedTranslateY.value = boundedY;
      }
    });

  const composedGestures = Gesture.Simultaneous(
    Gesture.Simultaneous(doubleTapGesture, singleTapGesture),
    Gesture.Simultaneous(pinchGesture, panGesture)
  );

  const animatedImageStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
    };
  });

  const resetBtnAnimatedStyle = useAnimatedStyle(() => {
    const isZoomed = scale.value > 1.05;
    return {
      opacity: withTiming(isZoomed ? 1 : 0, { duration: 180 }),
      transform: [
        { scale: withTiming(isZoomed ? 1 : 0.85, { duration: 180 }) },
      ],
    };
  });

  const handleResetPress = () => {
    scale.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) });
    translateX.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.quad) });
    translateY.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.quad) });
    savedScale.value = 1;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  };

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaView style={zoomStyles.zoomModalSafeArea}>
          <StatusBar hidden={true} barStyle="light-content" backgroundColor="#0a0b0c" />
          <Pressable style={zoomStyles.zoomModalHeader} onPress={onClose}>
            <TouchableOpacity
              style={zoomStyles.zoomModalCloseBtn}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={26} color="#FFFFFF" />
            </TouchableOpacity>
          </Pressable>

          <View
            style={zoomStyles.zoomModalBody}
            onLayout={(e) => {
              const { width, height } = e.nativeEvent.layout;
              if (width > 0 && height > 0) {
                containerWidth.value = width;
                containerHeight.value = height;
              }
            }}
          >
            <GestureDetector gesture={composedGestures}>
              <Reanimated.View style={zoomStyles.zoomGestureArea}>
                {imageUri ? (
                  <Reanimated.Image
                    source={{ uri: imageUri }}
                    style={[zoomStyles.zoomModalImage, animatedImageStyle]}
                    resizeMode="contain"
                    onLoad={(e) => {
                      const { width, height } = e.nativeEvent.source;
                      if (width > 0 && height > 0) {
                        imageNaturalWidth.value = width;
                        imageNaturalHeight.value = height;
                      }
                    }}
                  />
                ) : null}
              </Reanimated.View>
            </GestureDetector>

            {/* Botão Flutuante Redefinir (surge apenas se houver zoom) */}
            <Reanimated.View
              style={[zoomStyles.zoomFloatingResetContainer, resetBtnAnimatedStyle]}
              pointerEvents="box-none"
            >
              <TouchableOpacity
                style={zoomStyles.zoomFloatingResetBtn}
                onPress={handleResetPress}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name="fit-to-screen-outline"
                  size={18}
                  color="#FFFFFF"
                  style={{ marginRight: 6 }}
                />
                <Text style={zoomStyles.zoomFloatingResetText}>Redefinir zoom</Text>
              </TouchableOpacity>
            </Reanimated.View>
          </View>
        </SafeAreaView>
      </GestureHandlerRootView>
    </Modal>
  );
};

export default function QuizScreen() {
  const { colors: theme, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);

  const { especialidade, tema, limite, retomar, simulado, blocoId } = useLocalSearchParams<{
    especialidade?: string;
    tema?: string;
    limite?: string;
    retomar?: string;
    simulado?: string;
    blocoId?: string;
  }>();
  const router = useRouter();
  const scrollViewRef = useRef<ScrollView>(null);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  // Cronômetro invisível para cálculo de tempo e sessão de estudos
  const questionStartTime = useRef<number>(Date.now());
  const sessionIdRef = useRef<string>(`sessao_${Date.now()}`);

  useEffect(() => {
    questionStartTime.current = Date.now();
  }, [currentIndex]);
  const [selectedAlt, setSelectedAlt] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [correctCount, setCorrectCount] = useState<number>(0);
  const [wrongCount, setWrongCount] = useState<number>(0);
  const [streakAcertos, setStreakAcertos] = useState<number>(0);
  const [discardedAlts, setDiscardedAlts] = useState<string[]>([]);
  const [showExitModal, setShowExitModal] = useState<boolean>(false);
  const [showFinishModal, setShowFinishModal] = useState<boolean>(false);
  const [isFavorito, setIsFavorito] = useState<boolean>(false);
  const [isSimulado, setIsSimulado] = useState<boolean>(() => simulado === 'true');

  // Estados e controle do Modo de Revisão Pós-Finalização
  const [answersHistory, setAnswersHistory] = useState<Record<number, UserAnswerRecord>>({});
  const [isReviewMode, setIsReviewMode] = useState<boolean>(false);
  const [showReviewGridModal, setShowReviewGridModal] = useState<boolean>(false);

  const goToQuestion = (targetIndex: number) => {
    if (targetIndex < 0 || targetIndex >= questions.length) return;
    setCurrentIndex(targetIndex);
    const pastAnswer = answersHistory[targetIndex];
    if (pastAnswer) {
      setSelectedAlt(pastAnswer.selectedAlt);
      setIsAnswered(pastAnswer.isAnswered);
      setDiscardedAlts(pastAnswer.discardedAlts || []);
    } else {
      setSelectedAlt(null);
      setIsAnswered(false);
      setDiscardedAlts([]);
    }
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  };

  // Ref para manter snapshot sincronizado do estado da sessão
  const sessionRef = useRef({
    questions,
    currentIndex,
    correctCount,
    wrongCount,
    streakAcertos,
    answersHistory,
    isReviewMode,
    selectedAlt,
    isAnswered,
    discardedAlts,
    isSimulado,
  });

  useEffect(() => {
    sessionRef.current = {
      questions,
      currentIndex,
      correctCount,
      wrongCount,
      streakAcertos,
      answersHistory,
      isReviewMode,
      selectedAlt,
      isAnswered,
      discardedAlts,
      isSimulado,
    };
  }, [
    questions,
    currentIndex,
    correctCount,
    wrongCount,
    streakAcertos,
    answersHistory,
    isReviewMode,
    selectedAlt,
    isAnswered,
    discardedAlts,
    isSimulado,
  ]);

  // Auto-save contínuo resiliente (debounced 5000ms) para persistência segura sem superaquecer o celular
  useEffect(() => {
    if (loading || isReviewMode || questions.length === 0) return;

    const timer = setTimeout(() => {
      saveActiveQuizSession({
        ...sessionRef.current,
        timestamp: Date.now(),
      }).catch((e) => console.warn('[Athena Quiz] Erro no auto-save periódico:', e));
    }, 5000);

    return () => clearTimeout(timer);
  }, [
    loading,
    questions,
    currentIndex,
    correctCount,
    wrongCount,
    streakAcertos,
    answersHistory,
    selectedAlt,
    isAnswered,
    discardedAlts,
    isReviewMode,
  ]);

  // Sincronização imediata ao minimizar ou fechar o app em segundo plano via AppState (força escrita no disco)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState.match(/inactive|background/)) {
        if (!loading && !isReviewMode && sessionRef.current.questions.length > 0) {
          saveActiveQuizSession(
            {
              ...sessionRef.current,
              timestamp: Date.now(),
            },
            true
          ).catch((e) => console.warn('[Athena Quiz] Erro ao salvar no AppState background:', e));
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [loading, isReviewMode]);

  // Estados e animação para o Toast não-intrusivo de Streak de Acertos
  const [toastMessage, setToastMessage] = useState<string>('');
  const [toastVisible, setToastVisible] = useState<boolean>(false);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTranslateY = useRef(new Animated.Value(-24)).current;
  const toastScale = useRef(new Animated.Value(0.9)).current;
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dicionário de Frases (Milestones) de Streak de Acertos
  const getStreakMilestoneMessage = (streak: number): string | null => {
    switch (streak) {
      case 3:
        return '🔥 3 seguidas. Bom ritmo.';
      case 5:
        return '🎉 Parabéns! 5 acertos em sequência.';
      case 10:
        return '⚡ 10 seguidas. Precisão clínica.';
      case 15:
        return '🧠 15 acertos. Alto rendimento.';
      case 20:
        return '📚 20 invictas. Domínio do tema.';
      default:
        if (streak > 20 && streak % 10 === 0) {
          return `🔥 ${streak} seguidas. Domínio absoluto.`;
        }
        return null;
    }
  };

  const showStreakToast = (msg: string) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }

    setToastMessage(msg);
    setToastVisible(true);

    toastOpacity.setValue(0);
    toastTranslateY.setValue(-36);
    toastScale.setValue(0.95);

    Animated.parallel([
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.spring(toastTranslateY, {
        toValue: 0,
        friction: 8,
        tension: 45,
        useNativeDriver: true,
      }),
      Animated.spring(toastScale, {
        toValue: 1,
        friction: 8,
        tension: 50,
        useNativeDriver: true,
      }),
    ]).start();

    // Desaparece sozinho após 5 segundos (por volta de 5s, conforme solicitado)
    toastTimerRef.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(toastOpacity, {
          toValue: 0,
          duration: 380,
          useNativeDriver: true,
        }),
        Animated.timing(toastTranslateY, {
          toValue: -28,
          duration: 380,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setToastVisible(false);
      });
    }, 5000);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  // Estado da imagem offline dinâmica
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [modalZoomVisible, setModalZoomVisible] = useState<boolean>(false);

  const toggleDiscardAlternative = (altKey: string) => {
    if (isAnswered) return;
    setDiscardedAlts((prev) =>
      prev.includes(altKey)
        ? prev.filter((k) => k !== altKey)
        : [...prev, altKey]
    );
  };

  // Hash determinístico cobrindo o conteúdo completo da questão (enunciado + alternativas)
  const getQuestionContentHash = (q: any): string => {
    if (!q) return '0';
    const qEsp = getQuestionEspecialidade(q);
    const qTema = getQuestionTema(q);

    const text = (
      q.enunciado ||
      q.question ||
      q.texto ||
      q.descricao ||
      q.corpo ||
      q.pergunta ||
      q.statement ||
      ''
    ).toString().replace(/\s+/g, ' ').trim().toLowerCase();

    // Hash cobrindo todo o texto da questão
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }

    // Hash secundário sobre alternativas para diferenciar casos clínicos que começam iguais
    let altHash = 0;
    const alts = q.alternativas || q.options || q.choices || [];
    if (Array.isArray(alts) && alts.length > 0) {
      const firstAlt = String(typeof alts[0] === 'object' ? (alts[0].texto || alts[0].text || '') : alts[0]).trim();
      for (let i = 0; i < firstAlt.length; i++) {
        altHash = ((altHash << 5) - altHash + firstAlt.charCodeAt(i)) | 0;
      }
    }

    return `${qEsp}_${qTema}_${Math.abs(hash)}_${Math.abs(altHash)}`;
  };

  // Hash legado (primeiros 120 caracteres) para compatibilidade retroativa com histórico existente
  const getLegacyQuestionHash = (q: any): string => {
    if (!q) return '';
    const qEsp = getQuestionEspecialidade(q);
    const qTema = getQuestionTema(q);
    const text = (q.enunciado || q.question || q.texto || '').trim();
    if (text.length > 0) {
      let hash = 0;
      for (let i = 0; i < Math.min(text.length, 120); i++) {
        hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
      }
      return `${qEsp}_${qTema}_${Math.abs(hash)}`;
    }
    return '';
  };

  // Helper para obter o ID consistente da questão (prioriza id/id_questao explícito ou hash determinístico)
  const getQuestionId = (q?: Question, fallbackIdx: number = currentIndex): string => {
    if (!q) return String(fallbackIdx);
    const rawId = q.id ?? q.id_questao ?? (q as any)._id;
    if (rawId !== undefined && rawId !== null && String(rawId).trim() !== '') {
      return String(rawId).trim();
    }
    return getQuestionContentHash(q);
  };

  // Verifica se a questão atual está salva em @athena_favoritos
  const checkFavorito = async () => {
    try {
      const currentQuestion = questions[currentIndex];
      if (!currentQuestion) {
        setIsFavorito(false);
        return;
      }
      const qId = getQuestionId(currentQuestion, currentIndex);
      const data = storage.getString('@athena_favoritos');
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          const isFav = parsed.some((item: any) => String(item) === qId);
          setIsFavorito(isFav);
          return;
        }
      }
      setIsFavorito(false);
    } catch (err) {
      console.error('Erro ao verificar favorito:', err);
      setIsFavorito(false);
    }
  };

  // Alterna o status de favorito da questão atual
  const toggleFavorito = () => {
    try {
      const currentQuestion = questions[currentIndex];
      if (!currentQuestion) return;

      const qId = getQuestionId(currentQuestion, currentIndex);
      const data = storage.getString('@athena_favoritos');
      let favList: any[] = [];

      if (data) {
        try {
          const parsed = JSON.parse(data);
          if (Array.isArray(parsed)) {
            favList = parsed;
          }
        } catch {
          favList = [];
        }
      }

      const exists = favList.some((item) => String(item) === qId);
      let updatedList: any[];

      if (exists) {
        updatedList = favList.filter((item) => String(item) !== qId);
      } else {
        updatedList = [...favList, qId];
      }

      storage.set('@athena_favoritos', JSON.stringify(updatedList));
      setIsFavorito(!exists);
    } catch (err) {
      console.error('Erro ao alternar favorito:', err);
    }
  };

  // Dispara a verificação sempre que a questão atual (currentIndex) mudar
  useEffect(() => {
    checkFavorito();
  }, [currentIndex, questions]);

  useEffect(() => {
    carregarQuestoes();
  }, [especialidade, tema, retomar]);

  // Intercepta o botão voltar nativo do Android para exibir o diálogo customizado de saída ou reabrir resultados na revisão
  useEffect(() => {
    const backAction = () => {
      if (showReviewGridModal) {
        setShowReviewGridModal(false);
        return true;
      }
      if (isReviewMode) {
        router.back();
        return true;
      }
      setShowExitModal(true);
      return true;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [isReviewMode, showReviewGridModal]);

  // Algoritmo de Fisher-Yates para embaralhar aleatoriamente as questões
  const fisherYatesShuffle = <T,>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  const carregarQuestoes = async () => {
    try {
      setLoading(true);

      // Se for pedido para retomar sessão anterior salva
      if (retomar === 'true') {
        const parsed = await loadActiveQuizSession();
        if (parsed && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
          const restoredIndex = typeof parsed.currentIndex === 'number' ? parsed.currentIndex : 0;
          setQuestions(parsed.questions);
          setCurrentIndex(restoredIndex);
          setCorrectCount(typeof parsed.correctCount === 'number' ? parsed.correctCount : 0);
          setWrongCount(typeof parsed.wrongCount === 'number' ? parsed.wrongCount : 0);
          setStreakAcertos(typeof parsed.streakAcertos === 'number' ? parsed.streakAcertos : 0);
          const history = parsed.answersHistory || {};
          setAnswersHistory(history);
          setIsReviewMode(!!parsed.isReviewMode);
          setIsSimulado(!!parsed.isSimulado);

          // Restaura o estado da questão atual (se já havia sido respondida ou selecionada)
          const pastAnswer = history[restoredIndex];
          if (pastAnswer) {
            setSelectedAlt(pastAnswer.selectedAlt || null);
            setIsAnswered(!!pastAnswer.isAnswered);
            setDiscardedAlts(Array.isArray(pastAnswer.discardedAlts) ? pastAnswer.discardedAlts : []);
          } else {
            setSelectedAlt(parsed.selectedAlt || null);
            setIsAnswered(!!parsed.isAnswered);
            setDiscardedAlts(Array.isArray(parsed.discardedAlts) ? parsed.discardedAlts : []);
          }

          setLoading(false);
          return;
        }
      }

      // Se for um novo bloco de questões, limpa qualquer sessão pendente anterior
      await clearActiveQuizSession();

      // MODO SIMULADO (Provas de Residência Médica: 20% Clínica Médica, 20% Cirurgia, 20% Pediatria, 20% Ginecologia/Obstetrícia, 20% Preventiva)
      if (simulado === 'true') {
        setIsSimulado(true);

        // Aplica o limite de questões escolhido pelo usuário (padrão: 20)
        let maxQuestoesSimulado = 20;
        if (limite) {
          const parsedLim = parseInt(limite, 10);
          if (parsedLim > 0) maxQuestoesSimulado = parsedLim;
        } else {
          const savedLimit = storage.getString('@athena_quiz_limit');
          if (savedLimit) {
            const parsedSaved = parseInt(savedLimit, 10);
            if (parsedSaved > 0) maxQuestoesSimulado = parsedSaved;
          }
        }

        const filtrosData = storage.getString('@athena_filtros_simulado');
        const progressData = storage.getString('@athena_progress');
        const favoritosData = storage.getString('@athena_favoritos');

        let filtrosSimulado = { apenasErrei: false, apenasFavoritas: false };
        if (filtrosData) {
          try {
            const parsedFiltros = JSON.parse(filtrosData);
            if (parsedFiltros) {
              filtrosSimulado = {
                apenasErrei: !!parsedFiltros.apenasErrei,
                apenasFavoritas: !!parsedFiltros.apenasFavoritas,
              };
            }
          } catch (e) {
            console.error('Erro ao ler filtros do simulado:', e);
          }
        }

        let todasQuestoes = await getAllQuestions();
        if (!todasQuestoes || todasQuestoes.length === 0) {
          todasQuestoes = await getQuestoesCache();
        }

        if (!todasQuestoes || !Array.isArray(todasQuestoes) || todasQuestoes.length === 0) {
          setQuestions([]);
          setLoading(false);
          return;
        }

        // Normalização das questões
        const normalized = todasQuestoes.map((q: any, idx: number) => {
          if (!q || typeof q !== 'object') return q;
          const stableId = getQuestionId(q, idx);
          const esp = getQuestionEspecialidade(q);
          const tema = getQuestionTema(q);
          return {
            ...q,
            id: stableId,
            id_questao: stableId,
            especialidade: q.especialidade || esp,
            tema: tema,
            tema_principal: tema,
          };
        });

        let pool = normalized;

        // Filtro 1: Apenas questões que já errei
        if (filtrosSimulado.apenasErrei) {
          const erroredIds = await getErroredQuestionIds();
          pool = pool.filter((q: any, idx: number) => {
            const rawId = q.id ?? q.id_questao ?? (q as any)._id;
            const qId = rawId !== undefined && rawId !== null ? String(rawId).trim() : getQuestionId(q, idx);
            const cHash = getQuestionContentHash(q);
            const lHash = getLegacyQuestionHash(q);
            return (
              erroredIds.has(qId) ||
              (rawId && erroredIds.has(String(rawId).trim())) ||
              erroredIds.has(cHash) ||
              (lHash && erroredIds.has(lHash))
            );
          });
        }

        // Filtro 2: Apenas favoritas
        if (filtrosSimulado.apenasFavoritas) {
          const favIds = new Set<string>();
          if (favoritosData) {
            try {
              const parsedFavs = JSON.parse(favoritosData);
              if (Array.isArray(parsedFavs)) {
                for (const f of parsedFavs) {
                  if (f !== undefined && f !== null) favIds.add(String(f).trim());
                }
              }
            } catch (e) {}
          }
          pool = pool.filter((q: any, idx: number) => {
            const rawId = q.id ?? q.id_questao ?? (q as any)._id;
            const qId = rawId !== undefined && rawId !== null ? String(rawId).trim() : getQuestionId(q, idx);
            const cHash = getQuestionContentHash(q);
            const lHash = getLegacyQuestionHash(q);
            return (
              favIds.has(qId) ||
              (rawId && favIds.has(String(rawId).trim())) ||
              favIds.has(cHash) ||
              (lHash && favIds.has(lHash))
            );
          });
        }

        // Separação em 5 grupos (20% cada)
        const buckets: Record<GrandeAreaSimulado, any[]> = {
          clinica_medica: [],
          ginecologia_obstetricia: [],
          pediatria: [],
          medicina_preventiva: [],
          cirurgia: [],
        };

        for (const q of pool) {
          const area = classificarGrandeArea(q);
          buckets[area].push(q);
        }

        const areaKeys: GrandeAreaSimulado[] = [
          'clinica_medica',
          'ginecologia_obstetricia',
          'pediatria',
          'medicina_preventiva',
          'cirurgia',
        ];

        const basePerArea = Math.floor(maxQuestoesSimulado / 5);
        const remainder = maxQuestoesSimulado % 5;

        // Histórico de questões já respondidas
        const answeredQuestionIds = new Set<string>();
        if (progressData) {
          try {
            const parsedProgress = JSON.parse(progressData);
            if (Array.isArray(parsedProgress)) {
              for (const p of parsedProgress) {
                if (p && p.id_questao !== undefined && p.id_questao !== null) {
                  answeredQuestionIds.add(String(p.id_questao).trim());
                }
              }
            }
          } catch (e) {}
        }

        const isQuestionAnswered = (q: any, idx: number): boolean => {
          const rawId = q.id ?? q.id_questao ?? (q as any)._id;
          if (rawId !== undefined && rawId !== null && answeredQuestionIds.has(String(rawId).trim())) {
            return true;
          }
          const qId = getQuestionId(q, idx);
          if (answeredQuestionIds.has(qId)) return true;
          const contentHash = getQuestionContentHash(q);
          if (answeredQuestionIds.has(contentHash)) return true;
          const legacyHash = getLegacyQuestionHash(q);
          if (legacyHash && answeredQuestionIds.has(legacyHash)) return true;
          return false;
        };

        const selectedQuestoes: any[] = [];
        const leftovers: any[] = [];

        for (let i = 0; i < areaKeys.length; i++) {
          const key = areaKeys[i];
          const areaTarget = basePerArea + (i < remainder ? 1 : 0);
          const areaPool = buckets[key];

          const ineditas: any[] = [];
          const jaRespondidas: any[] = [];

          for (let idx = 0; idx < areaPool.length; idx++) {
            const q = areaPool[idx];
            if (isQuestionAnswered(q, idx)) {
              jaRespondidas.push(q);
            } else {
              ineditas.push(q);
            }
          }

          const shuffledIneditas = fisherYatesShuffle(ineditas);
          const shuffledRespondidas = fisherYatesShuffle(jaRespondidas);

          const orderedAreaQuestions = [...shuffledIneditas, ...shuffledRespondidas];
          const picked = orderedAreaQuestions.slice(0, areaTarget);
          selectedQuestoes.push(...picked);

          if (orderedAreaQuestions.length > areaTarget) {
            leftovers.push(...orderedAreaQuestions.slice(areaTarget));
          }
        }

        // Se alguma área teve menos questões que a sua cota de 20%, preenche com sobras das demais
        if (selectedQuestoes.length < maxQuestoesSimulado && leftovers.length > 0) {
          const needed = maxQuestoesSimulado - selectedQuestoes.length;
          const extra = fisherYatesShuffle(leftovers).slice(0, needed);
          selectedQuestoes.push(...extra);
        }

        // Embaralha o conjunto final para simular uma prova real com questões intercaladas
        const finalSimuladoQuestions = fisherYatesShuffle(selectedQuestoes);

        setQuestions(finalSimuladoQuestions);
        preloadQuestionImages(finalSimuladoQuestions, 0, 3);
        setCurrentIndex(0);
        setSelectedAlt(null);
        setIsAnswered(false);
        setCorrectCount(0);
        setWrongCount(0);
        setStreakAcertos(0);
        setAnswersHistory({});
        setLoading(false);
        return;
      }


      const cartData = storage.getString('@athena_cart');
      const filtrosData = storage.getString('@athena_filtros_simulado');
      const progressData = storage.getString('@athena_progress');
      const favoritosData = storage.getString('@athena_favoritos');

      let cartThemes: Array<{
        especialidade?: string;
        tema: string;
        allowedQuestionIds?: string[];
      }> = [];
      if (cartData) {
        const parsedCart = JSON.parse(cartData);
        if (Array.isArray(parsedCart)) {
          cartThemes = parsedCart.map((item: any) => {
            if (typeof item === 'string') {
              return { tema: item.trim().toLowerCase() };
            }
            return {
              especialidade: (item?.especialidade || '').toString().trim().toLowerCase(),
              tema: (item?.tema || '').toString().trim().toLowerCase(),
              allowedQuestionIds: Array.isArray(item?.allowedQuestionIds)
                ? item.allowedQuestionIds.map((id: any) => String(id).trim())
                : undefined,
            };
          });
        }
      }

      // Fallback para parâmetros de rota caso não haja carrinho
      if (cartThemes.length === 0 && (especialidade || tema)) {
        if (tema) {
          cartThemes.push({
            especialidade: especialidade ? decodeURIComponent(especialidade).trim().toLowerCase() : undefined,
            tema: decodeURIComponent(tema).trim().toLowerCase(),
          });
        }
      }

      if (cartThemes.length === 0) {
        setQuestions([]);
        return;
      }

      // Consulta seletiva no SQLite apenas para os temas presentes no simulado
      const temasNomes = cartThemes.map((t) => t.tema);
      let parsedQuestoes = await getQuestionsByThemes(temasNomes);
      if (!parsedQuestoes || parsedQuestoes.length === 0) {
        parsedQuestoes = await getQuestoesCache();
      }

      if (!parsedQuestoes || !Array.isArray(parsedQuestoes) || parsedQuestoes.length === 0) {
        setQuestions([]);
        return;
      }

      // Normaliza garantindo que toda questão tenha um id estável, especialidade e tema corretos
      const normalizedQuestoes = parsedQuestoes.map((q: any, idx: number) => {
        if (!q || typeof q !== 'object') return q;
        const stableId = getQuestionId(q, idx);
        const esp = getQuestionEspecialidade(q);
        const tema = getQuestionTema(q);
        return {
          ...q,
          id: stableId,
          id_questao: stableId,
          especialidade: q.especialidade || esp,
          tema: tema,
          tema_principal: tema,
        };
      });

      // Filtra as questões cujos temas coincidem com os temas do carrinho
      const filtered = normalizedQuestoes.filter((q: any) => {
        const rawEsp = getQuestionEspecialidade(q).toLowerCase();
        const rawTema = getQuestionTema(q).toLowerCase();

        return cartThemes.some((target) => {
          const matchTema = target.tema === rawTema;
          if (!matchTema) return false;
          if (target.especialidade && target.especialidade !== rawEsp) return false;

          // Se o tema possuir lista restrita de IDs selecionados via filtro de focos/micro-focos
          if (Array.isArray(target.allowedQuestionIds) && target.allowedQuestionIds.length > 0) {
            const stableId = String(q.id ?? q.id_questao ?? '').trim();
            return target.allowedQuestionIds.includes(stableId);
          }

          return true;
        });
      });

      // Leitura e aplicação dos filtros do simulado (Erros e Favoritas)
      let filtrosSimulado = { apenasErrei: false, apenasFavoritas: false };
      if (filtrosData) {
        try {
          const parsedFiltros = JSON.parse(filtrosData);
          if (parsedFiltros) {
            filtrosSimulado = {
              apenasErrei: !!parsedFiltros.apenasErrei,
              apenasFavoritas: !!parsedFiltros.apenasFavoritas,
            };
          }
        } catch (e) {
          console.error('Erro ao ler filtros do simulado no quiz:', e);
        }
      }

      let baseFiltered = filtered;

      // Filtro 1: Apenas questões que já errei
      if (filtrosSimulado.apenasErrei) {
        const erroredIds = await getErroredQuestionIds();

        baseFiltered = baseFiltered.filter((q: any, idx: number) => {
          const rawId = q.id ?? q.id_questao ?? (q as any)._id;
          const qId = rawId !== undefined && rawId !== null ? String(rawId).trim() : getQuestionId(q, idx);
          const cHash = getQuestionContentHash(q);
          const lHash = getLegacyQuestionHash(q);
          return (
            erroredIds.has(qId) ||
            (rawId && erroredIds.has(String(rawId).trim())) ||
            erroredIds.has(cHash) ||
            (lHash && erroredIds.has(lHash))
          );
        });
      }

      // Filtro 2: Apenas favoritas
      if (filtrosSimulado.apenasFavoritas) {
        const favIds = new Set<string>();
        if (favoritosData) {
          try {
            const parsedFavs = JSON.parse(favoritosData);
            if (Array.isArray(parsedFavs)) {
              for (const f of parsedFavs) {
                if (f !== undefined && f !== null) {
                  favIds.add(String(f).trim());
                }
              }
            }
          } catch (e) {
            console.error('Erro ao processar favoritosData para filtro:', e);
          }
        }

        baseFiltered = baseFiltered.filter((q: any, idx: number) => {
          const rawId = q.id ?? q.id_questao ?? (q as any)._id;
          const qId = rawId !== undefined && rawId !== null ? String(rawId).trim() : getQuestionId(q, idx);
          const cHash = getQuestionContentHash(q);
          const lHash = getLegacyQuestionHash(q);
          return (
            favIds.has(qId) ||
            (rawId && favIds.has(String(rawId).trim())) ||
            favIds.has(cHash) ||
            (lHash && favIds.has(lHash))
          );
        });
      }

      // Aplica o limite de questões escolhido pelo usuário (padrão: 20)
      let maxQuestoes: number | undefined = undefined;
      if (limite) {
        const parsedLim = parseInt(limite, 10);
        if (parsedLim > 0) maxQuestoes = parsedLim;
      }
      if (!maxQuestoes) {
        const savedLimit = storage.getString('@athena_quiz_limit');
        if (savedLimit) {
          const parsedSaved = parseInt(savedLimit, 10);
          if (parsedSaved > 0) maxQuestoes = parsedSaved;
        }
      }
      if (!maxQuestoes) {
        maxQuestoes = 20;
      }

      let finalQuestions: any[] = [];

      if (filtrosSimulado.apenasErrei) {
        // Se pediu explicitamente para refazer os erros, embaralha as erradas e limita
        finalQuestions = fisherYatesShuffle(baseFiltered).slice(0, maxQuestoes);
      } else {
        // Prioriza questões INÉDITAS (questões nunca respondidas pelo usuário)
        const answeredQuestionIds = new Set<string>();
        if (progressData) {
          try {
            const parsedProgress = JSON.parse(progressData);
            if (Array.isArray(parsedProgress)) {
              for (const p of parsedProgress) {
                if (p && p.id_questao !== undefined && p.id_questao !== null) {
                  answeredQuestionIds.add(String(p.id_questao).trim());
                }
              }
            }
          } catch (e) {
            console.error('Erro ao processar progressData para questões inéditas:', e);
          }
        }

        const isQuestionAnswered = (q: any, idx: number): boolean => {
          const rawId = q.id ?? q.id_questao ?? (q as any)._id;
          if (rawId !== undefined && rawId !== null && answeredQuestionIds.has(String(rawId).trim())) {
            return true;
          }
          const qId = getQuestionId(q, idx);
          if (answeredQuestionIds.has(qId)) {
            return true;
          }
          const contentHash = getQuestionContentHash(q);
          if (answeredQuestionIds.has(contentHash)) {
            return true;
          }
          const legacyHash = getLegacyQuestionHash(q);
          if (legacyHash && answeredQuestionIds.has(legacyHash)) {
            return true;
          }
          return false;
        };

        const ineditas: any[] = [];
        const jaRespondidas: any[] = [];

        for (let idx = 0; idx < baseFiltered.length; idx++) {
          const q = baseFiltered[idx];
          if (isQuestionAnswered(q, idx)) {
            jaRespondidas.push(q);
          } else {
            ineditas.push(q);
          }
        }

        const ineditasShuffled = fisherYatesShuffle(ineditas);
        const jaRespondidasShuffled = fisherYatesShuffle(jaRespondidas);

        if (ineditasShuffled.length > 0) {
          // Quando o usuário escolhe praticar um tema, prioriza 100% questões INÉDITAS.
          // Não mescla com questões já respondidas, garantindo que nenhum tema iniciado anteriormente
          // traga questões repetidas indesejadas na primeira ou em qualquer outra posição.
          finalQuestions = ineditasShuffled.slice(0, maxQuestoes);
        } else {
          // Somente se TODAS as questões do tema já tiverem sido respondidas pelo usuário,
          // permite a repetição/revisão com as questões já respondidas (totalmente reembaralhadas).
          finalQuestions = jaRespondidasShuffled.slice(0, maxQuestoes);
        }
      }

      setQuestions(finalQuestions);
      preloadQuestionImages(finalQuestions, 0, 3);
      setCurrentIndex(0);
      setSelectedAlt(null);
      setIsAnswered(false);
      setCorrectCount(0);
      setWrongCount(0);
      setStreakAcertos(0);
      setAnswersHistory({});
      setIsReviewMode(false);
      setDiscardedAlts([]);

      // Salva imediatamente a nova sessão ativa para ser resiliente a fechamento abrupto desde a primeira tela
      if (finalQuestions.length > 0) {
        saveActiveQuizSession({
          questions: finalQuestions,
          currentIndex: 0,
          correctCount: 0,
          wrongCount: 0,
          streakAcertos: 0,
          answersHistory: {},
          isReviewMode: false,
          selectedAlt: null,
          isAnswered: false,
          discardedAlts: [],
          timestamp: Date.now(),
        }).catch((err) => console.warn('[Athena Quiz] Erro ao salvar sessão inicial:', err));
      }
    } catch (error) {
      console.error('Erro ao ler questões do quiz:', error);
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  };

  const currentQ = questions[currentIndex];
  const currentQId = getQuestionId(currentQ, currentIndex);

  // Resolução dinâmica e inteligente do caminho da imagem offline com cache O(1) e pré-carregamento
  useEffect(() => {
    let isMounted = true;

    const verificarImagem = async () => {
      try {
        const uri = await resolveQuestionImageUri(currentQ);
        if (isMounted) {
          setImageUri(uri);
        }
        // Pré-carrega assincronamente as imagens das próximas 3 questões
        preloadQuestionImages(questions, currentIndex + 1, 3);
      } catch (err) {
        console.warn('[Athena Quiz] Erro ao verificar imagem:', err);
        if (isMounted) setImageUri(null);
      }
    };

    verificarImagem();
    return () => {
      isMounted = false;
    };
  }, [currentQId, currentIndex]);

  // Normalização das alternativas para o formato { key: 'A', text: '...' }
  const getNormalizedAlternatives = (q?: Question): Alternative[] => {
    if (!q || !q.alternativas) return [];

    if (Array.isArray(q.alternativas)) {
      return q.alternativas.map((item: any, idx: number) => {
        const defaultKey = String.fromCharCode(65 + idx); // A, B, C, D...
        if (typeof item === 'string') {
          return { key: defaultKey, text: item };
        }
        return {
          key: (item.key || item.letra || defaultKey).toUpperCase(),
          text: item.texto || item.text || String(item),
        };
      });
    }

    if (typeof q.alternativas === 'object') {
      return Object.entries(q.alternativas)
        .map(([k, v]) => ({
          key: k.toUpperCase(),
          text: String(v),
        }))
        .sort((a, b) => a.key.localeCompare(b.key));
    }

    return [];
  };

  const alternatives = getNormalizedAlternatives(currentQ);
  const correctKey = (
    currentQ?.resposta_correta ||
    currentQ?.gabarito ||
    currentQ?.correta ||
    ''
  ).toString().trim().toUpperCase();

  // Função para salvar silenciosamente no histórico @athena_progress
  const salvarProgresso = async (altKey: string, acerto: boolean) => {
    try {
      const qEsp = getQuestionEspecialidade(currentQ);
      const qTema = getQuestionTema(currentQ);
      const qFoco =
        currentQ?.foco_da_questao ||
        currentQ?.foco ||
        currentQ?.tipo ||
        (Array.isArray(currentQ?.tags) && currentQ.tags[2]) ||
        'Geral';
      const qMicroFoco =
        currentQ?.micro_foco ||
        currentQ?.microfoco ||
        currentQ?.subfoco ||
        (Array.isArray(currentQ?.tags) && currentQ.tags[3]) ||
        '';

      const qId = getQuestionId(currentQ, currentIndex);

      const record: ProgressRecord = {
        id_questao: qId,
        tema: qTema,
        especialidade: qEsp,
        foco: qFoco,
        micro_foco: qMicroFoco ? String(qMicroFoco).trim() : '',
        correta: acerto,
        resposta_usuario: altKey.toUpperCase(),
        gabarito: correctKey,
        data: new Date().toISOString(),
      };

      await saveProgressRecord(record);

      // 1. Calcula o tempo gasto de resolução
      const timeSpentSeconds = Math.max(1, Math.round((Date.now() - questionStartTime.current) / 1000));

      // 2. Grava histórico detalhado por questão e sessão
      await logQuestionAnswer(qId, qTema, acerto, timeSpentSeconds, sessionIdRef.current);

      // 3. Executa o algoritmo SM-2 e agenda a próxima revisão espaçada
      await processQuestionReview(qId, acerto, timeSpentSeconds);
      if (qTema) {
        await processTopicReview(qTema, acerto, timeSpentSeconds);
      }
    } catch (err) {
      console.error('Falha silenciosa ao salvar progresso:', err);
    }
  };

  const handleSelectAlternative = (altKey: string) => {
    if (isReviewMode) return;
    if (isAnswered && !isSimulado) return;

    if (discardedAlts.includes(altKey)) {
      setDiscardedAlts((prev) => prev.filter((k) => k !== altKey));
    }

    const isCorrect = altKey.toUpperCase() === correctKey;

    if (isSimulado) {
      const prevAnswer = answersHistory[currentIndex];
      if (prevAnswer?.isAnswered) {
        if (prevAnswer.isCorrect && !isCorrect) {
          setCorrectCount((prev) => Math.max(0, prev - 1));
          setWrongCount((prev) => prev + 1);
        } else if (!prevAnswer.isCorrect && isCorrect) {
          setWrongCount((prev) => Math.max(0, prev - 1));
          setCorrectCount((prev) => prev + 1);
        }
      } else {
        if (isCorrect) setCorrectCount((prev) => prev + 1);
        else setWrongCount((prev) => prev + 1);
      }

      setSelectedAlt(altKey);
      setIsAnswered(true);

      setAnswersHistory((prev) => ({
        ...prev,
        [currentIndex]: {
          selectedAlt: altKey,
          isAnswered: true,
          isCorrect,
          discardedAlts,
        },
      }));

      salvarProgresso(altKey, isCorrect);
      return;
    }

    setSelectedAlt(altKey);
    setIsAnswered(true);

    if (isCorrect) {
      setCorrectCount((prev) => prev + 1);
      setStreakAcertos((prev) => prev + 1);
      const nextStreak = streakAcertos + 1;
      const milestoneMsg = getStreakMilestoneMessage(nextStreak);
      if (milestoneMsg) {
        showStreakToast(milestoneMsg);
      }
    } else {
      setWrongCount((prev) => prev + 1);
      setStreakAcertos(0);
    }

    // Registra no histórico de respostas da sessão
    setAnswersHistory((prev) => ({
      ...prev,
      [currentIndex]: {
        selectedAlt: altKey,
        isAnswered: true,
        isCorrect,
        discardedAlts,
      },
    }));

    // Salva silenciosamente no histórico com o acerto devidamente computado
    salvarProgresso(altKey, isCorrect);

    // Scroll suave para revelar a explicação
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 200);
  };

  const handleUndoAnswer = async () => {
    if (!isAnswered || isReviewMode) return;

    const wasCorrect = selectedAlt ? selectedAlt.toUpperCase() === correctKey : false;
    if (wasCorrect) {
      setCorrectCount((prev) => Math.max(0, prev - 1));
      setStreakAcertos((prev) => Math.max(0, prev - 1));
    } else {
      setWrongCount((prev) => Math.max(0, prev - 1));
    }

    setSelectedAlt(null);
    setIsAnswered(false);

    setAnswersHistory((prev) => {
      const copy = { ...prev };
      delete copy[currentIndex];
      return copy;
    });

    // Remove do histórico salvo @athena_progress o último registro gravado para esta questão
    try {
      const qId = currentQId;
      const existingData = storage.getString('@athena_progress');
      if (existingData) {
        const parsed = JSON.parse(existingData);
        if (Array.isArray(parsed) && parsed.length > 0) {
          for (let i = parsed.length - 1; i >= 0; i--) {
            if (String(parsed[i].id_questao) === String(qId)) {
              parsed.splice(i, 1);
              break;
            }
          }
          storage.set('@athena_progress', JSON.stringify(parsed));
        }
      }
    } catch (err) {
      console.error('Erro ao reverter registro em @athena_progress:', err);
    }
  };

  const handleSkipQuestion = async () => {
    setAnswersHistory((prev) => {
      if (prev[currentIndex]?.isAnswered) return prev;
      return {
        ...prev,
        [currentIndex]: {
          selectedAlt: null,
          isAnswered: false,
          isCorrect: false,
          discardedAlts: [],
        },
      };
    });
    await handleNextQuestion();
  };

  const finishStats = useMemo(() => {
    const total = questions.length;
    const correct = correctCount;
    const wrong = wrongCount;
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
    let badgeText = 'Desempenho Excelente 🚀';
    let badgeColor = isDark ? '#34D399' : '#10B981';
    let message = 'Domínio sólido do conteúdo! Seus acertos demonstram excelente retenção diagnóstica e terapêutica.';
    let iconName = 'trophy';

    if (pct < 50) {
      badgeText = 'Foco na Revisão 💡';
      badgeColor = isDark ? '#FBBF24' : '#D97706';
      message = 'O treino é o melhor momento para errar e aprender. Releia os comentários das questões com atenção para consolidar a conduta médica.';
      iconName = 'lightbulb-outline';
    } else if (pct < 75) {
      badgeText = 'Bom Aproveitamento 👏';
      badgeColor = isDark ? '#60A5FA' : '#2563EB';
      message = 'Muito bom! Você está consolidando o raciocínio clínico. Fique atento aos detalhes para alcançar os 100% de acerto.';
      iconName = 'checkbox-marked-circle-outline';
    }

    return { total, correct, wrong, pct, badgeText, badgeColor, message, iconName };
  }, [questions.length, correctCount, wrongCount, isDark]);

  const handleNextQuestion = async () => {
    if (currentIndex < questions.length - 1) {
      goToQuestion(currentIndex + 1);
    } else {
      // Fim das questões
      try {
        await clearActiveQuizSession();
        if (blocoId) {
          await concluirAtividadePorId(decodeURIComponent(blocoId));
        }
      } catch (err) {
        console.error('Erro ao limpar sessão concluída:', err);
      }
      setShowFinishModal(true);
    }
  };

  const handleExit = () => {
    setShowExitModal(true);
  };

  const handleSairSalvar = async () => {
    try {
      const session = {
        questions,
        currentIndex,
        correctCount,
        wrongCount,
        streakAcertos,
        answersHistory,
        isReviewMode,
        selectedAlt,
        isAnswered,
        discardedAlts,
        timestamp: Date.now(),
      };
      await saveActiveQuizSession(session, true);
    } catch (err) {
      console.error('Erro ao salvar sessão de questões:', err);
    }
    setShowExitModal(false);
    router.back();
  };

  const handleEncerrarQuestoes = async () => {
    try {
      await clearActiveQuizSession();
    } catch (err) {
      console.error('Erro ao encerrar questões:', err);
    }
    setShowExitModal(false);
    router.back();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.background} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={styles.loadingText}>
            Carregando questões da Arena...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (questions.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.background} />
        <View style={styles.emptyContainer}>
          <Ionicons name="cart-outline" size={54} color={theme.primary} />
          <Text style={styles.emptyTitle}>
            Nenhuma questão encontrada
          </Text>
          <Text style={styles.emptySubtitle}>
            Nenhum tema foi selecionado no seu Carrinho de Estudos ou não há questões cadastradas para os temas selecionados.
          </Text>
          <TouchableOpacity style={styles.primaryActionButton} onPress={() => router.back()}>
            <Text style={styles.primaryActionButtonText}>Voltar e Selecionar Temas</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const especialidadeTag = getQuestionEspecialidade(currentQ);
  const temaTag = getQuestionTema(currentQ);
  const rawQId = currentQ?.id ?? currentQ?.id_questao ?? (currentQ as any)?._id;
  const questionDisplayId = (
    rawQId !== undefined && rawQId !== null && String(rawQId).trim() !== ''
      ? String(rawQId).trim()
      : currentQId
  )?.toString().trim();

  const focoTag = (
    currentQ?.foco_da_questao ||
    currentQ?.foco ||
    currentQ?.tipo ||
    (Array.isArray(currentQ?.tags) && currentQ.tags[2]) ||
    ''
  ).toString().trim();

  const microFocoTag = (
    currentQ?.micro_foco ||
    currentQ?.microfoco ||
    currentQ?.subfoco ||
    (Array.isArray(currentQ?.tags) && currentQ.tags[3]) ||
    ''
  ).toString().trim();

  const subtemaTag = (
    currentQ?.subtema ||
    ''
  ).toString().trim();

  // Tags a serem exibidas no campo de comentário do professor
  const comentarioTags: string[] = [];
  if (temaTag) {
    comentarioTags.push(temaTag);
  }
  if (focoTag) {
    comentarioTags.push(focoTag);
  }
  if (microFocoTag && !comentarioTags.some((c) => c.toLowerCase() === microFocoTag.toLowerCase())) {
    comentarioTags.push(microFocoTag);
  }
  if (Array.isArray(currentQ?.tags)) {
    for (const t of currentQ.tags) {
      const cleanT = String(t).trim();
      if (
        cleanT &&
        cleanT.toLowerCase() !== especialidadeTag.toLowerCase() &&
        !comentarioTags.some((c) => c.toLowerCase() === cleanT.toLowerCase())
      ) {
        comentarioTags.push(cleanT);
      }
    }
  }
  if (
    subtemaTag &&
    subtemaTag.toLowerCase() !== temaTag.toLowerCase() &&
    subtemaTag.toLowerCase() !== especialidadeTag.toLowerCase() &&
    !comentarioTags.some((c) => c.toLowerCase() === subtemaTag.toLowerCase())
  ) {
    comentarioTags.push(subtemaTag);
  }

  const explicacao = currentQ?.explicacao || currentQ?.comentario || currentQ?.justificativa;
  const isCorrect = selectedAlt?.toUpperCase() === correctKey;
  const progressPercent = Math.min(((currentIndex + 1) / questions.length) * 100, 100);

  // Substitui quebras de linha simples por espaço, preservando quebras de linha duplas (parágrafos reais) e removendo tags brutas de imagem
  const formatText = (text?: string): string => {
    if (!text) return '';
    return text
      .replace(/<img[^>]*>/gi, '')
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/\[(?:imagem|img|figura|foto):\s*[^\]]+\]/gi, '')
      .replace(/\r\n/g, '\n')
      .replace(/([^\n])\n([^\n])/g, '$1 $2')
      .replace(/ +/g, ' ')
      .trim();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.background} />

      {/* Topo / Barra de Progresso e Saída */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={isReviewMode ? () => router.back() : handleExit}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.7}
        >
          <Ionicons
            name="close"
            size={20}
            color={theme.text}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerInfo}
          activeOpacity={isReviewMode ? 0.7 : 1}
          onPress={isReviewMode ? () => setShowReviewGridModal(true) : undefined}
        >
          {isReviewMode ? (
            <View style={styles.reviewBadgeHeader}>
              <Ionicons name="eye" size={13} color={theme.primary} style={{ marginRight: 4 }} />
              <Text style={styles.reviewBadgeHeaderText}>REVISÃO</Text>
              <Text style={styles.counterText}>
                {' '}• <Text style={styles.counterHighlight}>{currentIndex + 1}</Text>/{questions.length}
              </Text>
              <Ionicons name="chevron-down" size={14} color={theme.primary} style={{ marginLeft: 2 }} />
            </View>
          ) : (
            <Text style={styles.counterText}>
              Questão <Text style={styles.counterHighlight}>{currentIndex + 1}</Text> de {questions.length}
            </Text>
          )}
        </TouchableOpacity>

        {isSimulado && !isReviewMode ? (
          <View style={styles.simuladoHeaderBadge}>
            <MaterialCommunityIcons name="clipboard-text-clock-outline" size={13} color={theme.primary} style={{ marginRight: 4 }} />
            <Text style={styles.simuladoHeaderBadgeText}>SIMULADO</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.scoresRow}
            activeOpacity={isReviewMode ? 0.7 : 1}
            onPress={isReviewMode ? () => setShowFinishModal(true) : undefined}
          >
            <View style={styles.scorePillCorrect}>
              <Ionicons name="checkmark" size={13} color={isDark ? '#34D399' : '#059669'} />
              <Text style={styles.scorePillTextCorrect}>{correctCount}</Text>
            </View>
            <View style={styles.scorePillWrong}>
              <Ionicons name="close" size={13} color={isDark ? '#F87171' : '#DC2626'} />
              <Text style={styles.scorePillTextWrong}>{wrongCount}</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>

      {/* Barra visual de progresso */}
      <View style={styles.progressBarTrack}>
        <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
      </View>

      {/* Corpo da Questão */}
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Caixa Arredondada do Enunciado englobando Tags, Ações e Texto */}
        <View style={styles.enunciadoCard}>
          {/* Linha de Tags: Especialidade à esquerda e Ações à direita (Desfazer e Favorito) */}
          <View style={styles.badgeRow}>
            <View style={styles.badgesLeftRow}>
              <View style={styles.specialtyBadge}>
                <Text style={styles.specialtyBadgeText} numberOfLines={1}>
                  {especialidadeTag.toUpperCase()}
                </Text>
              </View>

              {Boolean(questionDisplayId) && (
                <View style={styles.questionIdBadge}>
                  <Text style={styles.questionIdBadgeText} numberOfLines={1}>
                    #{questionDisplayId}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.rightActionsRow}>
              {/* Botão de Desfazer Resposta (somente ícone, ativo após responder, oculto em modo de revisão) */}
              {!isReviewMode && (
                <TouchableOpacity
                  style={[styles.undoButton, !isAnswered && styles.undoButtonDisabled]}
                  onPress={handleUndoAnswer}
                  disabled={!isAnswered}
                  activeOpacity={0.7}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <MaterialCommunityIcons
                    name="undo-variant"
                    size={24}
                    color={isAnswered ? theme.primary : theme.textMuted}
                  />
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.favoriteButton}
                onPress={toggleFavorito}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialCommunityIcons
                  name={isFavorito ? 'star' : 'star-outline'}
                  size={25}
                  color={isFavorito ? (isDark ? '#FACC15' : '#EAB308') : theme.textMuted}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Enunciado da Questão */}
          <Text style={styles.enunciadoText}>
            {formatText(currentQ.enunciado || currentQ.question || currentQ.texto || 'Questão sem enunciado cadastrado.')}
          </Text>

          {/* Renderizador Dinâmico de Imagem Offline dentro da Caixa do Enunciado */}
          {Boolean(imageUri) && (
            <View style={styles.imageCardContainer}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => setModalZoomVisible(true)}
                style={styles.imageTouchWrapper}
              >
                <Image
                  source={{ uri: imageUri! }}
                  style={styles.questionImage}
                  resizeMode="contain"
                  onError={(e) => {
                    console.log('[Athena Quiz] Erro nativo ao renderizar Image:', e.nativeEvent?.error, 'URI tentada:', imageUri);
                  }}
                />
                <View style={styles.zoomBadge}>
                  <Ionicons name="scan-outline" size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
                  <Text style={styles.zoomBadgeText}>Toque para ampliar</Text>
                </View>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Lista de Alternativas */}
        <View style={styles.alternativesContainer}>
          {alternatives.map((alt) => {
            const isThisSelected = selectedAlt?.toUpperCase() === alt.key;
            const isThisCorrect = alt.key === correctKey;
            const isDiscarded = discardedAlts.includes(alt.key);

            // Determina a estilização de feedback após resposta ou descarte
            let altStyle: any[] = [styles.altButton];
            let letterBoxStyle: any[] = [styles.altLetterBox];
            let letterTextColor = theme.text;
            let altTextStyle: any[] = [styles.altText];
            let altTextColor = theme.text;
            let iconElement = null;

            if (isAnswered || isReviewMode) {
              if (isSimulado && !isReviewMode) {
                // Modo Simulado: sem feedback de acerto/erro imediato
                if (isThisSelected) {
                  altStyle = [styles.altButton, styles.altSelectedSimulado];
                  letterBoxStyle = [styles.altLetterBox, styles.letterBoxSelectedSimulado];
                  letterTextColor = isDark ? '#000000' : '#FFFFFF';
                  altTextColor = theme.text;
                  iconElement = (
                    <Ionicons name="radio-button-on" size={20} color={theme.primary} style={styles.altStatusIcon} />
                  );
                } else if (isDiscarded) {
                  altStyle = [styles.altButton, styles.altDiscarded];
                  letterBoxStyle = [styles.altLetterBox, styles.letterBoxDiscarded];
                  letterTextColor = theme.textMuted;
                  altTextStyle = [styles.altText, styles.altTextDiscarded];
                  altTextColor = theme.textMuted;
                }
              } else {
                if (isThisCorrect) {
                  // Alternativa correta (Verde vibrante com alto contraste)
                  altStyle = [styles.altButton, styles.altCorrect];
                  letterBoxStyle = [styles.altLetterBox, styles.letterBoxCorrect];
                  letterTextColor = '#FFFFFF';
                  altTextColor = '#FFFFFF';
                  iconElement = (
                    <Ionicons name="checkmark-circle" size={22} color="#FFFFFF" style={styles.altStatusIcon} />
                  );
                } else if (isThisSelected) {
                  // Alternativa errada selecionada (Vermelha vibrante com alto contraste)
                  altStyle = [styles.altButton, styles.altWrong];
                  letterBoxStyle = [styles.altLetterBox, styles.letterBoxWrong];
                  letterTextColor = '#FFFFFF';
                  altTextColor = '#FFFFFF';
                  iconElement = (
                    <Ionicons name="close-circle" size={22} color="#FFFFFF" style={styles.altStatusIcon} />
                  );
                } else {
                  // Outras alternativas neutras (desabilitadas)
                  altStyle = [styles.altButton, styles.altDisabled];
                  altTextColor = theme.textSecondary;
                  letterTextColor = theme.textSecondary;
                }
              }
            } else if (isDiscarded) {
              // Alternativa descartada: mais escura e texto rasurado
              altStyle = [styles.altButton, styles.altDiscarded];
              letterBoxStyle = [styles.altLetterBox, styles.letterBoxDiscarded];
              letterTextColor = theme.textMuted;
              altTextStyle = [styles.altText, styles.altTextDiscarded];
              altTextColor = theme.textMuted;
            }

            return (
              <TouchableOpacity
                key={alt.key}
                style={altStyle}
                activeOpacity={0.8}
                onPress={() => handleSelectAlternative(alt.key)}
                disabled={isReviewMode || (!isSimulado && isAnswered)}
              >
                <View style={letterBoxStyle}>
                  <Text style={[styles.altLetterText, { color: letterTextColor }]}>
                    {alt.key}
                  </Text>
                </View>

                <Text style={[altTextStyle, { color: altTextColor }]}>
                  {alt.text}
                </Text>

                {isAnswered || isReviewMode ? (
                  iconElement
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.discardButton,
                      isDiscarded && styles.discardButtonActive,
                    ]}
                    onPress={() => toggleDiscardAlternative(alt.key)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="close"
                      size={15}
                      color={isDiscarded ? theme.error : theme.textMuted}
                    />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Caso a questão seja discursiva (sem alternativas de múltipla escolha) */}
        {alternatives.length === 0 && (
          <View style={styles.discursivaCard}>
            <View style={styles.discursivaHeaderRow}>
              <MaterialCommunityIcons name="file-document-edit-outline" size={22} color={theme.primary} style={{ marginRight: 8 }} />
              <Text style={styles.discursivaTitle}>Questão Discursiva</Text>
            </View>
            <Text style={styles.discursivaDesc}>
              {isSimulado && !isReviewMode
                ? 'Esta questão é discursiva ou descritiva. Formule sua resposta e confirme para avançar. O padrão oficial será liberado ao finalizar o simulado.'
                : 'Esta questão é discursiva ou descritiva. Formule sua resposta e toque abaixo para conferir o padrão de resposta oficial e o comentário da banca.'}
            </Text>
            {!isAnswered && !isReviewMode ? (
              <TouchableOpacity
                style={styles.discursivaActionButton}
                activeOpacity={0.85}
                onPress={() => {
                  setSelectedAlt('DISCURSIVA');
                  setIsAnswered(true);
                  if (!isSimulado) setCorrectCount((prev) => prev + 1);
                  setAnswersHistory((prev) => ({
                    ...prev,
                    [currentIndex]: {
                      selectedAlt: 'DISCURSIVA',
                      isAnswered: true,
                      isCorrect: true,
                      discardedAlts: [],
                    },
                  }));
                }}
              >
                <Ionicons name={isSimulado ? 'checkmark-circle-outline' : 'eye-outline'} size={18} color={isDark ? "#000000" : "#FFFFFF"} style={{ marginRight: 8 }} />
                <Text style={styles.discursivaActionButtonText}>
                  {isSimulado ? 'Registrar Resposta' : 'Ver Gabarito Oficial e Comentário'}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        {/* Bloco de Explicação e Feedback Imediato (Oculto durante o Simulado até a revisão) */}
        {(isAnswered || isReviewMode) && (!isSimulado || isReviewMode) && (
          <View style={styles.explanationCard}>
            {/* Pílula de Feedback em cima */}
            <View
              style={[
                styles.feedbackPill,
                alternatives.length === 0
                  ? styles.feedbackPillDiscursiva
                  : selectedAlt
                  ? isCorrect
                    ? styles.feedbackPillCorrect
                    : styles.feedbackPillWrong
                  : styles.feedbackPillSkipped,
              ]}
            >
              <Ionicons
                name={
                  alternatives.length === 0
                    ? 'information-circle'
                    : selectedAlt
                    ? isCorrect
                      ? 'checkmark-circle'
                      : 'alert-circle'
                    : 'help-circle'
                }
                size={15}
                color={
                  alternatives.length === 0
                    ? theme.primary
                    : selectedAlt
                    ? isCorrect
                      ? (isDark ? '#34D399' : '#059669')
                      : (isDark ? '#F87171' : '#DC2626')
                    : '#F59E0B'
                }
              />
              <Text
                style={[
                  styles.feedbackPillText,
                  {
                    color:
                      alternatives.length === 0
                        ? theme.primary
                        : selectedAlt
                        ? isCorrect
                          ? (isDark ? '#34D399' : '#059669')
                          : (isDark ? '#F87171' : '#DC2626')
                        : '#F59E0B',
                  },
                ]}
              >
                {alternatives.length === 0
                  ? 'Padrão Oficial de Resposta'
                  : selectedAlt
                  ? isCorrect
                    ? 'Você Acertou!'
                    : `Incorreto • Gabarito: ${correctKey}`
                  : `Não Respondida • Gabarito: ${correctKey}`}
              </Text>
            </View>

            {/* Tags da questão dispostas lado a lado */}
            {comentarioTags.length > 0 && (
              <View style={styles.comentarioTagsWrapper}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.comentarioTagsScrollContent}
                >
                  {comentarioTags.map((tag, idx) => (
                    <View key={`${tag}-${idx}`} style={styles.comentarioTagBadge}>
                      <Text style={styles.comentarioTagText} numberOfLines={1}>
                        {tag.toUpperCase()}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            <View style={styles.textContainer}>
              <Text style={styles.explanationText}>
                {formatText(explicacao || 'Gabarito oficial confirmado. Revise os conceitos-chave desta questão.')}
              </Text>
            </View>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Barra Inferior: Navegação de Revisão ou Ações do Quiz */}
      <View style={styles.bottomBar}>
        {isReviewMode ? (
          <View style={styles.reviewBottomBar}>
            {/* Botão Anterior */}
            <TouchableOpacity
              style={[styles.reviewNavBtn, currentIndex === 0 && styles.reviewNavBtnDisabled]}
              disabled={currentIndex === 0}
              onPress={() => goToQuestion(currentIndex - 1)}
              activeOpacity={0.7}
            >
              <Ionicons
                name="arrow-back"
                size={18}
                color={currentIndex === 0 ? theme.textMuted : theme.text}
              />
              <Text
                style={[
                  styles.reviewNavBtnText,
                  currentIndex === 0 && styles.reviewNavBtnTextDisabled,
                ]}
              >
                Anterior
              </Text>
            </TouchableOpacity>

            {/* Botão Central: Indicador e Gatilho do Grid */}
            <TouchableOpacity
              style={styles.reviewGridTriggerBtn}
              onPress={() => setShowReviewGridModal(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="grid-outline" size={15} color={theme.primary} style={{ marginRight: 6 }} />
              <Text style={styles.reviewGridTriggerBtnText}>
                {currentIndex + 1} / {questions.length}
              </Text>
            </TouchableOpacity>

            {/* Botão Próxima ou Ver Resultado */}
            {currentIndex < questions.length - 1 ? (
              <TouchableOpacity
                style={styles.reviewNavBtn}
                onPress={() => goToQuestion(currentIndex + 1)}
                activeOpacity={0.7}
              >
                <Text style={styles.reviewNavBtnText}>Próxima</Text>
                <Ionicons name="arrow-forward" size={18} color={theme.text} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.reviewFinishBtn}
                onPress={() => setShowFinishModal(true)}
                activeOpacity={0.85}
              >
                <Text style={styles.reviewFinishBtnText}>Resultado</Text>
                <Ionicons name="trophy" size={16} color={isDark ? "#000000" : "#FFFFFF"} style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            )}
          </View>
        ) : !isAnswered ? (
          <TouchableOpacity
            style={styles.skipButton}
            activeOpacity={0.85}
            onPress={handleSkipQuestion}
          >
            <Text style={styles.skipButtonText}>
              {currentIndex < questions.length - 1
                ? 'Pular Questão'
                : isSimulado
                ? 'Pular e Finalizar Simulado'
                : 'Pular e Finalizar'}
            </Text>
            <Ionicons
              name={currentIndex < questions.length - 1 ? 'play-skip-forward-outline' : 'checkmark-done'}
              size={19}
              color={theme.textSecondary}
              style={{ marginLeft: 8 }}
            />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.nextButton}
            activeOpacity={0.85}
            onPress={handleNextQuestion}
          >
            <Text style={styles.nextButtonText}>
              {currentIndex < questions.length - 1
                ? 'Próxima Questão'
                : isSimulado
                ? 'Finalizar Simulado'
                : 'Finalizar Questões'}
            </Text>
            <Ionicons
              name={currentIndex < questions.length - 1 ? 'arrow-forward' : 'checkmark-done'}
              size={20}
              color={isDark ? "#000000" : "#FFFFFF"}
              style={{ marginLeft: 8 }}
            />
          </TouchableOpacity>
        )}
      </View>

      {/* Modal Customizado de Saída */}
      <Modal
        transparent
        animationType="fade"
        visible={showExitModal}
        onRequestClose={() => setShowExitModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdropDismiss}
            activeOpacity={1}
            onPress={() => setShowExitModal(false)}
          />
          <View style={styles.exitModalCard}>
            <ScrollView
              contentContainerStyle={styles.modalScrollInner}
              showsVerticalScrollIndicator={false}
              style={{ width: '100%' }}
            >
              <View style={styles.exitModalIconContainer}>
                <Ionicons name="help-circle-outline" size={30} color={theme.primary} />
              </View>

              <Text style={styles.exitModalTitle}>Deseja realmente sair?</Text>
              <Text style={styles.exitModalSubtitle}>
                Você pode salvar o progresso para continuar mais tarde ou encerrar definitivamente este bloco de questões.
              </Text>

              {/* Resumo do Progresso Atual */}
              <View style={styles.exitModalProgressBox}>
                <View style={styles.exitModalProgressItem}>
                  <Text style={styles.exitModalProgressLabel}>QUESTÃO</Text>
                  <Text style={styles.exitModalProgressValue}>
                    {currentIndex + 1}/{questions.length}
                  </Text>
                </View>
                <View style={styles.exitModalDivider} />
                <View style={styles.exitModalProgressItem}>
                  <Text style={styles.exitModalProgressLabel}>ACERTOS</Text>
                  <Text style={[styles.exitModalProgressValue, { color: isDark ? '#34D399' : '#059669' }]}>
                    {correctCount}
                  </Text>
                </View>
                <View style={styles.exitModalDivider} />
                <View style={styles.exitModalProgressItem}>
                  <Text style={styles.exitModalProgressLabel}>ERROS</Text>
                  <Text style={[styles.exitModalProgressValue, { color: isDark ? '#F87171' : '#DC2626' }]}>
                    {wrongCount}
                  </Text>
                </View>
              </View>

              <View style={styles.exitModalButtonsCol}>
                {/* Botão Sair (Salva e Pausa) */}
                <TouchableOpacity
                  style={styles.exitModalPrimaryButton}
                  activeOpacity={0.85}
                  onPress={handleSairSalvar}
                >
                  <Ionicons name="pause" size={18} color={isDark ? "#000000" : "#FFFFFF"} style={{ marginRight: 8 }} />
                  <Text style={styles.exitModalPrimaryButtonText}>Sair</Text>
                </TouchableOpacity>

                {/* Botão Encerrar Questões (Descarta e volta ao início) */}
                <TouchableOpacity
                  style={styles.exitModalDangerButton}
                  activeOpacity={0.85}
                  onPress={handleEncerrarQuestoes}
                >
                  <Ionicons name="close-circle-outline" size={18} color={theme.error} style={{ marginRight: 8 }} />
                  <Text style={styles.exitModalDangerButtonText}>Encerrar Questões</Text>
                </TouchableOpacity>

                {/* Botão Cancelar / Continuar na questão */}
                <TouchableOpacity
                  style={styles.exitModalCancelButton}
                  activeOpacity={0.7}
                  onPress={() => setShowExitModal(false)}
                >
                  <Text style={styles.exitModalCancelButtonText}>Continuar Respondendo</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal Interativo com Pinch-to-Zoom e Controles da Imagem */}
      <ZoomableImageModal
        visible={modalZoomVisible}
        imageUri={imageUri}
        onClose={() => setModalZoomVisible(false)}
      />

      {/* Modal Remodelado de Conclusão de Simulado / Grupo de Questões */}
      <Modal
        transparent
        animationType="fade"
        visible={showFinishModal}
        onRequestClose={() => {
          if (!isReviewMode) {
            router.back();
          }
          setShowFinishModal(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdropDismiss}
            activeOpacity={1}
            onPress={() => {
              if (!isReviewMode) {
                router.back();
              }
              setShowFinishModal(false);
            }}
          />
          <View style={styles.finishModalCard}>
            <ScrollView
              contentContainerStyle={styles.modalScrollInner}
              showsVerticalScrollIndicator={false}
              style={{ width: '100%' }}
            >
              {/* Ícone comemorativo com Halo */}
              <View style={[styles.finishIconCircle, { borderColor: `${finishStats.badgeColor}4D`, backgroundColor: `${finishStats.badgeColor}1A` }]}>
                <MaterialCommunityIcons
                  name={finishStats.iconName as any}
                  size={38}
                  color={finishStats.badgeColor}
                />
              </View>

              <Text style={styles.finishModalTitle}>{isSimulado ? 'Simulado Concluído!' : 'Treino Finalizado!'}</Text>
              <Text style={styles.finishModalSubtitle}>
                {isSimulado
                  ? `Você concluiu a prova com ${finishStats.total} questões (20% por grande área). Veja seu gabarito e comentários na revisão!`
                  : `Você concluiu todas as ${finishStats.total} ${finishStats.total === 1 ? 'questão' : 'questões'} deste bloco.`}
              </Text>

              {/* Destaque Central de Aproveitamento */}
              <View style={styles.finishScoreCard}>
                <View style={styles.finishScoreRow}>
                  <Text style={[styles.finishScorePercent, { color: finishStats.badgeColor }]}>
                    {finishStats.pct}%
                  </Text>
                  <View style={[styles.finishBadgePill, { backgroundColor: `${finishStats.badgeColor}26`, borderColor: `${finishStats.badgeColor}66` }]}>
                    <Text style={[styles.finishBadgePillText, { color: finishStats.badgeColor }]}>
                      {finishStats.badgeText}
                    </Text>
                  </View>
                </View>

                {/* Grid com 3 caixas de métricas */}
                <View style={styles.finishStatsGrid}>
                  <View style={styles.finishStatBox}>
                    <Text style={styles.finishStatLabel}>TOTAL</Text>
                    <Text style={styles.finishStatValue}>{finishStats.total}</Text>
                  </View>
                  <View style={styles.finishStatDivider} />
                  <View style={styles.finishStatBox}>
                    <Text style={styles.finishStatLabel}>ACERTOS</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="checkmark-circle" size={15} color={isDark ? "#34D399" : "#059669"} />
                      <Text style={[styles.finishStatValue, { color: isDark ? '#34D399' : '#059669' }]}>
                        {finishStats.correct}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.finishStatDivider} />
                  <View style={styles.finishStatBox}>
                    <Text style={styles.finishStatLabel}>ERROS</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="close-circle" size={15} color={isDark ? "#F87171" : "#DC2626"} />
                      <Text style={[styles.finishStatValue, { color: isDark ? '#F87171' : '#DC2626' }]}>
                        {finishStats.wrong}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Mensagem de Feedback e Orientação Médica */}
              <View style={styles.finishFeedbackBox}>
                <Ionicons name="medical-outline" size={18} color={theme.primary} style={{ marginRight: 8, marginTop: 1 }} />
                <Text style={styles.finishFeedbackText}>
                  {finishStats.message}
                </Text>
              </View>

              {/* Botões de Ação */}
              <View style={styles.finishButtonsCol}>
                <TouchableOpacity
                  style={styles.finishReviewButton}
                  activeOpacity={0.85}
                  onPress={() => {
                    setShowFinishModal(false);
                    setIsReviewMode(true);
                    if (!isReviewMode) {
                      goToQuestion(0);
                    }
                  }}
                >
                  <Ionicons name="eye-outline" size={20} color={isDark ? "#000000" : "#FFFFFF"} style={{ marginRight: 8 }} />
                  <Text style={styles.finishReviewButtonText}>
                    {isReviewMode ? 'Continuar Revisão' : `Revisar Questões (${finishStats.total})`}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.finishExitButton}
                  activeOpacity={0.85}
                  onPress={async () => {
                    if (blocoId) {
                      await concluirAtividadePorId(decodeURIComponent(blocoId));
                    }
                    setShowFinishModal(false);
                    router.back();
                  }}
                >
                  <Ionicons name="checkmark-done" size={18} color={theme.text} style={{ marginRight: 8 }} />
                  <Text style={styles.finishExitButtonText}>Concluir e Voltar</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal Grid para Navegação Rápida entre Questões na Revisão */}
      <Modal
        transparent
        animationType="fade"
        visible={showReviewGridModal}
        onRequestClose={() => setShowReviewGridModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdropDismiss}
            activeOpacity={1}
            onPress={() => setShowReviewGridModal(false)}
          />
          <View style={styles.reviewGridModalCard}>
            <View style={styles.reviewGridModalHeader}>
              <View style={styles.reviewGridTitleRow}>
                <Ionicons name="grid-outline" size={18} color={theme.primary} style={{ marginRight: 8 }} />
                <Text style={styles.reviewGridModalTitle}>Navegar pelas Questões</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowReviewGridModal(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Legenda de cores */}
            <View style={styles.reviewGridLegendRow}>
              <View style={styles.reviewGridLegendItem}>
                <View style={[styles.legendDot, { backgroundColor: isDark ? '#34D399' : '#10B981' }]} />
                <Text style={styles.legendText}>Acertos ({correctCount})</Text>
              </View>
              <View style={styles.reviewGridLegendItem}>
                <View style={[styles.legendDot, { backgroundColor: isDark ? '#F87171' : '#EF4444' }]} />
                <Text style={styles.legendText}>Erros ({wrongCount})</Text>
              </View>
              <View style={styles.reviewGridLegendItem}>
                <View style={[styles.legendDot, { backgroundColor: theme.textMuted }]} />
                <Text style={styles.legendText}>
                  Puladas ({Math.max(0, questions.length - correctCount - wrongCount)})
                </Text>
              </View>
            </View>

            {/* Grid com os botões das questões */}
            <ScrollView
              contentContainerStyle={styles.reviewGridScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.reviewGridItemsWrapper}>
                {questions.map((_, qIdx) => {
                  const ans = answersHistory[qIdx];
                  const isCurrent = qIdx === currentIndex;
                  const isQAnswered = ans && ans.isAnswered;
                  const isQCorrect = isQAnswered && ans.isCorrect;
                  const isQWrong = isQAnswered && !ans.isCorrect;
                  const isQSkipped = !isQAnswered;

                  let borderColor = theme.border;
                  let bgColor = theme.surfaceCard;
                  let textColor = theme.textSecondary;

                  if (isQCorrect) {
                    borderColor = isDark ? 'rgba(16, 185, 129, 0.45)' : 'rgba(16, 185, 129, 0.35)';
                    bgColor = isDark ? 'rgba(16, 185, 129, 0.16)' : 'rgba(16, 185, 129, 0.10)';
                    textColor = isDark ? '#34D399' : '#059669';
                  } else if (isQWrong) {
                    borderColor = isDark ? 'rgba(239, 68, 68, 0.45)' : 'rgba(239, 68, 68, 0.35)';
                    bgColor = isDark ? 'rgba(239, 68, 68, 0.16)' : 'rgba(239, 68, 68, 0.10)';
                    textColor = isDark ? '#F87171' : '#DC2626';
                  } else if (isQSkipped) {
                    borderColor = theme.borderSubtle;
                    bgColor = isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)';
                    textColor = theme.textMuted;
                  }

                  if (isCurrent) {
                    borderColor = theme.primary;
                    bgColor = theme.primarySubtle;
                    textColor = theme.primary;
                  }

                  return (
                    <TouchableOpacity
                      key={`grid-q-${qIdx}`}
                      style={[
                        styles.reviewGridItemBtn,
                        { borderColor, backgroundColor: bgColor },
                        isCurrent && styles.reviewGridItemCurrent,
                      ]}
                      activeOpacity={0.7}
                      onPress={() => {
                        setShowReviewGridModal(false);
                        goToQuestion(qIdx);
                      }}
                    >
                      <Text style={[styles.reviewGridItemText, { color: textColor }]}>
                        {qIdx + 1}
                      </Text>
                      {isQCorrect && (
                        <Ionicons name="checkmark" size={10} color={isDark ? "#34D399" : "#059669"} style={styles.reviewGridItemIcon} />
                      )}
                      {isQWrong && (
                        <Ionicons name="close" size={10} color={isDark ? "#F87171" : "#DC2626"} style={styles.reviewGridItemIcon} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <TouchableOpacity
              style={styles.reviewGridDoneButton}
              activeOpacity={0.85}
              onPress={() => setShowReviewGridModal(false)}
            >
              <Text style={styles.reviewGridDoneButtonText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Toast de Streak de Acertos (Estilo Notificação iOS) */}
      {toastVisible && (
        <View pointerEvents="none" style={styles.streakToastOverlay}>
          <Animated.View
            style={[
              styles.streakToastCard,
              {
                opacity: toastOpacity,
                transform: [
                  { translateY: toastTranslateY },
                  { scale: toastScale },
                ],
              },
            ]}
          >
            <View style={styles.streakToastIconBox}>
              <Ionicons name="flame" size={18} color={isDark ? "#000000" : "#FFFFFF"} />
            </View>
            <View style={styles.streakToastContent}>
              <View style={styles.streakToastHeaderRow}>
                <Text style={styles.streakToastAppName}>ATHENA MD</Text>
                <Text style={styles.streakToastTime}>agora</Text>
              </View>
              <Text style={styles.streakToastText}>{toastMessage}</Text>
            </View>
          </Animated.View>
        </View>
      )}
    </SafeAreaView>
  );
}

function createStyles(theme: ActiveThemeColors, isDark: boolean) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.background,
    },
    header: {
      position: 'relative',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 12,
      backgroundColor: theme.background,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    closeButton: {
      width: 38,
      height: 38,
      borderRadius: 10,
      backgroundColor: theme.surfaceCard,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2,
    },
    headerInfo: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 8,
      bottom: 12,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1,
    },
    counterText: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.text,
      textAlign: 'center',
    },
    counterHighlight: {
      color: theme.primary,
    },
    themeHeaderTag: {
      fontSize: 12,
      color: theme.textSecondary,
      marginTop: 2,
      fontWeight: '500',
    },
    scoresRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      zIndex: 2,
    },
    scorePillCorrect: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.14)' : 'rgba(16, 185, 129, 0.10)',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(16, 185, 129, 0.35)' : 'rgba(16, 185, 129, 0.25)',
    },
    scorePillTextCorrect: {
      fontSize: 13,
      fontWeight: '700',
      color: isDark ? '#34D399' : '#059669',
    },
    scorePillWrong: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.14)' : 'rgba(239, 68, 68, 0.10)',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(239, 68, 68, 0.35)' : 'rgba(239, 68, 68, 0.25)',
    },
    scorePillTextWrong: {
      fontSize: 13,
      fontWeight: '700',
      color: isDark ? '#F87171' : '#DC2626',
    },
    progressBarTrack: {
      height: 4,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
      width: '100%',
    },
    progressBarFill: {
      height: '100%',
      backgroundColor: theme.primary,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 40,
    },
    badgeRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 15,
    },
    rightActionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    undoButton: {
      padding: 4,
      justifyContent: 'center',
      alignItems: 'center',
    },
    undoButtonDisabled: {
      opacity: 0.35,
    },
    favoriteButton: {
      padding: 4,
      justifyContent: 'center',
      alignItems: 'center',
    },
    specialtyBadge: {
      backgroundColor: theme.primarySubtle,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.primaryBorder,
      justifyContent: 'center',
      alignItems: 'center',
    },
    specialtyBadgeText: {
      fontSize: 11,
      fontWeight: '800',
      color: theme.primary,
      letterSpacing: 0.5,
    },
    badgesLeftRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      flex: 1,
      marginRight: 10,
      gap: 8,
    },
    questionIdBadge: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
      paddingHorizontal: 7,
      paddingVertical: 3.5,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: theme.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
    questionIdBadgeText: {
      fontSize: 10.5,
      fontWeight: '600',
      color: theme.textMuted,
      letterSpacing: 0.3,
    },
    microFocoBadge: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
    microFocoBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.textSecondary,
      letterSpacing: 0.4,
    },
    comentarioTagsWrapper: {
      marginBottom: 14,
    },
    comentarioTagsScrollContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 2,
    },
    comentarioTagBadge: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
    comentarioTagText: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.primary,
      letterSpacing: 0.4,
    },
    textContainer: {
      width: '100%',
    },
    enunciadoCard: {
      width: '100%',
      backgroundColor: theme.surfaceCard,
      borderRadius: 16,
      paddingVertical: 16,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0.25 : 0.04,
      shadowRadius: 4,
      elevation: isDark ? 2 : 1,
    },
    enunciadoText: {
      width: '100%',
      flexShrink: 1,
      fontSize: 16,
      fontWeight: '500',
      color: theme.text,
      lineHeight: 25,
      textAlign: 'left',
    },
    imageCardContainer: {
      width: '100%',
      marginTop: 14,
      marginBottom: 4,
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
    },
    imageTouchWrapper: {
      width: '100%',
      minHeight: 220,
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      overflow: 'hidden',
    },
    questionImage: {
      width: '100%',
      height: 240,
      borderRadius: 12,
    },
    zoomBadge: {
      position: 'absolute',
      bottom: 8,
      right: 8,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    zoomBadgeText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '600',
    },
    alternativesContainer: {
      gap: 12,
      marginBottom: 20,
    },
    altButton: {
      backgroundColor: theme.surfaceCard,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0.2 : 0.04,
      shadowRadius: 4,
      elevation: isDark ? 2 : 1,
    },
    altLetterBox: {
      width: 34,
      height: 34,
      borderRadius: 8,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    altLetterText: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.text,
    },
    altText: {
      flex: 1,
      fontSize: 15,
      lineHeight: 22,
      fontWeight: '500',
      color: theme.text,
    },
    altStatusIcon: {
      marginLeft: 10,
    },
    altCorrect: {
      backgroundColor: isDark ? '#059669' : '#10B981',
      borderColor: isDark ? '#10B981' : '#059669',
      borderWidth: 1.5,
    },
    letterBoxCorrect: {
      backgroundColor: 'rgba(0, 0, 0, 0.2)',
    },
    altWrong: {
      backgroundColor: isDark ? '#DC2626' : '#EF4444',
      borderColor: isDark ? '#EF4444' : '#DC2626',
      borderWidth: 1.5,
    },
    letterBoxWrong: {
      backgroundColor: 'rgba(0, 0, 0, 0.2)',
    },
    altDisabled: {
      opacity: 0.5,
      backgroundColor: theme.surfaceCard,
      borderColor: theme.borderSubtle,
      borderWidth: 1,
    },
    altDiscarded: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#F2F2F0',
      borderColor: theme.borderSubtle,
      borderWidth: 1,
      opacity: 0.65,
    },
    letterBoxDiscarded: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#E8E8E6',
      borderColor: 'transparent',
    },
    altTextDiscarded: {
      textDecorationLine: 'line-through',
      textDecorationColor: theme.textMuted,
      color: theme.textMuted,
    },
    discardButton: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 10,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
      borderWidth: 1,
      borderColor: theme.border,
    },
    discardButtonActive: {
      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.16)' : 'rgba(239, 68, 68, 0.10)',
      borderColor: theme.error,
    },
    explanationCard: {
      backgroundColor: theme.surfaceCard,
      borderRadius: 16,
      padding: 18,
      marginTop: 8,
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.25 : 0.05,
      shadowRadius: 6,
      elevation: isDark ? 2 : 1,
    },
    feedbackPill: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 10,
      marginBottom: 10,
    },
    feedbackPillCorrect: {
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.16)' : 'rgba(16, 185, 129, 0.12)',
      borderWidth: 1,
      borderColor: isDark ? '#10B981' : '#059669',
    },
    feedbackPillWrong: {
      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.16)' : 'rgba(239, 68, 68, 0.12)',
      borderWidth: 1,
      borderColor: isDark ? '#EF4444' : '#DC2626',
    },
    feedbackPillDiscursiva: {
      backgroundColor: theme.primarySubtle,
      borderWidth: 1,
      borderColor: theme.primaryBorder,
    },
    feedbackPillSkipped: {
      backgroundColor: isDark ? 'rgba(148, 163, 184, 0.15)' : 'rgba(100, 116, 139, 0.12)',
      borderWidth: 1,
      borderColor: theme.textMuted,
    },
    discursivaCard: {
      backgroundColor: theme.surfaceCard,
      borderRadius: 16,
      padding: 18,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: theme.border,
    },
    discursivaHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    discursivaTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.text,
    },
    discursivaDesc: {
      fontSize: 14,
      color: theme.textSecondary,
      lineHeight: 20,
      marginBottom: 16,
    },
    discursivaActionButton: {
      backgroundColor: theme.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      borderRadius: 12,
    },
    discursivaActionButtonText: {
      color: isDark ? '#000000' : '#FFFFFF',
      fontSize: 15,
      fontWeight: '700',
    },
    feedbackPillText: {
      fontSize: 12,
      fontWeight: '700',
    },
    explanationText: {
      width: '100%',
      flexShrink: 1,
      fontSize: 14.5,
      lineHeight: 23,
      color: theme.text,
      textAlign: 'left',
    },
    bottomBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: theme.surfaceCard,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 22,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: isDark ? 0.25 : 0.05,
      shadowRadius: 4,
      elevation: isDark ? 6 : 2,
    },
    nextButton: {
      backgroundColor: theme.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 16,
      borderRadius: 14,
      shadowColor: theme.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.3 : 0.15,
      shadowRadius: 6,
      elevation: 3,
      width: '100%',
      maxWidth: 500,
      alignSelf: 'center',
    },
    nextButtonText: {
      color: isDark ? '#000000' : '#FFFFFF',
      fontSize: 16,
      fontWeight: '700',
    },
    skipButton: {
      backgroundColor: theme.surfaceCard,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 16,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.2 : 0.04,
      shadowRadius: 4,
      elevation: 2,
      width: '100%',
      maxWidth: 500,
      alignSelf: 'center',
    },
    skipButtonText: {
      color: theme.textSecondary,
      fontSize: 16,
      fontWeight: '700',
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 30,
    },
    loadingText: {
      marginTop: 14,
      fontSize: 15,
      color: theme.textSecondary,
    },
    emptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 30,
    },
    emptyTitle: {
      fontSize: 19,
      fontWeight: '700',
      color: theme.text,
      marginTop: 16,
      textAlign: 'center',
    },
    emptySubtitle: {
      fontSize: 14,
      color: theme.textSecondary,
      textAlign: 'center',
      marginTop: 8,
      lineHeight: 20,
      marginBottom: 24,
    },
    primaryActionButton: {
      backgroundColor: theme.primary,
      paddingVertical: 12,
      paddingHorizontal: 24,
      borderRadius: 10,
    },
    primaryActionButtonText: {
      color: isDark ? '#000000' : '#FFFFFF',
      fontSize: 15,
      fontWeight: '700',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 20,
    },
    modalBackdropDismiss: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    exitModalCard: {
      width: '100%',
      maxWidth: 380,
      maxHeight: '92%',
      backgroundColor: theme.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 22,
      paddingVertical: 20,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: isDark ? 0.5 : 0.12,
      shadowRadius: 16,
      elevation: 10,
    },
    modalScrollInner: {
      alignItems: 'center',
      width: '100%',
    },
    exitModalIconContainer: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: theme.primarySubtle,
      borderWidth: 1,
      borderColor: theme.primaryBorder,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 14,
    },
    exitModalTitle: {
      fontSize: 19,
      fontWeight: '700',
      color: theme.text,
      textAlign: 'center',
      marginBottom: 8,
    },
    exitModalSubtitle: {
      fontSize: 13,
      color: theme.textSecondary,
      textAlign: 'center',
      lineHeight: 18,
      marginBottom: 18,
    },
    exitModalProgressBox: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.backgroundSecondary,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      paddingVertical: 10,
      paddingHorizontal: 16,
      width: '100%',
      marginBottom: 20,
    },
    exitModalProgressItem: {
      flex: 1,
      alignItems: 'center',
    },
    exitModalProgressLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: theme.textMuted,
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    exitModalProgressValue: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.text,
    },
    exitModalDivider: {
      width: 1,
      height: 22,
      backgroundColor: theme.border,
    },
    exitModalButtonsCol: {
      width: '100%',
      gap: 10,
    },
    exitModalPrimaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.primary,
      borderRadius: 12,
      paddingVertical: 13,
      width: '100%',
    },
    exitModalPrimaryButtonText: {
      fontSize: 15,
      fontWeight: '700',
      color: isDark ? '#000000' : '#FFFFFF',
    },
    exitModalDangerButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.16)' : 'rgba(239, 68, 68, 0.10)',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(239, 68, 68, 0.35)' : 'rgba(239, 68, 68, 0.25)',
      paddingVertical: 12,
      width: '100%',
    },
    exitModalDangerButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.error,
    },
    exitModalCancelButton: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      width: '100%',
    },
    exitModalCancelButtonText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.textSecondary,
    },
    finishModalCard: {
      width: '100%',
      maxWidth: 400,
      maxHeight: '92%',
      backgroundColor: theme.surface,
      borderRadius: 24,
      padding: 22,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: isDark ? 0.5 : 0.12,
      shadowRadius: 20,
      elevation: 10,
    },
    finishIconCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
      borderWidth: 1.5,
    },
    finishModalTitle: {
      fontSize: 22,
      fontWeight: '800',
      color: theme.text,
      textAlign: 'center',
      marginBottom: 4,
    },
    finishModalSubtitle: {
      fontSize: 13,
      color: theme.textSecondary,
      textAlign: 'center',
      lineHeight: 18,
      marginBottom: 18,
    },
    finishScoreCard: {
      width: '100%',
      backgroundColor: theme.backgroundSecondary,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 16,
      marginBottom: 14,
    },
    finishScoreRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    finishScorePercent: {
      fontSize: 32,
      fontWeight: '900',
    },
    finishBadgePill: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 10,
      borderWidth: 1,
    },
    finishBadgePillText: {
      fontSize: 12,
      fontWeight: '700',
    },
    finishStatsGrid: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    finishStatBox: {
      flex: 1,
      alignItems: 'center',
    },
    finishStatLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: theme.textMuted,
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    finishStatValue: {
      fontSize: 16,
      fontWeight: '800',
      color: theme.text,
    },
    finishStatDivider: {
      width: 1,
      height: 24,
      backgroundColor: theme.border,
    },
    finishFeedbackBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: theme.primarySubtle,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.primaryBorder,
      padding: 12,
      marginBottom: 20,
      width: '100%',
    },
    finishFeedbackText: {
      flex: 1,
      fontSize: 12,
      color: theme.text,
      lineHeight: 17,
    },
    finishButtonsCol: {
      width: '100%',
      gap: 10,
    },
    finishPrimaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.primary,
      borderRadius: 12,
      paddingVertical: 14,
      width: '100%',
      shadowColor: theme.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.25 : 0.12,
      shadowRadius: 8,
      elevation: 3,
    },
    finishPrimaryButtonText: {
      fontSize: 15,
      fontWeight: '800',
      color: isDark ? '#000000' : '#FFFFFF',
    },
    finishSecondaryButton: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      width: '100%',
    },
    finishSecondaryButtonText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.textSecondary,
    },
    finishReviewButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.primary,
      borderRadius: 12,
      paddingVertical: 14,
      width: '100%',
      shadowColor: theme.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.25 : 0.12,
      shadowRadius: 8,
      elevation: 3,
    },
    finishReviewButtonText: {
      fontSize: 15,
      fontWeight: '800',
      color: isDark ? '#000000' : '#FFFFFF',
    },
    finishExitButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surfaceCard,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      paddingVertical: 13,
      width: '100%',
    },
    finishExitButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.text,
    },
    streakToastOverlay: {
      position: 'absolute',
      top: 54,
      left: 0,
      right: 0,
      alignItems: 'center',
      paddingHorizontal: 16,
      zIndex: 9999,
    },
    streakToastCard: {
      width: '100%',
      maxWidth: 400,
      backgroundColor: theme.surface,
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.45 : 0.12,
      shadowRadius: 16,
      elevation: 12,
    },
    streakToastIconBox: {
      width: 36,
      height: 36,
      borderRadius: 9,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    streakToastContent: {
      flex: 1,
      justifyContent: 'center',
    },
    streakToastHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 2,
    },
    streakToastAppName: {
      fontSize: 10.5,
      fontWeight: '700',
      color: theme.textMuted,
      letterSpacing: 0.6,
    },
    streakToastTime: {
      fontSize: 10.5,
      color: theme.textMuted,
      fontWeight: '500',
    },
    streakToastText: {
      fontSize: 13.5,
      fontWeight: '700',
      color: theme.text,
      lineHeight: 18,
    },
    reviewBadgeHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.primarySubtle,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.primaryBorder,
    },
    reviewBadgeHeaderText: {
      fontSize: 11,
      fontWeight: '800',
      color: theme.primary,
      letterSpacing: 0.8,
    },
    reviewBottomBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
      maxWidth: 500,
      alignSelf: 'center',
      gap: 10,
    },
    reviewNavBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: theme.surfaceCard,
      paddingVertical: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
    },
    reviewNavBtnDisabled: {
      opacity: 0.4,
      borderColor: theme.borderSubtle,
    },
    reviewNavBtnText: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '700',
    },
    reviewNavBtnTextDisabled: {
      color: theme.textMuted,
    },
    reviewGridTriggerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.primarySubtle,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.primaryBorder,
    },
    reviewGridTriggerBtnText: {
      color: theme.primary,
      fontSize: 14,
      fontWeight: '800',
    },
    reviewFinishBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.primary,
      paddingVertical: 14,
      borderRadius: 14,
    },
    reviewFinishBtnText: {
      color: isDark ? '#000000' : '#FFFFFF',
      fontSize: 14,
      fontWeight: '800',
    },
    reviewGridModalCard: {
      width: '90%',
      maxWidth: 420,
      maxHeight: '80%',
      backgroundColor: theme.surface,
      borderRadius: 20,
      padding: 20,
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: isDark ? 0.5 : 0.12,
      shadowRadius: 20,
      elevation: 12,
    },
    reviewGridModalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    reviewGridTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    reviewGridModalTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: theme.text,
    },
    reviewGridLegendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      marginBottom: 12,
    },
    reviewGridLegendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    legendDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    legendText: {
      fontSize: 11,
      color: theme.textSecondary,
      fontWeight: '600',
    },
    reviewGridScrollContent: {
      paddingVertical: 6,
    },
    reviewGridItemsWrapper: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      justifyContent: 'flex-start',
    },
    reviewGridItemBtn: {
      width: 44,
      height: 44,
      borderRadius: 12,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    reviewGridItemCurrent: {
      borderWidth: 2,
      borderColor: theme.primary,
      shadowColor: theme.primary,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.4,
      shadowRadius: 4,
      elevation: 3,
    },
    reviewGridItemText: {
      fontSize: 14,
      fontWeight: '700',
    },
    reviewGridItemIcon: {
      position: 'absolute',
      top: 3,
      right: 3,
    },
    reviewGridDoneButton: {
      marginTop: 16,
      backgroundColor: theme.surfaceCard,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
    },
    reviewGridDoneButtonText: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '700',
    },
    altSelectedSimulado: {
      borderColor: theme.primary,
      backgroundColor: theme.primarySubtle,
      borderWidth: 1.5,
    },
    letterBoxSelectedSimulado: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    simuladoHeaderBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.primarySubtle,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.primaryBorder,
    },
    simuladoHeaderBadgeText: {
      color: theme.primary,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
  });
}
