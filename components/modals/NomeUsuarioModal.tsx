import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { storage } from '@/services/storage';
import { useAppTheme } from '@/context/ThemeContext';

interface NomeUsuarioModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (nome: string) => void;
  initialName: string;
}

export function NomeUsuarioModal({ visible, onClose, onSave, initialName }: NomeUsuarioModalProps) {
  const { theme, isDark } = useAppTheme();
  const [inputNome, setInputNome] = useState('');

  useEffect(() => {
    if (visible) setInputNome(initialName);
  }, [visible, initialName]);

  const handleSalvar = () => {
    const trimmed = inputNome.trim();
    try {
      if (trimmed) {
        storage.set('@athena_user_name', trimmed);
      } else {
        storage.remove('@athena_user_name');
      }
      onSave(trimmed);
      onClose();
    } catch (e) {
      console.error('Erro ao salvar nome do usuário:', e);
      onClose();
    }
  };

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
        style={[
          styles.modalOverlay,
          { backgroundColor: isDark ? 'rgba(0, 0, 0, 0.78)' : 'rgba(0, 0, 0, 0.45)' },
        ]}
      >
        <TouchableOpacity
          style={styles.modalBackdropTouch}
          activeOpacity={1}
          onPress={onClose}
        />
        <View
          style={[
            styles.nameModalCard,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}
        >
          <View style={styles.nameModalHeader}>
            <View
              style={[
                styles.nameModalIconCircle,
                { backgroundColor: theme.primarySubtle },
              ]}
            >
              <Ionicons name="person-outline" size={24} color={theme.primary} />
            </View>
            <Text style={[styles.nameModalTitle, { color: theme.text }]}>
              Como prefere ser chamado(a)?
            </Text>
            <Text style={[styles.nameModalSubtitle, { color: theme.textSecondary }]}>
              Digite seu nome para personalizar a saudação na tela inicial.
            </Text>
          </View>

          <View
            style={[
              styles.nameInputContainer,
              {
                backgroundColor: isDark ? '#121416' : '#FFFFFF',
                borderColor: theme.border,
              },
            ]}
          >
            <TextInput
              style={[styles.nameInput, { color: theme.text }]}
              placeholder="Ex: Gabriel ou Dr. Gabriel"
              placeholderTextColor={theme.textSecondary}
              value={inputNome}
              onChangeText={setInputNome}
              autoFocus={true}
              maxLength={30}
              returnKeyType="done"
              onSubmitEditing={handleSalvar}
            />
            {inputNome.length > 0 && (
              <TouchableOpacity
                onPress={() => setInputNome('')}
                style={styles.nameInputClearBtn}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.nameModalButtonsRow}>
            <TouchableOpacity
              style={[
                styles.nameModalCancelBtn,
                {
                  backgroundColor: isDark ? '#26292d' : theme.background,
                  borderColor: theme.border,
                },
              ]}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={[styles.nameModalCancelText, { color: theme.textSecondary }]}>
                Cancelar
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.nameModalSaveBtn,
                { backgroundColor: theme.primary },
              ]}
              onPress={handleSalvar}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.nameModalSaveText,
                  { color: isDark ? '#000000' : '#FFFFFF' },
                ]}
              >
                Salvar
              </Text>
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
    borderRadius: 16,
    borderWidth: 1,
    padding: 22,
    alignItems: 'center',
    elevation: 0,
    shadowOpacity: 0,
  },
  nameModalHeader: {
    alignItems: 'center',
    marginBottom: 20,
    width: '100%',
  },
  nameModalIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  nameModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
  },
  nameModalSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  nameInputContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    marginBottom: 22,
  },
  nameInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
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
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameModalCancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  nameModalSaveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameModalSaveText: {
    fontSize: 14,
    fontWeight: '800',
  },
});
