import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { StreakInfo } from '@/services/streakService';

interface StreakModalProps {
  visible: boolean;
  onClose: () => void;
  streakInfo: StreakInfo | null;
}

export const StreakModal: React.FC<StreakModalProps> = ({
  visible,
  onClose,
  streakInfo,
}) => {
  if (!streakInfo) return null;

  const streak = streakInfo.streak;
  const activeToday = streakInfo.activeToday;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent={true}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback>
            <View style={styles.modalContainer}>
              {/* Ícone de Fogo de Destaque */}
              <View style={[styles.fireCircle, activeToday ? styles.fireCircleActive : styles.fireCirclePending]}>
                <Ionicons
                  name={activeToday ? 'flame' : 'flame-outline'}
                  size={46}
                  color={activeToday ? Colors.primary : '#8E959E'}
                />
              </View>

              {/* Contagem de Dias */}
              <Text style={styles.streakCountText}>
                {streak} {streak === 1 ? 'dia' : 'dias'}
              </Text>
              <Text style={styles.streakTitleText}>
                {activeToday ? 'Ofensiva ativa hoje! 🔥' : 'Mantenha sua chama acesa!'}
              </Text>

              <Text style={styles.streakDescriptionText}>
                {activeToday
                  ? 'Excelente constância, Dr.! Você já treinou hoje e garantiu mais um dia de ofensiva.'
                  : 'Resolva pelo menos 1 questão hoje para continuar sua sequência de estudos consecutivos.'}
              </Text>

              {/* Calendário dos Últimos 7 Dias */}
              <View style={styles.calendarCard}>
                <Text style={styles.calendarCardTitle}>ÚLTIMOS 7 DIAS</Text>
                <View style={styles.daysRow}>
                  {streakInfo.historyLast7Days.map((item, index) => (
                    <View key={`${item.date}-${index}`} style={styles.dayCol}>
                      <Text style={styles.dayLabelText}>{item.dayLabel}</Text>
                      <View
                        style={[
                          styles.dayCheckCircle,
                          item.active ? styles.dayCheckCircleActive : styles.dayCheckCircleInactive,
                        ]}
                      >
                        {item.active ? (
                          <Ionicons name="checkmark" size={15} color="#000000" />
                        ) : (
                          <View style={styles.dayDotEmpty} />
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              </View>

              {/* Dica de Médica / Frase de Impacto */}
              <View style={styles.quoteBox}>
                <Ionicons name="sparkles" size={16} color={Colors.primary} style={{ marginRight: 8 }} />
                <Text style={styles.quoteText}>
                  "A excelência médica é um hábito diário, não um ato isolado."
                </Text>
              </View>

              {/* Botão de Fechar */}
              <TouchableOpacity style={styles.closeBtn} activeOpacity={0.85} onPress={onClose}>
                <Text style={styles.closeBtnText}>Entendi</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#16181B',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#262A2E',
  },
  fireCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  fireCircleActive: {
    backgroundColor: 'rgba(234, 225, 21, 0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(234, 225, 21, 0.35)',
  },
  fireCirclePending: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  streakCountText: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  streakTitleText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.primary,
    marginTop: 4,
    marginBottom: 8,
  },
  streakDescriptionText: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  calendarCard: {
    width: '100%',
    backgroundColor: '#0F1012',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#202327',
    marginBottom: 16,
  },
  calendarCardTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: 0.8,
  },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dayCol: {
    alignItems: 'center',
    flex: 1,
  },
  dayLabelText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 8,
  },
  dayCheckCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCheckCircleActive: {
    backgroundColor: Colors.primary,
  },
  dayCheckCircleInactive: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  dayDotEmpty: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#475569',
  },
  quoteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(234, 225, 21, 0.06)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(234, 225, 21, 0.15)',
  },
  quoteText: {
    flex: 1,
    fontSize: 12,
    color: '#E2E8F0',
    fontStyle: 'italic',
    lineHeight: 16,
  },
  closeBtn: {
    width: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#000000',
  },
});
