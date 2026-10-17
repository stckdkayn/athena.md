import React from 'react';
import {
  Modal,
  View,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from 'react-native';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { Fonts } from '@/constants/Typography';

// Configuração do Locale para Português do Brasil
LocaleConfig.locales['pt-br'] = {
  monthNames: [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro',
  ],
  monthNamesShort: [
    'Jan',
    'Fev',
    'Mar',
    'Abr',
    'Mai',
    'Jun',
    'Jul',
    'Ago',
    'Set',
    'Out',
    'Nov',
    'Dez',
  ],
  dayNames: [
    'Domingo',
    'Segunda-feira',
    'Terça-feira',
    'Quarta-feira',
    'Quinta-feira',
    'Sexta-feira',
    'Sábado',
  ],
  dayNamesShort: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
  today: 'Hoje',
};
LocaleConfig.defaultLocale = 'pt-br';

import { useAppTheme } from '@/context/ThemeContext';

interface Props {
  visible: boolean;
  onClose: () => void;
  dataAtual: string; // YYYY-MM-DD
  onDayPress: (data: string) => void;
}

export default function ModalCalendarioMensal({
  visible,
  onClose,
  dataAtual,
  onDayPress,
}: Props) {
  const { colors: theme, isDark } = useAppTheme();

  // Configuração dos dias marcados (dataAtual selecionada)
  const markedDates: Record<string, any> = dataAtual
    ? {
        [dataAtual]: {
          selected: true,
          selectedColor: theme.primary,
          selectedTextColor: isDark ? '#000000' : '#FFFFFF',
        },
      }
    : {};

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={[
          styles.overlay,
          { backgroundColor: isDark ? 'rgba(0, 0, 0, 0.75)' : 'rgba(0, 0, 0, 0.45)' },
        ]}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableWithoutFeedback>
          <View
            style={[
              styles.calendarContainer,
              {
                backgroundColor: theme.surfaceCard || theme.surface,
                borderColor: theme.border,
                borderWidth: 1,
              },
            ]}
          >
            <Calendar
              current={dataAtual || undefined}
              onDayPress={(day: { dateString: string }) => {
                onDayPress(day.dateString);
              }}
              markedDates={markedDates}
              theme={{
                backgroundColor: theme.surfaceCard || theme.surface,
                calendarBackground: theme.surfaceCard || theme.surface,
                textSectionTitleColor: theme.textSecondary,
                selectedDayBackgroundColor: theme.primary,
                selectedDayTextColor: isDark ? '#000000' : '#FFFFFF',
                todayBackgroundColor: theme.primarySubtle,
                todayTextColor: theme.primary,
                dayTextColor: theme.text,
                textDisabledColor: theme.textMuted,
                arrowColor: isDark ? theme.primary : theme.text,
                monthTextColor: theme.text,
                textMonthFontWeight: '800',
                textDayHeaderFontWeight: '600',
                textDayFontSize: 15,
                textMonthFontSize: 16,
                textDayHeaderFontSize: 12,
                textDayFontFamily: Fonts.medium,
                textMonthFontFamily: Fonts.bold,
                textDayHeaderFontFamily: Fonts.semiBold,
              }}
              style={styles.calendar}
            />
          </View>
        </TouchableWithoutFeedback>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  calendarContainer: {
    borderRadius: 16,
    padding: 12,
    width: '100%',
    maxWidth: 360,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  calendar: {
    borderRadius: 12,
  },
});
