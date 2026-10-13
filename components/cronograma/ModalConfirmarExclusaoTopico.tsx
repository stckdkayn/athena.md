import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CronogramaTopico } from '@/services/scheduleService';

export interface ModalConfirmarExclusaoTopicoProps {
  topicoParaExcluir: {
    topico: CronogramaTopico;
    semanaOrigemNumero: number;
  } | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ModalConfirmarExclusaoTopico({
  topicoParaExcluir,
  onCancel,
  onConfirm,
}: ModalConfirmarExclusaoTopicoProps) {
  return (
    <Modal
      visible={topicoParaExcluir !== null}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.alertCardBox}>
          <View style={styles.alertIconCircle}>
            <Ionicons name="alert-circle-outline" size={32} color="#EF4444" />
          </View>
          <Text style={styles.alertCardTitle}>Remover Tópico?</Text>
          <Text style={styles.alertCardMessage}>
            Você tem certeza que deseja remover "{topicoParaExcluir?.topico.titulo}" do cronograma? Seu progresso nesta matéria será resetado.
          </Text>

          <View style={styles.alertActionsRow}>
            <TouchableOpacity
              style={styles.alertCancelButton}
              onPress={onCancel}
              activeOpacity={0.8}
            >
              <Text style={styles.alertCancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.alertConfirmButton}
              onPress={onConfirm}
              activeOpacity={0.8}
            >
              <Text style={styles.alertConfirmText}>Sim, Remover</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertCardBox: {
    backgroundColor: '#181B20',
    borderRadius: 16,
    padding: 22,
    marginHorizontal: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#292E36',
    alignSelf: 'center',
    width: '88%',
  },
  alertIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  alertCardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  alertCardMessage: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  alertActionsRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  alertCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#23272E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#C1C7D0',
  },
  alertConfirmButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertConfirmText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

