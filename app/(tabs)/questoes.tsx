import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  PanResponder,
  useWindowDimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, ActiveThemeColors } from '@/constants/Colors';
import { useAppTheme } from '@/context/ThemeContext';
import HealthIcon from '@/components/HealthIcon';
import AppHeader from '@/components/AppHeader';

import { storage } from '@/services/storage'; // <-- Importando MMKV

import {
  SpecialtyItem as Specialty,
  ThemeItem,
  CartItem,
  getQuestionEspecialidade,
  getQuestionTema,
  getQuestionFoco,
  getQuestionMicroFoco,
  getQuestionContentHash,
  getQuestionId,
  getQuestionCategoryKey,
  getSpecialtiesWithCounts,
  getQuestoesCache,
  getQuestionsBySpecialty,
  getThemesBySpecialty,
  getTotalQuestoesCount,
  getSpecialtyThemesIndex,
  getTemaParaEspMap,
  loadActiveQuizSession,
  clearActiveQuizSession,
} from '@/services/questionService';

export {
  Specialty,
  ThemeItem,
  CartItem,
  getQuestionEspecialidade,
  getQuestionTema,
  getQuestionFoco,
  getQuestionMicroFoco,
  getQuestionContentHash,
  getQuestionId,
  getQuestionCategoryKey,
};

interface MicroFocoItem {
  microFocoNome: string;
  totalQuestoes: number;
  key: string;
}

interface FocoGroup {
  focoNome: string;
  totalQuestoes: number;
  microFocos: MicroFocoItem[];
  geralCount: number;
  geralKey: string;
}

interface ActiveQuizSessionInfo {
  currentIndex: number;
  totalQuestions: number;
}

const IconesEspecialidades: Record<string, string> = {
  'Nefrologia': 'kidney',
  'Gastroenterologia': 'stomach',
  'Hepatologia': 'leaf',
  'Cardiologia': 'heart-pulse',
  'Cirurgia Geral': 'scalpel',
  'Pneumologia': 'lungs',
  'Neurologia': 'brain',
  'Ginecologia': 'human-female',
  'Obstetrícia': 'human-pregnant',
  'Pediatria': 'baby-face-outline',
  'Dermatologia': 'hand-back-right-outline',
  'Endocrinologia': 'pill',
  'Hematologia': 'water',
  'Infectologia': 'virus',
  'Medicina Preventiva': 'shield-check',
  'Oftalmologia': 'eye',
  'Ortopedia': 'bone',
  'Otorrinolaringologia': 'ear-hearing',
  'Psiquiatria': 'head-snowflake-outline',
  'Reumatologia': 'arm-flex',
  'Urologia': 'water',
  'Bagagem': 'folder',
  'default': 'medical-bag',
};

const normalizeText = (text: string): string => {
  if (!text) return '';
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
};

