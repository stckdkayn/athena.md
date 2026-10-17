import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useAppTheme } from '@/context/ThemeContext';
import { ActiveThemeColors } from '@/constants/Colors';
import { Fonts } from '@/constants/Typography';
import { buscarNoCronogramaCompleto, ItemBuscaCronograma } from '@/services/database';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelectItem: (item: ItemBuscaCronograma) => void;
}

const DIAS_SHORT_MAP: Record<string, string> = {
  segunda: 'Seg',
  terca: 'Ter',
  quarta: 'Qua',
  quinta: 'Qui',
  sexta: 'Sex',
  sabado: 'Sáb',
  domingo: 'Dom',
};

export default function ModalBuscaUniversal({ visible, onClose, onSelectItem }: Props) {
  const { colors: theme, isDark } = useAppTheme();
  const styles = createStyles(theme, isDark);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ItemBuscaCronograma[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setResults([]);
      return;
    }
  }, [visible]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await buscarNoCronogramaCompleto(trimmed);
        setResults(data);
      } catch (err) {
        console.error('Erro na busca universal:', err);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header com Campo de Busca */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="arrow-back" size={24} color={theme.text} />
          </TouchableOpacity>

          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={theme.primary} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.input}
              placeholder="Buscar em todas as 45 semanas..."
              placeholderTextColor={theme.textMuted}
              value={query}
              onChangeText={setQuery}
              autoFocus={true}
              returnKeyType="search"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Status / Loading */}
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={theme.primary} />
            <Text style={styles.loadingText}>Buscando matérias e temas...</Text>
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item, index) => `${item.topico_id}_${item.passo_id || index}`}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              query.trim().length > 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="search-outline" size={40} color={theme.textMuted} style={{ marginBottom: 10 }} />
                  <Text style={styles.emptyTitle}>Nenhum tema encontrado</Text>
                  <Text style={styles.emptySubtitle}>
                    Tente buscar por especialidade (ex: Cardiologia), assunto (ex: IAM), aula ou capítulo.
                  </Text>
                </View>
              ) : (
                <View style={styles.emptyContainer}>
                  <Feather name="book-open" size={40} color={theme.textMuted} style={{ marginBottom: 10 }} />
                  <Text style={styles.emptyTitle}>Pesquisa Universal da Residência</Text>
                  <Text style={styles.emptySubtitle}>
                    Digite para localizar qualquer tópico entre as 45 semanas do cronograma e remanejá-lo.
                  </Text>
                </View>
              )
            }
            renderItem={({ item }) => {
              const diaCurto = DIAS_SHORT_MAP[item.assigned_day?.toLowerCase()] || item.assigned_day;

              return (
                <TouchableOpacity
                  style={styles.card}
                  onPress={() => {
                    onClose();
                    onSelectItem(item);
                  }}
                  activeOpacity={0.75}
                >
                  <View style={styles.cardHeader}>
                    <View style={styles.weekPill}>
                      <Text style={styles.weekPillText}>
                        Semana {item.semana_numero} • {diaCurto}
                      </Text>
                    </View>

                    {item.especialidade ? (
                      <Text style={styles.especialidadeText} numberOfLines={1}>
                        {item.especialidade}
                      </Text>
                    ) : null}
                  </View>

                  <Text style={styles.topicTitle} numberOfLines={2}>
                    {item.topico_titulo}
                  </Text>

                  {/* Informação correspondente da busca */}
                  {(item.passo_label || item.passo_detalhe || item.tema_questoes) && (
                    <View style={styles.matchRow}>
                      <Ionicons name="checkmark-circle-outline" size={13} color={theme.primary} style={{ marginRight: 4 }} />
                      <Text style={styles.matchText} numberOfLines={1}>
                        {item.passo_label || item.passo_detalhe || item.tema_questoes}
                        {item.meta_questoes ? ` • ${item.meta_questoes} questões` : ''}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(theme: ActiveThemeColors, isDark: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: Platform.OS === 'ios' ? 54 : 20,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      backgroundColor: theme.surfaceCard,
      gap: 12,
    },
    backButton: {
      padding: 4,
    },
    searchBar: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      height: 44,
    },
    input: {
      flex: 1,
      fontSize: 15,
      fontFamily: Fonts.regular,
      color: theme.text,
      paddingVertical: 0,
    },
    loadingBox: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      paddingVertical: 24,
    },
    loadingText: {
      color: theme.textSecondary,
      fontSize: 13,
      fontFamily: Fonts.medium,
    },
    listContent: {
      padding: 16,
      paddingBottom: 40,
    },
    card: {
      backgroundColor: theme.surfaceCard,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: theme.border,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: isDark ? 0.25 : 0.05,
          shadowRadius: 6,
        },
        android: {
          elevation: 2,
        },
      }),
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    weekPill: {
      backgroundColor: isDark ? 'rgba(234, 225, 21, 0.12)' : 'rgba(234, 225, 21, 0.16)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(234, 225, 21, 0.3)' : 'rgba(234, 225, 21, 0.4)',
    },
    weekPillText: {
      fontSize: 11,
      fontWeight: '800',
      fontFamily: Fonts.extraBold,
      color: isDark ? theme.primary : '#857500',
    },
    especialidadeText: {
      fontSize: 12,
      fontWeight: '600',
      fontFamily: Fonts.semiBold,
      color: theme.textSecondary,
    },
    topicTitle: {
      fontSize: 16,
      fontWeight: '700',
      fontFamily: Fonts.bold,
      color: theme.text,
      marginBottom: 6,
    },
    matchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.surface,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      alignSelf: 'flex-start',
    },
    matchText: {
      fontSize: 12,
      color: theme.textSecondary,
      fontWeight: '500',
      fontFamily: Fonts.medium,
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 64,
      paddingHorizontal: 24,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: '700',
      fontFamily: Fonts.bold,
      color: theme.text,
      marginBottom: 6,
    },
    emptySubtitle: {
      fontSize: 13,
      fontFamily: Fonts.regular,
      color: theme.textSecondary,
      textAlign: 'center',
      lineHeight: 18,
    },
  });
}
