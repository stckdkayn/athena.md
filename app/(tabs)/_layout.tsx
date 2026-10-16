import React, { useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useWindowDimensions, View, StyleSheet, AppState, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';

import { Colors } from '@/constants/Colors';
import { Fonts } from '@/constants/Typography';
import { useAppTheme } from '@/context/ThemeContext';
import {
  subscribeToUpdateStatus,
  checkSilentUpdates,
  UpdateNotificationStatus,
} from '@/services/githubSync';
import { checkSilentICalSync } from '@/services/icsService';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { colors: themeColors, isDark } = useAppTheme();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const [hasUpdate, setHasUpdate] = useState(false);

  const pillHeight = isLandscape ? 48 : 52;
  const capsuleWidth = isLandscape
    ? Math.min(width * 0.45, 300)
    : Math.min(width * 0.68, 260);
  const leftOffset = Math.round((width - capsuleWidth) / 2);
  const bottomMargin = isLandscape ? 12 : Math.max(insets.bottom, 16);

  useEffect(() => {
    // Inscreve no status reativo de atualização
    const unsubscribe = subscribeToUpdateStatus((status: UpdateNotificationStatus) => {
      setHasUpdate(status.hasUpdate);
    });

    // Dispara a checagem silenciosa em segundo plano ao abrir o app
    checkSilentUpdates();
    checkSilentICalSync();

    // Re-verifica ao voltar ao primeiro plano
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        checkSilentUpdates();
        checkSilentICalSync();
      }
    });

    return () => {
      unsubscribe();
      appStateSub.remove();
    };
  }, []);

  return (
    <Tabs
      screenOptions={{
        tabBarShowLabel: false,
        tabBarStyle: {
          position: 'absolute',
          width: capsuleWidth,
          left: leftOffset,
          bottom: bottomMargin,
          height: pillHeight,
          borderRadius: pillHeight / 2,
          backgroundColor: Platform.OS === 'ios'
            ? 'transparent'
            : (isDark ? 'rgba(30, 30, 32, 0.96)' : 'rgba(255, 255, 255, 0.98)'),
          borderWidth: 1,
          borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
          borderTopWidth: 1,
          borderTopColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: isDark ? 0.35 : 0.08,
          shadowRadius: 16,
          elevation: 10,
          paddingTop: 0,
          paddingBottom: 0,
        },
        tabBarBackground: () => (
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                borderRadius: pillHeight / 2,
                overflow: 'hidden',
                backgroundColor: isDark
                  ? (Platform.OS === 'ios' ? 'rgba(28, 28, 30, 0.88)' : '#1C1C1E')
                  : (Platform.OS === 'ios' ? 'rgba(255, 255, 255, 0.90)' : '#FFFFFF'),
              },
            ]}
          >
            {Platform.OS === 'ios' && (
              <BlurView
                intensity={85}
                tint={isDark ? 'dark' : 'light'}
                style={StyleSheet.absoluteFill}
              />
            )}
          </View>
        ),
        tabBarActiveTintColor: themeColors.primary,
        tabBarInactiveTintColor: themeColors.textSecondary,
        tabBarItemStyle: {
          height: pillHeight,
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 0,
        },
        headerStyle: {
          backgroundColor: themeColors.background,
        },
        headerTintColor: themeColors.text,
        headerShadowVisible: false,
        headerShown: false,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Início',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="questoes"
        options={{
          title: 'Questões',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'document-text' : 'document-text-outline'}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="desempenho"
        options={{
          title: 'Desempenho',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'bar-chart' : 'bar-chart-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="cronograma"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="configuracoes"
        options={{
          title: 'Configurações',
          tabBarIcon: ({ color, focused }) => (
            <View style={styles.tabIconWrapper}>
              <Ionicons name={focused ? 'settings' : 'settings-outline'} size={24} color={color} />
              {hasUpdate && (
                <View
                  style={[
                    styles.notificationDot,
                    { borderColor: isDark ? '#1C1C1E' : '#FFFFFF' },
                  ]}
                />
              )}
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabIconWrapper: {
    position: 'relative',
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationDot: {
    position: 'absolute',
    top: 0,
    right: -1,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
    borderWidth: 1.5,
    borderColor: Colors.surface,
  },
});
