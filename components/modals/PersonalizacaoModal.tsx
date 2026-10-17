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
  Image,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { storage } from '@/services/storage';
import { useAppTheme } from '@/context/ThemeContext';

interface PersonalizacaoModalProps {
  visible: boolean;
  onClose: () => void;
  currentName: string;
  currentPhoto: string | null;
  onSaveName: (novoNome: string) => void;
  onSavePhoto: (novaFoto: string | null) => void;
}

export function PersonalizacaoModal({
  visible,
  onClose,
  currentName,
  currentPhoto,
  onSaveName,
  onSavePhoto,
}: PersonalizacaoModalProps) {
  const { colors, isDark, mode, setMode } = useAppTheme();

  const [inputNome, setInputNome] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setInputNome(currentName);
      setPhoto(currentPhoto);
    }
  }, [visible, currentName, currentPhoto]);

  const handlePickPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permissão necessária',
          'Precisamos de acesso às suas fotos para atualizar sua imagem de perfil.'
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        setPhoto(uri);
        storage.set('@athena_user_photo', uri);
        onSavePhoto(uri);
      }
    } catch (e) {
      console.error('[PersonalizacaoModal] Erro ao selecionar foto:', e);
      Alert.alert('Erro', 'Não foi possível selecionar a foto.');
    }
  };

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permissão necessária',
          'Precisamos de acesso à câmera para tirar sua foto de perfil.'
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        setPhoto(uri);
        storage.set('@athena_user_photo', uri);
        onSavePhoto(uri);
      }
    } catch (e) {
      console.error('[PersonalizacaoModal] Erro ao tirar foto:', e);
      Alert.alert('Erro', 'Não foi possível tirar a foto.');
    }
  };

  const handleRemovePhoto = () => {
    setPhoto(null);
    storage.remove('@athena_user_photo');
    onSavePhoto(null);
  };

  const handleSalvar = () => {
    const trimmed = inputNome.trim();
    try {
      if (trimmed) {
        storage.set('@athena_user_name', trimmed);
      } else {
        storage.remove('@athena_user_name');
      }
      onSaveName(trimmed);
      onClose();
    } catch (e) {
      console.error('Erro ao salvar dados de personalização:', e);
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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
            styles.modalCard,
            {
              backgroundColor: colors.surfaceCard,
              borderColor: colors.border,
            },
          ]}
        >
          {/* Header do Modal com Título e Fechar */}
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Personalização
              </Text>
              <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                Edite seu perfil e preferências de aparência
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeButton, { backgroundColor: colors.background, borderColor: colors.border }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
          >
            {/* SEÇÃO 1: FOTO DE PERFIL */}
            <View style={styles.sectionContainer}>
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
                FOTO DE PERFIL
              </Text>

              <View style={styles.avatarSectionWrapper}>
                <View style={[styles.avatarCircle, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  {photo ? (
                    <Image source={{ uri: photo }} style={styles.avatarImage} />
                  ) : (
                    <View style={[styles.avatarPlaceholder, { backgroundColor: colors.surface }]}>
                      {inputNome && inputNome.trim() ? (
                        <Text style={[styles.avatarInitials, { color: colors.primary }]}>
                          {inputNome.trim().charAt(0).toUpperCase()}
                        </Text>
                      ) : (
                        <Ionicons name="person" size={36} color={colors.textSecondary} />
                      )}
                    </View>
                  )}
                  <View style={[styles.avatarCameraBadge, { backgroundColor: colors.primary }]}>
                    <Ionicons name="camera" size={13} color={isDark ? '#000' : '#FFF'} />
                  </View>
                </View>

                {/* Ações de Foto */}
                <View style={styles.photoActionsRow}>
                  <TouchableOpacity
                    style={[styles.photoActionBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                    onPress={handlePickPhoto}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="images-outline" size={16} color={colors.text} style={{ marginRight: 6 }} />
                    <Text style={[styles.photoActionText, { color: colors.text }]}>Galeria</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.photoActionBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                    onPress={handleTakePhoto}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="camera-outline" size={16} color={colors.text} style={{ marginRight: 6 }} />
                    <Text style={[styles.photoActionText, { color: colors.text }]}>Câmera</Text>
                  </TouchableOpacity>

                  {photo && (
                    <TouchableOpacity
                      style={[styles.photoActionBtn, styles.photoActionBtnRemove, { borderColor: 'rgba(239, 68, 68, 0.25)' }]}
                      onPress={handleRemovePhoto}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.error} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>

            {/* SEÇÃO 2: NOME DE EXIBIÇÃO */}
            <View style={styles.sectionContainer}>
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
                NOME DE EXIBIÇÃO
              </Text>

              <View
                style={[
                  styles.inputContainer,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Ionicons
                  name="person-outline"
                  size={18}
                  color={colors.textSecondary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[styles.textInput, { color: colors.text }]}
                  placeholder="Digite seu nome (ex: Gabriel)"
                  placeholderTextColor={colors.textMuted}
                  value={inputNome}
                  onChangeText={setInputNome}
                  autoCapitalize="words"
                  autoCorrect={false}
                  maxLength={30}
                  returnKeyType="done"
                  onSubmitEditing={handleSalvar}
                />
                {inputNome.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setInputNome('')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
              <Text style={[styles.inputHint, { color: colors.textMuted }]}>
                Usado na saudação no topo do aplicativo.
              </Text>
            </View>

            {/* SEÇÃO 3: TEMA CLARO E ESCURO */}
            <View style={styles.sectionContainer}>
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
                TEMA
              </Text>

              <View style={[styles.themeSwitcherContainer, { backgroundColor: colors.background, borderColor: colors.borderSubtle }]}>
                <TouchableOpacity
                  style={[
                    styles.themeOptionBtn,
                    (!isDark || mode === 'light') && [
                      styles.themeOptionBtnActive,
                      {
                        backgroundColor: colors.surfaceCard,
                        borderColor: colors.border,
                      },
                    ],
                  ]}
                  onPress={() => setMode('light')}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="sunny"
                    size={18}
                    color={!isDark || mode === 'light' ? '#F59E0B' : colors.textMuted}
                    style={{ marginRight: 8 }}
                  />
                  <Text
                    style={[
                      styles.themeOptionText,
                      { color: !isDark || mode === 'light' ? colors.text : colors.textSecondary },
                      (!isDark || mode === 'light') && styles.themeOptionTextActive,
                    ]}
                  >
                    Claro
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.themeOptionBtn,
                    (isDark || mode === 'dark') && [
                      styles.themeOptionBtnActive,
                      {
                        backgroundColor: colors.surfaceCard,
                        borderColor: colors.border,
                      },
                    ],
                  ]}
                  onPress={() => setMode('dark')}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="moon"
                    size={17}
                    color={isDark || mode === 'dark' ? '#8B5CF6' : colors.textMuted}
                    style={{ marginRight: 8 }}
                  />
                  <Text
                    style={[
                      styles.themeOptionText,
                      { color: isDark || mode === 'dark' ? colors.text : colors.textSecondary },
                      (isDark || mode === 'dark') && styles.themeOptionTextActive,
                    ]}
                  >
                    Escuro
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>

          {/* Botão de Salvar */}
          <View style={[styles.footerContainer, { borderTopColor: colors.borderSubtle }]}>
            <TouchableOpacity
              style={[
                styles.saveButton,
                {
                  backgroundColor: colors.primary,
                  shadowColor: colors.primary,
                },
              ]}
              onPress={handleSalvar}
              activeOpacity={0.85}
            >
              <Text style={[styles.saveButtonText, { color: isDark ? '#000000' : '#FFFFFF' }]}>
                Salvar Alterações
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
    padding: 20,
  },
  modalBackdropTouch: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    borderWidth: 1,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 16,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 4,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  modalSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  scrollContent: {
    paddingBottom: 12,
  },
  sectionContainer: {
    marginBottom: 18,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  avatarSectionWrapper: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  avatarCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 1.5,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 42,
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 32,
    fontWeight: '800',
  },
  avatarCameraBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  photoActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  photoActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  photoActionBtnRemove: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    paddingHorizontal: 12,
  },
  photoActionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
  },
  inputIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    padding: 0,
  },
  inputHint: {
    fontSize: 11,
    marginTop: 6,
    marginLeft: 4,
  },
  themeSwitcherContainer: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    gap: 4,
  },
  themeOptionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 11,
  },
  themeOptionBtnActive: {
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  themeOptionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  themeOptionTextActive: {
    fontWeight: '700',
  },
  footerContainer: {
    paddingTop: 14,
    borderTopWidth: 1,
  },
  saveButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
