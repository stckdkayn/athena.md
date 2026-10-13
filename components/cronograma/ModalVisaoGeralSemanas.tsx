import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import {
  CronogramaSemana,
  CronogramaProgresso,
  calcularProgressoSemana,
} from '@/services/scheduleService';
import CircularProgressRing from '@/components/CircularProgressRing';

export interface ModalVisaoGeralSemanasProps {
  visible: boolean;
  onClose: () => void;
  semanasList: CronogramaSemana[];
  semanaAtiva: number;
  progresso: CronogramaProgresso;
  onSelectSemana: (semanaNum: number) => void;
}

export function ModalVisaoGeralSemanas({
  visible,
  onClose,
  semanasList,
  semanaAtiva,
  progresso,
  onSelectSemana,
}: ModalVisaoGeralSemanasProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={[styles.modalSheetBox, { maxHeight: '80%' }]} onStartShouldSetResponder={() => true}>
          <View style={styles.modalHeaderRow}>
            <View>
              <Text style={styles.modalSheetTitle}>Visão Geral das Semanas</Text>
              <Text style={styles.modalSheetSub}>Toque para pular para qualquer semana</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color="#8E959E" />
            </TouchableOpacity>
          </View>

          <FlatList
            data={semanasList}
            keyExtractor={(s) => `ov_${s.numero}`}
            contentContainerStyle={{ paddingVertical: 8 }}
            renderItem={({ item: s }) => {
              const st = calcularProgressoSemana(s, progresso);
              const isSelected = s.numero === semanaAtiva;
              return (
                <TouchableOpacity
                  style={[styles.weekOverviewCard, isSelected && styles.weekOverviewCardSelected]}
                  onPress={() => {
                    onSelectSemana(s.numero);
                    onClose();
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.weekOverviewLeft}>
                    <Text style={[styles.weekOverviewTitle, isSelected && { color: Colors.primary }]}>
                      Semana {s.numero}
                    </Text>
                    <Text style={styles.weekOverviewTopicsCount}>
                      {s.topicos?.length || 0} tópicos programados
                    </Text>
                  </View>

                  <View style={styles.weekOverviewRight}>
                    <CircularProgressRing progress={st.porcentagem} size={34} strokeWidth={3} />
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={16} color={Colors.primary} style={{ marginLeft: 8 }} />
                    )}
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalSheetBox: {
    backgroundColor: '#16191E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderColor: '#262B33',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#22262E',
  },
  modalSheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalSheetSub: {
    fontSize: 12,
    color: '#8E959E',
    marginTop: 2,
  },
  weekOverviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1B1E24',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#262B32',
  },
  weekOverviewCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(234, 225, 21, 0.08)',
  },
  weekOverviewLeft: {
    flex: 1,
  },
  weekOverviewTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 3,
  },
  weekOverviewTopicsCount: {
    fontSize: 12,
    color: '#8E959E',
  },
  weekOverviewRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