export default function TreinoScreen() {
  const { colors: themeColors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(themeColors, isDark), [themeColors, isDark]);
  const router = useRouter();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isLandscape = windowWidth > windowHeight;

  // Estados Base Síncronos
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [searchText, setSearchText] = useState<string>('');
  const [specialtyThemesIndex, setSpecialtyThemesIndex] = useState<Record<string, string[]>>({});
  const [totalQuestoes, setTotalQuestoes] = useState<number>(0);
  
  const [cartCount, setCartCount] = useState<number>(0);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [selectedSpecialties, setSelectedSpecialties] = useState<Record<string, number>>({});
  
  const [quizLimit, setQuizLimit] = useState<string>(() => {
    const saved = storage.getString('@athena_quiz_limit');
    return saved && !isNaN(parseInt(saved, 10)) && parseInt(saved, 10) > 0 ? saved : '20';
  });
  const [activeSession, setActiveSession] = useState<ActiveQuizSessionInfo | null>(null);

  // Estados dos Filtros e Menu de Opções
  const [showSearch, setShowSearch] = useState<boolean>(false);
  const [menuModalVisible, setMenuModalVisible] = useState<boolean>(false);
  const [showSimuladoInfoModal, setShowSimuladoInfoModal] = useState<boolean>(false);

  const [isModoSimulado, setIsModoSimulado] = useState<boolean>(() => {
    return storage.getString('@athena_modo_simulado') === 'true';
  });

  const [filtroErros, setFiltroErros] = useState<boolean>(() => {
    const data = storage.getString('@athena_filtros_simulado');
    return data ? !!JSON.parse(data).apenasErrei : false;
  });
  const [filtroFavoritas, setFiltroFavoritas] = useState<boolean>(() => {
    const data = storage.getString('@athena_filtros_simulado');
    return data ? !!JSON.parse(data).apenasFavoritas : false;
  });

  // Estados da Gaveta Inferior Limpa e Compacta
  const temTemasSelecionados = cartItems.length > 0 || isModoSimulado;
  const ALTURA_PAINEL = isLandscape ? (temTemasSelecionados ? 116 : 74) : (temTemasSelecionados ? 138 : 88);
  const painelHeight = useRef(new Animated.Value(ALTURA_PAINEL)).current;

  React.useEffect(() => {
    Animated.spring(painelHeight, {
      toValue: ALTURA_PAINEL,
      useNativeDriver: false,
      bounciness: 2,
    }).start();
  }, [isLandscape, temTemasSelecionados, ALTURA_PAINEL]);

  const toggleModoSimulado = (val: boolean) => {
    setIsModoSimulado(val);
    storage.set('@athena_modo_simulado', String(val));
    if (val) {
      // Impede tags selecionadas e limpa carrinho existente
      storage.set('@athena_cart', JSON.stringify([]));
      setCartCount(0);
      setCartItems([]);
      setSelectedSpecialties({});
      setTemaFilters({});
      setModalSelectedThemes([]);
    }
  };

  const salvarFiltros = (erros: boolean, favs: boolean) => {
    storage.set('@athena_filtros_simulado', JSON.stringify({ apenasErrei: erros, apenasFavoritas: favs }));
  };

  const toggleFiltroErros = (val: boolean) => {
    setFiltroErros(val);
    salvarFiltros(val, filtroFavoritas);
  };

  const toggleFiltroFavoritas = (val: boolean) => {
    setFiltroFavoritas(val);
    salvarFiltros(filtroErros, val);
  };

  // Estados do Pop-up da Especialidade
  const [selectedSpecialtyName, setSelectedSpecialtyName] = useState<string | null>(null);
  const [specialtyThemes, setSpecialtyThemes] = useState<ThemeItem[]>([]);
  const [specialtyQuestions, setSpecialtyQuestions] = useState<any[]>([]);
  const [temaFilters, setTemaFilters] = useState<Record<string, CartItem>>({});
  const [modalSearchText, setModalSearchText] = useState<string>('');
  const [modalSelectedThemes, setModalSelectedThemes] = useState<string[]>([]);
  const [showNoThemesModal, setShowNoThemesModal] = useState<boolean>(false);

  // Estados do Modal de Afunilamento de Focos e Micro-focos
  const [filtroModalVisible, setFiltroModalVisible] = useState<boolean>(false);
  const [modalTema, setModalTema] = useState<string>('');
  const [modalThemeQuestions, setModalThemeQuestions] = useState<any[]>([]);
  const [modalFocosGroups, setModalFocosGroups] = useState<FocoGroup[]>([]);
  const [modalActiveKeys, setModalActiveKeys] = useState<Set<string>>(new Set());

  // === DADOS SÍNCRONOS ===
  const carregarEspecialidades = async () => {
    try {
      const [total, specs, themesIdx] = await Promise.all([
        getTotalQuestoesCount(),
        getSpecialtiesWithCounts(),
        getSpecialtyThemesIndex(),
      ]);
      setTotalQuestoes(total);
      setSpecialties(specs);
      setSpecialtyThemesIndex(themesIdx);
    } catch (err) {
      console.error('Erro ao carregar especialidades:', err);
    }
  };

  const carregarCart = async () => {
    try {
      const cartData = storage.getString('@athena_cart');
      const temaParaEspMap = await getTemaParaEspMap();

      if (cartData) {
        const parsed = JSON.parse(cartData);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCartCount(parsed.length);

          const filtersMap: Record<string, CartItem> = {};
          const counts: Record<string, number> = {};

          for (const item of parsed) {
            if (typeof item === 'object' && item?.tema) {
              const t = String(item.tema).trim();
              if (Array.isArray(item.allowedQuestionIds)) {
                filtersMap[t] = item;
                filtersMap[t.toLowerCase()] = item;
              }
              
              let espName = String(item.especialidade || temaParaEspMap[t.toLowerCase()] || '').trim();
              if (espName) {
                counts[espName.toLowerCase()] = (counts[espName.toLowerCase()] || 0) + 1;
              }
            }
          }
          setTemaFilters(filtersMap);
          setSelectedSpecialties(counts);

          const formattedCart: CartItem[] = parsed
            .map((item: any) => ({
              especialidade: typeof item === 'object' ? item?.especialidade : undefined,
              tema: String(typeof item === 'object' ? item?.tema : item).trim(),
              allowedQuestionIds: Array.isArray(item?.allowedQuestionIds) ? item.allowedQuestionIds : undefined,
              focos: Array.isArray(item?.focos) ? item.focos : undefined,
              microFocos: Array.isArray(item?.microFocos) ? item.microFocos : undefined,
              filterCount: typeof item?.filterCount === 'number' ? item.filterCount : undefined,
            }))
            .filter((i) => i.tema.length > 0);
          setCartItems(formattedCart);
          return;
        }
      }
      setCartCount(0);
      setCartItems([]);
      setTemaFilters({});
      setSelectedSpecialties({});
    } catch {
      setCartCount(0);
      setCartItems([]);
      setSelectedSpecialties({});
    }
  };

  const verificarSessaoAtiva = async () => {
    try {
      const parsed = await loadActiveQuizSession();
      if (parsed && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
        setActiveSession({
          currentIndex: typeof parsed.currentIndex === 'number' ? parsed.currentIndex : 0,
          totalQuestions: parsed.questions.length,
        });
      } else {
        setActiveSession(null);
      }
    } catch {
      setActiveSession(null);
    }
  };

  useFocusEffect(
    useCallback(() => {
      carregarEspecialidades();
      carregarCart();
      verificarSessaoAtiva();
    }, [])
  );

  const iniciarQuiz = () => {
    const cleanNum = quizLimit.trim();
    const finalLimit = parseInt(cleanNum, 10) > 0 ? String(parseInt(cleanNum, 10)) : '20';
    
    storage.set('@athena_quiz_limit', finalLimit);
    clearActiveQuizSession();

    if (isModoSimulado) {
      router.push({ pathname: '/treino/quiz', params: { limite: finalLimit, simulado: 'true' } });
      return;
    }

    if (cartCount === 0) {
      setShowNoThemesModal(true);
      return;
    }

    router.push({ pathname: '/treino/quiz', params: { limite: finalLimit } });
  };

  const continuarQuiz = () => {
    router.push({ pathname: '/treino/quiz', params: { retomar: 'true' } });
  };

  const { filteredSpecialties, matchingThemesBySpec } = useMemo(() => {
    // Apenas especialidades com questões cadastradas (> 0), ordenadas em ordem alfabética
    const listaDisponivel = specialties
      .filter((s) => s.count > 0)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));

    const query = normalizeText(searchText);
    if (!query) return { filteredSpecialties: listaDisponivel, matchingThemesBySpec: {} };

    const matchingThemes: Record<string, string[]> = {};
    const filtered = listaDisponivel.filter((spec) => {
      const isSpecMatch = normalizeText(spec.nome).includes(query);
      const themes = specialtyThemesIndex[spec.nome.trim().toLowerCase()] || [];
      const matchedThemes = themes.filter((t) => normalizeText(t).includes(query));

      if (matchedThemes.length > 0) matchingThemes[spec.nome.trim().toLowerCase()] = matchedThemes;
      return isSpecMatch || matchedThemes.length > 0;
    });

    return { filteredSpecialties: filtered, matchingThemesBySpec: matchingThemes };
  }, [specialties, specialtyThemesIndex, searchText]);

  const { filteredModalThemes, themeSearchMatchMap } = useMemo(() => {
    const query = normalizeText(modalSearchText);
    if (!query) {
      const sorted = [...specialtyThemes].sort((a, b) =>
        a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
      );
      return { filteredModalThemes: sorted, themeSearchMatchMap: {} as Record<string, string> };
    }

    // Mapear cada tema para seus focos/micro_focos/tags correspondentes a partir das questões carregadas
    const themeFocosMap: Record<string, Set<string>> = {};
    for (const q of specialtyQuestions) {
      const t = getQuestionTema(q).trim().toLowerCase();
      if (!themeFocosMap[t]) themeFocosMap[t] = new Set();

      const f = getQuestionFoco(q);
      if (f && f.toLowerCase() !== 'geral') themeFocosMap[t].add(f);

      const mf = getQuestionMicroFoco(q);
      if (mf) themeFocosMap[t].add(mf);

      if (Array.isArray(q.tags)) {
        for (const tag of q.tags) {
          if (typeof tag === 'string' && tag.trim()) themeFocosMap[t].add(tag.trim());
        }
      }
    }

    const matchesMap: Record<string, string> = {};
    const list = specialtyThemes.filter((t) => {
      const isNameMatch = normalizeText(t.nome).includes(query);
      if (isNameMatch) return true;

      const subTerms = themeFocosMap[t.nome.trim().toLowerCase()];
      if (subTerms) {
        for (const term of subTerms) {
          if (normalizeText(term).includes(query)) {
            matchesMap[t.nome] = term;
            return true;
          }
        }
      }
      return false;
    });

    const sorted = [...list].sort((a, b) =>
      a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
    );

    return { filteredModalThemes: sorted, themeSearchMatchMap: matchesMap };
  }, [specialtyThemes, specialtyQuestions, modalSearchText]);

  // Modais abrem instantaneamente agora!
  const abrirModalEspecialidade = async (especialidadeNome: string, initialThemeSearch?: string) => {
    setSelectedSpecialtyName(especialidadeNome);
    setModalSearchText(initialThemeSearch ? initialThemeSearch.trim() : '');

    try {
      const [filtered, result] = await Promise.all([
        getQuestionsBySpecialty(especialidadeNome),
        getThemesBySpecialty(especialidadeNome),
      ]);
      
      setSpecialtyQuestions(filtered);
      setSpecialtyThemes(result);
    } catch (e) {
      console.warn('Erro ao carregar temas da especialidade:', e);
    }

    const cartData = storage.getString('@athena_cart');
    if (cartData) {
      try {
        const parsedCart = JSON.parse(cartData);
        if (Array.isArray(parsedCart)) {
          const thisSpecThemes = parsedCart
            .filter((item: any) => (!item.especialidade || item.especialidade.toLowerCase() === especialidadeNome.toLowerCase()))
            .map((item: any) => item.tema);
          
          setModalSelectedThemes(thisSpecThemes);
          
          const filtersMap: Record<string, CartItem> = {};
          parsedCart.forEach(item => {
            if (item.tema && Array.isArray(item.allowedQuestionIds)) {
              filtersMap[item.tema] = item;
              filtersMap[item.tema.toLowerCase()] = item;
            }
          });
          setTemaFilters(filtersMap);
        }
      } catch (e) {}
    } else {
      setModalSelectedThemes([]);
      setTemaFilters({});
    }
  };

  const atualizarCartStore = (newCart: any[], newSelectedSpec: number, isAddition: boolean) => {
    storage.set('@athena_cart', JSON.stringify(newCart));
    setCartCount(newCart.length);
    setCartItems(newCart);

    setSelectedSpecialties((prev) => {
      const next = { ...prev };
      const key = selectedSpecialtyName!.toLowerCase();
      if (newSelectedSpec > 0) next[key] = newSelectedSpec;
      else delete next[key];
      return next;
    });
  };

  const toggleTemaModal = (temaNome: string) => {
    if (!selectedSpecialtyName) return;

    const isSelected = modalSelectedThemes.includes(temaNome);
    const updatedSelected = isSelected
      ? modalSelectedThemes.filter((t) => t !== temaNome)
      : [...modalSelectedThemes, temaNome];

    setModalSelectedThemes(updatedSelected);

    if (isSelected) {
      setTemaFilters((prev) => {
        const copy = { ...prev };
        delete copy[temaNome];
        delete copy[temaNome.toLowerCase()];
        return copy;
      });
    }

    const data = storage.getString('@athena_cart');
    let currentCart: any[] = [];
    if (data) try { currentCart = JSON.parse(data); } catch(e){}

    const otherItems = currentCart.filter((item: any) => 
      item.especialidade && item.especialidade.toLowerCase() !== selectedSpecialtyName.toLowerCase()
    );

    const updatedThisSpecItems = updatedSelected.map((t) => {
      const existingFilter = !isSelected ? (temaFilters[t] || temaFilters[t.toLowerCase()]) : undefined;
      if (existingFilter && Array.isArray(existingFilter.allowedQuestionIds)) return existingFilter;
      return { especialidade: selectedSpecialtyName, tema: t };
    });

    const newCart = [...otherItems, ...updatedThisSpecItems];
    atualizarCartStore(newCart, updatedSelected.length, !isSelected);
  };

  const toggleSelectAllModal = () => {
    if (!selectedSpecialtyName || specialtyThemes.length === 0) return;

    const allSelected = specialtyThemes.every((t) => modalSelectedThemes.includes(t.nome));
    const newSelected = allSelected ? [] : specialtyThemes.map((t) => t.nome);
    setModalSelectedThemes(newSelected);

    if (allSelected) setTemaFilters({});

    const data = storage.getString('@athena_cart');
    let currentCart: any[] = [];
    if (data) try { currentCart = JSON.parse(data); } catch(e){}

    const otherItems = currentCart.filter((item: any) => 
      item.especialidade && item.especialidade.toLowerCase() !== selectedSpecialtyName.toLowerCase()
    );

    const updatedThisSpecItems = newSelected.map((t) => {
      const existingFilter = temaFilters[t] || temaFilters[t.toLowerCase()];
      if (existingFilter && Array.isArray(existingFilter.allowedQuestionIds)) return existingFilter;
      return { especialidade: selectedSpecialtyName, tema: t };
    });

    atualizarCartStore([...otherItems, ...updatedThisSpecItems], newSelected.length, !allSelected);
  };

  const removerTemaDoCarrinho = (itemToRemove: CartItem) => {
    const data = storage.getString('@athena_cart');
    let currentCart: any[] = [];
    if (data) try { currentCart = JSON.parse(data); } catch(e){}

    const newCart = currentCart.filter((item: any) => {
      if (itemToRemove.especialidade && item.especialidade) {
        return !(item.especialidade.toLowerCase() === itemToRemove.especialidade.toLowerCase() &&
                 item.tema.toLowerCase() === itemToRemove.tema.toLowerCase());
      }
      return item.tema.toLowerCase() !== itemToRemove.tema.toLowerCase();
    });

    storage.set('@athena_cart', JSON.stringify(newCart));
    setCartCount(newCart.length);
    setCartItems(newCart);

    const specCounts: Record<string, number> = {};
    for (const item of newCart) {
      if (item.especialidade) {
        const k = item.especialidade.toLowerCase();
        specCounts[k] = (specCounts[k] || 0) + 1;
      }
    }
    setSelectedSpecialties(specCounts);

    if (selectedSpecialtyName) {
      setModalSelectedThemes((prev) => prev.filter((t) => t.toLowerCase() !== itemToRemove.tema.toLowerCase()));
    }
  };

  // Funções do Filtro de Microfoco (Síncronas)
  const abrirFiltroModal = async (temaNome: string, specialtyOverride?: string) => {
    const activeSpecialty = specialtyOverride || selectedSpecialtyName;
    if (specialtyOverride && specialtyOverride !== selectedSpecialtyName) setSelectedSpecialtyName(specialtyOverride);

    let sourceQuestions = specialtyQuestions;
    if ((sourceQuestions.length === 0 || specialtyOverride) && activeSpecialty) {
      sourceQuestions = await getQuestionsBySpecialty(activeSpecialty);
      setSpecialtyQuestions(sourceQuestions);
    }

    const themeQs = sourceQuestions.filter((q) => getQuestionTema(q).trim().toLowerCase() === temaNome.trim().toLowerCase());
    if (themeQs.length === 0) return;

    const focosMap: Record<string, { total: number; microFocosMap: Record<string, number>; geralCount: number }> = {};
    const allKeys = new Set<string>();

    for (const q of themeQs) {
      const rawFoco = getQuestionFoco(q) || 'Abordagem Geral';
      const foco = rawFoco.charAt(0).toUpperCase() + rawFoco.slice(1);
      const rawMicro = getQuestionMicroFoco(q);
      const micro = rawMicro ? rawMicro.charAt(0).toUpperCase() + rawMicro.slice(1) : '';

      if (!focosMap[foco]) focosMap[foco] = { total: 0, microFocosMap: {}, geralCount: 0 };
      focosMap[foco].total += 1;

      const catKey = `${foco}::${micro || '__geral__'}`;
      allKeys.add(catKey);

      if (micro) focosMap[foco].microFocosMap[micro] = (focosMap[foco].microFocosMap[micro] || 0) + 1;
      else focosMap[foco].geralCount += 1;
    }

    const groups: FocoGroup[] = Object.entries(focosMap)
      .map(([focoNome, dados]) => ({
        focoNome,
        totalQuestoes: dados.total,
        microFocos: Object.entries(dados.microFocosMap)
          .map(([mNome, mCount]) => ({ microFocoNome: mNome, totalQuestoes: mCount, key: `${focoNome}::${mNome}` }))
          .sort((a, b) => b.totalQuestoes - a.totalQuestoes || a.microFocoNome.localeCompare(b.microFocoNome)),
        geralCount: dados.geralCount,
        geralKey: `${focoNome}::__geral__`,
      }))
      .sort((a, b) => b.totalQuestoes - a.totalQuestoes || a.focoNome.localeCompare(b.focoNome));

    let initialActive = new Set<string>(allKeys);
    const existingFilter = temaFilters[temaNome] || temaFilters[temaNome.toLowerCase()];
    if (existingFilter && Array.isArray(existingFilter.allowedQuestionIds)) {
      const allowedSet = new Set(existingFilter.allowedQuestionIds);
      const activeFromIds = new Set<string>();
      for (const q of themeQs) {
        if (allowedSet.has(getQuestionId(q))) activeFromIds.add(getQuestionCategoryKey(q));
      }
      if (activeFromIds.size > 0) initialActive = activeFromIds;
    }

    setModalTema(temaNome);
    setModalThemeQuestions(themeQs);
    setModalFocosGroups(groups);
    setModalActiveKeys(initialActive);
    setFiltroModalVisible(true);
  };

  const toggleModalKey = (key: string) => {
    setModalActiveKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleFocoGroup = (group: FocoGroup) => {
    const groupKeys: string[] = group.microFocos.map(m => m.key);
    if (group.geralCount > 0) groupKeys.push(group.geralKey);

    const allActive = groupKeys.every((k) => modalActiveKeys.has(k));
    setModalActiveKeys((prev) => {
      const next = new Set(prev);
      if (allActive) groupKeys.forEach(k => next.delete(k));
      else groupKeys.forEach(k => next.add(k));
      return next;
    });
  };

  const isAllModalActive = useMemo(() => {
    let totalKeys = 0;
    for (const g of modalFocosGroups) totalKeys += g.microFocos.length + (g.geralCount > 0 ? 1 : 0);
    return totalKeys > 0 && modalActiveKeys.size === totalKeys;
  }, [modalFocosGroups, modalActiveKeys]);

  const isPartialModalActive = useMemo(() => modalActiveKeys.size > 0 && !isAllModalActive, [modalActiveKeys, isAllModalActive]);

  const toggleSelectAllFocos = () => {
    if (isAllModalActive) setModalActiveKeys(new Set());
    else {
      const allKeys = new Set<string>();
      modalFocosGroups.forEach(g => {
        g.microFocos.forEach(m => allKeys.add(m.key));
        if (g.geralCount > 0) allKeys.add(g.geralKey);
      });
      setModalActiveKeys(allKeys);
    }
  };

  const matchingQuestions = useMemo(() => modalThemeQuestions.filter((q) => modalActiveKeys.has(getQuestionCategoryKey(q))), [modalThemeQuestions, modalActiveKeys]);
  const matchingCount = matchingQuestions.length;

  const handleIniciarComFiltro = () => {
    const targetSpec = selectedSpecialtyName || cartItems.find((i) => i.tema.toLowerCase() === modalTema.toLowerCase())?.especialidade;
    if (matchingCount === 0 || !targetSpec) return;

    const allowedIds = matchingQuestions.map((q, idx) => getQuestionId(q, idx));
    const cartItem: CartItem = { especialidade: targetSpec, tema: modalTema, allowedQuestionIds: allowedIds, filterCount: matchingCount };

    storage.set('@athena_cart', JSON.stringify([cartItem]));
    
    const cleanNum = quizLimit.trim();
    const finalLimit = parseInt(cleanNum, 10) > 0 ? String(parseInt(cleanNum, 10)) : '20';
    storage.set('@athena_quiz_limit', finalLimit);
    clearActiveQuizSession();

    setFiltroModalVisible(false);
    setSelectedSpecialtyName(null);
    router.push({ pathname: '/treino/quiz', params: { limite: finalLimit } });
  };

  const handleSalvarFiltroNoCarrinho = () => {
    const targetSpec = selectedSpecialtyName || cartItems.find((i) => i.tema.toLowerCase() === modalTema.toLowerCase())?.especialidade;
    if (matchingCount === 0 || !targetSpec) return;

    const allowedIds = matchingQuestions.map((q, idx) => getQuestionId(q, idx));
    const isFullSelection = matchingCount === modalThemeQuestions.length;

    const data = storage.getString('@athena_cart');
    let currentCart: any[] = [];
    if (data) try { currentCart = JSON.parse(data); } catch(e){}

    const otherItems = currentCart.filter((item: any) => 
      !(item.especialidade?.toLowerCase() === targetSpec.toLowerCase() && item.tema.toLowerCase() === modalTema.toLowerCase())
    );

    const newCartItem: CartItem = {
      especialidade: targetSpec,
      tema: modalTema,
      allowedQuestionIds: isFullSelection ? undefined : allowedIds,
      filterCount: isFullSelection ? undefined : matchingCount,
    };

    const updatedCart = [...otherItems, newCartItem];
    storage.set('@athena_cart', JSON.stringify(updatedCart));

    setCartCount(updatedCart.length);
    setCartItems(updatedCart);

    if (!modalSelectedThemes.includes(modalTema)) setModalSelectedThemes((prev) => [...prev, modalTema]);

    setTemaFilters((prev) => ({ ...prev, [modalTema]: newCartItem, [modalTema.toLowerCase()]: newCartItem }));

    const specCounts: Record<string, number> = {};
    for (const item of updatedCart) {
      if (item.especialidade) specCounts[item.especialidade.toLowerCase()] = (specCounts[item.especialidade.toLowerCase()] || 0) + 1;
    }
    setSelectedSpecialties(specCounts);
    setFiltroModalVisible(false);
  };

  const renderItem = ({ item }: { item: Specialty }) => {
    const selectedThemesCount = selectedSpecialties[item.nome.toLowerCase()] || 0;
    const isSelected = selectedThemesCount > 0;
    const specKey = item.nome.trim().toLowerCase();
    const matchedThemes = matchingThemesBySpec[specKey];
    const query = normalizeText(searchText);
    const isSpecNameDirectMatch = query ? normalizeText(item.nome).includes(query) : true;
    const shouldPreFilterModal = Boolean(matchedThemes && matchedThemes.length > 0 && !isSpecNameDirectMatch);

    const handleCardPress = () => {
      if (isModoSimulado) {
        Alert.alert(
          'Modo Simulado Ativo',
          'No Modo Simulado, as questões são distribuídas automaticamente entre as 5 grandes áreas da residência médica.\n\nPara selecionar temas específicos manualmente, desative o Modo Simulado no menu de opções (ícone de 3 pontos).',
          [
            { text: 'Entendi', style: 'cancel' },
            {
              text: 'Desativar Simulado',
              style: 'destructive',
              onPress: () => toggleModoSimulado(false),
            },
          ]
        );
        return;
      }
      abrirModalEspecialidade(item.nome, shouldPreFilterModal ? searchText : undefined);
    };

    return (
      <TouchableOpacity
        style={[styles.gridCard, isSelected && styles.gridCardSelected]}
        activeOpacity={0.7}
        onPress={handleCardPress}
      >
        {isSelected && (
          <View style={styles.selectedBadge}>
            <Ionicons name="checkmark" size={12} color="#FFFFFF" />
            {selectedThemesCount > 1 && <Text style={styles.selectedBadgeCount}>{selectedThemesCount}</Text>}
          </View>
        )}
        <View style={styles.cardIconBox}>
          <HealthIcon specialty={item.nome} size={40} color={themeColors.primary} />
        </View>
        <Text style={[styles.cardTitle, isSelected && styles.cardTitleSelected]} numberOfLines={1}>
          {item.nome}
        </Text>
        {matchedThemes && matchedThemes.length > 0 && !isSpecNameDirectMatch ? (
          <View style={styles.cardMatchThemeBadge}>
            <Ionicons name="search" size={10} color={themeColors.primary} style={{ marginRight: 3 }} />
            <Text style={styles.cardMatchThemeText} numberOfLines={1}>
              {matchedThemes[0]}{matchedThemes.length > 1 ? ` (+${matchedThemes.length - 1})` : ''}
            </Text>
          </View>
        ) : (
          <Text style={[styles.cardCount, isSelected && styles.cardCountSelected]}>
            {isSelected ? `${selectedThemesCount} ${selectedThemesCount === 1 ? 'tema ativo' : 'temas ativos'}` : `${item.count} ${item.count === 1 ? 'questão' : 'questões'}`}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => {
    if (searchText.trim().length > 0) {
      return (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}><Ionicons name="search-outline" size={36} color={themeColors.primary} /></View>
          <Text style={styles.emptyTitle}>Nenhum resultado encontrado</Text>
          <Text style={styles.emptySubtitle}>Não encontramos especialidades ou temas correspondentes a "{searchText}".</Text>
          <TouchableOpacity style={styles.emptyButton} activeOpacity={0.7} onPress={() => setSearchText('')}>
            <Ionicons name="close-circle-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.emptyButtonText}>Limpar pesquisa</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconCircle}><Ionicons name="file-tray-outline" size={36} color={themeColors.primary} /></View>
        <Text style={styles.emptyTitle}>O seu banco está vazio</Text>
        <Text style={styles.emptySubtitle}>Vá à aba Configurações para importar as suas questões.</Text>
        <TouchableOpacity style={styles.emptyButton} activeOpacity={0.7} onPress={() => router.push('/configuracoes')}>
          <Ionicons name="settings-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
          <Text style={styles.emptyButtonText}>Ir para Configurações</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderListHeader = () => {
    if (searchText.trim().length > 0) {
      return (
        <View style={styles.searchSummaryContainer}>
          <Text style={styles.searchSummaryText}>
            Resultados para "{searchText}" ({filteredSpecialties.length})
          </Text>
        </View>
      );
    }
    return null;
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={themeColors.background} />

      {/* Cabeçalho Unificado com Barra de Ações como children */}
      <AppHeader>
        <View style={styles.topHeaderRow}>
          {/* Botão de Busca Circular */}
          <TouchableOpacity
            style={[styles.searchIconButton, (showSearch || searchText.length > 0) && styles.searchIconButtonActive]}
            onPress={() => {
              if (showSearch) {
                setShowSearch(false);
                setSearchText('');
              } else {
                setShowSearch(true);
              }
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <Ionicons
              name={showSearch || searchText.length > 0 ? 'close' : 'search'}
              size={20}
              color={showSearch || searchText.length > 0 ? themeColors.primary : themeColors.text}
            />
          </TouchableOpacity>

          {/* Título Especialidades Centralizado */}
          <View style={styles.topHeaderCenter}>
            <Text style={styles.screenMainTitle}>Especialidades</Text>
            {isModoSimulado ? (
              <View style={styles.headerSimuladoPill}>
                <Text style={styles.headerSimuladoPillText}>SIMULADO ATIVO</Text>
              </View>
            ) : cartCount > 0 ? (
              <Text style={styles.topHeaderCartSubtext}>
                {cartCount} {cartCount === 1 ? 'tema ativo' : 'temas ativos'}
              </Text>
            ) : null}
          </View>

          {/* Menu de 3 Pontos Circular */}
          <TouchableOpacity
            style={[styles.menuIconButton, (isModoSimulado || filtroErros || filtroFavoritas) && styles.menuIconButtonActive]}
            onPress={() => setMenuModalVisible(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <Ionicons
              name="ellipsis-vertical"
              size={20}
              color={isModoSimulado || filtroErros || filtroFavoritas ? themeColors.primary : themeColors.text}
            />
            {(isModoSimulado || filtroErros || filtroFavoritas) && <View style={styles.menuActiveDot} />}
          </TouchableOpacity>
        </View>

        {/* Barra Expansível de Pesquisa */}
        {showSearch && (
          <View style={styles.searchBarRow}>
            <Ionicons name="search" size={16} color="#8E959E" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Pesquisar especialidade ou tema..."
              placeholderTextColor="#8E959E"
              value={searchText}
              onChangeText={setSearchText}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="default"
              inputMode="text"
              textContentType="none"
              returnKeyType="search"
              blurOnSubmit={false}
            />
            {searchText.length > 0 && (
              <TouchableOpacity onPress={() => setSearchText('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={18} color="#8E959E" />
              </TouchableOpacity>
            )}
          </View>
        )}
      </AppHeader>

      <View style={styles.contentContainer}>
        <FlatList
          key="specialties-grid"
          data={filteredSpecialties}
          keyExtractor={(item) => item.nome}
          renderItem={renderItem}
          ListHeaderComponent={renderListHeader}
          numColumns={2}
          columnWrapperStyle={styles.columnWrapper}
          ListEmptyComponent={renderEmpty}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.listContent, { paddingBottom: temTemasSelecionados ? 245 : 185 }]}
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
        />

        {/* Gaveta Inferior Limpa e Compacta (Filtros avançados movidos para o menu de 3 pontos) */}
        <Animated.View style={[styles.bottomDrawer, { height: painelHeight, bottom: isLandscape ? 64 : 82 }]}>
          {isModoSimulado ? (
            <View style={[styles.cartThemesWrapper, isLandscape && { maxWidth: 560, alignSelf: 'center', width: '100%' }]}>
              <View style={styles.simuladoBottomBanner}>
                <MaterialCommunityIcons name="clipboard-text-clock-outline" size={15} color={themeColors.primary} style={{ marginRight: 6 }} />
                <Text style={styles.simuladoBottomBannerText} numberOfLines={1}>
                  Modo Simulado • 20% por Grande Área (Automático)
                </Text>
              </View>
            </View>
          ) : cartItems.length > 0 ? (
            <View style={[styles.cartThemesWrapper, isLandscape && { maxWidth: 560, alignSelf: 'center', width: '100%' }]}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cartThemesScrollContent}>
                {cartItems.map((item, index) => {
                  const hasFilter = Array.isArray(item.allowedQuestionIds) && item.allowedQuestionIds.length > 0;
                  return (
                    <TouchableOpacity
                      key={`${item.tema}-${index}`}
                      style={[styles.cartThemeChip, hasFilter && styles.cartThemeChipFiltered]}
                      activeOpacity={0.7}
                      onPress={() => {
                        const esp = item.especialidade || selectedSpecialtyName;
                        if (esp) {
                          abrirModalEspecialidade(esp);
                          abrirFiltroModal(item.tema, esp);
                        }
                      }}
                    >
                      {hasFilter && <Ionicons name="funnel" size={11} color={themeColors.primary} style={{ marginRight: 4 }} />}
                      <Text style={[styles.cartThemeChipText, hasFilter && styles.cartThemeChipTextFiltered]} numberOfLines={1}>
                        {item.microFocos?.[0] ? `${item.tema}: ${item.microFocos[0]}` : item.focos?.[0] ? `${item.tema}: ${item.focos[0]}` : item.tema}
                        {hasFilter && item.filterCount ? ` (${item.filterCount}q)` : ''}
                      </Text>
                      <TouchableOpacity onPress={() => removerTemaDoCarrinho(item)} style={styles.cartThemeRemoveButton} hitSlop={{ top: 8, bottom: 8, left: 6, right: 8 }}>
                        <Ionicons name="close-circle" size={16} color={themeColors.textSecondary} />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          <View style={[styles.cartActionsRow, isLandscape && { maxWidth: 560, alignSelf: 'center', width: '100%' }]}>
            {activeSession ? (
              <TouchableOpacity style={styles.cartStartButton} activeOpacity={0.7} onPress={continuarQuiz}>
                <Ionicons name="play-forward" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.cartStartButtonText} numberOfLines={1}>
                  Continuar Questões ({activeSession.currentIndex + 1}/{activeSession.totalQuestions})
                </Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity style={styles.cartStartButton} activeOpacity={0.7} onPress={iniciarQuiz}>
                  <Ionicons name="play" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cartStartButtonText} numberOfLines={1}>
                      {isModoSimulado
                        ? 'Iniciar Simulado'
                        : cartCount > 0
                        ? `Iniciar Questões (${cartCount} ${cartCount === 1 ? 'Tema' : 'Temas'})`
                        : 'Iniciar Questões'}
                    </Text>
                    {isModoSimulado ? (
                      <Text style={styles.cartStartButtonSubtext} numberOfLines={1}>
                        Prova estilo residência • Sem gabarito imediato
                      </Text>
                    ) : (
                      cartItems.length === 1 && cartItems[0].allowedQuestionIds && (
                        <Text style={styles.cartStartButtonSubtext} numberOfLines={1}>
                          {cartItems[0].microFocos?.[0] ? `${cartItems[0].tema}: ${cartItems[0].microFocos[0]}` : cartItems[0].focos?.[0] ? `${cartItems[0].tema}: ${cartItems[0].focos[0]}` : cartItems[0].tema}
                          {cartItems[0].filterCount ? ` • ${cartItems[0].filterCount}q focadas` : ''}
                        </Text>
                      )
                    )}
                  </View>
                </TouchableOpacity>
                <View style={styles.limitBox}>
                  <Text style={styles.limitLabel}>QUESTÕES</Text>
                  <TextInput
                    style={styles.limitInput}
                    value={quizLimit}
                    onChangeText={(text) => setQuizLimit(text.replace(/[^0-9]/g, ''))}
                    onBlur={() => { if (!quizLimit.trim() || parseInt(quizLimit, 10) <= 0) setQuizLimit('20'); }}
                    keyboardType="number-pad"
                    maxLength={3}
                    selectTextOnFocus
                    placeholder="20"
                    placeholderTextColor={themeColors.textSecondary}
                  />
                </View>
              </>
            )}
          </View>
        </Animated.View>
      </View>

      {/* Menu de Contexto (3 Pontos - Dropdown Flutuante) */}
      <Modal
        visible={menuModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setMenuModalVisible(false)}
        statusBarTranslucent={true}
      >
        <TouchableOpacity
          style={styles.contextMenuBackdrop}
          activeOpacity={1}
          onPress={() => setMenuModalVisible(false)}
        >
          <View style={styles.contextMenuContainer}>
            {/* 1. MODO SIMULADO */}
            <TouchableOpacity
              style={styles.contextMenuItem}
              activeOpacity={0.7}
              onPress={() => toggleModoSimulado(!isModoSimulado)}
            >
              <View style={[styles.contextIconBox, { backgroundColor: 'rgba(234, 225, 21, 0.15)' }]}>
                <MaterialCommunityIcons name="clipboard-text-clock-outline" size={19} color={Colors.primary} />
              </View>
              <Text style={[styles.contextMenuLabel, isModoSimulado && styles.contextMenuLabelActive]}>
                Modo Simulado
              </Text>
              <TouchableOpacity
                style={styles.contextHelpBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                activeOpacity={0.7}
                onPress={() => {
                  setMenuModalVisible(false);
                  setShowSimuladoInfoModal(true);
                }}
              >
                <Ionicons name="help-circle-outline" size={20} color={Colors.primary} />
              </TouchableOpacity>
              <View style={[styles.contextCheckbox, isModoSimulado && styles.contextCheckboxChecked]}>
                {isModoSimulado && <Ionicons name="checkmark" size={14} color="#000000" />}
              </View>
            </TouchableOpacity>

            <View style={styles.contextMenuDivider} />

            {/* 2. SOMENTE QUESTÕES ERRADAS */}
            <TouchableOpacity
              style={styles.contextMenuItem}
              activeOpacity={0.7}
              onPress={() => toggleFiltroErros(!filtroErros)}
            >
              <View style={[styles.contextIconBox, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
                <Ionicons name="close-circle-outline" size={19} color="#EF4444" />
              </View>
              <Text style={[styles.contextMenuLabel, filtroErros && styles.contextMenuLabelActive]}>
                Somente questões erradas
              </Text>
              <View style={[styles.contextCheckbox, filtroErros && styles.contextCheckboxChecked]}>
                {filtroErros && <Ionicons name="checkmark" size={14} color="#000000" />}
              </View>
            </TouchableOpacity>

            <View style={styles.contextMenuDivider} />

            {/* 3. SOMENTE FAVORITAS */}
            <TouchableOpacity
              style={styles.contextMenuItem}
              activeOpacity={0.7}
              onPress={() => toggleFiltroFavoritas(!filtroFavoritas)}
            >
              <View style={[styles.contextIconBox, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                <Ionicons name="star" size={17} color="#F59E0B" />
              </View>
              <Text style={[styles.contextMenuLabel, filtroFavoritas && styles.contextMenuLabelActive]}>
                Somente favoritas
              </Text>
              <View style={[styles.contextCheckbox, filtroFavoritas && styles.contextCheckboxChecked]}>
                {filtroFavoritas && <Ionicons name="checkmark" size={14} color="#000000" />}
              </View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Caixa de Diálogo Explicativa do Modo Simulado */}
      <Modal
        visible={showSimuladoInfoModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowSimuladoInfoModal(false)}
        statusBarTranslucent={true}
      >
        <View style={styles.simuladoInfoBackdrop}>
          <TouchableOpacity
            style={styles.simuladoInfoDismiss}
            activeOpacity={1}
            onPress={() => setShowSimuladoInfoModal(false)}
          />
          <View style={styles.simuladoInfoCard}>
            <View style={styles.simuladoInfoIconBox}>
              <MaterialCommunityIcons name="clipboard-text-clock-outline" size={30} color={Colors.primary} />
            </View>

            <Text style={styles.simuladoInfoTitle}>Modo Simulado</Text>
            <Text style={styles.simuladoInfoSubtitle}>Simulação de Prova de Residência</Text>

            <View style={styles.simuladoInfoList}>
              <View style={styles.simuladoInfoRow}>
                <Ionicons name="pie-chart-outline" size={18} color={Colors.primary} style={styles.simuladoInfoRowIcon} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.simuladoInfoRowTitle}>Distribuição Equilibrada (20% por Área)</Text>
                  <Text style={styles.simuladoInfoRowDesc}>
                    O simulado é composto igualmente pelas 5 grandes áreas: Clínica Médica, Cirurgia, Pediatria, Ginecologia/Obstetrícia e Medicina Preventiva.
                  </Text>
                </View>
              </View>

              <View style={styles.simuladoInfoRow}>
                <Ionicons name="eye-off-outline" size={18} color={Colors.primary} style={styles.simuladoInfoRowIcon} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.simuladoInfoRowTitle}>Sem Feedback Imediato</Text>
                  <Text style={styles.simuladoInfoRowDesc}>
                    Não há indicação imediata de acerto ou erro e os comentários e gabaritos ficam ocultos durante o teste, simulando uma prova real.
                  </Text>
                </View>
              </View>

              <View style={styles.simuladoInfoRow}>
                <Ionicons name="checkbox-outline" size={18} color={Colors.primary} style={styles.simuladoInfoRowIcon} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.simuladoInfoRowTitle}>Modo Revisão ao Concluir</Text>
                  <Text style={styles.simuladoInfoRowDesc}>
                    Ao terminar, você confere sua nota, desempenho por área e tem acesso às resoluções e comentários completos de cada questão.
                  </Text>
                </View>
              </View>

              <View style={styles.simuladoInfoRow}>
                <Ionicons name="options-outline" size={18} color={Colors.primary} style={styles.simuladoInfoRowIcon} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.simuladoInfoRowTitle}>Quantidade Personalizável</Text>
                  <Text style={styles.simuladoInfoRowDesc}>
                    A quantidade de questões é definida no rodapé da tela (ao lado de Iniciar Simulado), mantendo o padrão de 20 questões.
                  </Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={styles.simuladoInfoBtn}
              activeOpacity={0.85}
              onPress={() => setShowSimuladoInfoModal(false)}
            >
              <Text style={styles.simuladoInfoBtnText}>Entendi</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modais */}
      <Modal
        visible={selectedSpecialtyName !== null}
        transparent={true}
        animationType="slide"
        onRequestClose={() => filtroModalVisible ? setFiltroModalVisible(false) : setSelectedSpecialtyName(null)}
        statusBarTranslucent={true}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}>
          <TouchableOpacity style={styles.modalDismissArea} activeOpacity={1} onPress={() => filtroModalVisible ? setFiltroModalVisible(false) : setSelectedSpecialtyName(null)} />
          <View style={[styles.modalContent, isLandscape && { maxHeight: '94%', minHeight: undefined, maxWidth: 640, alignSelf: 'center', width: '100%', borderLeftWidth: 1.5, borderRightWidth: 1.5, paddingBottom: 12 }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderInfo}>
                <View style={styles.modalIconBox}>
                  <HealthIcon specialty={selectedSpecialtyName || ''} size={26} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle} numberOfLines={1}>{selectedSpecialtyName}</Text>
                  <Text style={styles.modalSubtitle}>{specialtyThemes.length} {specialtyThemes.length === 1 ? 'tema disponível' : 'temas disponíveis'} • Segure para afunilar</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.modalCloseButton} activeOpacity={0.7} onPress={() => setSelectedSpecialtyName(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={20} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalSearchContainer}>
              <Ionicons name="search-outline" size={18} color={Colors.textSecondary} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.modalSearchInput}
                placeholder="Pesquisar tema..."
                placeholderTextColor={Colors.textSecondary}
                value={modalSearchText}
                onChangeText={setModalSearchText}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="default"
                inputMode="text"
                textContentType="none"
                returnKeyType="search"
                blurOnSubmit={false}
              />
              {modalSearchText.length > 0 && (
                <TouchableOpacity onPress={() => setModalSearchText('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={16} color={Colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.modalActionsRow}>
              <Text style={styles.modalActionsSummary}>
                <Text style={{ color: isDark ? '#E5E7EB' : '#37352F', fontWeight: '700' }}>{modalSelectedThemes.length}</Text> {modalSelectedThemes.length === 1 ? 'tema selecionado' : 'temas selecionados'}
              </Text>
              {specialtyThemes.length > 0 && (
                <TouchableOpacity activeOpacity={0.7} onPress={toggleSelectAllModal}>
                  <Text style={styles.modalSelectAllButton}>{specialtyThemes.every((t) => modalSelectedThemes.includes(t.nome)) ? 'Desmarcar todos' : 'Selecionar todos'}</Text>
                </TouchableOpacity>
              )}
            </View>

            <FlatList
              key="modal-themes-grid"
              data={filteredModalThemes}
              keyExtractor={(item) => item.nome}
              numColumns={2}
              columnWrapperStyle={styles.modalColumnWrapper}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalListContent}
              renderItem={({ item }) => {
                const isThemeSelected = modalSelectedThemes.includes(item.nome);
                const filterInfo = temaFilters[item.nome] || temaFilters[item.nome.toLowerCase()];
                const hasCustomFilter = isThemeSelected && filterInfo && Array.isArray(filterInfo.allowedQuestionIds);
                const customCount = filterInfo?.filterCount ?? filterInfo?.allowedQuestionIds?.length;

                return (
                  <TouchableOpacity
                    style={[styles.themeGridCard, isThemeSelected && styles.themeGridCardSelected, hasCustomFilter && styles.themeGridCardFiltered]}
                    activeOpacity={0.7}
                    onPress={() => toggleTemaModal(item.nome)}
                    onLongPress={() => abrirFiltroModal(item.nome)}
                    delayLongPress={300}
                  >
                    <View style={styles.themeCheckHeader}>
                      <View style={[styles.themeCheckCircle, isThemeSelected && styles.themeCheckCircleSelected]}>
                        {isThemeSelected && <Ionicons name="checkmark" size={12} color="#FFFFFF" />}
                      </View>
                      <TouchableOpacity style={styles.cardFilterIconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => abrirFiltroModal(item.nome)}>
                        <Ionicons name="ellipsis-vertical" size={15} color={hasCustomFilter ? Colors.primary : '#64748B'} />
                      </TouchableOpacity>
                    </View>
                    <Text style={[styles.themeCardTitle, isThemeSelected && styles.themeCardTitleSelected]} numberOfLines={3}>{item.nome}</Text>
                    {themeSearchMatchMap[item.nome] ? (
                      <View style={styles.themeMatchBadge}>
                        <Ionicons name="search" size={9} color={Colors.primary} style={{ marginRight: 3 }} />
                        <Text style={styles.themeMatchBadgeText} numberOfLines={1}>
                          {themeSearchMatchMap[item.nome]}
                        </Text>
                      </View>
                    ) : null}
                    <View style={styles.themeCardFooterRow}>
                      <Text style={[styles.themeCardCount, isThemeSelected && styles.themeCardCountSelected]}>
                        {hasCustomFilter ? `${customCount} de ${item.count} q.` : `${item.count} ${item.count === 1 ? 'questão' : 'questões'}`}
                      </Text>
                      {hasCustomFilter && <View style={styles.cardFilterPill}><Text style={styles.cardFilterPillText}>Afunilado</Text></View>}
                    </View>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={styles.modalEmptyContainer}>
                  <Ionicons name="document-text-outline" size={32} color={Colors.textSecondary} style={{ marginBottom: 8 }} />
                  <Text style={styles.modalEmptyText}>{modalSearchText.trim().length > 0 ? `Nenhum tema encontrado para "${modalSearchText}"` : 'Nenhum tema encontrado nesta especialidade.'}</Text>
                </View>
              }
            />

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.modalDoneButton} activeOpacity={0.85} onPress={() => setSelectedSpecialtyName(null)}>
                <Text style={styles.modalDoneButtonText}>{modalSelectedThemes.length > 0 ? `Concluir Seleção (${modalSelectedThemes.length})` : 'Concluir'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>

        {filtroModalVisible && (
          <View style={styles.filtroOverlay}>
            <TouchableOpacity style={styles.filtroBackdropDismiss} activeOpacity={1} onPress={() => setFiltroModalVisible(false)} />
            <View style={styles.filtroCard}>
              <View style={styles.filtroHeader}>
                <View style={styles.filtroHeaderTopRow}>
                  <View style={styles.filtroHeaderTitleRow}>
                    <Ionicons name="funnel" size={17} color={Colors.primary} style={{ marginRight: 8 }} />
                    <Text style={styles.filtroTitle} numberOfLines={1}>{modalTema}</Text>
                  </View>
                  <TouchableOpacity style={styles.filtroCloseBtn} onPress={() => setFiltroModalVisible(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                    <Ionicons name="close" size={20} color={Colors.textSecondary} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.filtroSubtitle} numberOfLines={1}>{selectedSpecialtyName ? `${selectedSpecialtyName} • ` : ''}Filtro por focos clínicos</Text>
              </View>

              <View style={styles.filtroSelectionToolbar}>
                <TouchableOpacity style={styles.filtroSelectionToolbarBtn} activeOpacity={0.7} onPress={toggleSelectAllFocos}>
                  <Ionicons name={isAllModalActive ? 'checkbox' : isPartialModalActive ? 'remove-circle' : 'square-outline'} size={18} color={isAllModalActive || isPartialModalActive ? Colors.primary : Colors.textSecondary} style={{ marginRight: 8 }} />
                  <Text style={styles.filtroSelectionToolbarBtnText}>{isAllModalActive ? 'Desmarcar todos' : 'Selecionar todos'}</Text>
                </TouchableOpacity>
                <Text style={styles.filtroSelectionCountText}>{matchingCount} {matchingCount === 1 ? 'questão' : 'questões'}</Text>
              </View>

              <ScrollView style={styles.filtroScroll} contentContainerStyle={styles.filtroScrollContent} showsVerticalScrollIndicator={false}>
                {modalFocosGroups.map((group, gIdx) => {
                  const groupKeys = group.microFocos.map(m => m.key);
                  if (group.geralCount > 0) groupKeys.push(group.geralKey);
                  const activeCountInGroup = groupKeys.filter((k) => modalActiveKeys.has(k)).length;
                  const isGroupAllActive = activeCountInGroup === groupKeys.length;
                  const isGroupPartialActive = activeCountInGroup > 0 && !isGroupAllActive;
                  const hasSubItems = group.microFocos.length > 0 || group.geralCount > 0;

                  return (
                    <View key={`${group.focoNome}-${gIdx}`} style={styles.focoGroupSection}>
                      <TouchableOpacity style={[styles.focoRow, (isGroupAllActive || isGroupPartialActive) && styles.focoRowActive]} activeOpacity={0.7} onPress={() => toggleFocoGroup(group)}>
                        <Ionicons name={isGroupAllActive ? 'checkbox' : isGroupPartialActive ? 'remove-circle' : 'square-outline'} size={19} color={isGroupAllActive || isGroupPartialActive ? Colors.primary : '#525860'} style={{ marginRight: 10 }} />
                        <Text style={[styles.focoTitle, (isGroupAllActive || isGroupPartialActive) && styles.focoTitleActive]} numberOfLines={1}>{group.focoNome}</Text>
                        <Text style={styles.focoBadgeCount}>{group.totalQuestoes}q</Text>
                      </TouchableOpacity>
                      {hasSubItems && (
                        <View style={styles.microFocosSubList}>
                          {group.microFocos.map((mf, mIdx) => (
                            <TouchableOpacity key={`${mf.key}-${mIdx}`} style={styles.microFocoCleanRow} activeOpacity={0.7} onPress={() => toggleModalKey(mf.key)}>
                              <Ionicons name={modalActiveKeys.has(mf.key) ? 'checkbox' : 'square-outline'} size={16} color={modalActiveKeys.has(mf.key) ? Colors.primary : '#454B52'} style={{ marginRight: 8 }} />
                              <Text style={[styles.microFocoCleanText, modalActiveKeys.has(mf.key) && styles.microFocoCleanTextActive]} numberOfLines={1}>{mf.microFocoNome}</Text>
                              <Text style={styles.microFocoCountText}>{mf.totalQuestoes}q</Text>
                            </TouchableOpacity>
                          ))}
                          {group.geralCount > 0 && (
                            <TouchableOpacity style={styles.microFocoCleanRow} activeOpacity={0.7} onPress={() => toggleModalKey(group.geralKey)}>
                              <Ionicons name={modalActiveKeys.has(group.geralKey) ? 'checkbox' : 'square-outline'} size={16} color={modalActiveKeys.has(group.geralKey) ? Colors.primary : '#454B52'} style={{ marginRight: 8 }} />
                              <Text style={[styles.microFocoCleanText, modalActiveKeys.has(group.geralKey) && styles.microFocoCleanTextActive]} numberOfLines={1}>{group.microFocos.length > 0 ? 'Abordagem Geral' : 'Geral'}</Text>
                              <Text style={styles.microFocoCountText}>{group.geralCount}q</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>

              <View style={styles.filtroFooter}>
                <TouchableOpacity style={[styles.filtroPrimaryBtn, matchingCount === 0 && styles.filtroBtnDisabled]} activeOpacity={0.85} disabled={matchingCount === 0} onPress={handleSalvarFiltroNoCarrinho}>
                  <Ionicons name="checkmark" size={18} color="#000000" style={{ marginRight: 6 }} />
                  <Text style={styles.filtroPrimaryBtnText}>Aplicar Filtro ({matchingCount} {matchingCount === 1 ? 'questão' : 'questões'})</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.filtroQuickStartBtn} activeOpacity={0.7} disabled={matchingCount === 0} onPress={handleIniciarComFiltro}>
                  <Ionicons name="play" size={13} color={matchingCount === 0 ? '#555' : Colors.primary} style={{ marginRight: 5 }} />
                  <Text style={[styles.filtroQuickStartBtnText, matchingCount === 0 && { color: '#555' }]}>Iniciar Simulado Agora</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </Modal>

      <Modal visible={showNoThemesModal} transparent={true} animationType="fade" onRequestClose={() => setShowNoThemesModal(false)} statusBarTranslucent={true}>
        <View style={styles.noThemesOverlay}>
          <TouchableOpacity style={styles.noThemesBackdrop} activeOpacity={1} onPress={() => setShowNoThemesModal(false)} />
          <View style={styles.noThemesCard}>
            <View style={styles.noThemesIconBox}><Ionicons name="layers-outline" size={30} color={Colors.primary} /></View>
            <Text style={styles.noThemesTitle}>Nenhum tema selecionado</Text>
            <Text style={styles.noThemesDescription}>Selecione ao menos uma especialidade e tema no catálogo para começar seu treino de questões.</Text>
            <View style={styles.noThemesTipBox}>
              <Ionicons name="bulb-outline" size={17} color={Colors.primary} style={{ marginRight: 8, marginTop: 1 }} />
              <Text style={styles.noThemesTipText}>Toque no card de qualquer especialidade para marcar temas específicos ou selecionar todos.</Text>
            </View>
            <TouchableOpacity style={styles.noThemesPrimaryBtn} activeOpacity={0.85} onPress={() => setShowNoThemesModal(false)}>
              <Ionicons name="grid-outline" size={18} color="#000000" style={{ marginRight: 8 }} />
              <Text style={styles.noThemesPrimaryBtnText}>Entendido, vou selecionar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.noThemesCloseBtn} activeOpacity={0.7} onPress={() => setShowNoThemesModal(false)}>
              <Text style={styles.noThemesCloseBtnText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function createStyles(theme: ActiveThemeColors, isDark: boolean) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: theme.background },
    headerContainer: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      backgroundColor: theme.background,
    },
    headerTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    headerIcon: {
      marginRight: 10,
    },
    headerTitle: {
      fontSize: 24,
      fontWeight: '800',
      color: theme.text,
      letterSpacing: -0.5,
    },
    headerSubtitle: {
      fontSize: 14,
      color: theme.textSecondary,
      marginTop: 4,
      lineHeight: 20,
      textAlign: 'left',
    },
    topHeaderContainer: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 6,
    },
    topHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 2,
    },
    searchIconButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchIconButtonActive: {
      backgroundColor: theme.primarySubtle,
      borderColor: theme.primary,
    },
    topHeaderCenter: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    screenMainTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.text,
      letterSpacing: -0.3,
      textAlign: 'center',
    },
    topHeaderCartSubtext: {
      fontSize: 11,
      color: theme.primary,
      fontWeight: '700',
      marginTop: 2,
    },
    menuIconButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    menuIconButtonActive: {
      backgroundColor: theme.primarySubtle,
      borderColor: theme.primary,
    },
    menuActiveDot: {
      position: 'absolute',
      top: 6,
      right: 6,
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: theme.primary,
    },
    searchBarRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 12,
      paddingVertical: Platform.OS === 'ios' ? 10 : 6,
      marginTop: 10,
    },
    searchIcon: { marginRight: 8 },
    searchInput: { flex: 1, color: theme.text, fontSize: 14, height: '100%', paddingVertical: 0 },
    searchSummaryContainer: { paddingVertical: 8, paddingHorizontal: 4, marginBottom: 4 },
    searchSummaryText: { fontSize: 13, color: theme.textSecondary, fontWeight: '600' },

    headerSimuladoPill: {
      backgroundColor: theme.primarySubtle,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: theme.primaryBorder,
      marginTop: 3,
    },
    headerSimuladoPillText: {
      color: theme.primary,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },

    simuladoBottomBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.primarySubtle,
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: theme.primaryBorder,
      alignSelf: 'flex-start',
      marginBottom: 4,
    },
    simuladoBottomBannerText: {
      fontSize: 10,
      fontWeight: '700',
      color: theme.primary,
      textTransform: 'uppercase',
    },

    // Menu de Contexto (Dropdown Flutuante)
    contextMenuBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.35)',
    },
    contextMenuContainer: {
      position: 'absolute',
      top: Platform.OS === 'ios' ? 144 : 138,
      right: 14,
      width: 295,
      backgroundColor: theme.surface,
      borderRadius: 16,
      paddingVertical: 8,
      paddingHorizontal: 8,
      borderWidth: 1,
      borderColor: theme.border,
      elevation: isDark ? 8 : 1,
      shadowOpacity: isDark ? 0.3 : 0.05,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 8,
    },
    contextMenuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRadius: 10,
    },
    contextIconBox: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 11,
    },
    contextCheckbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.backgroundSecondary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    contextCheckboxChecked: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    contextMenuLabel: {
      flex: 1,
      fontSize: 14,
      fontWeight: '600',
      color: theme.text,
    },
    contextMenuLabelActive: {
      color: theme.text,
      fontWeight: '700',
    },
    contextHelpBtn: {
      padding: 6,
      marginRight: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    contextMenuDivider: {
      height: 1,
      backgroundColor: theme.borderSubtle,
      marginVertical: 4,
      marginHorizontal: 8,
    },

    // Modal Explicativo do Modo Simulado
    simuladoInfoBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 20,
    },
    simuladoInfoDismiss: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    },
    simuladoInfoCard: {
      width: '100%',
      maxWidth: 390,
      backgroundColor: theme.surface,
      borderRadius: 20,
      padding: 22,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.border,
      elevation: 0,
      shadowOpacity: 0,
    },
    simuladoInfoIconBox: {
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: theme.primarySubtle,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.primaryBorder,
      marginBottom: 12,
    },
    simuladoInfoTitle: {
      fontSize: 19,
      fontWeight: '800',
      color: theme.text,
      textAlign: 'center',
      letterSpacing: -0.3,
    },
    simuladoInfoSubtitle: {
      fontSize: 12,
      color: theme.textSecondary,
      fontWeight: '600',
      marginTop: 2,
      marginBottom: 18,
    },
    simuladoInfoList: {
      width: '100%',
      gap: 10,
      marginBottom: 20,
    },
    simuladoInfoRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: theme.backgroundSecondary,
      padding: 11,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
    },
    simuladoInfoRowIcon: {
      marginTop: 1,
      marginRight: 10,
    },
    simuladoInfoRowTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.text,
      marginBottom: 2,
    },
    simuladoInfoRowDesc: {
      fontSize: 11.5,
      color: theme.textSecondary,
      lineHeight: 16,
    },
    simuladoInfoBtn: {
      backgroundColor: theme.primary,
      height: 46,
      borderRadius: 12,
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 0,
      shadowOpacity: 0,
    },
    simuladoInfoBtnText: {
      fontSize: 14,
      fontWeight: '800',
      color: '#FFFFFF',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },

    contentContainer: { flex: 1, backgroundColor: theme.background },
    listContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 },
    listHeaderContainer: { marginBottom: 14, paddingHorizontal: 2 },
    listHeaderTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
    sectionMainTitle: { fontSize: 17, fontWeight: '700', color: theme.text, letterSpacing: -0.3 },
    cartBadgeContainer: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', backgroundColor: theme.primarySubtle, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: theme.primaryBorder, marginTop: 6 },
    cartBadgeText: { fontSize: 10, fontWeight: '700', color: theme.primary, textTransform: 'uppercase' },
    columnWrapper: { justifyContent: 'space-between', marginBottom: 12 },
    bottomDrawer: {
      position: 'absolute',
      bottom: 82,
      left: 16,
      right: 16,
      backgroundColor: theme.surface,
      borderRadius: 20,
      overflow: 'hidden',
      paddingHorizontal: 16,
      paddingTop: 10,
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.35 : 0.08,
      shadowRadius: 12,
      elevation: 6,
      zIndex: 999,
    },
    cartActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    cartStartButton: { flex: 1, height: 52, backgroundColor: theme.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, elevation: 0, shadowOpacity: 0 },
    cartStartButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
    cartStartButtonSubtext: { fontSize: 10, fontWeight: '600', color: 'rgba(255, 255, 255, 0.8)', marginTop: 1 },
    limitBox: { width: 78, height: 52, backgroundColor: theme.surfaceCard, borderRadius: 12, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center', paddingVertical: 4, paddingHorizontal: 6 },
    limitLabel: { fontSize: 8.5, fontWeight: '700', color: theme.textSecondary, letterSpacing: 0.5, marginBottom: 1 },
    limitInput: { fontSize: 18, fontWeight: '800', color: theme.primary, textAlign: 'center', padding: 0, margin: 0, width: '100%' },
    cartThemesWrapper: { marginBottom: 10, marginTop: 2 },
    cartThemesScrollContent: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2, paddingHorizontal: 2 },
    cartThemeChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surfaceCard, borderWidth: 1, borderColor: theme.border, borderRadius: 20, paddingVertical: 6, paddingLeft: 12, paddingRight: 8, gap: 6 },
    cartThemeChipText: { fontSize: 12, fontWeight: '600', color: theme.text, maxWidth: 160 },
    cartThemeRemoveButton: { alignItems: 'center', justifyContent: 'center' },
    gridCard: { width: '48.5%', minHeight: 140, backgroundColor: theme.surfaceCard, borderRadius: 16, paddingVertical: 20, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.border, elevation: 0, shadowOpacity: 0, position: 'relative' },
    gridCardSelected: { borderColor: theme.primary, backgroundColor: theme.primarySubtle },
    selectedBadge: { position: 'absolute', top: 10, right: 10, backgroundColor: theme.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, gap: 2 },
    selectedBadgeCount: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
    cardIconBox: { marginBottom: 12, alignItems: 'center', justifyContent: 'center' },
    cardTitle: { fontSize: 15, fontWeight: '700', color: theme.text, textAlign: 'center', marginBottom: 6 },
    cardTitleSelected: { color: theme.text },
    cardCount: { fontSize: 12, fontWeight: '500', color: theme.textSecondary, textAlign: 'center' },
    cardCountSelected: { color: theme.textSecondary, fontWeight: '700' },
    cardMatchThemeBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.primarySubtle, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: theme.primaryBorder, maxWidth: '96%', marginTop: 2 },
    cardMatchThemeText: { fontSize: 10, fontWeight: '700', color: theme.primary, textTransform: 'uppercase', flexShrink: 1 },
    emptyContainer: { marginTop: 60, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: theme.surfaceCard, borderRadius: 16, borderWidth: 1, borderColor: theme.border, elevation: 0 },
    emptyIconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: theme.backgroundSecondary, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: theme.text, textAlign: 'center', marginBottom: 8 },
    emptySubtitle: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 20, paddingHorizontal: 8 },
    emptyButton: { backgroundColor: theme.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10, elevation: 0 },
    emptyButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.6)', justifyContent: 'flex-end' },
    modalDismissArea: { flex: 1 },
    modalContent: { backgroundColor: theme.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: theme.border, maxHeight: '88%', minHeight: '65%', paddingBottom: Platform.OS === 'ios' ? 32 : 20 },
    modalHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: isDark ? '#3E4247' : '#D1D1CE', alignSelf: 'center', marginTop: 10, marginBottom: 12 },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 14 },
    modalHeaderInfo: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 },
    modalIconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: theme.surfaceCard, alignItems: 'center', justifyContent: 'center', marginRight: 12, borderWidth: 1, borderColor: theme.border },
    modalTitle: { fontSize: 18, fontWeight: '800', color: theme.text },
    modalSubtitle: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
    modalCloseButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: theme.surfaceCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.border },
    modalSearchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surfaceCard, marginHorizontal: 20, borderRadius: 12, paddingHorizontal: 12, height: 44, borderWidth: 1, borderColor: theme.border, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: isDark ? 0.25 : 0.04, shadowRadius: 3, elevation: 1 },
    modalSearchInput: { flex: 1, fontSize: 14, color: theme.text, height: '100%' },
    modalActionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 12 },
    modalActionsSummary: { fontSize: 13, color: theme.textSecondary },
    modalSelectAllButton: { fontSize: 13, fontWeight: '700', color: isDark ? '#E5E7EB' : '#37352F' },
    modalLoadingContainer: { paddingVertical: 50, alignItems: 'center', justifyContent: 'center' },
    modalLoadingText: { marginTop: 12, fontSize: 14, color: theme.textSecondary },
    modalColumnWrapper: { justifyContent: 'space-between', marginBottom: 10 },
    modalListContent: { paddingHorizontal: 20, paddingBottom: 16 },
    themeGridCard: {
      width: '48.5%',
      minHeight: 96,
      backgroundColor: theme.surfaceCard,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: theme.border,
      position: 'relative',
      justifyContent: 'space-between',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.35 : 0.06,
      shadowRadius: 6,
      elevation: isDark ? 4 : 2,
    },
    themeGridCardSelected: {
      borderColor: isDark ? '#9CA3AF' : '#37352F',
      borderWidth: 1.5,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#FFFFFF',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: isDark ? 0.45 : 0.10,
      shadowRadius: 8,
      elevation: isDark ? 5 : 3,
    },
    themeCheckHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    cardFilterIconBtn: { padding: 2, borderRadius: 6 },
    themeGridCardFiltered: {
      borderColor: isDark ? '#9CA3AF' : '#37352F',
      borderWidth: 1.5,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#FFFFFF',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: isDark ? 0.45 : 0.10,
      shadowRadius: 8,
      elevation: isDark ? 5 : 3,
    },
    themeCardFooterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
    cardFilterPill: { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(55, 53, 47, 0.08)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(55, 53, 47, 0.2)' },
    cardFilterPillText: { fontSize: 9, fontWeight: '700', color: isDark ? '#E5E7EB' : '#37352F', letterSpacing: 0.2, textTransform: 'uppercase' },
    cartThemeChipFiltered: { borderColor: isDark ? '#9CA3AF' : '#37352F', backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(55, 53, 47, 0.06)' },
    cartThemeChipTextFiltered: { color: isDark ? '#E5E7EB' : '#37352F', fontWeight: '700' },
    themeCheckCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: isDark ? '#6B7280' : '#D1D5DB', alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
    themeCheckCircleSelected: { backgroundColor: isDark ? '#4B5563' : '#37352F', borderColor: isDark ? '#4B5563' : '#37352F' },
    themeCardTitle: { fontSize: 13, fontWeight: '700', color: theme.text, marginBottom: 4 },
    themeCardTitleSelected: { color: theme.text },
    themeMatchBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(55, 53, 47, 0.08)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(55, 53, 47, 0.2)', marginBottom: 4, alignSelf: 'flex-start', maxWidth: '100%' },
    themeMatchBadgeText: { fontSize: 10, fontWeight: '700', color: isDark ? '#E5E7EB' : '#37352F', textTransform: 'uppercase', flexShrink: 1 },
    themeCardCount: { fontSize: 11, color: theme.textSecondary, fontWeight: '500' },
    themeCardCountSelected: { color: theme.text, fontWeight: '700' },
    modalEmptyContainer: { paddingVertical: 36, alignItems: 'center', justifyContent: 'center' },
    modalEmptyText: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', paddingHorizontal: 20 },
    modalFooter: { paddingHorizontal: 20, paddingTop: 10 },
    modalDoneButton: { backgroundColor: isDark ? '#2A2E33' : '#37352F', paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: isDark ? 0.3 : 0.1, shadowRadius: 4, elevation: 2 },
    modalDoneButtonText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: 0.5 },
    activeSessionText: { color: theme.primary, fontSize: 14, fontWeight: '800', textAlign: 'center', paddingVertical: 2 },
    filtroOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0, 0, 0, 0.65)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, zIndex: 9999 },
    filtroBackdropDismiss: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
    filtroCard: { width: '100%', maxWidth: 420, maxHeight: '85%', backgroundColor: theme.surface, borderRadius: 16, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 14, borderWidth: 1, borderColor: theme.border, elevation: 0, shadowOpacity: 0 },
    filtroHeader: { marginBottom: 8 },
    filtroHeaderTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    filtroHeaderTitleRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 },
    filtroTitle: { fontSize: 16, fontWeight: '800', color: theme.text, flexShrink: 1 },
    filtroCloseBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: theme.surfaceCard, alignItems: 'center', justifyContent: 'center' },
    filtroSubtitle: { fontSize: 12, color: theme.textSecondary, marginTop: 3 },
    filtroSelectionToolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.borderSubtle, marginBottom: 6 },
    filtroSelectionToolbarBtn: { flexDirection: 'row', alignItems: 'center' },
    filtroSelectionToolbarBtnText: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },
    filtroSelectionCountText: { fontSize: 12, fontWeight: '700', color: theme.primary },
    filtroScroll: { maxHeight: 340, marginVertical: 4 },
    filtroScrollContent: { paddingVertical: 4, gap: 6 },
    focoGroupSection: { borderRadius: 12, overflow: 'hidden', backgroundColor: theme.backgroundSecondary, borderWidth: 1, borderColor: theme.border },
    focoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, backgroundColor: theme.surfaceCard },
    focoRowActive: { backgroundColor: theme.primarySubtle },
    focoTitle: { fontSize: 14, fontWeight: '700', color: theme.text, flex: 1 },
    focoTitleActive: { color: theme.text, fontWeight: '800' },
    focoBadgeCount: { fontSize: 11, fontWeight: '600', color: theme.textSecondary, marginLeft: 6 },
    microFocosSubList: { paddingLeft: 30, paddingRight: 12, paddingVertical: 4, backgroundColor: theme.backgroundSecondary, borderTopWidth: 1, borderTopColor: theme.borderSubtle },
    microFocoCleanRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
    microFocoCleanText: { fontSize: 12, fontWeight: '500', color: theme.textSecondary, flex: 1 },
    microFocoCleanTextActive: { color: theme.text, fontWeight: '600' },
    microFocoCountText: { fontSize: 11, fontWeight: '500', color: theme.textMuted, marginLeft: 6 },
    filtroFooter: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.borderSubtle, alignItems: 'center', gap: 6 },
    filtroPrimaryBtn: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.primary, borderRadius: 12, height: 48 },
    filtroPrimaryBtnText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: 0.5 },
    filtroQuickStartBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 6, paddingHorizontal: 12 },
    filtroQuickStartBtnText: { fontSize: 12, fontWeight: '700', color: theme.primary },
    filtroBtnDisabled: { opacity: 0.35 },
    noThemesOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.65)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
    noThemesBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    noThemesCard: { width: '100%', maxWidth: 380, backgroundColor: theme.surface, borderRadius: 20, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: theme.border, elevation: 0, shadowOpacity: 0 },
    noThemesIconBox: { width: 60, height: 60, borderRadius: 30, backgroundColor: theme.primarySubtle, borderWidth: 1, borderColor: theme.primaryBorder, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    noThemesTitle: { fontSize: 20, fontWeight: '800', color: theme.text, textAlign: 'center', letterSpacing: -0.3, marginBottom: 8 },
    noThemesDescription: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 21, marginBottom: 18 },
    noThemesTipBox: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: theme.backgroundSecondary, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: theme.border, marginBottom: 20, width: '100%' },
    noThemesTipText: { flex: 1, fontSize: 13, color: theme.textSecondary, lineHeight: 18 },
    noThemesPrimaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.primary, height: 48, borderRadius: 14, width: '100%', marginBottom: 8, elevation: 0, shadowOpacity: 0 },
    noThemesPrimaryBtnText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: 0.5 },
    noThemesCloseBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 10, width: '100%' },
    noThemesCloseBtnText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
  });
}