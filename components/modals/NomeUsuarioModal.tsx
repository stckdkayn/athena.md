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

interface NomeUsuarioModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (nome: string) => void;
  initialName: string;
}

export function NomeUsuarioModal({ visible, onClose, onSave, initialName }: NomeUsuarioModalProps) {
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
              <Ionicons name="person-outline" size={24} color={Colors.primary} />
            </View>
            <Text style={styles.nameModalTitle}>Como prefere ser chamado(a)?</Text>
            <Text style={styles.nameModalSubtitle}>
              Digite seu nome para personalizar a saudação na tela inicial.
            </Text>
          </View>

          <View style={styles.nameInputContainer}>
            <TextInput
              style={styles.nameInput}
              placeholder="Ex: Gabriel ou Dr. Gabriel"
              placeholderTextColor="#71767b"
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
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={18} color="#71767b" />
              </TouchableOpacity>
            )}
          </View>

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
              <Text style={styles.nameModalSaveText}>Salvar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Estilos extraídos do seu arquivo original
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
});
