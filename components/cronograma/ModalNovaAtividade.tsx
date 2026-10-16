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
  Alert,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Colors } from '@/constants/Colors';
import { criarNovaAtividade } from '@/services/database';
import { canScheduleActivity } from '@/services/scheduleService';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaveSuccess: () => void; // Para recarregar a lista na tela principal
  dataInicial?: string; // Formato YYYY-MM-DD
}

const TIPOS_DISPONIVEIS = ['Estudo', 'Faculdade', 'Pessoal', 'Lazer'];
const ICONES_DISPONIVEIS = [
  'book', 'book-open', 'activity', 'heart', 'users', 'user', 'home', 
  'briefcase', 'monitor', 'coffee', 'edit-2', 'zap', 'target', 
  'award', 'clock', 'map-pin', 'folder', 'file-text'
];
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
  const [iconeSelecionado, setIconeSelecionado] = useState('book');
  const [horaInicio, setHoraInicio] = useState(new Date());
  const [horaFim, setHoraFim] = useState(new Date(new Date().getTime() + 60 * 60 * 1000)); // +1 hora padrão
  const [showPickerInicio, setShowPickerInicio] = useState(false);
  const [showPickerFim, setShowPickerFim] = useState(false);
  const [showIconMenu, setShowIconMenu] = useState(false);
  const [frequencia, setFrequencia] = useState<'unica' | 'diaria' | 'dias_uteis' | 'semanal'>('unica');
  const [demanda, setDemanda] = useState(3);
  const [diasSemanaSelecionados, setDiasSemanaSelecionados] = useState<number[]>([1, 3, 5]);
  const [isChecking, setIsChecking] = useState(false);

  const formatTimeStr = (d: Date) => {
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  };

  useEffect(() => {
    if (visible) {
      setTitulo('');
      setTipo('Estudo');
      setIconeSelecionado('book');
      setShowIconMenu(false);
      const now = new Date();
      setHoraInicio(now);
      setHoraFim(new Date(now.getTime() + 60 * 60 * 1000));
      setShowPickerInicio(false);
      setShowPickerFim(false);
      setFrequencia('unica');
      setDemanda(3);
      setIsChecking(false);
    }
  }, [visible]);

  const toggleDiaSemana = (diaId: number) => {
    setDiasSemanaSelecionados((prev) =>
      prev.includes(diaId) ? prev.filter((d) => d !== diaId) : [...prev, diaId]
    );
  };

  const handleSave = async () => {
    if (!titulo.trim()) {
      Alert.alert('Atenção', 'Dê um nome para a atividade.');
      return;
    }
    if (isChecking) return;

    setIsChecking(true);
    const dataSelecionada = dataInicial || toLocalDateStr(new Date());

    try {
      // 1. O Algoritmo avalia o Orçamento de Energia
      const analise = await canScheduleActivity(dataSelecionada, demanda);

      if (!analise.canSchedule) {
        setIsChecking(false);
        // O limite rígido estourou.
        Alert.alert(
          '🔥 Carga Mental Excedida!',
          `Adicionar essa tarefa vai elevar sua carga de hoje para ${analise.futureLoad} pontos, passando do seu limite crítico de tolerância.\n\nO Athena recomenda remanejar esse estudo/tarefa para amanhã. Tem certeza que deseja forçar o agendamento?`,
          [
            { text: 'Cancelar, vou remanejar', style: 'cancel' },
            { 
              text: 'Sim, forçar agendamento', 
              style: 'destructive',
              onPress: () => executarSalvamento(dataSelecionada) 
            }
          ]
        );
      } else if (analise.futureLoad > 15) {
        setIsChecking(false);
        // Passou do limite ideal, mas está dentro da margem de tolerância. Avisa da dívida.
        Alert.alert(
          '⚠️ Limite de Tolerância',
          `Sua carga vai para ${analise.futureLoad} pontos hoje. Amanhã o seu teto de energia será reduzido para compensar esse esforço extra.`,
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Continuar', onPress: () => executarSalvamento(dataSelecionada) }
          ]
        );
      } else {
        // Tudo dentro do normal
        await executarSalvamento(dataSelecionada);
      }
    } catch (error) {
      console.error('[ModalNovaAtividade] Erro ao validar atividade:', error);
      setIsChecking(false);
    }
  };

  // 3. Função auxiliar de salvamento real (isola o código do banco)
  const executarSalvamento = async (data: string) => {
    setIsChecking(true);
    try {
      await criarNovaAtividade({
        titulo: titulo.trim(),
        tipo,
        icone: iconeSelecionado,
        frequencia,
        data_inicio: data,
        hora_inicio: formatTimeStr(horaInicio),
        hora_fim: formatTimeStr(horaFim),
        feedback_cansaco: demanda,
        dias_semana: frequencia === 'semanal' ? diasSemanaSelecionados : undefined,
      });

      setTitulo('');
      setIconeSelecionado('book');
      const now = new Date();
      setHoraInicio(now);
      setHoraFim(new Date(now.getTime() + 60 * 60 * 1000));
      setDemanda(3); // reseta para o padrão
      setFrequencia('unica'); // reseta
      onSaveSuccess();
      onClose();
    } catch (error) {
      console.error('[ModalNovaAtividade] Erro ao salvar atividade:', error);
      Alert.alert('Erro', 'Não foi possível salvar a atividade.');
    } finally {
      setIsChecking(false);
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
              <Text style={styles.modalTitle}>Novo Evento</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Input Agrupado com Ícone */}
            <View style={styles.inputRow}>
              <TouchableOpacity 
                style={styles.iconSelectorButton} 
                onPress={() => setShowIconMenu(!showIconMenu)}
                activeOpacity={0.7}
              >
                <Feather name={iconeSelecionado as any} size={22} color={Colors.text} />
                <Feather name="chevron-down" size={14} color="#888" style={{ marginLeft: 4 }} />
              </TouchableOpacity>
              <TextInput
                style={styles.titleInputGrouped}
                placeholder="Nome do evento..."
                value={titulo}
                onChangeText={setTitulo}
                placeholderTextColor="#999"
                autoFocus
              />
            </View>

            {/* Mini menu de ícones flutuante/condicional */}
            {showIconMenu && (
              <View style={styles.iconDropdown}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {ICONES_DISPONIVEIS.map((ic) => (
                    <TouchableOpacity 
                      key={ic} 
                      style={styles.iconDropdownItem} 
                      onPress={() => { setIconeSelecionado(ic); setShowIconMenu(false); }}
                      activeOpacity={0.7}
                    >
                      <Feather name={ic as any} size={20} color={iconeSelecionado === ic ? Colors.primary : '#888'} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Seletor de Horário e Repetição */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Horário</Text>
              <View style={styles.timeRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.subLabel}>Início</Text>
                  <TouchableOpacity style={styles.nativeTimeButton} onPress={() => setShowPickerInicio(true)} activeOpacity={0.7}>
                    <Text style={styles.nativeTimeText}>
                      {horaInicio.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </TouchableOpacity>
                </View>
                
                <View style={{ flex: 1 }}>
                  <Text style={styles.subLabel}>Fim</Text>
                  <TouchableOpacity style={styles.nativeTimeButton} onPress={() => setShowPickerFim(true)} activeOpacity={0.7}>
                    <Text style={styles.nativeTimeText}>
                      {horaFim.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Pílulas de Repetição diretamente abaixo, centralizadas, sem título */}
              <View style={styles.repetitionContainer}>
                {(['unica', 'diaria', 'semanal'] as const).map((freq) => (
                  <TouchableOpacity 
                    key={freq} 
                    style={[styles.freqPill, frequencia === freq && styles.freqPillActive]} 
                    onPress={() => setFrequencia(freq)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.freqPillText, frequencia === freq && styles.freqPillTextActive]}>
                      {freq === 'unica' ? 'Não se repete' : freq === 'diaria' ? 'Todos os dias' : 'Semanalmente'}
                    </Text>
                  </TouchableOpacity>
                ))}
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

              {/* Picker de Início */}
              {showPickerInicio && (
                <DateTimePicker
                  value={horaInicio}
                  mode="time"
                  is24Hour={true}
                  onValueChange={(event, selectedDate) => {
                    if (Platform.OS === 'android') setShowPickerInicio(false);
                    if (selectedDate) {
                      setHoraInicio(selectedDate);
                      setHoraFim(new Date(selectedDate.getTime() + 60 * 60 * 1000));
                    }
                  }}
                  onDismiss={() => setShowPickerInicio(false)}
                />
              )}

              {/* Picker de Fim */}
              {showPickerFim && (
                <DateTimePicker
                  value={horaFim}
                  mode="time"
                  is24Hour={true}
                  onValueChange={(event, selectedDate) => {
                    if (Platform.OS === 'android') setShowPickerFim(false);
                    if (selectedDate) setHoraFim(selectedDate);
                  }}
                  onDismiss={() => setShowPickerFim(false)}
                />
              )}
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

            {/* Botão Salvar */}
            <TouchableOpacity
              style={[
                styles.saveButton,
                (!titulo.trim() || isChecking) && styles.saveButtonDisabled,
                isChecking && { opacity: 0.7 },
              ]}
              onPress={handleSave}
              disabled={!titulo.trim() || isChecking}
              activeOpacity={0.85}
            >
              <Text style={styles.saveButtonText}>
                {isChecking ? 'Analisando...' : 'Adicionar à Agenda'}
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
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.3,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.3,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1b1d1f',
    borderWidth: 1,
    borderColor: '#2e3235',
    borderRadius: 12,
    marginBottom: 16,
    paddingHorizontal: 12,
  },
  iconSelectorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 12,
    borderRightWidth: 1,
    borderRightColor: '#2e3235',
    paddingVertical: 12,
  },
  titleInputGrouped: {
    flex: 1,
    fontSize: 17,
    color: Colors.text,
    paddingVertical: 14,
    paddingLeft: 12,
  },
  iconDropdown: {
    backgroundColor: '#1b1d1f',
    borderWidth: 1,
    borderColor: '#2e3235',
    borderRadius: 12,
    padding: 8,
    marginBottom: 16,
  },
  iconDropdownItem: {
    padding: 8,
    marginRight: 8,
  },
  timeRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  subLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 6,
    fontWeight: '600',
  },
  repetitionContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  freqPill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#1b1d1f',
    borderWidth: 1,
    borderColor: '#2e3235',
  },
  freqPillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  freqPillText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  freqPillTextActive: {
    color: '#000000',
    fontWeight: '800',
  },
  nativeTimeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#1b1d1f',
    borderWidth: 1,
    borderColor: '#2e3235',
  },
  nativeTimeText: {
    fontSize: 16,
    color: Colors.text,
    fontWeight: '600',
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
