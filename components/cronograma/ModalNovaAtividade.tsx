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
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Fonts } from '@/constants/Typography';
import { useAppTheme } from '@/context/ThemeContext';
import {
  criarNovaAtividade,
  atualizarAtividade,
  excluirAtividade,
  verificarSeEventoRepete,
  atualizarSerieEventos,
  excluirSerieEventos,
} from '@/services/database';
import { gerarPlanoDiario } from '@/services/schedulerService';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaveSuccess: () => void; // Para recarregar a lista na tela principal
  dataInicial?: string; // Formato YYYY-MM-DD
  atividadeEmEdicao?: any;
}

const TIPOS_DISPONIVEIS = ['Pessoal', 'Estudo', 'Faculdade', 'Lazer'];

const FEATHER_TO_IONICONS_MAP: Record<string, string> = {
  calendar: 'calendar-outline',
  book: 'book-outline',
  'book-open': 'library-outline',
  activity: 'pulse-outline',
  heart: 'heart-outline',
  users: 'people-outline',
  user: 'person-outline',
  home: 'home-outline',
  briefcase: 'briefcase-outline',
  monitor: 'desktop-outline',
  coffee: 'cafe-outline',
  'edit-2': 'create-outline',
  zap: 'flash-outline',
  target: 'locate-outline',
  award: 'ribbon-outline',
  clock: 'time-outline',
  'map-pin': 'location-outline',
  folder: 'folder-outline',
  'file-text': 'document-text-outline',
};

