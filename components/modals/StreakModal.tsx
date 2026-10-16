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
import { useAppTheme } from '@/context/ThemeContext';
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
  const { colors: theme } = useAppTheme();
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
            <View style={[styles.modalContainer, { backgroundColor: theme.surfaceCard, borderColor: theme.border }]}>
              {/* Ícone de Fogo de Destaque */}
              <View
                style={[
                  styles.fireCircle,
                  activeToday
                    ? { backgroundColor: theme.primarySubtle, borderColor: theme.primaryBorder, borderWidth: 1 }
                    : { backgroundColor: theme.backgroundSecondary, borderColor: theme.borderSubtle, borderWidth: 1 },
                ]}
              >
                <Ionicons
                  name={activeToday ? 'flame' : 'flame-outline'}
                  size={46}
                  color={activeToday ? theme.primary : theme.textSecondary}
                />
              </View>

              {/* Contagem de Dias */}
              <Text style={[styles.streakCountText, { color: theme.text }]}>
                {streak} {streak === 1 ? 'dia' : 'dias'}
              </Text>
              <Text style={[styles.streakTitleText, { color: theme.text }]}>
                {activeToday ? 'Ofensiva ativa hoje! 🔥' : 'Mantenha sua chama acesa!'}
              </Text>

              <Text style={[styles.streakDescriptionText, { color: theme.textSecondary }]}>
                {activeToday
                  ? 'Excelente constância, Dr.! Você já treinou hoje e garantiu mais um dia de ofensiva.'
                  : 'Resolva pelo menos 1 questão hoje para continuar sua sequência de estudos consecutivos.'}
              </Text>

              {/* Calendário dos Últimos 7 Dias */}
              <View style={[styles.calendarCard, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <Text style={[styles.calendarCardTitle, { color: theme.textSecondary }]}>ÚLTIMOS 7 DIAS</Text>
                <View style={styles.daysRow}>
                  {streakInfo.historyLast7Days.map((item, index) => (
                    <View key={`${item.date}-${index}`} style={styles.dayCol}>
                      <Text style={[styles.dayLabelText, { color: theme.textSecondary }]}>
                        {item.dayLabel}
                      </Text>
                      <View
                        style={[
                          styles.dayCheckCircle,
                          item.active
                            ? { backgroundColor: theme.primary }
                            : { backgroundColor: theme.backgroundSecondary, borderColor: theme.borderSubtle, borderWidth: 1 },
                        ]}
                      >
                        {item.active ? (
                          <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                        ) : (
                          <View style={[styles.dayDotEmpty, { backgroundColor: theme.textMuted }]} />
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              </View>

              {/* Frase Motivacional */}
              <View style={[styles.quoteBox, { backgroundColor: theme.primarySubtle, borderColor: theme.primaryBorder }]}>
                <Ionicons
                  name="sparkles"
                  size={16}
                  color={theme.primary}
                  style={{ marginRight: 8 }}
                />
                <Text style={[styles.quoteText, { color: theme.text }]}>
                  {activeToday
                    ? '"A disciplina é a ponte entre metas e conquistas."'
                    : '"Grandes aprovações são construídas um dia de cada vez."'}
                </Text>
              </View>

              {/* Botão de Fechar */}
              <TouchableOpacity
                style={[styles.closeBtn, { backgroundColor: theme.primary }]}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Text style={styles.closeBtnText}>Entendido</Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    elevation: 0,
  },
  fireCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  streakCountText: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  streakTitleText: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
    marginBottom: 8,
  },
  streakDescriptionText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  calendarCard: {
    width: '100%',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  calendarCardTitle: {
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
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
    marginBottom: 8,
  },
  dayCheckCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayDotEmpty: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  quoteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 20,
    borderWidth: 1,
    width: '100%',
  },
  quoteText: {
    flex: 1,
    fontSize: 12,
    fontStyle: 'italic',
    lineHeight: 16,
  },
  closeBtn: {
    width: '100%',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
