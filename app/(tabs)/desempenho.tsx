import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';

import { Colors } from '@/constants/Colors';
import { getDatabase } from '@/services/database';
import { getStreakInfo, StreakInfo } from '@/services/streakService';
import { StreakModal } from '@/components/modals/StreakModal';

function toLocalDateStr(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Retorna a cor sólida do aproveitamento de acordo com o desempenho
function getAproveitamentoCor(taxa: number): string {
  if (taxa <= 25) return '#EF4444';
  if (taxa <= 50) return '#F97316';
  if (taxa <= 75) return '#EAB308';
  if (taxa <= 90) return '#10B981';
  return '#3B82F6';
}

// Cores dos quadradinhos do Heatmap no tema Notion Dark
function getHeatmapSquareColor(count: number): string {
  if (count <= 0) return '#1c1f22';
  if (count <= 3) return 'rgba(234, 225, 21, 0.3)';
  if (count <= 8) return 'rgba(234, 225, 21, 0.55)';
  if (count <= 15) return 'rgba(234, 225, 21, 0.8)';
  return Colors.primary;
}

const DIAS_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export default function DesempenhoScreen() {
  const [loading, setLoading] = useState<boolean>(true);
  const [streakInfo, setStreakInfo] = useState<StreakInfo | null>(null);
  const [modalStreakVisible, setModalStreakVisible] = useState<boolean>(false);

  // Estatísticas gerais
  const [totalQuestoes, setTotalQuestoes] = useState<number>(0);
  const [totalAcertos, setTotalAcertos] = useState<number>(0);
  const [mapaDias, setMapaDias] = useState<Record<string, number>>({});

  const carregarMetricas = useCallback(async () => {
    try {
      setLoading(true);

      // 1. Ofensiva e histórico dos últimos 7 dias
      const info = await getStreakInfo();
      setStreakInfo(info);

      // 2. Registros de respostas no SQLite
      const database = getDatabase();
      const rows = await database.getAllAsync<{ data: string; correta: number }>(
        `SELECT data, correta FROM progresso ORDER BY data DESC;`
      );

      let acertos = 0;
      const counts: Record<string, number> = {};

      for (const r of rows) {
        if (r.correta === 1) acertos++;
        if (r.data) {
          const d = new Date(r.data);
          if (!isNaN(d.getTime())) {
            const dateStr = toLocalDateStr(d);
            counts[dateStr] = (counts[dateStr] || 0) + 1;
          }
        }
      }

      setTotalQuestoes(rows.length);
      setTotalAcertos(acertos);
      setMapaDias(counts);
    } catch (err) {
      console.error('[DesempenhoScreen] Erro ao carregar métricas:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carregarMetricas();
    }, [carregarMetricas])
  );

  const aproveitamento = useMemo(() => {
    if (totalQuestoes === 0) return 0;
    return Math.round((totalAcertos / totalQuestoes) * 100);
  }, [totalQuestoes, totalAcertos]);

  // Gera a matriz do heatmap: 12 semanas (84 dias) dispostas em colunas de 7 dias
  const semanasHeatmap = useMemo(() => {
    const hoje = new Date();
    const diaDaSemanaHoje = hoje.getDay(); // 0 (Dom) a 6 (Sáb)
    
    // O final da grade é o sábado desta semana
    const sabadoFinal = new Date(hoje);
    sabadoFinal.setDate(hoje.getDate() + (6 - diaDaSemanaHoje));

    const totalSemanas = 12;
    const totalDias = totalSemanas * 7;
    
    const inicioData = new Date(sabadoFinal);
    inicioData.setDate(sabadoFinal.getDate() - totalDias + 1);

    const semanas: { dataISO: string; count: number; isFuture: boolean }[][] = [];

    const cursor = new Date(inicioData);
    for (let s = 0; s < totalSemanas; s++) {
      const semanaCol: { dataISO: string; count: number; isFuture: boolean }[] = [];
      for (let d = 0; d < 7; d++) {
        const iso = toLocalDateStr(cursor);
        const isFuture = cursor.getTime() > hoje.getTime();
        semanaCol.push({
          dataISO: iso,
          count: isFuture ? 0 : mapaDias[iso] || 0,
          isFuture,
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      semanas.push(semanaCol);
    }

    return semanas;
  }, [mapaDias]);

  const corAproveitamento = getAproveitamentoCor(aproveitamento);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Cabeçalho */}
        <View style={styles.header}>
          <Text style={styles.title}>Seu Desempenho</Text>
          <Text style={styles.subtitle}>Acompanhe sua evolução e consistência de estudos.</Text>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Carregando métricas...</Text>
          </View>
        ) : (
          <>
            {/* 1. Card de Ofensiva de Estudos */}
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.8}
              onPress={() => setModalStreakVisible(true)}
            >
              <View style={styles.cardHeaderRow}>
                <View style={styles.cardTitleWithIcon}>
                  <Text style={styles.cardTitle}>Ofensiva de Estudos</Text>
                  <Text style={styles.flameEmoji}>🔥</Text>
                </View>
                <View style={styles.detailsBadge}>
                  <Text style={styles.detailsBadgeText}>Ver detalhes</Text>
                  <Ionicons name="chevron-forward" size={12} color={Colors.textSecondary} />
                </View>
              </View>

              <Text style={styles.cardHighlight}>
                {streakInfo?.streak || 0} {streakInfo?.streak === 1 ? 'Dia' : 'Dias'}
              </Text>
              <Text style={styles.cardDesc}>
                {streakInfo?.bestStreak
                  ? `Seu recorde é de ${streakInfo.bestStreak} ${streakInfo.bestStreak === 1 ? 'dia' : 'dias'}.`
                  : 'Resolva questões diariamente para aumentar sua ofensiva!'}
              </Text>

              {/* Indicador dos Últimos 7 Dias */}
              {streakInfo?.historyLast7Days && streakInfo.historyLast7Days.length > 0 && (
                <View style={styles.streakWeekRow}>
                  {streakInfo.historyLast7Days.map((item) => (
                    <View key={item.date} style={styles.streakDayCol}>
                      <View
                        style={[
                          styles.streakDayCircle,
                          item.active ? styles.streakDayCircleActive : styles.streakDayCircleInactive,
                        ]}
                      >
                        <Ionicons
                          name={item.active ? 'flame' : 'remove'}
                          size={13}
                          color={item.active ? '#000000' : '#4E5358'}
                        />
                      </View>
                      <Text
                        style={[
                          styles.streakDayLabel,
                          item.active && styles.streakDayLabelActive,
                        ]}
                      >
                        {item.dayLabel}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </TouchableOpacity>

            {/* 2. Card de Consistência (Heatmap Anual/12 Semanas) */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardTitle}>Consistência de Estudos</Text>
                <Text style={styles.cardBadge}>Últimas 12 semanas</Text>
              </View>

              <Text style={styles.heatmapSubinfo}>
                Atividade diária em resolução de questões
              </Text>

              {/* Grid do Heatmap */}
              <View style={styles.heatmapWrapper}>
                <View style={styles.heatmapDayLabels}>
                  {DIAS_LABELS.map((lbl, idx) => (
                    <Text key={idx} style={styles.heatmapDayText}>
                      {idx % 2 === 1 ? lbl : ''}
                    </Text>
                  ))}
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.heatmapColumns}>
                    {semanasHeatmap.map((semana, sIdx) => (
                      <View key={sIdx} style={styles.heatmapCol}>
                        {semana.map((dia, dIdx) => (
                          <View
                            key={dIdx}
                            style={[
                              styles.heatmapSquare,
                              { backgroundColor: getHeatmapSquareColor(dia.count) },
                              dia.isFuture && styles.heatmapSquareFuture,
                            ]}
                          />
                        ))}
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </View>

              {/* Legenda do Heatmap */}
              <View style={styles.heatmapLegend}>
                <Text style={styles.legendText}>Menos</Text>
                <View style={[styles.legendSquare, { backgroundColor: '#1c1f22' }]} />
                <View style={[styles.legendSquare, { backgroundColor: 'rgba(234, 225, 21, 0.3)' }]} />
                <View style={[styles.legendSquare, { backgroundColor: 'rgba(234, 225, 21, 0.55)' }]} />
                <View style={[styles.legendSquare, { backgroundColor: 'rgba(234, 225, 21, 0.8)' }]} />
                <View style={[styles.legendSquare, { backgroundColor: Colors.primary }]} />
                <Text style={styles.legendText}>Mais</Text>
              </View>
            </View>

            {/* 3. Card de Desempenho em Questões */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardTitle}>Aproveitamento Geral</Text>
                <View style={[styles.rateBadge, { borderColor: corAproveitamento }]}>
                  <Text style={[styles.rateBadgeText, { color: corAproveitamento }]}>
                    {aproveitamento}%
                  </Text>
                </View>
              </View>

              <Text style={[styles.cardHighlight, { color: corAproveitamento }]}>
                {aproveitamento}%
              </Text>

              {/* Barra de Progresso do Aproveitamento */}
              <View style={styles.progressBarTrack}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${aproveitamento}%`,
                      backgroundColor: corAproveitamento,
                    },
                  ]}
                />
              </View>

              <Text style={styles.cardDesc}>
                {totalQuestoes > 0
                  ? `Baseado em ${totalQuestoes} ${totalQuestoes === 1 ? 'questão respondida' : 'questões respondidas'} com ${totalAcertos} ${totalAcertos === 1 ? 'acerto' : 'acertos'}.`
                  : 'Você ainda não respondeu nenhuma questão. Comece seus treinos na aba Questões!'}
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      {/* Modal detalhado de Streak / Ofensiva */}
      <StreakModal
        visible={modalStreakVisible}
        onClose={() => setModalStreakVisible(false)}
        streakInfo={streakInfo}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 100,
  },
  header: {
    marginTop: 10,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 6,
    lineHeight: 20,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: 14,
    marginTop: 12,
  },
  card: {
    backgroundColor: Colors.surface,
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2e3235',
    marginBottom: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  flameEmoji: {
    fontSize: 16,
    marginLeft: 6,
  },
  detailsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1b1d1f',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a2e32',
  },
  detailsBadgeText: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginRight: 2,
    fontWeight: '600',
  },
  cardHighlight: {
    fontSize: 34,
    fontWeight: '900',
    color: Colors.primary,
    letterSpacing: -0.5,
  },
  cardDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 6,
    lineHeight: 18,
  },
  cardBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    backgroundColor: '#1b1d1f',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },

  /* Indicadores dos últimos 7 dias */
  streakWeekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#2b2f33',
  },
  streakDayCol: {
    alignItems: 'center',
    gap: 6,
  },
  streakDayCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  streakDayCircleActive: {
    backgroundColor: Colors.primary,
  },
  streakDayCircleInactive: {
    backgroundColor: '#1a1d1f',
    borderWidth: 1,
    borderColor: '#2d3135',
  },
  streakDayLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  streakDayLabelActive: {
    color: Colors.primary,
    fontWeight: '700',
  },

  /* Heatmap */
  heatmapSubinfo: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  heatmapWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#151719',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#24282b',
  },
  heatmapDayLabels: {
    marginRight: 6,
    justifyContent: 'space-between',
    height: 118,
  },
  heatmapDayText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#656b73',
    height: 14,
    lineHeight: 14,
  },
  heatmapColumns: {
    flexDirection: 'row',
    gap: 4,
  },
  heatmapCol: {
    flexDirection: 'column',
    gap: 4,
  },
  heatmapSquare: {
    width: 13,
    height: 13,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#282c30',
  },
  heatmapSquareFuture: {
    opacity: 0.15,
  },
  heatmapLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 5,
    marginTop: 12,
  },
  legendText: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginHorizontal: 3,
  },
  legendSquare: {
    width: 10,
    height: 10,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: '#282c30',
  },

  /* Aproveitamento */
  rateBadge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  rateBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: '#1b1d1f',
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#272a2e',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
});
