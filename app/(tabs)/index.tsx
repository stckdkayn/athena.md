import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Animated } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@react-navigation/native'; // 1. Hook de cores do sistema
import { useAccentColor } from '../_layout'; // 2. Nosso hook da cor de destaque

import { getProgress, getDailyGoal, ProgressData } from '../../services/progressService';
import { getStreakData, StreakData } from '../../services/streakService';
import CircularProgressRing from '../../components/CircularProgressRing';

export default function IndexScreen() {
  const { colors } = useTheme(); // Cores do Dark/Light mode
  const { accentColor } = useAccentColor(); // A sua cor azul/amarela
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [streak, setStreak] = useState<StreakData | null>(null);
  const [dailyGoal, setDailyGoal] = useState(10);
  const fadeAnim = useRef(new Animated.Value(0)).current; // Animação de entrada

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      const prog = await getProgress();
      const strk = await getStreakData();
      const goal = await getDailyGoal();
      setProgress(prog);
      setStreak(strk);
      setDailyGoal(goal);
      
      // Efeito Fade-in suave ao carregar os dados
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  const calculateAccuracy = () => {
    if (!progress || progress.totalQuestionsAnswered === 0) return 0;
    return Math.round((progress.correctAnswers / progress.totalQuestionsAnswered) * 100);
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView 
        contentContainerStyle={styles.container} 
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fadeAnim }}>
          
          {/* HEADER MINIMALISTA */}
          <View style={styles.header}>
            <View>
              <Text style={[styles.greeting, { color: colors.text }]}>{getGreeting()}</Text>
              <Text style={[styles.title, { color: colors.text }]}>Visão Geral</Text>
            </View>
            <View style={styles.streakBadge}>
              <MaterialCommunityIcons name="fire" size={24} color={accentColor} />
              <Text style={[styles.streakText, { color: accentColor }]}>
                {streak?.currentStreak || 0} dias
              </Text>
            </View>
          </View>

          {/* CARD PRINCIPAL - Fica com cor sólida de destaque (Azul/Amarelo) */}
          <View style={[styles.mainCard, { backgroundColor: accentColor }]}>
             <View style={styles.mainCardContent}>
                <View style={styles.mainCardText}>
                  <Text style={styles.mainCardTitle}>Progresso Diário</Text>
                  <Text style={styles.mainCardSubtitle}>
                    {progress?.questionsAnsweredToday || 0} de {dailyGoal} questões
                  </Text>
                </View>
                <CircularProgressRing 
                  progress={progress?.questionsAnsweredToday || 0} 
                  goal={dailyGoal} 
                  size={80} 
                  strokeWidth={8} 
                  // No fundo colorido, o anel precisa ser branco/transparente para dar contraste
                  color="#ffffff" 
                  backgroundColor="rgba(255,255,255,0.2)"
                />
             </View>
          </View>

          {/* ESTATÍSTICAS SECUNDÁRIAS - Cards limpos, sem sombra, com borda fina */}
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Desempenho Global</Text>
          
          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="check-circle-outline" size={32} color={colors.text} />
              <Text style={[styles.statValue, { color: colors.text }]}>{calculateAccuracy()}%</Text>
              <Text style={[styles.statLabel, { color: colors.text }]}>Taxa de Acerto</Text>
            </View>

            <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="chart-box-outline" size={32} color={colors.text} />
              <Text style={[styles.statValue, { color: colors.text }]}>{progress?.totalQuestionsAnswered || 0}</Text>
              <Text style={[styles.statLabel, { color: colors.text }]}>Resolvidas</Text>
            </View>
          </View>

        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    padding: 24, // Mais "respiro" nas bordas (minimalismo)
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 32,
    marginTop: 16,
  },
  greeting: {
    fontSize: 16,
    fontFamily: 'SpaceMono', // Mantive a sua fonte mono para dar aquele ar "dev/notion"
    opacity: 0.6,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    marginTop: 4,
    letterSpacing: -1, // Fica mais sofisticado
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)', // Fundo bem sutil
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  streakText: {
    fontWeight: 'bold',
    marginLeft: 4,
    fontSize: 16,
  },
  mainCard: {
    borderRadius: 24,
    padding: 24,
    marginBottom: 32,
    // Removi as sombras pesadas do Android/iOS. O minimalismo não usa sombra, usa contraste.
  },
  mainCardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mainCardText: {
    flex: 1,
  },
  mainCardTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  mainCardSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 16,
    fontFamily: 'SpaceMono',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statCard: {
    flex: 1,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1, // Borda fina no estilo Notion
    marginHorizontal: 4,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
    marginTop: 12,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    opacity: 0.7,
  },
});