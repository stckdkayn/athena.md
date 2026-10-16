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
import { Fonts } from '@/constants/Typography';
import { criarNovaAtividade, atualizarAtividade, excluirAtividade } from '@/services/database';
import { gerarPlanoDiario } from '@/services/schedulerService';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaveSuccess: () => void; // Para recarregar a lista na tela principal
  dataInicial?: string; // Formato YYYY-MM-DD
  atividadeEmEdicao?: any;
}

const TIPOS_DISPONIVEIS = ['Pessoal', 'Estudo', 'Faculdade', 'Lazer'];
const ICONES_DISPONIVEIS = [
  'calendar', 'book', 'book-open', 'activity', 'heart', 'users', 'user', 'home', 
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
  const [tipo, setTipo] = useState('Pessoal');
  const [iconeSelecionado, setIconeSelecionado] = useState('calendar');
  const [showCategoriaDrop, setShowCategoriaDrop] = useState(false);
  const [horaInicio, setHoraInicio] = useState(new Date());
  const [horaFim, setHoraFim] = useState(new Date(new Date().getTime() + 60 * 60 * 1000)); // +1 hora padrão
  const [showPickerInicio, setShowPickerInicio] = useState(false);
  const [showPickerFim, setShowPickerFim] = useState(false);
  const [showIconMenu, setShowIconMenu] = useState(false);
  const [frequencia, setFrequencia] = useState<'unica' | 'diaria' | 'dias_uteis' | 'semanal'>('unica');
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
        setTipo(atividadeEmEdicao.tipo || 'Pessoal');
        setIconeSelecionado(atividadeEmEdicao.icone || 'calendar');
        setFrequencia('unica');
        setShowIconMenu(false);
        setShowPickerInicio(false);
        setShowPickerFim(false);
        setShowCategoriaDrop(false);
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
        setTipo('Pessoal');
        setIconeSelecionado('calendar');
        setShowIconMenu(false);
        const now = new Date();
        setHoraInicio(now);
        setHoraFim(new Date(now.getTime() + 60 * 60 * 1000));
        setShowPickerInicio(false);
        setShowPickerFim(false);
        setShowCategoriaDrop(false);
        setFrequencia('unica');
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
              try {
                const dataRef = dataInicial || toLocalDateStr(new Date());
                await gerarPlanoDiario(dataRef);
              } catch (planErr) {
                console.warn('[ModalNovaAtividade] Erro ao re-planejar após exclusão:', planErr);
              }
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

    const dataSelecionada = dataInicial || toLocalDateStr(new Date());
    await executarSalvamento(dataSelecionada);
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
          dias_semana: frequencia === 'semanal' ? diasSemanaSelecionados : undefined,
        });
      }

      // Re-executa o agendador para adaptar os blocos de estudo em volta do novo evento
      try {
        await gerarPlanoDiario(data);
      } catch (e) {
        console.warn('[ModalNovaAtividade] Erro ao re-gerar plano diário:', e);
      }

      setTitulo('');
      setDetalhes('');
      setTipo('Pessoal');
      setIconeSelecionado('calendar');
      const now = new Date();
      setHoraInicio(now);
      setHoraFim(new Date(now.getTime() + 60 * 60 * 1000));
      setFrequencia('unica'); // reseta
      setShowCategoriaDrop(false);
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
              <Text style={styles.modalTitle}>{atividadeEmEdicao ? 'Editar Evento' : 'Novo Evento'}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
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
                activeOpacity={0.7}
              >
                <Feather name={iconeSelecionado as any} size={22} color={Colors.primary} />
              </TouchableOpacity>
              
              <TextInput
                style={styles.textInputBox}
                placeholder="Nome do evento..."
                value={titulo}
                onChangeText={setTitulo}
                placeholderTextColor={Colors.textSecondary}
              />
            </View>

            {/* NOVO CAMPO: Detalhes */}
            <TextInput
              style={styles.detailsInputBox}
              placeholder="Detalhes..."
              value={detalhes}
              onChangeText={setDetalhes}
              placeholderTextColor={Colors.textSecondary}
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
                          <Feather name={ic as any} size={24} color={iconeSelecionado === ic ? '#000000' : Colors.textSecondary} />
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

            {/* Seletor de Categoria */}
            <View style={styles.categoryContainer}>
              <Text style={styles.subLabel}>Categoria</Text>
              <TouchableOpacity
                style={styles.dropdownButton}
                onPress={() => setShowCategoriaDrop(!showCategoriaDrop)}
                activeOpacity={0.7}
              >
                <Text style={styles.dropdownButtonText}>{tipo}</Text>
                <Feather name="chevron-down" size={16} color={Colors.textSecondary} />
              </TouchableOpacity>
              {showCategoriaDrop && (
                <View style={styles.dropdownList}>
                  {['Estudos', 'Faculdade', 'Saúde', 'Lazer', 'Outros'].map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.dropdownListItem, tipo === cat && styles.dropdownListItemActive]}
                      onPress={() => {
                        setTipo(cat);
                        setShowCategoriaDrop(false);
                      }}
                    >
                      <Text style={[styles.dropdownListItemText, tipo === cat && styles.dropdownListItemTextActive]}>{cat}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
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
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
  },
  modalContent: {
    backgroundColor: Colors.surface,
    width: '100%',
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#2e3235',
    minHeight: '50%',
    maxHeight: '90%',
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
    fontFamily: Fonts.extraBold,
    color: Colors.text,
    letterSpacing: -0.3,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    fontFamily: Fonts.extraBold,
    color: Colors.text,
    letterSpacing: -0.3,
  },
  mainInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  iconBox: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#1b1d1f',
    borderWidth: 1,
    borderColor: '#2e3235',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textInputBox: {
    flex: 1,
    height: 46,
    backgroundColor: '#1b1d1f',
    borderWidth: 1,
    borderColor: '#2e3235',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    fontFamily: Fonts.medium,
    color: Colors.text,
    fontWeight: '500',
  },
  detailsInputBox: {
    minHeight: 80,
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.text,
    backgroundColor: '#1b1d1f',
    borderWidth: 1,
    borderColor: '#2e3235',
    borderRadius: 12,
    padding: 12,
    marginBottom: 18,
  },
  categoryContainer: {
    marginBottom: 18,
  },
  dropdownButton: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    backgroundColor: '#1b1d1f', 
    borderWidth: 1,
    borderColor: '#2e3235',
    padding: 12, 
    borderRadius: 12,
  },
  dropdownButtonText: {
    fontSize: 14,
    fontFamily: Fonts.medium,
    color: Colors.text,
    fontWeight: '500',
  },
  dropdownList: { 
    marginTop: 6,
    backgroundColor: '#1b1d1f', 
    borderRadius: 12, 
    borderWidth: 1, 
    borderColor: '#2e3235',
    overflow: 'hidden',
  },
  dropdownListItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2e3235',
  },
  dropdownListItemActive: {
    backgroundColor: 'rgba(234, 225, 21, 0.08)',
  },
  dropdownListItemText: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.text,
  },
  dropdownListItemTextActive: {
    color: Colors.primary,
    fontWeight: '700',
    fontFamily: Fonts.bold,
  },
  gridOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    width: '85%',
    maxHeight: '70%',
    padding: 20,
    borderWidth: 1,
    borderColor: '#2e3235',
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
    backgroundColor: '#1b1d1f',
    borderWidth: 1,
    borderColor: '#2e3235',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridItemActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  timeRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  subLabel: {
    fontSize: 12,
    fontFamily: Fonts.semiBold,
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
    fontFamily: Fonts.semiBold,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  freqPillTextActive: {
    color: '#000000',
    fontWeight: '800',
    fontFamily: Fonts.extraBold,
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
    fontFamily: Fonts.semiBold,
    color: Colors.text,
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
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
  },
  weekDayTextSelected: {
    color: '#000000',
    fontWeight: '800',
    fontFamily: Fonts.extraBold,
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
    fontFamily: Fonts.extraBold,
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
    fontFamily: Fonts.bold,
  },
});
