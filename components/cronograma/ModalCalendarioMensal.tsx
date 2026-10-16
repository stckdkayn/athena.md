import React from 'react';
import {
  Modal,
  View,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from 'react-native';
import { Calendar, LocaleConfig } from 'react-native-calendars';

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
  // Configuração dos dias marcados (dataAtual selecionada)
  const markedDates: Record<string, any> = dataAtual
    ? {
        [dataAtual]: {
          selected: true,
          selectedColor: '#1F2937',
          selectedTextColor: '#FFFFFF',
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
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableWithoutFeedback>
          <View style={styles.calendarContainer}>
            <Calendar
              current={dataAtual || undefined}
              onDayPress={(day: { dateString: string }) => {
                onDayPress(day.dateString);
              }}
              markedDates={markedDates}
              theme={{
                backgroundColor: '#FFFFFF',
                calendarBackground: '#FFFFFF',
                textSectionTitleColor: '#6B7280',
                selectedDayBackgroundColor: '#1F2937',
                selectedDayTextColor: '#FFFFFF',
                todayBackgroundColor: '#000000',
                todayTextColor: '#FFFFFF',
                dayTextColor: '#000000',
                textDisabledColor: '#D1D5DB',
                arrowColor: '#000000',
                monthTextColor: '#000000',
                textMonthFontWeight: '700',
                textDayHeaderFontWeight: '600',
                textDayFontSize: 15,
                textMonthFontSize: 16,
                textDayHeaderFontSize: 12,
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  calendarContainer: {
    backgroundColor: '#FFFFFF',
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
