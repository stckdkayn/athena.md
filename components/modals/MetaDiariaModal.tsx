import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StyleSheet
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { storage } from '@/services/storage';

interface MetaDiariaModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (meta: number) => void;
  initialMeta: number;
}

export function MetaDiariaModal({ visible, onClose, onSave, initialMeta }: MetaDiariaModalProps) {
  const [inputMeta, setInputMeta] = useState('');

  useEffect(() => {
    if (visible) {
      setInputMeta(initialMeta > 0 ? String(initialMeta) : '30');
    }
  }, [visible, initialMeta]);

  const handleSalvar = () => {
    try {
      const cleanNum = inputMeta.trim();
      const parsed = parseInt(cleanNum, 10);
      if (!isNaN(parsed) && parsed > 0) {
        storage.set('@athena_meta_questoes_diaria', String(parsed));
        onSave(parsed);
      } else {
        storage.remove('@athena_meta_questoes_diaria');
        onSave(0);
      }
      onClose();
    } catch (e) {
      console.error('Erro ao salvar meta diária:', e);
      onClose();
    }
  };

  const handleRemover = () => {
    try {
      storage.remove('@athena_meta_questoes_diaria');
      onSave(0);
      onClose();
    } catch (e) {
      console.error(e);
    }
  };

  const parsedVal = parseInt(inputMeta, 10);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <TouchableOpacity
          style={styles.modalBackdropTouch}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.nameModalCard}>
          <View style={styles.nameModalHeader}>
            <View style={styles.nameModalIconCircle}>
              <Ionicons name="flag-outline" size={24} color={Colors.primary} />
            </View>
            <Text style={styles.nameModalTitle}>Meta Diária de Questões</Text>
            <Text style={styles.nameModalSubtitle}>
              Defina quantas questões você deseja resolver por dia para manter o ritmo e consistência nos estudos.
            </Text>
          </View>

          {/* Atalhos Rápidos de Meta */}
          <View style={styles.metaPresetsRow}>
            {[10, 20, 30, 50, 100].map((val) => {
              const isSelected = inputMeta === String(val);
              return (
                <TouchableOpacity
                  key={val}
                  style={[styles.metaPresetChip, isSelected && styles.metaPresetChipActive]}
                  onPress={() => setInputMeta(String(val))}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.metaPresetChipText, isSelected && styles.metaPresetChipTextActive]}>
                    {val}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.nameInputContainer}>
            <TextInput
              style={styles.nameInput}
              placeholder="Ex: 30 questões"
              placeholderTextColor="#71767b"
              value={inputMeta}
              onChangeText={(val) => setInputMeta(val.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              autoFocus={true}
              maxLength={4}
              returnKeyType="done"
              onSubmitEditing={handleSalvar}
            />
            {inputMeta.length > 0 && (
              <TouchableOpacity
                onPress={() => setInputMeta('')}
                style={styles.nameInputClearBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={18} color="#71767b" />
              </TouchableOpacity>
            )}
          </View>

          {/* Projeção Semanal e Mensal */}
          {parsedVal > 0 && (
            <View style={styles.metaProjectionBox}>
              <View style={styles.metaProjectionItem}>
                <Text style={styles.metaProjectionLabel}>Semana (7d)</Text>
                <Text style={styles.metaProjectionVal}>{parsedVal * 7} questões</Text>
              </View>
              <View style={styles.metaProjectionDivider} />
              <View style={styles.metaProjectionItem}>
                <Text style={styles.metaProjectionLabel}>Mês (30d)</Text>
                <Text style={styles.metaProjectionVal}>{parsedVal * 30} questões</Text>
              </View>
            </View>
          )}

          {initialMeta > 0 && (
            <TouchableOpacity
              style={styles.metaModalRemoveBtn}
              onPress={handleRemover}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={14} color={Colors.error} style={{ marginRight: 5 }} />
              <Text style={styles.metaModalRemoveText}>Remover meta diária</Text>
            </TouchableOpacity>
          )}

          <View style={styles.nameModalButtonsRow}>
            <TouchableOpacity
              style={styles.nameModalCancelBtn}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={styles.nameModalCancelText}>Cancelar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.nameModalSaveBtn}
              onPress={handleSalvar}
              activeOpacity={0.85}
            >
              <Text style={styles.nameModalSaveText}>Salvar Meta</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalBackdropTouch: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  nameModalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#1A1D20',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2E3338',
    padding: 22,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  nameModalHeader: {
    alignItems: 'center',
    marginBottom: 20,
    width: '100%',
  },
  nameModalIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(234, 225, 21, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  nameModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 6,
  },
  nameModalSubtitle: {
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  nameInputContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#121416',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#34383c',
    paddingHorizontal: 14,
    marginBottom: 22,
  },
  nameInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  nameInputClearBtn: {
    padding: 4,
  },
  nameModalButtonsRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  nameModalCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#26292d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameModalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#9ca3af',
  },
  nameModalSaveBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameModalSaveText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#000000',
  },
  metaPresetsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
    width: '100%',
  },
  metaPresetChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#121416',
    borderWidth: 1,
    borderColor: '#2e3338',
  },
  metaPresetChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  metaPresetChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9ca3af',
  },
  metaPresetChipTextActive: {
    color: '#000000',
    fontWeight: '800',
  },
  metaModalRemoveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    marginBottom: 14,
  },
  metaModalRemoveText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.error,
  },
  metaProjectionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#121416',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#262A2E',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 16,
    width: '100%',
  },
  metaProjectionItem: {
    flex: 1,
    alignItems: 'center',
  },
  metaProjectionLabel: {
    fontSize: 11,
    color: '#8A9098',
    fontWeight: '600',
    marginBottom: 2,
  },
  metaProjectionVal: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '800',
  },
  metaProjectionDivider: {
    width: 1,
    height: 22,
    backgroundColor: '#2A2E33',
  }
});
