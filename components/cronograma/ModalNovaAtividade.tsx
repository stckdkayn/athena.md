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
import { criarNovaAtividade, atualizarAtividade, excluirAtividade } from '@/services/database';
import { canScheduleActivity } from '@/services/scheduleService';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaveSuccess: () => void; // Para recarregar a lista na tela principal
  dataInicial?: string; // Formato YYYY-MM-DD
  atividadeEmEdicao?: any;
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
  atividadeEmEdicao,
}: Props) {
  const [titulo, setTitulo] = useState('');
  const [detalhes, setDetalhes] = useState('');
  const [tipo, setTipo] = useState('Estudos');
  const [iconeSelecionado, setIconeSelecionado] = useState('book');
  const [showCategoriaDrop, setShowCategoriaDrop] = useState(false);
  const [showDemandaDrop, setShowDemandaDrop] = useState(false);
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
      if (atividadeEmEdicao) {
        setTitulo(atividadeEmEdicao.titulo || '');
        setDetalhes(atividadeEmEdicao.detalhes || '');
        setTipo(atividadeEmEdicao.tipo || 'Estudos');
        setIconeSelecionado(atividadeEmEdicao.icone || 'book');
        setDemanda(typeof atividadeEmEdicao.feedback_cansaco === 'number' ? atividadeEmEdicao.feedback_cansaco : 3);
        setFrequencia('unica');
        setShowIconMenu(false);
        setShowPickerInicio(false);
        setShowPickerFim(false);
        setShowCategoriaDrop(false);
        setShowDemandaDrop(false);
        setIsChecking(false);

        // Converte as strings de hora de volta para Date objects para o Picker
        const [hI, mI] = (atividadeEmEdicao.hora_inicio || '08:00').split(':');
        const dI = new Date();
        dI.setHours(parseInt(hI, 10) || 8, parseInt(mI, 10) || 0, 0, 0);
        setHoraInicio(dI);

        const [hF, mF] = (atividadeEmEdicao.hora_fim || '09:00').split(':');
        const dF = new Date();
        dF.setHours(parseInt(hF, 10) || 9, parseInt(mF, 10) || 0, 0, 0);
        setHoraFim(dF);
      } else {
        setTitulo('');
        setDetalhes('');
        setTipo('Estudos');
        setIconeSelecionado('book');
        setShowIconMenu(false);
        const now = new Date();
        setHoraInicio(now);
        setHoraFim(new Date(now.getTime() + 60 * 60 * 1000));
        setShowPickerInicio(false);
        setShowPickerFim(false);
        setShowCategoriaDrop(false);
        setShowDemandaDrop(false);
        setFrequencia('unica');
        setDemanda(3);
        setIsChecking(false);
      }
    }
  }, [visible, atividadeEmEdicao]);

  const toggleDiaSemana = (diaId: number) => {
    setDiasSemanaSelecionados((prev) =>
      prev.includes(diaId) ? prev.filter((d) => d !== diaId) : [...prev, diaId]
    );
  };

  const handleExcluir = () => {
    if (!atividadeEmEdicao) return;
    Alert.alert(
      'Excluir Evento',
      'Tem certeza que deseja excluir esta atividade da sua agenda?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await excluirAtividade(atividadeEmEdicao.id);
              onSaveSuccess();
              onClose();
            } catch (err) {
              console.error('[ModalNovaAtividade] Erro ao excluir:', err);
              Alert.alert('Erro', 'Não foi possível excluir a atividade.');
            }
          },
        },
      ]
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
      if (atividadeEmEdicao) {
        await atualizarAtividade(atividadeEmEdicao.id, {
          titulo: titulo.trim(),
          tipo,
          icone: iconeSelecionado,
          detalhes: detalhes.trim(),
          hora_inicio: formatTimeStr(horaInicio),
          hora_fim: formatTimeStr(horaFim),
          feedback_cansaco: demanda,
        });
      } else {
        await criarNovaAtividade({
          titulo: titulo.trim(),
          tipo,
          icone: iconeSelecionado,
          detalhes: detalhes.trim(),
          frequencia,
          data_inicio: data,
          hora_inicio: formatTimeStr(horaInicio),
          hora_fim: formatTimeStr(horaFim),
          feedback_cansaco: demanda,
          dias_semana: frequencia === 'semanal' ? diasSemanaSelecionados : undefined,
        });
      }

      setTitulo('');
      setDetalhes('');
      setIconeSelecionado('book');
      const now = new Date();
      setHoraInicio(now);
      setHoraFim(new Date(now.getTime() + 60 * 60 * 1000));
      setDemanda(3); // reseta para o padrão
      setFrequencia('unica'); // reseta
      setShowCategoriaDrop(false);
      setShowDemandaDrop(false);
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
              <Ionicons name="calendar" size={20} color="#000000" style={{ marginRight: 8 }} />
              <Text style={styles.modalTitle}>{atividadeEmEdicao ? 'Editar Evento' : 'Novo Evento'}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color="#666666" />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled={true}
          >
            {/* Input e Ícone Separados */}
            <View style={styles.mainInputContainer}>
              <TouchableOpacity 
                style={styles.iconBox} 
                onPress={() => setShowIconMenu(!showIconMenu)}
              >
                <Feather name={iconeSelecionado as any} size={24} color="#000" />
              </TouchableOpacity>
              
              <TextInput
                style={styles.textInputBox}
                placeholder="Nome do evento..."
                value={titulo}
                onChangeText={setTitulo}
                placeholderTextColor="#999"
              />
            </View>

            {/* NOVO CAMPO: Detalhes */}
            <TextInput
              style={styles.detailsInputBox}
              placeholder="Detalhes..."
              value={detalhes}
              onChangeText={setDetalhes}
              placeholderTextColor="#999"
              multiline={true}
              numberOfLines={4}
              textAlignVertical="top"
            />

            {/* Pop-up em Grelha para Seleção de Ícones */}
            {showIconMenu && (
              <Modal visible={showIconMenu} transparent animationType="fade" onRequestClose={() => setShowIconMenu(false)}>
                <TouchableOpacity style={styles.gridOverlay} activeOpacity={1} onPress={() => setShowIconMenu(false)}>
                  <View style={styles.gridContainer}>
                    <ScrollView contentContainerStyle={styles.gridGrid} showsVerticalScrollIndicator={false}>
                      {ICONES_DISPONIVEIS.map((ic) => (
                        <TouchableOpacity 
                          key={ic} 
                          style={[styles.gridItem, iconeSelecionado === ic && styles.gridItemActive]} 
                          onPress={() => { setIconeSelecionado(ic); setShowIconMenu(false); }}
                          activeOpacity={0.7}
                        >
                          <Feather name={ic as any} size={24} color={iconeSelecionado === ic ? '#FFFFFF' : '#4B5563'} />
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                </TouchableOpacity>
              </Modal>
            )}

            {/* Seletor de Horário e Repetição */}
            <View style={styles.section}>
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
              {!atividadeEmEdicao && (
                <>
                  <View style={styles.repetitionContainer}>
                    {(['unica', 'diaria', 'semanal'] as const).map((freq) => (
                      <TouchableOpacity 
                        key={freq} 
                        style={[styles.freqPill, frequencia === freq && styles.freqPillActive]} 
                        onPress={() => setFrequencia(freq)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.freqPillText, frequencia === freq && styles.freqPillTextActive]}>
                          {freq === 'unica' ? 'Hoje' : freq === 'diaria' ? 'Todos os dias' : 'Semanalmente'}
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
                </>
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

            {/* Dropdowns Lado a Lado (Categoria e Carga Cognitiva) */}
            <View style={styles.dropdownsRow}>
              {/* Coluna 1: Categoria */}
              <View style={styles.dropdownColumn}>
                <Text style={styles.subLabel}>Categoria</Text>
                <TouchableOpacity
                  style={styles.dropdownButton}
                  onPress={() => {
                    setShowCategoriaDrop(!showCategoriaDrop);
                    setShowDemandaDrop(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.dropdownButtonText}>{tipo}</Text>
                  <Feather name="chevron-down" size={16} color="#888" />
                </TouchableOpacity>
                {showCategoriaDrop && (
                  <View style={styles.dropdownList}>
                    {['Estudos', 'Faculdade', 'Saúde', 'Lazer', 'Outros'].map((cat) => (
                      <TouchableOpacity
                        key={cat}
                        style={styles.dropdownListItem}
                        onPress={() => {
                          setTipo(cat);
                          setShowCategoriaDrop(false);
                        }}
                      >
                        <Text style={styles.dropdownListItemText}>{cat}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Coluna 2: Carga Cognitiva */}
              <View style={styles.dropdownColumn}>
                <Text style={styles.subLabel}>Carga Cognitiva</Text>
                <TouchableOpacity
                  style={styles.dropdownButton}
                  onPress={() => {
                    setShowDemandaDrop(!showDemandaDrop);
                    setShowCategoriaDrop(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.dropdownButtonText}>{demanda}</Text>
                  <Feather name="chevron-down" size={16} color="#888" />
                </TouchableOpacity>
                {showDemandaDrop && (
                  <View style={styles.dropdownList}>
                    {[1, 2, 3, 4, 5].map((peso) => (
                      <TouchableOpacity
                        key={peso}
                        style={styles.dropdownListItem}
                        onPress={() => {
                          setDemanda(peso);
                          setShowDemandaDrop(false);
                        }}
                      >
                        <Text style={styles.dropdownListItemText}>{peso}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
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
                {isChecking
                  ? 'Analisando...'
                  : atividadeEmEdicao
                  ? 'Salvar Alterações'
                  : 'Adicionar à Agenda'}
              </Text>
            </TouchableOpacity>

            {/* Botão Excluir (apenas em modo de edição) */}
            {atividadeEmEdicao && (
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={handleExcluir}
                activeOpacity={0.85}
              >
                <Ionicons name="trash-outline" size={18} color="#EF4444" style={{ marginRight: 6 }} />
                <Text style={styles.deleteButtonText}>Excluir Evento</Text>
              </TouchableOpacity>
            )}
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
    backgroundColor: '#FFF',
    width: '100%',
    padding: 24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: '50%',
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: -0.3,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: -0.3,
  },
  mainInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  iconBox: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textInputBox: {
    flex: 1,
    fontSize: 18,
    color: '#000000',
    fontWeight: '500',
    paddingVertical: 8,
  },
  detailsInputBox: {
    minHeight: 80,
    fontSize: 15,
    color: '#444444',
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
  },
  dropdownsRow: { 
    flexDirection: 'row', 
    gap: 16, 
    marginBottom: 20,
    alignItems: 'flex-start',
  },
  dropdownColumn: { 
    flex: 1 
  },
  dropdownButton: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    backgroundColor: '#F5F5F5', 
    padding: 12, 
    borderRadius: 10 
  },
  dropdownButtonText: {
    fontSize: 14,
    color: '#000000',
    fontWeight: '500',
  },
  dropdownList: { 
    marginTop: 6,
    backgroundColor: '#FFF', 
    borderRadius: 10, 
    borderWidth: 1, 
    borderColor: '#EEE',
  },
  dropdownListItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F9F9F9',
  },
  dropdownListItemText: {
    fontSize: 14,
    color: '#333333',
  },
  gridOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    width: '85%',
    maxHeight: '70%',
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  gridGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  gridItem: {
    width: '22%',
    aspectRatio: 1,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridItemActive: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  timeRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  subLabel: {
    fontSize: 12,
    color: '#6B7280',
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
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  freqPillActive: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  freqPillText: {
    fontSize: 13,
    color: '#4B5563',
    fontWeight: '600',
  },
  freqPillTextActive: {
    color: '#FFFFFF',
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
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  nativeTimeText: {
    fontSize: 16,
    color: '#000000',
    fontWeight: '600',
  },
  section: {
    marginBottom: 18,
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
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDayCircleSelected: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  weekDayText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4B5563',
  },
  weekDayTextSelected: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  saveButton: {
    backgroundColor: '#000000',
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
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EF444440',
    backgroundColor: '#EF444415',
    marginBottom: 10,
  },
  deleteButtonText: {
    color: '#EF4444',
    fontSize: 15,
    fontWeight: '700',
  },
});
