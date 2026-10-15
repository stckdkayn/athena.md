import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { criarNovaAtividade } from '@/services/database';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaveSuccess: () => void; // Para recarregar a lista na tela principal
  dataInicial?: string; // Formato YYYY-MM-DD
}

const TIPOS_DISPONIVEIS = ['Estudo', 'Faculdade', 'Pessoal', 'Lazer'];
const DIAS_SEMANA_NOMES = [
  { id: 0, label: 'D' },
  { id: 1, label: 'S' },
  { id: 2, label: 'T' },
  { id: 3, label: 'Q' },
  { id: 4, label: 'Q' },
  { id: 5, label: 'S' },
  { id: 6, label: 'S' },
];

function toLocalDateStr(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function ModalNovaAtividade({
  visible,
  onClose,
  onSaveSuccess,
  dataInicial,
}: Props) {
  const [titulo, setTitulo] = useState('');
  const [tipo, setTipo] = useState('Estudo');
  const [frequencia, setFrequencia] = useState<'unica' | 'diaria' | 'dias_uteis' | 'semanal'>('unica');
  const [demanda, setDemanda] = useState(3);
  const [horaInicio, setHoraInicio] = useState('');
  const [horaFim, setHoraFim] = useState('');
  const [diasSemanaSelecionados, setDiasSemanaSelecionados] = useState<number[]>([1, 3, 5]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (visible) {
      setTitulo('');
      setTipo('Estudo');
      setFrequencia('unica');
      setDemanda(3);
      setHoraInicio('');
      setHoraFim('');
      setSalvando(false);
    }
  }, [visible]);

  const toggleDiaSemana = (diaId: number) => {
    setDiasSemanaSelecionados((prev) =>
      prev.includes(diaId) ? prev.filter((d) => d !== diaId) : [...prev, diaId]
    );
  };

  const handleSave = async () => {
    if (!titulo.trim() || salvando) return;
    setSalvando(true);

    try {
      const dataInicio = dataInicial || toLocalDateStr(new Date());

      await criarNovaAtividade({
        titulo: titulo.trim(),
        tipo,
        frequencia,
        data_inicio: dataInicio,
        hora_inicio: horaInicio.trim() || undefined,
        hora_fim: horaFim.trim() || undefined,
        feedback_cansaco: demanda,
        dias_semana: frequencia === 'semanal' ? diasSemanaSelecionados : undefined,
      });

      onSaveSuccess();
      onClose();
    } catch (err) {
      console.error('[ModalNovaAtividade] Erro ao salvar atividade:', err);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Ionicons name="calendar" size={20} color={Colors.primary} style={{ marginRight: 8 }} />
              <Text style={styles.title}>Nova Atividade</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Input do Título */}
            <TextInput
              style={styles.input}
              placeholder="Nome da atividade..."
              placeholderTextColor="#71767B"
              value={titulo}
              onChangeText={setTitulo}
              autoFocus
            />

            {/* Horários Opcionais */}
            <View style={styles.timeRow}>
              <View style={styles.timeInputCol}>
                <Text style={styles.sectionLabel}>Início</Text>
                <TextInput
                  style={styles.timeInput}
                  placeholder="08:00"
                  placeholderTextColor="#71767B"
                  value={horaInicio}
                  onChangeText={setHoraInicio}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                />
              </View>
              <View style={styles.timeInputCol}>
                <Text style={styles.sectionLabel}>Término</Text>
                <TextInput
                  style={styles.timeInput}
                  placeholder="09:00"
                  placeholderTextColor="#71767B"
                  value={horaFim}
                  onChangeText={setHoraFim}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                />
              </View>
            </View>

            {/* Seleção de Categoria / Tipo */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Categoria</Text>
              <View style={styles.pillContainer}>
                {TIPOS_DISPONIVEIS.map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.pill, tipo === t && styles.pillActive]}
                    onPress={() => setTipo(t)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.pillText, tipo === t && styles.pillTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Demanda Cognitiva / Carga Mental */}
            <View style={styles.section}>
              <View style={styles.sectionTitleWithSub}>
                <Text style={styles.sectionLabel}>Demanda Cognitiva (1 a 5)</Text>
                <Text style={styles.sectionSublabel}>
                  {demanda <= 2 ? 'Leve' : demanda === 3 ? 'Moderada' : 'Intensa'}
                </Text>
              </View>
              <View style={styles.pillContainer}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <TouchableOpacity
                    key={n}
                    style={[styles.pillNumber, demanda === n && styles.pillNumberActive]}
                    onPress={() => setDemanda(n)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="flash"
                      size={13}
                      color={demanda === n ? '#000000' : Colors.textSecondary}
                      style={{ marginRight: 3 }}
                    />
                    <Text
                      style={[
                        styles.pillNumberText,
                        demanda === n && styles.pillNumberTextActive,
                      ]}
                    >
                      {n}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Frequência / Repetição */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Repetição</Text>
              <View style={styles.pillContainer}>
                <TouchableOpacity
                  style={[styles.pill, frequencia === 'unica' && styles.pillActive]}
                  onPress={() => setFrequencia('unica')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.pillText, frequencia === 'unica' && styles.pillTextActive]}>
                    Única
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.pill, frequencia === 'diaria' && styles.pillActive]}
                  onPress={() => setFrequencia('diaria')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.pillText, frequencia === 'diaria' && styles.pillTextActive]}>
                    Diária
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.pill, frequencia === 'dias_uteis' && styles.pillActive]}
                  onPress={() => setFrequencia('dias_uteis')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.pillText, frequencia === 'dias_uteis' && styles.pillTextActive]}>
                    Dias Úteis
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.pill, frequencia === 'semanal' && styles.pillActive]}
                  onPress={() => setFrequencia('semanal')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.pillText, frequencia === 'semanal' && styles.pillTextActive]}>
                    Semanal
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Seletor de dias para frequência Semanal */}
              {frequencia === 'semanal' && (
                <View style={styles.weekDaysContainer}>
                  {DIAS_SEMANA_NOMES.map((d) => {
                    const isSelected = diasSemanaSelecionados.includes(d.id);
                    return (
                      <TouchableOpacity
                        key={d.id}
                        style={[styles.weekDayCircle, isSelected && styles.weekDayCircleSelected]}
                        onPress={() => toggleDiaSemana(d.id)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.weekDayText,
                            isSelected && styles.weekDayTextSelected,
                          ]}
                        >
                          {d.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Botão Salvar */}
            <TouchableOpacity
              style={[styles.saveButton, !titulo.trim() && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={!titulo.trim() || salvando}
              activeOpacity={0.85}
            >
              <Text style={styles.saveButtonText}>
                {salvando ? 'Salvando...' : 'Adicionar à Agenda'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#2e3235',
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.3,
  },
  input: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
    borderBottomWidth: 1,
    borderBottomColor: '#2e3235',
    paddingVertical: 12,
    marginBottom: 18,
  },
  timeRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  timeInputCol: {
    flex: 1,
  },
  timeInput: {
    backgroundColor: '#1b1d1f',
    borderWidth: 1,
    borderColor: '#2e3235',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.text,
  },
  section: {
    marginBottom: 18,
  },
  sectionTitleWithSub: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  sectionSublabel: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '600',
  },
  pillContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: '#1b1d1f',
    borderWidth: 1,
    borderColor: '#2e3235',
  },
  pillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  pillText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  pillTextActive: {
    color: '#000000',
    fontWeight: '800',
  },
  pillNumber: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: '#1b1d1f',
    borderWidth: 1,
    borderColor: '#2e3235',
  },
  pillNumberActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  pillNumberText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '700',
  },
  pillNumberTextActive: {
    color: '#000000',
    fontWeight: '800',
  },
  weekDaysContainer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  weekDayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1b1d1f',
    borderWidth: 1,
    borderColor: '#2e3235',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDayCircleSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  weekDayText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  weekDayTextSelected: {
    color: '#000000',
    fontWeight: '800',
  },
  saveButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    marginBottom: 10,
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '800',
  },
});
