import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Fonts } from '@/constants/Typography';
import { useAppTheme } from '@/context/ThemeContext';
import { storage } from '@/services/storage';
import { getStreakInfo, StreakInfo } from '@/services/streakService';
import { NomeUsuarioModal } from '@/components/modals/NomeUsuarioModal';
import { StreakModal } from '@/components/modals/StreakModal';

interface AppHeaderProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export default function AppHeader({ children, style }: AppHeaderProps) {
  const { colors, isDark } = useAppTheme();

  const [userName, setUserName] = useState<string>('');
  const [userPhoto, setUserPhoto] = useState<string | null>(null);
  const [streakInfo, setStreakInfo] = useState<StreakInfo | null>(null);
  const [modalNomeVisible, setModalNomeVisible] = useState<boolean>(false);
  const [modalStreakVisible, setModalStreakVisible] = useState<boolean>(false);

  const carregarDadosUsuario = useCallback(async () => {
    const savedName = storage.getString('@athena_user_name') || '';
    setUserName(savedName);
    const savedPhoto = storage.getString('@athena_user_photo') || null;
    setUserPhoto(savedPhoto);

    try {
      const info = await getStreakInfo();
      setStreakInfo(info);
    } catch (e) {
      console.warn('[AppHeader] Erro ao carregar streak:', e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carregarDadosUsuario();
    }, [carregarDadosUsuario])
  );

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Bom dia';
    if (hour >= 12 && hour < 18) return 'Boa tarde';
    return 'Boa noite';
  };
  const greeting = getGreeting();

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
        setUserPhoto(uri);
        storage.set('@athena_user_photo', uri);
      }
    } catch (e) {
      console.error('[AppHeader] Erro ao selecionar foto:', e);
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
        setUserPhoto(uri);
        storage.set('@athena_user_photo', uri);
      }
    } catch (e) {
      console.error('[AppHeader] Erro ao tirar foto:', e);
      Alert.alert('Erro', 'Não foi possível tirar a foto.');
    }
  };

  const handleAvatarPress = () => {
    const buttons: any[] = [
      { text: 'Escolher da Galeria', onPress: handlePickPhoto },
      { text: 'Tirar Foto', onPress: handleTakePhoto },
    ];
    if (userPhoto) {
      buttons.push({
        text: 'Remover Foto',
        style: 'destructive',
        onPress: () => {
          setUserPhoto(null);
          storage.remove('@athena_user_photo');
        },
      });
    }
    buttons.push({ text: 'Cancelar', style: 'cancel' });

    Alert.alert('Foto de Perfil', 'Escolha como deseja alterar sua foto:', buttons);
  };

  return (
    <View style={[styles.header, style]}>
      {/* Primeira linha: Foto (à esquerda), Saudação e Nome ao lado, Streak à direita */}
      <View style={styles.headerTopRow}>
        <View style={styles.headerProfileGroup}>
          <TouchableOpacity
            style={styles.avatarContainer}
            onPress={handleAvatarPress}
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <View style={[styles.avatarCircle, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {userPhoto ? (
                <Image source={{ uri: userPhoto }} style={styles.avatarImage} />
              ) : (
                <View style={[styles.avatarPlaceholder, { backgroundColor: colors.surface }]}>
                  {userName && userName.trim() ? (
                    <Text style={[styles.avatarInitials, { color: colors.primary }]}>
                      {userName.trim().charAt(0).toUpperCase()}
                    </Text>
                  ) : (
                    <Ionicons name="person" size={24} color={colors.textSecondary} />
                  )}
                </View>
              )}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setModalNomeVisible(true)}
            activeOpacity={0.7}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            style={styles.greetingContainer}
          >
            <Text style={[styles.greetingSubtitleText, { color: colors.textSecondary }]}>
              {greeting},
            </Text>
            <Text style={[styles.bigGreetingText, { color: colors.text }]} numberOfLines={1}>
              {userName && userName.trim() ? userName.trim() : 'Gabriel'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Feature de Streak Alinhada à Direita no Nível do Nome */}
        <TouchableOpacity
          style={[
            styles.streakBadge,
            streakInfo?.activeToday
              ? styles.streakBadgeActive
              : [styles.streakBadgeInactive, { backgroundColor: colors.surface, borderColor: colors.border }],
          ]}
          onPress={() => setModalStreakVisible(true)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={streakInfo?.activeToday ? 'flame' : 'flame-outline'}
            size={18}
            color={streakInfo?.activeToday ? '#FF8800' : '#8E959E'}
          />
          <Text
            style={[
              styles.streakBadgeText,
              streakInfo?.activeToday
                ? styles.streakBadgeTextActive
                : [styles.streakBadgeTextInactive, { color: colors.textSecondary }],
            ]}
          >
            {streakInfo?.streak || 0}
          </Text>
        </TouchableOpacity>
      </View>

      {children}

      {/* Modal detalhado de Streak / Ofensiva */}
      <StreakModal
        visible={modalStreakVisible}
        onClose={() => setModalStreakVisible(false)}
        streakInfo={streakInfo}
      />

      {/* Modal para Editar Nome do Usuário */}
      <NomeUsuarioModal
        visible={modalNomeVisible}
        onClose={() => setModalNomeVisible(false)}
        initialName={userName}
        onSave={(novoNome) => setUserName(novoNome)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 8,
    paddingHorizontal: 16,
    marginBottom: 14,
    gap: 12,
    zIndex: 100,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerProfileGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatarCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 22,
    fontFamily: Fonts.extraBold,
    fontWeight: '800',
  },
  greetingContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  greetingSubtitleText: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    fontWeight: '600',
    lineHeight: 16,
  },
  bigGreetingText: {
    fontSize: 22,
    fontFamily: Fonts.extraBold,
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 26,
    marginTop: -1,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 36,
    paddingHorizontal: 9,
    borderRadius: 18,
    borderWidth: 1,
  },
  streakBadgeActive: {
    backgroundColor: 'rgba(255, 136, 0, 0.12)',
    borderColor: 'rgba(255, 136, 0, 0.35)',
  },
  streakBadgeInactive: {},
  streakBadgeText: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    fontWeight: '800',
  },
  streakBadgeTextActive: {
    color: '#FF8800',
  },
  streakBadgeTextInactive: {},
});
