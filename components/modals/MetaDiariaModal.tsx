import React, { useState, useEffect, useMemo } from 'react';
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
import { Colors, ActiveThemeColors } from '@/constants/Colors';
import { useAppTheme } from '@/context/ThemeContext';
import { storage } from '@/services/storage';

interface MetaDiariaModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (meta: number) => void;
  initialMeta: number;
}

export function MetaDiariaModal({ visible, onClose, onSave, initialMeta }: MetaDiariaModalProps) {
  const { colors: theme, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
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

function createStyles(theme: ActiveThemeColors, isDark: boolean) {
  return StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
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
      backgroundColor: theme.surfaceCard || theme.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 22,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: isDark ? 0.5 : 0.15,
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
      backgroundColor: theme.primarySubtle,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    nameModalTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: theme.text,
      textAlign: 'center',
      marginBottom: 6,
    },
    nameModalSubtitle: {
      fontSize: 13,
      color: theme.textSecondary,
      textAlign: 'center',
      lineHeight: 18,
      paddingHorizontal: 8,
    },
    nameInputContainer: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.backgroundSecondary || theme.surface,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: theme.border,
      paddingHorizontal: 14,
      marginBottom: 22,
    },
    nameInput: {
      flex: 1,
      paddingVertical: 12,
      fontSize: 16,
      color: theme.text,
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
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    nameModalCancelText: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.textSecondary,
    },
    nameModalSaveBtn: {
      flex: 1,
      paddingVertical: 13,
      borderRadius: 12,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    nameModalSaveText: {
      fontSize: 15,
      fontWeight: '800',
      color: isDark ? '#000000' : '#FFFFFF',
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
      backgroundColor: theme.backgroundSecondary || theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
    },
    metaPresetChipActive: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    metaPresetChipText: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.textSecondary,
    },
    metaPresetChipTextActive: {
      color: isDark ? '#000000' : '#FFFFFF',
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
      color: theme.error,
    },
    metaProjectionBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.backgroundSecondary || theme.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.borderSubtle,
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
      color: theme.textMuted,
      fontWeight: '600',
      marginBottom: 2,
    },
    metaProjectionVal: {
      fontSize: 13,
      color: theme.primary,
      fontWeight: '800',
    },
    metaProjectionDivider: {
      width: 1,
      height: 22,
      backgroundColor: theme.borderSubtle,
    }
  });
}
