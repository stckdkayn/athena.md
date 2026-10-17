import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ActiveThemeColors } from '../../constants/Colors';
import { useAppTheme } from '../../context/ThemeContext';
import {
  CronogramaSemana,
  CronogramaTopico,
  DiaSemana,
  DIAS_SEMANA_LISTA,
} from '../../services/scheduleService';

// Abreviações de 1 caractere para os dias da semana (Segunda a Domingo)
const DIA_LETRA_MAP: Record<DiaSemana, string> = {
  segunda: 'S',
  terca: 'T',
  quarta: 'Q',
  quinta: 'Q',
  sexta: 'S',
  sabado: 'S',
  domingo: 'D',
};

interface ModalNovoTopicoProps {
  visible: boolean;
  onClose: () => void;
  semanasList: CronogramaSemana[];
  semanaAtivaNumero: number;
  diaSugerido?: DiaSemana;
  topicoParaEditar?: CronogramaTopico | null;
  onSalvar: (
    semanaNumero: number,
    topico: Omit<CronogramaTopico, 'id'> & { id?: string }
  ) => Promise<boolean | void>;
}

export function ModalNovoTopico({
  visible,
  onClose,
  semanaAtivaNumero,
  diaSugerido = 'segunda',
  topicoParaEditar = null,
  onSalvar,
}: ModalNovoTopicoProps) {
  const { colors: theme, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);

  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [diaEscolhido, setDiaEscolhido] = useState<DiaSemana>(diaSugerido);
  const [saving, setSaving] = useState(false);

  // Reseta ou popula campos ao abrir o modal
  useEffect(() => {
    if (visible) {
      if (topicoParaEditar) {
        setTitulo(topicoParaEditar.titulo || '');
        setDescricao(
          topicoParaEditar.descricao ||
            (topicoParaEditar.passos && topicoParaEditar.passos[0]?.detalhe !== topicoParaEditar.titulo
              ? topicoParaEditar.passos[0]?.detalhe || ''
              : '')
        );
        setDiaEscolhido(topicoParaEditar.assignedDay || diaSugerido || 'segunda');
      } else {
        setTitulo('');
        setDescricao('');
        setDiaEscolhido(diaSugerido || 'segunda');
      }
      setSaving(false);
    }
  }, [visible, diaSugerido, topicoParaEditar]);

  const handleSalvar = async () => {
    const tituloLimpo = titulo.trim();
    if (!tituloLimpo) {
      Alert.alert('Título Obrigatório', 'Por favor, digite o nome do lembrete.');
      return;
    }

    try {
      setSaving(true);
      const payload: Omit<CronogramaTopico, 'id'> & { id?: string } = {
        ...(topicoParaEditar ? { ...topicoParaEditar } : {}),
        titulo: tituloLimpo,
        area: 'Lembrete',
        descricao: descricao.trim() || undefined,
        assignedDay: diaEscolhido,
        isLembrete: true,
        passos: [
          {
            tipo: 'apostila',
            label: tituloLimpo,
            detalhe: descricao.trim() || undefined,
            dia: diaEscolhido,
          },
        ],
      };

      if (topicoParaEditar?.id) {
        payload.id = topicoParaEditar.id;
      }

      const sucesso = await onSalvar(semanaAtivaNumero || 1, payload);
      if (sucesso !== false) {
        onClose();
      }
    } catch (err: any) {
      Alert.alert('Erro', err?.message || 'Não foi possível salvar o lembrete.');
    } finally {
      setSaving(false);
    }
  };

  const isEdicao = !!topicoParaEditar?.id;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity
          style={styles.backdropDismiss}
          activeOpacity={1}
          onPress={onClose}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalContainer}
        >
          {/* Cabeçalho */}
          <View style={styles.header}>
            <View style={styles.headerIconCircle}>
              <Ionicons name="bookmark-outline" size={20} color={theme.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>
                {isEdicao ? 'Editar Lembrete' : 'Novo Lembrete'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Conteúdo do Formulário */}
          <View style={styles.formContent}>
            {/* Campo Lembrete */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                Lembrete: <Text style={{ color: theme.primary }}>*</Text>
              </Text>
              <TextInput
                style={styles.textInput}
                value={titulo}
                onChangeText={setTitulo}
                placeholder="Ex: Prescrição de sepse, Checar PCR..."
                placeholderTextColor={theme.textMuted}
                autoFocus={true}
                returnKeyType="next"
              />
            </View>

            {/* Campo Detalhes (Opcional) */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Detalhes</Text>
              <TextInput
                style={[styles.textInput, styles.textAreaInput]}
                value={descricao}
                onChangeText={setDescricao}
                placeholder="Ex: Checar dose de ataque e gasometria arterial"
                placeholderTextColor={theme.textMuted}
                multiline={true}
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            {/* Seletor de Dia da Semana em Círculos */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Dia da semana</Text>
              <View style={styles.daysCirclesRow}>
                {DIAS_SEMANA_LISTA.map((dia) => {
                  const isSelected = diaEscolhido === dia.id;
                  const letra = DIA_LETRA_MAP[dia.id] || dia.shortLabel.charAt(0);
                  return (
                    <TouchableOpacity
                      key={dia.id}
                      style={[styles.dayCircle, isSelected && styles.dayCircleSelected]}
                      onPress={() => setDiaEscolhido(dia.id)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.dayCircleText,
                          isSelected && styles.dayCircleTextSelected,
                        ]}
                      >
                        {letra}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          {/* Rodapé com Botões */}
          <View style={styles.footerRow}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onClose}
              disabled={saving}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelBtnText}>Cancelar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSalvar}
              disabled={saving}
              activeOpacity={0.85}
            >
              <Ionicons
                name="checkmark"
                size={18}
                color={isDark ? '#000000' : '#FFFFFF'}
                style={{ marginRight: 6 }}
              />
              <Text style={styles.saveBtnText}>
                {saving ? 'Salvando...' : isEdicao ? 'Salvar Lembrete' : 'Adicionar Lembrete'}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function createStyles(theme: ActiveThemeColors, isDark: boolean) {
  return StyleSheet.create({
    modalOverlay: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(0, 0, 0, 0.78)' : 'rgba(0, 0, 0, 0.45)',
      paddingHorizontal: 20,
    },
    backdropDismiss: {
      ...StyleSheet.absoluteFill,
    },
    modalContainer: {
      width: '100%',
      maxWidth: 440,
      backgroundColor: theme.surfaceCard || theme.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.border,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.45 : 0.08,
      shadowRadius: 16,
      elevation: 6,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: theme.borderSubtle,
      gap: 12,
    },
    headerIconCircle: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: theme.primarySubtle,
      borderWidth: 1,
      borderColor: theme.primaryBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: theme.text,
      letterSpacing: -0.3,
    },
    closeBtn: {
      padding: 6,
      borderRadius: 8,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
    },
    formContent: {
      padding: 20,
      gap: 16,
    },
    inputGroup: {
      gap: 7,
    },
    inputLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.textSecondary,
    },
    textInput: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 14,
      color: theme.text,
    },
    textAreaInput: {
      minHeight: 74,
      paddingTop: 12,
    },
    daysCirclesRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 4,
    },
    dayCircle: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: theme.surface,
      borderWidth: 1.5,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayCircleSelected: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
      shadowColor: theme.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.35,
      shadowRadius: 4,
      elevation: 3,
    },
    dayCircleText: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.textSecondary,
    },
    dayCircleTextSelected: {
      color: isDark ? '#000000' : '#FFFFFF',
      fontWeight: '800',
    },
    footerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingHorizontal: 20,
      paddingVertical: 14,
      backgroundColor: theme.surface,
      borderTopWidth: 1,
      borderTopColor: theme.borderSubtle,
      gap: 10,
    },
    cancelBtn: {
      paddingVertical: 11,
      paddingHorizontal: 16,
      borderRadius: 10,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
    },
    cancelBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.textSecondary,
    },
    saveBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 11,
      paddingHorizontal: 18,
      borderRadius: 10,
      backgroundColor: theme.primary,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 2,
    },
    saveBtnDisabled: {
      opacity: 0.5,
    },
    saveBtnText: {
      fontSize: 13,
      fontWeight: '800',
      color: isDark ? '#000000' : '#FFFFFF',
    },
  });
}
