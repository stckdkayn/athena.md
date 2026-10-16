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
import { useAppTheme } from '@/context/ThemeContext';
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
const CORES_DISPONIVEIS = [
  { id: '#3B82F6', label: 'Azul' },
  { id: '#EC4899', label: 'Rosa' },
  { id: '#EF4444', label: 'Vermelho' },
  { id: '#10B981', label: 'Verde' },
  { id: '#8B5CF6', label: 'Roxo' },
  { id: '#EAE115', label: 'Amarelo' },
  { id: '#F97316', label: 'Laranja' },
  { id: '#6B7280', label: 'Cinza' },
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
  const { theme, isDark } = useAppTheme();
  const [titulo, setTitulo] = useState('');
  const [detalhes, setDetalhes] = useState('');
  const [tipo, setTipo] = useState('Pessoal');
  const [iconeSelecionado, setIconeSelecionado] = useState('calendar');
  const [corSelecionada, setCorSelecionada] = useState<string | null>(null);
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
        setCorSelecionada(atividadeEmEdicao.cor || null);
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
        setCorSelecionada(null);
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
          cor: corSelecionada || undefined,
          hora_inicio: formatTimeStr(horaInicio),
          hora_fim: formatTimeStr(horaFim),
        });
      } else {
        await criarNovaAtividade({
          titulo: titulo.trim(),
          tipo,
          icone: iconeSelecionado,
          detalhes: detalhes.trim(),
          cor: corSelecionada || undefined,
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
      setCorSelecionada(null);
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
        style={[
          styles.overlay,
          { backgroundColor: isDark ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.45)' },
        ]}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View
          style={[
            styles.modalContent,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Ionicons name="calendar" size={20} color={theme.primary} style={{ marginRight: 8 }} />
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {atividadeEmEdicao ? 'Editar Evento' : 'Novo Evento'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={22} color={theme.textSecondary} />
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
                style={[
                  styles.iconBox,
                  {
                    backgroundColor: isDark ? '#1b1d1f' : '#FFFFFF',
                    borderColor: theme.border,
                  },
                ]} 
                onPress={() => setShowIconMenu(!showIconMenu)}
                activeOpacity={0.7}
              >
                <Feather name={iconeSelecionado as any} size={22} color={theme.primary} />
              </TouchableOpacity>
              
              <TextInput
                style={[
                  styles.textInputBox,
                  {
                    backgroundColor: isDark ? '#1b1d1f' : '#FFFFFF',
                    borderColor: theme.border,
                    color: theme.text,
                  },
                ]}
                placeholder="Nome do evento..."
                value={titulo}
                onChangeText={setTitulo}
                placeholderTextColor={theme.textSecondary}
              />
            </View>

            {/* NOVO CAMPO: Detalhes */}
            <TextInput
              style={[
                styles.detailsInputBox,
                {
                  backgroundColor: isDark ? '#1b1d1f' : '#FFFFFF',
                  borderColor: theme.border,
                  color: theme.text,
                },
              ]}
              placeholder="Detalhes..."
              value={detalhes}
              onChangeText={setDetalhes}
              placeholderTextColor={theme.textSecondary}
              multiline={true}
              numberOfLines={4}
              textAlignVertical="top"
            />

            {/* SELETOR DE COR DO CARTÃO */}
            <View style={styles.colorSection}>
              <Text style={[styles.colorSectionTitle, { color: theme.textSecondary }]}>Cor do Cartão</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.colorPaletteRow}
              >
                {/* Opção Padrão / Automática */}
                <TouchableOpacity
                  style={[
                    styles.colorCircle,
                    {
                      backgroundColor: isDark ? '#2e3235' : '#E9E9E7',
                      borderColor: isDark ? '#4E5358' : '#D3D3D0',
                    },
                    corSelecionada === null && styles.colorCircleSelected,
                  ]}
                  onPress={() => setCorSelecionada(null)}
                  activeOpacity={0.7}
                >
                  {corSelecionada === null ? (
                    <Ionicons name="checkmark" size={16} color={isDark ? '#FFFFFF' : '#37352F'} />
                  ) : (
                    <Ionicons name="color-palette-outline" size={14} color={theme.textSecondary} />
                  )}
                </TouchableOpacity>

                {CORES_DISPONIVEIS.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={[
                      styles.colorCircle,
                      { backgroundColor: c.id, borderColor: c.id },
                      corSelecionada === c.id && styles.colorCircleSelected,
                    ]}
                    onPress={() => setCorSelecionada(c.id)}
                    activeOpacity={0.7}
                  >
                    {corSelecionada === c.id && (
                      <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Pop-up em Grelha para Seleção de Ícones */}
            {showIconMenu && (
              <Modal visible={showIconMenu} transparent animationType="fade" onRequestClose={() => setShowIconMenu(false)}>
                <TouchableOpacity
                  style={[
                    styles.gridOverlay,
                    { backgroundColor: isDark ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.45)' },
                  ]}
                  activeOpacity={1}
                  onPress={() => setShowIconMenu(false)}
                >
                  <View
                    style={[
                      styles.gridContainer,
                      {
                        backgroundColor: theme.surface,
                        borderColor: theme.border,
                      },
                    ]}
                  >
                    <ScrollView contentContainerStyle={styles.gridGrid} showsVerticalScrollIndicator={false}>
                      {ICONES_DISPONIVEIS.map((ic) => {
                        const isSelected = iconeSelecionado === ic;
                        return (
                          <TouchableOpacity 
                            key={ic} 
                            style={[
                              styles.gridItem,
                              {
                                backgroundColor: isDark ? '#1b1d1f' : '#FFFFFF',
                                borderColor: theme.border,
                              },
                              isSelected && {
                                backgroundColor: theme.primary,
                                borderColor: theme.primary,
                              },
                            ]} 
                            onPress={() => { setIconeSelecionado(ic); setShowIconMenu(false); }}
                            activeOpacity={0.7}
                          >
                            <Feather
                              name={ic as any}
                              size={24}
                              color={isSelected ? (isDark ? '#000000' : '#FFFFFF') : theme.textSecondary}
                            />
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                </TouchableOpacity>
              </Modal>
            )}

            {/* Seletor de Horário e Repetição */}
            <View style={styles.section}>
              <View style={styles.timeRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.subLabel, { color: theme.textSecondary }]}>Início</Text>
                  <TouchableOpacity
                    style={[
                      styles.nativeTimeButton,
                      {
                        backgroundColor: isDark ? '#1b1d1f' : '#FFFFFF',
                        borderColor: theme.border,
                      },
                    ]}
                    onPress={() => setShowPickerInicio(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.nativeTimeText, { color: theme.text }]}>
                      {horaInicio.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </TouchableOpacity>
                </View>
                
                <View style={{ flex: 1 }}>
                  <Text style={[styles.subLabel, { color: theme.textSecondary }]}>Fim</Text>
                  <TouchableOpacity
                    style={[
                      styles.nativeTimeButton,
                      {
                        backgroundColor: isDark ? '#1b1d1f' : '#FFFFFF',
                        borderColor: theme.border,
                      },
                    ]}
                    onPress={() => setShowPickerFim(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.nativeTimeText, { color: theme.text }]}>
                      {horaFim.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Pílulas de Repetição diretamente abaixo, centralizadas, sem título */}
              {!atividadeEmEdicao && (
                <>
                  <View style={styles.repetitionContainer}>
                    {(['unica', 'diaria', 'semanal'] as const).map((freq) => {
                      const isActive = frequencia === freq;
                      return (
                        <TouchableOpacity 
                          key={freq} 
                          style={[
                            styles.freqPill,
                            {
                              backgroundColor: isDark ? '#1b1d1f' : '#FFFFFF',
                              borderColor: theme.border,
                            },
                            isActive && {
                              backgroundColor: theme.primary,
                              borderColor: theme.primary,
                            },
                          ]} 
                          onPress={() => setFrequencia(freq)}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.freqPillText,
                              { color: theme.textSecondary },
                              isActive && {
                                color: isDark ? '#000000' : '#FFFFFF',
                                fontWeight: '800',
                                fontFamily: Fonts.extraBold,
                              },
                            ]}
                          >
                            {freq === 'unica' ? 'Hoje' : freq === 'diaria' ? 'Todos os dias' : 'Semanalmente'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Seletor de dias para frequência Semanal */}
                  {frequencia === 'semanal' && (
                    <View style={styles.weekDaysContainer}>
                      {DIAS_SEMANA_NOMES.map((d) => {
                        const isSelected = diasSemanaSelecionados.includes(d.id);
                        return (
                          <TouchableOpacity
                            key={d.id}
                            style={[
                              styles.weekDayCircle,
                              {
                                backgroundColor: isDark ? '#1b1d1f' : '#FFFFFF',
                                borderColor: theme.border,
                              },
                              isSelected && {
                                backgroundColor: theme.primary,
                                borderColor: theme.primary,
                              },
                            ]}
                            onPress={() => toggleDiaSemana(d.id)}
                            activeOpacity={0.7}
                          >
                            <Text
                              style={[
                                styles.weekDayText,
                                { color: theme.textSecondary },
                                isSelected && {
                                  color: isDark ? '#000000' : '#FFFFFF',
                                  fontWeight: '800',
                                  fontFamily: Fonts.extraBold,
                                },
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
              <Text style={[styles.subLabel, { color: theme.textSecondary }]}>Categoria</Text>
              <TouchableOpacity
                style={[
                  styles.dropdownButton,
                  {
                    backgroundColor: isDark ? '#1b1d1f' : '#FFFFFF',
                    borderColor: theme.border,
                  },
                ]}
                onPress={() => setShowCategoriaDrop(!showCategoriaDrop)}
                activeOpacity={0.7}
              >
                <Text style={[styles.dropdownButtonText, { color: theme.text }]}>{tipo}</Text>
                <Feather name="chevron-down" size={16} color={theme.textSecondary} />
              </TouchableOpacity>
              {showCategoriaDrop && (
                <View
                  style={[
                    styles.dropdownList,
                    {
                      backgroundColor: isDark ? '#1b1d1f' : '#FFFFFF',
                      borderColor: theme.border,
                    },
                  ]}
                >
                  {['Estudos', 'Faculdade', 'Saúde', 'Lazer', 'Outros'].map((cat) => {
                    const isCatSelected = tipo === cat;
                    return (
                      <TouchableOpacity
                        key={cat}
                        style={[
                          styles.dropdownListItem,
                          { borderBottomColor: theme.border },
                          isCatSelected && { backgroundColor: theme.primarySubtle },
                        ]}
                        onPress={() => {
                          setTipo(cat);
                          setShowCategoriaDrop(false);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.dropdownListItemText,
                            { color: theme.text },
                            isCatSelected && [
                              styles.dropdownListItemTextActive,
                              { color: theme.primary },
                            ],
                          ]}
                        >
                          {cat}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Botão Salvar */}
            <TouchableOpacity
              style={[
                styles.saveButton,
                { backgroundColor: theme.primary },
                (!titulo.trim() || isChecking) && styles.saveButtonDisabled,
                isChecking && { opacity: 0.7 },
              ]}
              onPress={handleSave}
              disabled={!titulo.trim() || isChecking}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.saveButtonText,
                  { color: isDark ? '#000000' : '#FFFFFF' },
                ]}
              >
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
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={18} color={theme.error} style={{ marginRight: 6 }} />
                <Text style={[styles.deleteButtonText, { color: theme.error }]}>Excluir Evento</Text>
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
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
  },
  modalContent: {
    width: '100%',
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    minHeight: '50%',
    maxHeight: '90%',
    elevation: 0,
    shadowOpacity: 0,
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
    letterSpacing: -0.3,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    fontFamily: Fonts.extraBold,
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
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textInputBox: {
    flex: 1,
    height: 46,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 15,
    fontFamily: Fonts.medium,
    fontWeight: '500',
  },
  detailsInputBox: {
    minHeight: 80,
    fontSize: 14,
    fontFamily: Fonts.regular,
    borderWidth: 1,
    borderRadius: 10,
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
    borderWidth: 1,
    padding: 12, 
    borderRadius: 10,
  },
  dropdownButtonText: {
    fontSize: 14,
    fontFamily: Fonts.medium,
    fontWeight: '500',
  },
  dropdownList: { 
    marginTop: 6,
    borderRadius: 10, 
    borderWidth: 1, 
    overflow: 'hidden',
  },
  dropdownListItem: {
    padding: 12,
    borderBottomWidth: 1,
  },
  dropdownListItemText: {
    fontSize: 14,
    fontFamily: Fonts.regular,
  },
  dropdownListItemTextActive: {
    fontWeight: '700',
    fontFamily: Fonts.bold,
  },
  gridOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridContainer: {
    borderRadius: 16,
    width: '85%',
    maxHeight: '70%',
    padding: 20,
    borderWidth: 1,
    elevation: 0,
    shadowOpacity: 0,
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
    borderWidth: 1,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  subLabel: {
    fontSize: 12,
    fontFamily: Fonts.semiBold,
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
    borderRadius: 8,
    borderWidth: 1,
  },
  freqPillText: {
    fontSize: 12,
    fontFamily: Fonts.semiBold,
    fontWeight: '600',
  },
  nativeTimeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  nativeTimeText: {
    fontSize: 15,
    fontFamily: Fonts.semiBold,
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
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDayText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Fonts.bold,
  },
  saveButton: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    marginBottom: 10,
    elevation: 0,
    shadowOpacity: 0,
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '800',
    fontFamily: Fonts.extraBold,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    marginBottom: 10,
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: Fonts.bold,
  },
  colorSection: {
    marginVertical: 12,
  },
  colorSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: Fonts.bold,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  colorPaletteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  colorCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  colorCircleSelected: {
    borderColor: '#37352F',
    transform: [{ scale: 1.15 }],
  },
});
