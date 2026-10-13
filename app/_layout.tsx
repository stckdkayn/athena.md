import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform, StatusBar as RNStatusBar, AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationBar, addVisibilityListener } from 'expo-navigation-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { migrateAsyncStorageToMMKV } from '@/services/storage';
import { ensureQuestionsDatabaseReady } from '@/services/questionService';
import { migrateStorageProgressToSQLite } from '@/services/progressService';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  useEffect(() => {
    migrateAsyncStorageToMMKV();
    ensureQuestionsDatabaseReady().catch(() => {});
    migrateStorageProgressToSQLite().catch(() => {});
  }, []);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    const applyFullscreen = () => {
      RNStatusBar.setHidden(true, 'none');
      if (Platform.OS === 'android') {
        try {
          NavigationBar.setHidden(true);
        } catch (e) {
          // Ignora caso a plataforma não suporte
        }
      }
    };

    applyFullscreen();

    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        applyFullscreen();
      }
    });

    let navSub: { remove: () => void } | null = null;
    if (Platform.OS === 'android') {
      try {
        navSub = addVisibilityListener(({ visibility }: any) => {
          if (visibility === 'visible') {
            setTimeout(() => {
              try {
                NavigationBar.setHidden(true);
              } catch (e) {}
            }, 2500);
          }
        });
      } catch (e) {}
    }

    return () => {
      sub.remove();
      navSub?.remove();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <StatusBar hidden={true} />
        {Platform.OS === 'android' && <NavigationBar hidden={true} />}
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="treino/quiz" options={{ headerShown: false }} />
        </Stack>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