const ICONES_DISPONIVEIS = [
  'calendar-outline',
  'time-outline',
  'alarm-outline',
  'book-outline',
  'school-outline',
  'library-outline',
  'document-text-outline',
  'clipboard-outline',
  'checkmark-circle-outline',
  'medkit-outline',
  'bandage-outline',
  'fitness-outline',
  'heart-outline',
  'pulse-outline',
  'flask-outline',
  'body-outline',
  'briefcase-outline',
  'business-outline',
  'home-outline',
  'bed-outline',
  'cafe-outline',
  'restaurant-outline',
  'car-outline',
  'airplane-outline',
  'bus-outline',
  'bicycle-outline',
  'walk-outline',
  'barbell-outline',
  'bulb-outline',
  'chatbubble-ellipses-outline',
  'mail-outline',
  'call-outline',
  'notifications-outline',
  'flag-outline',
  'star-outline',
  'sparkles-outline',
  'trophy-outline',
  'ribbon-outline',
  'wallet-outline',
  'card-outline',
  'laptop-outline',
  'desktop-outline',
  'headset-outline',
  'musical-notes-outline',
  'camera-outline',
  'newspaper-outline',
  'folder-outline',
  'water-outline',
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
  const [local, setLocal] = useState('');
  const [tipo, setTipo] = useState('Pessoal');
  const [iconeSelecionado, setIconeSelecionado] = useState('calendar-outline');
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
  const [infoRepeticao, setInfoRepeticao] = useState<{ ehRepeticao: boolean; seriePrefix: string | null; total: number } | null>(null);
  const [showPromptRepeticao, setShowPromptRepeticao] = useState(false);
  const [acaoPendente, setAcaoPendente] = useState<'salvar' | 'excluir' | null>(null);

  const formatTimeStr = (d: Date) => {
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  };

  useEffect(() => {
    if (visible) {
      setShowPromptRepeticao(false);
      setInfoRepeticao(null);
      setAcaoPendente(null);

      if (atividadeEmEdicao) {
        setTitulo(atividadeEmEdicao.titulo || '');
        setDetalhes(atividadeEmEdicao.detalhes || '');
        setLocal(atividadeEmEdicao.local || '');
        setTipo(atividadeEmEdicao.tipo || 'Pessoal');
        const iconeSalvo = atividadeEmEdicao.icone;
        setIconeSelecionado(
          (iconeSalvo && FEATHER_TO_IONICONS_MAP[iconeSalvo]) || iconeSalvo || 'calendar-outline'
        );
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
        setLocal('');
        setTipo('Pessoal');
        setIconeSelecionado('calendar-outline');
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

  const handleExcluir = async () => {
    if (!atividadeEmEdicao) return;

    const repete = await verificarSeEventoRepete(atividadeEmEdicao.id);
    if (repete.ehRepeticao) {
      setInfoRepeticao(repete);
      setAcaoPendente('excluir');
      setShowPromptRepeticao(true);
      return;
    }

    Alert.alert(
      'Excluir Evento',
      'Tem certeza que deseja excluir esta atividade da sua agenda?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => executarExclusao(false),
        },
      ]
    );
  };

  const executarExclusao = async (todasAsRepeticoes: boolean) => {
    if (!atividadeEmEdicao) return;
    try {
      if (todasAsRepeticoes && infoRepeticao?.seriePrefix) {
        await excluirSerieEventos(infoRepeticao.seriePrefix);
      } else {
        await excluirAtividade(atividadeEmEdicao.id);
      }
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
  };

  const handleSave = async () => {
    if (!titulo.trim()) {
      Alert.alert('Atenção', 'Dê um nome para a atividade.');
      return;
    }
    if (isChecking) return;

    if (atividadeEmEdicao) {
      const repete = await verificarSeEventoRepete(atividadeEmEdicao.id);
      if (repete.ehRepeticao) {
        setInfoRepeticao(repete);
        setAcaoPendente('salvar');
        setShowPromptRepeticao(true);
        return;
      }
    }

    const dataSelecionada = dataInicial || toLocalDateStr(new Date());
    await executarSalvamento(dataSelecionada, false);
  };

  const handleConfirmarApenasEste = async () => {
    setShowPromptRepeticao(false);
    const dataSelecionada = dataInicial || toLocalDateStr(new Date());
    if (acaoPendente === 'salvar') {
      await executarSalvamento(dataSelecionada, false);
    } else if (acaoPendente === 'excluir') {
      await executarExclusao(false);
    }
  };

  const handleConfirmarTodasRepeticoes = async () => {
    setShowPromptRepeticao(false);
    const dataSelecionada = dataInicial || toLocalDateStr(new Date());
    if (acaoPendente === 'salvar') {
      await executarSalvamento(dataSelecionada, true);
    } else if (acaoPendente === 'excluir') {
      await executarExclusao(true);
    }
  };

  // 3. Função auxiliar de salvamento real (isola o código do banco)
  const executarSalvamento = async (data: string, todasAsRepeticoes: boolean = false) => {
    setIsChecking(true);
    try {
      if (atividadeEmEdicao) {
        if (todasAsRepeticoes && infoRepeticao?.seriePrefix) {
          await atualizarSerieEventos(infoRepeticao.seriePrefix, {
            titulo: titulo.trim(),
            tipo,
            icone: iconeSelecionado,
            detalhes: detalhes.trim() || undefined,
            local: local.trim() || undefined,
            cor: corSelecionada || undefined,
            hora_inicio: formatTimeStr(horaInicio),
            hora_fim: formatTimeStr(horaFim),
          });
        } else {
          await atualizarAtividade(atividadeEmEdicao.id, {
            titulo: titulo.trim(),
            tipo,
            icone: iconeSelecionado,
            detalhes: detalhes.trim() || undefined,
            local: local.trim() || undefined,
            cor: corSelecionada || undefined,
            hora_inicio: formatTimeStr(horaInicio),
            hora_fim: formatTimeStr(horaFim),
          });
        }
      } else {
        await criarNovaAtividade({
          titulo: titulo.trim(),
          tipo,
          icone: iconeSelecionado,
          detalhes: detalhes.trim() || undefined,
          local: local.trim() || undefined,
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
      setLocal('');
      setTipo('Pessoal');
      setIconeSelecionado('calendar-outline');
      setCorSelecionada(null);
      const now = new Date();
      setHoraInicio(now);
      setHoraFim(new Date(now.getTime() + 60 * 60 * 1000));
      setFrequencia('unica'); // reseta
      setShowCategoriaDrop(false);
      setShowPromptRepeticao(false);
      setInfoRepeticao(null);
      setAcaoPendente(null);
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
    <>
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
                    backgroundColor: isDark ? theme.surfaceCard : '#FFFFFF',
                    borderColor: theme.border,
                  },
                ]} 
                onPress={() => setShowIconMenu(!showIconMenu)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={
                    ((FEATHER_TO_IONICONS_MAP[iconeSelecionado] || iconeSelecionado) as any) ||
                    'calendar-outline'
                  }
                  size={24}
                  color={theme.primary}
                />
              </TouchableOpacity>
              
              <TextInput
                style={[
                  styles.textInputBox,
                  {
                    backgroundColor: isDark ? theme.surfaceCard : '#FFFFFF',
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

            {/* Campo Local */}
            <View
              style={[
                styles.localInputContainer,
                {
                  backgroundColor: isDark ? theme.surfaceCard : '#FFFFFF',
                  borderColor: theme.border,
                },
              ]}
            >
              <Ionicons
                name="location-outline"
                size={18}
                color={theme.textSecondary}
                style={{ marginLeft: 14, marginRight: 8 }}
              />
              <TextInput
                style={[
                  styles.localTextInput,
                  { color: theme.text },
                ]}
                placeholder="Local (sala, hospital, bloco...)"
                value={local}
                onChangeText={setLocal}
                placeholderTextColor={theme.textSecondary}
              />
            </View>

            {/* Detalhes / Anotações */}
            <TextInput
              style={[
                styles.detailsInputBox,
                {
                  backgroundColor: isDark ? theme.surfaceCard : '#FFFFFF',
                  borderColor: theme.border,
                  color: theme.text,
                },
              ]}
              placeholder="Anotações ou detalhes..."
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
                      backgroundColor: isDark ? theme.surfaceCard : '#E9E9E7',
                      borderColor: isDark ? theme.border : '#D3D3D0',
                    },
                    corSelecionada === null && [
                      styles.colorCircleSelected,
                      { borderColor: isDark ? theme.primary : '#2383E2' },
                    ],
                  ]}
                  onPress={() => setCorSelecionada(null)}
                  activeOpacity={0.7}
                >
                  {corSelecionada === null ? (
                    <Ionicons name="checkmark" size={16} color={isDark ? theme.primary : '#2383E2'} />
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
                      corSelecionada === c.id && [
                        styles.colorCircleSelected,
                        { borderColor: isDark ? theme.primary : '#2383E2' },
                      ],
                    ]}
                    onPress={() => setCorSelecionada(c.id)}
                    activeOpacity={0.7}
                  >
                    {corSelecionada === c.id && (
                      <Ionicons
                        name="checkmark"
                        size={16}
                        color={c.id === '#EAE115' ? '#000000' : '#FFFFFF'}
                      />
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
                    <View style={[styles.gridHeader, { borderBottomColor: theme.border }]}>
                      <Text style={[styles.gridHeaderTitle, { color: theme.text }]}>Escolha um Ícone</Text>
                      <TouchableOpacity
                        onPress={() => setShowIconMenu(false)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="close" size={22} color={theme.textSecondary} />
                      </TouchableOpacity>
                    </View>

                    <ScrollView contentContainerStyle={styles.gridGrid} showsVerticalScrollIndicator={false}>
                      {ICONES_DISPONIVEIS.map((ic) => {
                        const isSelected =
                          iconeSelecionado === ic ||
                          FEATHER_TO_IONICONS_MAP[iconeSelecionado] === ic;
                        return (
                          <TouchableOpacity 
                            key={ic} 
                            style={styles.gridItem} 
                            onPress={() => { setIconeSelecionado(ic); setShowIconMenu(false); }}
                            activeOpacity={0.6}
                          >
                            <Ionicons
                              name={ic as any}
                              size={28}
                              color={isSelected ? theme.primary : theme.textSecondary}
                            />
                            {isSelected ? (
                              <View style={[styles.gridSelectedDot, { backgroundColor: theme.primary }]} />
                            ) : (
                              <View style={{ height: 4, marginTop: 4 }} />
                            )}
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
                        backgroundColor: isDark ? theme.surfaceCard : '#FFFFFF',
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
                        backgroundColor: isDark ? theme.surfaceCard : '#FFFFFF',
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
                              backgroundColor: isDark ? theme.surfaceCard : '#FFFFFF',
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
                                backgroundColor: isDark ? theme.surfaceCard : '#FFFFFF',
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
                    backgroundColor: isDark ? theme.surfaceCard : '#FFFFFF',
                    borderColor: theme.border,
                  },
                ]}
                onPress={() => setShowCategoriaDrop(!showCategoriaDrop)}
                activeOpacity={0.7}
              >
                <Text style={[styles.dropdownButtonText, { color: theme.text }]}>{tipo}</Text>
                <Ionicons name="chevron-down" size={16} color={theme.textSecondary} />
              </TouchableOpacity>
              {showCategoriaDrop && (
                <View
                  style={[
                    styles.dropdownList,
                    {
                      backgroundColor: isDark ? theme.surfaceCard : '#FFFFFF',
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

    {/* Modal Elegante de Escolha de Repetição */}
    <Modal
      visible={showPromptRepeticao}
      transparent
      animationType="fade"
      onRequestClose={() => setShowPromptRepeticao(false)}
      statusBarTranslucent
    >
      <TouchableOpacity
        style={[
          styles.repeticaoOverlay,
          { backgroundColor: isDark ? 'rgba(0, 0, 0, 0.78)' : 'rgba(0, 0, 0, 0.45)' },
        ]}
        activeOpacity={1}
        onPress={() => setShowPromptRepeticao(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={[
            styles.repeticaoCard,
            {
              backgroundColor: theme.surfaceCard,
              borderColor: theme.border,
            },
          ]}
        >
          <View style={[styles.repeticaoBadge, { backgroundColor: theme.primarySubtle }]}>
            <Ionicons name="repeat" size={26} color={theme.primary} />
          </View>

          <Text style={[styles.repeticaoTitle, { color: theme.text }]}>
            Evento Recorrente
          </Text>

          <Text style={[styles.repeticaoMessage, { color: theme.textSecondary }]}>
            {acaoPendente === 'salvar'
              ? 'Este evento se repete no calendário. Onde deseja aplicar as alterações de ícone, cor e informações?'
              : 'Este evento se repete no calendário. Deseja excluir apenas esta ocorrência ou todas as repetições?'}
          </Text>

          {/* Opção 1: Todas as repetições */}
          <TouchableOpacity
            style={[
              styles.repeticaoOptionBtn,
              {
                backgroundColor: acaoPendente === 'excluir' ? 'rgba(239, 68, 68, 0.10)' : (isDark ? theme.surface : '#F7F6F3'),
                borderColor: acaoPendente === 'excluir' ? theme.error : theme.border,
              },
            ]}
            onPress={handleConfirmarTodasRepeticoes}
            activeOpacity={0.7}
          >
            <Ionicons
              name={acaoPendente === 'excluir' ? 'trash-outline' : 'copy-outline'}
              size={20}
              color={acaoPendente === 'excluir' ? theme.error : theme.primary}
              style={{ marginRight: 12 }}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.repeticaoOptionTitle,
                  { color: acaoPendente === 'excluir' ? theme.error : theme.text },
                ]}
              >
                {acaoPendente === 'excluir' ? 'Excluir todas as repetições' : 'Em todas as repetições'}
              </Text>
              <Text style={[styles.repeticaoOptionSub, { color: theme.textSecondary }]}>
                {acaoPendente === 'excluir'
                  ? 'Remove todas as ocorrências deste evento no calendário'
                  : 'Aplica ícone, cor e detalhes em todos os dias que se repetem'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
          </TouchableOpacity>

          {/* Opção 2: Apenas este evento */}
          <TouchableOpacity
            style={[
              styles.repeticaoOptionBtn,
              {
                backgroundColor: isDark ? theme.surface : '#F7F6F3',
                borderColor: theme.border,
              },
            ]}
            onPress={handleConfirmarApenasEste}
            activeOpacity={0.7}
          >
            <Ionicons
              name="calendar-outline"
              size={20}
              color={theme.text}
              style={{ marginRight: 12 }}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.repeticaoOptionTitle, { color: theme.text }]}>
                {acaoPendente === 'excluir' ? 'Excluir apenas este evento' : 'Apenas neste evento'}
              </Text>
              <Text style={[styles.repeticaoOptionSub, { color: theme.textSecondary }]}>
                {acaoPendente === 'excluir'
                  ? 'Mantém as outras repetições nas demais semanas'
                  : 'Modifica somente a ocorrência deste dia específico'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
          </TouchableOpacity>

          {/* Botão Cancelar */}
          <TouchableOpacity
            style={styles.repeticaoCancelBtn}
            onPress={() => setShowPromptRepeticao(false)}
            activeOpacity={0.7}
          >
            <Text style={[styles.repeticaoCancelText, { color: theme.textSecondary }]}>Cancelar</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
    </>
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
  localInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 46,
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 12,
  },
  localTextInput: {
    flex: 1,
    height: '100%',
    paddingRight: 14,
    fontSize: 14,
    fontFamily: Fonts.medium,
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
    borderRadius: 20,
    width: '88%',
    maxHeight: '72%',
    padding: 20,
    borderWidth: 1,
    elevation: 0,
    shadowOpacity: 0,
  },
  gridHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  gridHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: Fonts.bold,
  },
  gridGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  gridItem: {
    width: '20%',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridSelectedDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 4,
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
    borderColor: '#2383E2',
    transform: [{ scale: 1.15 }],
  },
  repeticaoOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  repeticaoCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 18,
    borderWidth: 1,
    padding: 22,
    alignItems: 'center',
  },
  repeticaoBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  repeticaoTitle: {
    fontSize: 18,
    fontFamily: Fonts.extraBold,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
  },
  repeticaoMessage: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  repeticaoOptionBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  repeticaoOptionTitle: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    fontWeight: '700',
    marginBottom: 2,
  },
  repeticaoOptionSub: {
    fontSize: 11,
    fontFamily: Fonts.regular,
    lineHeight: 14,
  },
  repeticaoCancelBtn: {
    marginTop: 6,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  repeticaoCancelText: {
    fontSize: 13,
    fontFamily: Fonts.medium,
  },
});
