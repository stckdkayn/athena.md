import AsyncStorage from '@react-native-async-storage/async-storage';

// Interface padronizada compatível com a API de alta performance do MMKV
export interface AthenaStorage {
  getString: (key: string) => string | undefined;
  set: (key: string, value: string | boolean | number) => void;
  getBoolean: (key: string) => boolean | undefined;
  contains: (key: string) => boolean;
  remove: (key: string) => boolean;
  delete: (key: string) => boolean;
  clearAll: () => void;
  getAllKeys: () => string[];
}

// Chaves históricas do Athena.md para migração e pré-carregamento transparente
const KNOWN_STORAGE_KEYS = [
  '@athena_progress',
  '@athena_user_name',
  '@athena_meta_questoes_diaria',
  '@athena_filtros_simulado',
  '@athena_quiz_limit',
  '@athena_cart',
  '@athena_favoritos',
  '@athena_cronograma_days',
  '@athena_cronograma_progresso_topicos',
  '@athena_cronograma_salvo',
  '@athena_active_quiz_session',
  '@athena_github_sync_metadata',
  '@athena_github_sync_config',
  '@athena_github_token',
  '@athena_github_sync_status',
  '@athena_cronograma_data_inicio',
  '@athena_semana_ativa',
];

// Cache em memória para garantir leituras e escritas 100% síncronas no Expo Go e Web
const memoryStore = new Map<string, string>();

// Pré-carrega de forma imediata o AsyncStorage no cache em memória
AsyncStorage.getAllKeys()
  .then((keys) => {
    const all = Array.from(new Set([...keys, ...KNOWN_STORAGE_KEYS]));
    return AsyncStorage.multiGet(all);
  })
  .then((entries) => {
    for (const [k, v] of entries) {
      if (v !== null && v !== undefined && !memoryStore.has(k)) {
        memoryStore.set(k, v);
      }
    }
  })
  .catch((err) => {
    console.warn('[storage] Aviso ao pré-carregar cache em memória do AsyncStorage:', err);
  });

// Implementação de Fallback (Expo Go, Web, Testes)
const fallbackStorage: AthenaStorage = {
  getString: (key: string) => {
    const val = memoryStore.get(key);
    return typeof val === 'string' ? val : undefined;
  },
  set: (key: string, value: string | boolean | number) => {
    const strVal = String(value);
    memoryStore.set(key, strVal);
    // Persistência assíncrona não-bloqueante no disco
    AsyncStorage.setItem(key, strVal).catch(() => {});
  },
  getBoolean: (key: string) => {
    const val = memoryStore.get(key);
    if (val === 'true') return true;
    if (val === 'false') return false;
    return undefined;
  },
  contains: (key: string) => {
    return memoryStore.has(key);
  },
  remove: (key: string) => {
    const existed = memoryStore.delete(key);
    AsyncStorage.removeItem(key).catch(() => {});
    return existed;
  },
  delete: (key: string) => {
    const existed = memoryStore.delete(key);
    AsyncStorage.removeItem(key).catch(() => {});
    return existed;
  },
  clearAll: () => {
    memoryStore.clear();
    AsyncStorage.clear().catch(() => {});
  },
  getAllKeys: () => {
    return Array.from(memoryStore.keys());
  },
};

// Tenta inicializar o MMKV nativo (disponível em Dev Builds compilados e APKs de produção)
let activeStorage: AthenaStorage = fallbackStorage;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createMMKV } = require('react-native-mmkv');
  const mmkvInstance = createMMKV({ id: 'athena-storage' });
  if (mmkvInstance) {
    if (typeof mmkvInstance.delete !== 'function') {
      mmkvInstance.delete = (key: string) => mmkvInstance.remove(key);
    }
    activeStorage = mmkvInstance as AthenaStorage;
  }
} catch {
  // No Expo Go clássico ou Web, NitroModules nativos não existem.
  // O fallbackStorage assume de forma transparente e 100% síncrona.
  activeStorage = fallbackStorage;
}

export const storage: AthenaStorage = activeStorage;

/**
 * Migra os dados previamente salvos no AsyncStorage para o MMKV de forma síncrona/transparente.
 * Executada apenas uma vez para não impactar novas execuções.
 */
export async function migrateAsyncStorageToMMKV(): Promise<void> {
  const MIGRATED_FLAG = '@athena_migrated_mmkv_v1';
  if (storage.getBoolean(MIGRATED_FLAG)) {
    return;
  }

  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const keysToMigrate = Array.from(new Set([...allKeys, ...KNOWN_STORAGE_KEYS]));

    for (const key of keysToMigrate) {
      if (!storage.contains(key)) {
        const val = await AsyncStorage.getItem(key);
        if (val !== null && val !== undefined) {
          storage.set(key, val);
        }
      }
    }

    storage.set(MIGRATED_FLAG, true);
    console.log('[storage] Migração transparente AsyncStorage -> MMKV concluída!');
  } catch (err) {
    console.warn('[storage] Falha ao migrar chaves do AsyncStorage:', err);
  }
}
