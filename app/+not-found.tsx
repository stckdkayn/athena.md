import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/context/ThemeContext';
import { Fonts } from '@/constants/Typography';

export default function NotFoundScreen() {
  const { colors } = useAppTheme();

  return (
    <>
      <Stack.Screen options={{ title: 'Não Encontrado' }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.text }]}>Esta página não existe.</Text>

        <Link href="/" style={[styles.link, { backgroundColor: colors.primarySubtle, borderColor: colors.primaryBorder }]}>
          <Text style={[styles.linkText, { color: colors.primary }]}>Voltar para o início</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: Fonts.bold,
    marginBottom: 16,
  },
  link: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
  },
  linkText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: Fonts.semiBold,
  },
});
