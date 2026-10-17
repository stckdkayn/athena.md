import { storage } from './storage';
import * as FileSystem from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { unzip } from 'react-native-zip-archive';
import { getQuestoesCache, setQuestoesCache, saveQuestoesStorage } from './questionService';
import { invalidateImageCache } from './imageService';
import {
  CronogramaData,
  parseAndValidateCronogramaJson,
  saveCronograma,
} from './scheduleService';
import {
  TAGS_MAIORES_PADRAO,
  TagMaiorPadrao,
  isTagMaior,
  formatarNomeBanco,
  formatarNomeEspecialidade,
  resolverEspecialidadeDoBanco,
} from './specialtyResolver';

export interface GitHubConfig {
  owner: string;
  repo: string;
  branch: string;
  indexPath: string;
  token: string;
}

export interface IndexItem {
  versao: number | string;
  hash?: string;
  url: string;
}

export interface IndexSchema {
  versao?: number | string;
  bancos?: Record<string, IndexItem>;
  pacotes_imagens?: Record<string, IndexItem>;
  cronograma?: IndexItem | string;
}

export interface SyncMetadata {
  versao?: number | string;
  bancos: Record<string, number | string>;
  pacotes_imagens: Record<string, number | string>;
  ultimaSincronizacao: string | null;
}

export type BankSyncStatus = 'atualizacao' | 'novo' | 'atualizado';

export interface BankSyncItem {
  nome: string;
  item: IndexItem;
  versaoLocal?: number | string;
  status: BankSyncStatus;
  instalado: boolean;
  especialidade?: string;
}

export interface PacoteSyncItem {
  nome: string;
  item: IndexItem;
  versaoLocal?: number | string;
  status: BankSyncStatus;
  instalado: boolean;
}

export interface SpecialtySyncItem {
  nome: string; // Ex: "Cardiologia", "Ginecologia"
  status: BankSyncStatus;
  instalado: boolean;
  bancos: BankSyncItem[];
  pacotesImagens: PacoteSyncItem[];
  versaoRemota: number | string;
  versaoLocal?: number | string;
  temasNomes: string[];
}

export interface SyncCheckResult {
  temAtualizacao: boolean;
  remoteVersaoGlobal?: number | string;
  localVersaoGlobal?: number | string;
  especialidades: SpecialtySyncItem[];
  especialidadesComAtualizacao: SpecialtySyncItem[];
  novasEspecialidades: SpecialtySyncItem[];
  todosBancos: BankSyncItem[];
  todosPacotes: PacoteSyncItem[];
  bancosComAtualizacao: BankSyncItem[];
  novosBancosDisponiveis: BankSyncItem[];
  pacotesComAtualizacao: PacoteSyncItem[];
  novosPacotesDisponiveis: PacoteSyncItem[];
  bancosParaBaixar: BankSyncItem[];
  pacotesParaBaixar: PacoteSyncItem[];
  totalBancosRemotos: number;
  totalPacotesRemotos: number;
  totalEspecialidadesRemotas: number;
  totalAtualizacoes: number;
  totalNovos: number;
}

export interface SyncOptions {
  config?: Partial<GitHubConfig>;
  onProgress?: SyncProgressCallback;
  forceAll?: boolean;
  selectedEspecialidades?: string[]; // Nomes das especialidades selecionadas (ex: ["Cardiologia", "Ginecologia"])
  selectedBancos?: string[];
  selectedPacotes?: string[];
  baixarImagens?: boolean;
}

export interface UpdateNotificationStatus {
  hasUpdate: boolean;
  totalBancosNovos: number;
  totalPacotesNovos: number;
  remoteVersao?: number | string;
  checkedAt?: number;
}

export type SyncStep =
  | 'verificando'
  | 'baixando_questoes'
  | 'processando_questoes'
  | 'baixando_imagens'
  | 'descompactando_imagens'
  | 'salvando'
  | 'concluido'
  | 'erro';

export interface SyncProgress {
  etapa: SyncStep;
  progressoAtual: number;
  totalItens: number;
  mensagem: string;
  detalhe?: string;
}

export type SyncProgressCallback = (status: SyncProgress) => void;

export interface SyncResult {
  sucesso: boolean;
  questoesAdicionadas: number;
  questoesAtualizadas: number;
  imagensExtraidas: number;
  totalQuestoesFinal: number;
  bancosSincronizados: string[];
  pacotesSincronizados: string[];
  mensagem: string;
  erro?: string;
}

const STORAGE_KEY_CONFIG = '@athena_github_config';
const STORAGE_KEY_METADATA = '@athena_github_sync_metadata';
const STORAGE_KEY_TOKEN = '@athena_github_token';
const STORAGE_KEY_UPDATE_STATUS = '@athena_update_status';

let currentUpdateStatus: UpdateNotificationStatus = {
  hasUpdate: false,
  totalBancosNovos: 0,
  totalPacotesNovos: 0,
};

type UpdateListener = (status: UpdateNotificationStatus) => void;
const updateListeners = new Set<UpdateListener>();

export function subscribeToUpdateStatus(listener: UpdateListener): () => void {
  updateListeners.add(listener);
  getUpdateStatus().then(listener).catch(() => {});
  return () => {
    updateListeners.delete(listener);
  };
}

function notifyUpdateListeners(status: UpdateNotificationStatus) {
  currentUpdateStatus = status;
  for (const listener of updateListeners) {
    try {
      listener(status);
    } catch (e) {
      console.warn('Erro ao notificar listener de update:', e);
    }
  }
}

export async function getUpdateStatus(): Promise<UpdateNotificationStatus> {
  if (currentUpdateStatus.checkedAt) {
    return currentUpdateStatus;
  }
  try {
    const raw = storage.getString(STORAGE_KEY_UPDATE_STATUS);
    if (raw) {
      const parsed = JSON.parse(raw);
      currentUpdateStatus = {
        hasUpdate: Boolean(parsed.hasUpdate),
        totalBancosNovos: parsed.totalBancosNovos || 0,
        totalPacotesNovos: parsed.totalPacotesNovos || 0,
        remoteVersao: parsed.remoteVersao,
        checkedAt: parsed.checkedAt,
      };
      return currentUpdateStatus;
    }
  } catch {}
  return currentUpdateStatus;
}

export async function setUpdateStatus(status: UpdateNotificationStatus): Promise<void> {
  currentUpdateStatus = status;
  try {
    storage.set(STORAGE_KEY_UPDATE_STATUS, JSON.stringify(status));
  } catch (err) {
    console.warn('Erro ao salvar status de atualização:', err);
  }
  notifyUpdateListeners(status);
}

export async function clearUpdateStatus(): Promise<void> {
  const status: UpdateNotificationStatus = {
    hasUpdate: false,
    totalBancosNovos: 0,
    totalPacotesNovos: 0,
    checkedAt: Date.now(),
  };
  await setUpdateStatus(status);
}

let lastCheckTime = 0;
const CHECK_COOLDOWN_MS = 60 * 1000; // 1 minuto de intervalo mínimo entre checagens automáticas

export async function checkSilentUpdates(force = false): Promise<UpdateNotificationStatus> {
  const now = Date.now();
  if (!force && now - lastCheckTime < CHECK_COOLDOWN_MS) {
    return await getUpdateStatus();
  }
  lastCheckTime = now;

  try {
    const config = await getGitHubConfig();
    // Se ainda não configurou repositório, não faz requisição
    if (!config.owner || !config.repo) {
      const status: UpdateNotificationStatus = {
        hasUpdate: false,
        totalBancosNovos: 0,
        totalPacotesNovos: 0,
      };
      await setUpdateStatus(status);
      return status;
    }

    const checkResult = await checkForUpdates(config);
    if (checkResult.temAtualizacao) {
      const status: UpdateNotificationStatus = {
        hasUpdate: true,
        totalBancosNovos: checkResult.especialidadesComAtualizacao.length,
        totalPacotesNovos: checkResult.pacotesComAtualizacao.length,
        remoteVersao: checkResult.remoteVersaoGlobal,
        checkedAt: Date.now(),
      };
      await setUpdateStatus(status);
      return status;
    } else {
      const status: UpdateNotificationStatus = {
        hasUpdate: false,
        totalBancosNovos: 0,
        totalPacotesNovos: 0,
        remoteVersao: checkResult.remoteVersaoGlobal,
        checkedAt: Date.now(),
      };
      await setUpdateStatus(status);
      return status;
    }
  } catch (err) {
    // Checagem silenciosa: falha propositalmente sem disparar erros para o usuário
    return await getUpdateStatus();
  }
}

export const DEFAULT_CONFIG: GitHubConfig = {
  owner: '',
  repo: '',
  branch: 'main',
  indexPath: 'index.json',
  token: '',
};

/**
 * Obtém a configuração de sincronização do GitHub armazenada localmente
 */
export async function getGitHubConfig(override?: Partial<GitHubConfig>): Promise<GitHubConfig> {
  try {
    const raw = storage.getString(STORAGE_KEY_CONFIG);
    const saved = raw ? JSON.parse(raw) : {};

    // Token pode estar salvo separadamente para compatibilidade
    let token = saved.token || '';
    if (!token) {
      const rawToken = storage.getString(STORAGE_KEY_TOKEN);
      if (rawToken) token = rawToken.trim();
    }

    return {
      ...DEFAULT_CONFIG,
      ...saved,
      token,
      ...override,
    };
  } catch {
    return { ...DEFAULT_CONFIG, ...override };
  }
}

/**
 * Salva a configuração do GitHub no armazenamento local
 */
export async function saveGitHubConfig(config: Partial<GitHubConfig>): Promise<void> {
  try {
    const current = await getGitHubConfig();
    const updated = { ...current, ...config };
    storage.set(STORAGE_KEY_CONFIG, JSON.stringify(updated));
    if (updated.token !== undefined) {
      storage.set(STORAGE_KEY_TOKEN, updated.token.trim());
    }
  } catch (err) {
    console.error('Erro ao salvar configuração do GitHub:', err);
  }
}

/**
 * Obtém os metadados de versões já baixadas
 */
export async function getSyncMetadata(): Promise<SyncMetadata> {
  try {
    const raw = storage.getString(STORAGE_KEY_METADATA);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        versao: parsed.versao,
        bancos: parsed.bancos || {},
        pacotes_imagens: parsed.pacotes_imagens || {},
        ultimaSincronizacao: parsed.ultimaSincronizacao || null,
      };
    }
  } catch (err) {
    console.warn('Erro ao ler metadados de sincronização:', err);
  }
  return {
    bancos: {},
    pacotes_imagens: {},
    ultimaSincronizacao: null,
  };
}

/**
 * Salva metadados de versões no armazenamento
 */
export async function saveSyncMetadata(metadata: SyncMetadata): Promise<void> {
  try {
    storage.set(STORAGE_KEY_METADATA, JSON.stringify(metadata));
  } catch (err) {
    console.error('Erro ao salvar metadados de sincronização:', err);
  }
}

/**
 * Limpa os metadados de versão armazenados dos bancos de questões
 */
export async function clearBancosSyncMetadata(): Promise<void> {
  try {
    const meta = await getSyncMetadata();
    meta.bancos = {};
    delete meta.versao;
    meta.ultimaSincronizacao = null;
    await saveSyncMetadata(meta);
  } catch (err) {
    console.error('Erro ao limpar metadados de bancos:', err);
  }
}

/**
 * Reseta todos os metadados de sincronização (bancos, imagens e versões)
 */
export async function resetSyncMetadata(): Promise<void> {
  try {
    storage.remove(STORAGE_KEY_METADATA);
  } catch (err) {
    console.error('Erro ao resetar metadados de sincronização:', err);
  }
}

/**
 * Compara se a versão remota é maior/mais recente que a versão registrada localmente.
 * Suporta inteiros, floats, semver (ex: "1.2.0") e strings.
 * Se a versão local não existir, retorna true (novo arquivo a ser baixado).
 */
export function isRemoteNewer(
  remoteVer: string | number | undefined,
  localVer: string | number | undefined
): boolean {
  if (remoteVer === undefined || remoteVer === null || remoteVer === '') return false;
  if (localVer === undefined || localVer === null || localVer === '') return true;

  if (typeof remoteVer === 'number' && typeof localVer === 'number') {
    return remoteVer > localVer;
  }

  const remoteStr = String(remoteVer).trim();
  const localStr = String(localVer).trim();

  if (remoteStr === localStr) return false;

  const numRemote = Number(remoteStr);
  const numLocal = Number(localStr);
  if (!isNaN(numRemote) && !isNaN(numLocal)) {
    return numRemote > numLocal;
  }

  const remoteParts = remoteStr.split('.').map((p) => parseInt(p, 10));
  const localParts = localStr.split('.').map((p) => parseInt(p, 10));
  const maxLen = Math.max(remoteParts.length, localParts.length);

  for (let i = 0; i < maxLen; i++) {
    const r = isNaN(remoteParts[i]) ? 0 : remoteParts[i];
    const l = isNaN(localParts[i]) ? 0 : localParts[i];
    if (r > l) return true;
    if (r < l) return false;
  }

  return remoteStr.localeCompare(localStr, undefined, { numeric: true }) > 0;
}

/**
 * Extrai e codifica o caminho do arquivo a partir de uma URL ou caminho relativo
 */
function extractAndEncodePath(
  filePathOrUrl: string,
  owner: string,
  repo: string,
  branch: string
): string {
  let cleanPath = filePathOrUrl.trim();

  // Se for URL completa do raw.githubusercontent.com
  const rawPrefix = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/`;
  if (cleanPath.startsWith(rawPrefix)) {
    cleanPath = cleanPath.slice(rawPrefix.length);
  } else if (cleanPath.includes('raw.githubusercontent.com')) {
    // Extrai após o nome da branch
    const parts = cleanPath.split(`/${branch}/`);
    if (parts.length > 1) {
      cleanPath = parts[1];
    }
  }

  // Remove barras iniciais
  cleanPath = cleanPath.replace(/^\/+/, '');

  // Decodifica se já tiver %20 para evitar dupla codificação
  try {
    cleanPath = decodeURIComponent(cleanPath);
  } catch {}

  // Codifica cada segmento de pasta mantendo as barras
  return cleanPath
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

/**
 * Busca e interpreta um arquivo JSON do repositório privado do GitHub
 */
export async function fetchGitHubJson(
  filePathOrUrl: string,
  config: GitHubConfig
): Promise<any> {
  const { token, owner, repo, branch } = config;
  if (!owner || !repo) {
    throw new Error('Repositório não configurado. Por favor, informe o usuário e repositório (ex: usuario/meu-banco).');
  }
  const encodedPath = extractAndEncodePath(filePathOrUrl, owner, repo, branch);

  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${branch}`;
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${encodedPath}`;

  const authHeaders: Record<string, string> = {
    'User-Agent': 'AthenaMD-App',
    Accept: 'application/vnd.github.v3.raw, application/json, text/plain, */*',
  };
  if (token && token.trim()) {
    authHeaders['Authorization'] = `Bearer ${token.trim()}`;
  }

  // 1. Tenta API do GitHub com redirect manual (evita conflito de autorização no AWS S3)
  try {
    const apiRes = await fetch(apiUrl, {
      method: 'GET',
      headers: authHeaders,
      redirect: 'manual',
    });

    if (apiRes.status === 302 || apiRes.status === 301 || apiRes.status === 307) {
      const s3Url = apiRes.headers.get('Location') || apiRes.headers.get('location');
      if (s3Url) {
        const s3Res = await fetch(s3Url);
        if (!s3Res.ok) {
          throw new Error(`Erro ao baixar arquivo do storage (${s3Res.status})`);
        }
        return await s3Res.json();
      }
    }

    if (apiRes.ok) {
      const text = await apiRes.text();
      return JSON.parse(text);
    }

    if (apiRes.status === 401 || apiRes.status === 403) {
      throw new Error(
        'Falha de autenticação no GitHub: Token inválido ou sem permissão de leitura de conteúdo no repositório.'
      );
    }
  } catch (apiErr: any) {
    if (apiErr?.message?.includes('autenticação')) {
      throw apiErr;
    }
    // Falha de rede ou rota na API, prossegue para rawUrl como fallback
  }

  // 2. Fallback: raw.githubusercontent.com
  const rawHeaders: Record<string, string> = {
    'User-Agent': 'AthenaMD-App',
  };
  if (token && token.trim()) {
    rawHeaders['Authorization'] = `token ${token.trim()}`;
  }

  const rawRes = await fetch(rawUrl, {
    method: 'GET',
    headers: rawHeaders,
  });

  if (rawRes.ok) {
    const text = await rawRes.text();
    return JSON.parse(text);
  }

  if (rawRes.status === 401 || rawRes.status === 403 || rawRes.status === 404) {
    if (!token) {
      throw new Error(
        'Repositório privado. É necessário informar um GitHub Personal Access Token para baixar os arquivos.'
      );
    }
    throw new Error(
      `Não foi possível acessar o arquivo no repositório (${rawRes.status}). Verifique o token, nome do repositório ou caminho.`
    );
  }

  throw new Error(`Erro HTTP ${rawRes.status} ao acessar ${rawUrl}`);
}

/**
 * Normaliza os campos de uma questão para o padrão do AthenaMD
 */
export function normalizeQuestion(
  item: any,
  idx: number,
  fallbackOrigem: string = 'banco_geral',
  forcedSpecialty?: string
): any {
  if (!item || typeof item !== 'object') return item;

  const hasBagagemTag =
    Array.isArray(item.tags) &&
    item.tags.some(
      (t: any) => typeof t === 'string' && t.trim().toLowerCase() === 'bagagem'
    );

  let esp: string;
  if (hasBagagemTag) {
    esp = 'Bagagem';
  } else if (forcedSpecialty && isTagMaior(forcedSpecialty)) {
    esp = isTagMaior(forcedSpecialty)!;
  } else {
    const rawCandidate =
      item.tagMaior ||
      item.tag_maior ||
      (forcedSpecialty ? forcedSpecialty : undefined) ||
      (Array.isArray(item.tags) && item.tags.length > 0 ? item.tags[0] : undefined) ||
      item.especialidade ||
      item.specialty ||
      item.area ||
      item.grandeArea ||
      fallbackOrigem;
    esp = resolverEspecialidadeDoBanco(fallbackOrigem, { ...item, especialidade: rawCandidate });
  }

  const espNorm = esp.toLowerCase();

  let tema =
    item.tema_principal ||
    item.tema ||
    item.subtema ||
    item.topic ||
    item.assunto;

  // Se o tema explícito for idêntico à especialidade mãe ou for uma Tag Maior, desconsidera
  if (tema && typeof tema === 'string' && (tema.trim().toLowerCase() === espNorm || isTagMaior(tema))) {
    tema = undefined;
  }

  // Se item.especialidade continha na verdade um tema (ex: "Avaliação da Vitalidade Fetal")
  if (!tema && item.especialidade && typeof item.especialidade === 'string') {
    const origEsp = item.especialidade.trim();
    if (origEsp.toLowerCase() !== espNorm && !isTagMaior(origEsp)) {
      tema = origEsp;
    }
  }

  if (!tema && Array.isArray(item.tags) && item.tags.length > 0) {
    const nonBagagem = item.tags.filter(
      (t: any) => typeof t === 'string' && t.trim().toLowerCase() !== 'bagagem'
    );
    const tagDiferente = nonBagagem.find((t: any) => {
      const s = String(t).trim();
      return s.toLowerCase() !== espNorm && !isTagMaior(s);
    });
    if (tagDiferente) {
      tema = String(tagDiferente).trim();
    } else if (nonBagagem.length > 1) {
      tema = String(nonBagagem[1]).trim();
    }
  }

  if (!tema && fallbackOrigem && fallbackOrigem !== 'banco_geral') {
    let cleanOrigin = formatarNomeBanco(fallbackOrigem);
    if (cleanOrigin.toLowerCase().startsWith(espNorm)) {
      cleanOrigin = cleanOrigin.slice(espNorm.length).replace(/^[\s\-_:]+/, '').trim();
    }
    if (cleanOrigin && cleanOrigin.toLowerCase() !== espNorm && !isTagMaior(cleanOrigin)) {
      tema = cleanOrigin;
    }
  }

  if (!tema) tema = 'Tema Geral';

  const foco =
    item.foco_da_questao ||
    item.foco ||
    item.tipo ||
    (Array.isArray(item.tags) && item.tags.length > 2 ? item.tags[2] : undefined) ||
    'Geral';

  const microFoco =
    item.micro_foco ||
    item.microfoco ||
    item.subfoco ||
    (Array.isArray(item.tags) && item.tags.length > 3 ? item.tags[3] : undefined) ||
    '';

  const rawId = item.id ?? item.id_questao ?? `${esp}_${tema}_${idx}`;
  const itemOrigem = item.origem || item.origin || item.pacote || item.banco;
  const finalOrigem =
    itemOrigem && typeof itemOrigem === 'string' && itemOrigem.trim()
      ? itemOrigem.trim()
      : fallbackOrigem;

  let tags = [
    typeof esp === 'string' ? esp.trim() : String(esp),
    typeof tema === 'string' ? tema.trim() : String(tema),
    typeof foco === 'string' ? foco.trim() : String(foco),
  ];
  if (microFoco) {
    tags.push(typeof microFoco === 'string' ? microFoco.trim() : String(microFoco));
  }

  return {
    ...item,
    id: String(rawId).trim(),
    tagMaior: typeof esp === 'string' ? esp.trim() : String(esp),
    tag_maior: typeof esp === 'string' ? esp.trim() : String(esp),
    especialidade: typeof esp === 'string' ? esp.trim() : String(esp),
    tema: typeof tema === 'string' ? tema.trim() : String(tema),
    tema_principal: typeof tema === 'string' ? tema.trim() : String(tema),
    foco: typeof foco === 'string' ? foco.trim() : String(foco),
    foco_da_questao: typeof foco === 'string' ? foco.trim() : String(foco),
    micro_foco: typeof microFoco === 'string' ? microFoco.trim() : microFoco ? String(microFoco).trim() : '',
    microfoco: typeof microFoco === 'string' ? microFoco.trim() : microFoco ? String(microFoco).trim() : '',
    tags,
    origem: finalOrigem,
  };
}

/**
 * Baixa e descompacta um pacote ZIP de imagens do GitHub
 */
export async function downloadAndExtractZip(
  filePathOrUrl: string,
  subfolderName: string,
  config: GitHubConfig,
  onProgressDetail?: (msg: string) => void
): Promise<number> {
  const { token, owner, repo, branch } = config;
  const encodedPath = extractAndEncodePath(filePathOrUrl, owner, repo, branch);

  const baseDir =
    FileSystemLegacy.documentDirectory ||
    (FileSystem as any).documentDirectory ||
    (FileSystem.Paths?.document?.uri ? `${FileSystem.Paths.document.uri}/` : '');
  const athenaImagensDir = baseDir.endsWith('/') ? `${baseDir}AthenaImagens/` : `${baseDir}/AthenaImagens/`;

  const baseInfo = await FileSystemLegacy.getInfoAsync(athenaImagensDir);
  if (!baseInfo.exists) {
    await FileSystemLegacy.makeDirectoryAsync(athenaImagensDir, { intermediates: true });
  }

  const cleanSub = subfolderName
    .replace(/_imagens\.zip$/i, '')
    .replace(/\.zip$/i, '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .toLowerCase();

  const targetDir = `${athenaImagensDir}${cleanSub}/`;
  const dirInfo = await FileSystemLegacy.getInfoAsync(targetDir);
  if (!dirInfo.exists) {
    await FileSystemLegacy.makeDirectoryAsync(targetDir, { intermediates: true });
  }

  const tempZipLocalPath = `${athenaImagensDir}_staging_sync_${Date.now()}.zip`;
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${branch}`;

  let downloadUrl = apiUrl;
  let downloadHeaders: Record<string, string> = {
    'User-Agent': 'AthenaMD-App',
    Accept: 'application/vnd.github.v3.raw',
  };
  if (token && token.trim()) {
    downloadHeaders['Authorization'] = `Bearer ${token.trim()}`;
  }

  // Verifica se a API do GitHub responde com redirect 302 para pre-signed S3
  try {
    const probeRes = await fetch(apiUrl, {
      method: 'GET',
      headers: downloadHeaders,
      redirect: 'manual',
    });

    if (probeRes.status === 302 || probeRes.status === 301 || probeRes.status === 307) {
      const s3Url = probeRes.headers.get('Location') || probeRes.headers.get('location');
      if (s3Url) {
        downloadUrl = s3Url;
        downloadHeaders = {}; // S3 pre-signed URL não aceita cabeçalho Authorization
      }
    }
  } catch {
    // Continua normalmente
  }

  let extractedCount = 0;

  try {
    if (onProgressDetail) onProgressDetail('Baixando pacote ZIP...');

    try {
      await FileSystemLegacy.downloadAsync(downloadUrl, tempZipLocalPath, {
        headers: downloadHeaders,
      });
    } catch (dlErr) {
      // Fallback: download via raw.githubusercontent.com
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${encodedPath}`;
      const rawHeaders: Record<string, string> = { 'User-Agent': 'AthenaMD-App' };
      if (token && token.trim()) rawHeaders['Authorization'] = `token ${token.trim()}`;
      await FileSystemLegacy.downloadAsync(rawUrl, tempZipLocalPath, { headers: rawHeaders });
    }

    if (onProgressDetail) onProgressDetail('Extraindo imagens...');

    // 1. Descompacta nativamente (react-native-zip-archive)
    // Sem fallback para JSZip em memória para prevenir OutOfMemory (OOM) com arquivos grandes de centenas de MBs
    try {
      const nativeSource = tempZipLocalPath.replace(/^file:\/\//, '');
      const nativeTarget = targetDir.replace(/^file:\/\//, '');
      await unzip(nativeSource, nativeTarget);
    } catch (unzipErr: any) {
      console.error('[githubSync] Erro na descompactação nativa do ZIP:', unzipErr);
      throw new Error(`Falha ao descompactar pacote de imagens nativamente: ${unzipErr?.message || 'erro no arquivo'}`);
    }

    // Se o ZIP continha subpastas internas, move as imagens para a raiz de targetDir
    try {
      const items = await FileSystemLegacy.readDirectoryAsync(targetDir);
      for (const item of items) {
        if (item === '__MACOSX' || item.startsWith('.')) continue;
        const itemPath = `${targetDir}${item}`;
        const itemInfo = await FileSystemLegacy.getInfoAsync(itemPath);
        if (itemInfo.isDirectory) {
          const nested = await FileSystemLegacy.readDirectoryAsync(itemPath);
          for (const n of nested) {
            if (/\.(jpg|jpeg|png|webp|gif|svg)$/i.test(n)) {
              await FileSystemLegacy.moveAsync({
                from: `${itemPath}/${n}`,
                to: `${targetDir}${n}`,
              });
              extractedCount++;
            }
          }
        } else if (/\.(jpg|jpeg|png|webp|gif|svg)$/i.test(item)) {
          extractedCount++;
        }
      }
    } catch (moveErr) {
      console.warn('[githubSync] Aviso ao organizar arquivos extraídos:', moveErr);
    }
  } finally {
    // Remove SEMPRE o arquivo zip temporário do armazenamento interno
    try {
      await FileSystemLegacy.deleteAsync(tempZipLocalPath, { idempotent: true });
    } catch {}
  }

  return extractedCount;
}

/**
 * Testa a conexão com o GitHub e a leitura do index.json
 */
export async function testGitHubConnection(config?: Partial<GitHubConfig>): Promise<{
  success: boolean;
  message: string;
  indexFound: boolean;
  totalBancos?: number;
  totalPacotes?: number;
  versaoGlobal?: string | number;
}> {
  try {
    const fullConfig = await getGitHubConfig(config);
    if (!fullConfig.owner || !fullConfig.repo) {
      return {
        success: false,
        message: 'Por favor, informe o repositório no formato "usuario/repositorio".',
        indexFound: false,
      };
    }
    if (!fullConfig.token || !fullConfig.token.trim()) {
      return {
        success: false,
        message: 'Por favor, insira o seu Personal Access Token do GitHub.',
        indexFound: false,
      };
    }
    const indexData = await fetchGitHubJson(fullConfig.indexPath || 'index.json', fullConfig);

    if (!indexData || typeof indexData !== 'object') {
      return {
        success: false,
        message: 'O arquivo index.json retornado está vazio ou inválido.',
        indexFound: false,
      };
    }

    const totalBancos = indexData.bancos ? Object.keys(indexData.bancos).length : 0;
    const totalPacotes = indexData.pacotes_imagens ? Object.keys(indexData.pacotes_imagens).length : 0;
    const versaoGlobal = indexData.versao;

    return {
      success: true,
      message: `Conexão bem-sucedida! ${totalBancos} temas e ${totalPacotes} pacotes de imagens identificados no repositório.`,
      indexFound: true,
      totalBancos,
      totalPacotes,
      versaoGlobal,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Falha ao conectar ao repositório GitHub.',
      indexFound: false,
    };
  }
}

/**
 * Encontra pacotes de imagens compatíveis com a lista de bancos selecionados
 */
export function findMatchingPacotesForBancos(
  bancosNomes: string[],
  remotePacotes: Record<string, IndexItem>
): string[] {
  const matched = new Set<string>();
  const pacoteKeys = Object.keys(remotePacotes);

  const cleanNames = bancosNomes.map((b) =>
    b
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\.json$/i, '')
      .replace(/[^a-z0-9]/g, '')
  );

  for (const pKey of pacoteKeys) {
    const cleanP = pKey
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\.zip$/i, '')
      .replace(/_imagens$/i, '')
      .replace(/-imagens$/i, '')
      .replace(/\s+imagens$/i, '')
      .replace(/_img$/i, '')
      .replace(/[^a-z0-9]/g, '');

    if (!cleanP) continue;

    for (const cleanB of cleanNames) {
      if (!cleanB) continue;
      if (cleanB === cleanP || cleanB.includes(cleanP) || cleanP.includes(cleanB)) {
        matched.add(pKey);
        break;
      }
    }
  }

  return Array.from(matched);
}

/**
 * Re-exporta funções e tipos do resolvedor determinístico de especialidades (Tag Maior)
 */
export {
  TAGS_MAIORES_PADRAO,
  TagMaiorPadrao,
  isTagMaior,
  formatarNomeBanco,
  formatarNomeEspecialidade,
  resolverEspecialidadeDoBanco,
};

/**
 * Verifica se existem novos bancos ou pacotes de imagens disponíveis no GitHub.
 * Segue a OPÇÃO A: a notificação (temAtualizacao) acende apenas se houver atualização
 * de ESPECIALIDADES que o usuário JÁ instalou. Novas especialidades no GitHub não acendem o aviso.
 */
export async function checkForUpdates(config?: Partial<GitHubConfig>): Promise<SyncCheckResult> {
  const fullConfig = await getGitHubConfig(config);
  const metadata = await getSyncMetadata();
  const indexData = await fetchGitHubJson(fullConfig.indexPath || 'index.json', fullConfig);

  let localQuestoes: any[] = [];
  try {
    localQuestoes = await getQuestoesCache();
  } catch {}

  const installedEspecialidades = new Set(
    localQuestoes.map((q) => {
      const raw =
        (Array.isArray(q?.tags) && q.tags.length > 0 ? String(q.tags[0]).trim() : undefined) ||
        (q?.especialidade && typeof q.especialidade === 'string' ? q.especialidade.trim() : undefined) ||
        (q?.area && typeof q.area === 'string' ? q.area.trim() : undefined);
      return formatarNomeEspecialidade(raw || '').toLowerCase();
    }).filter(Boolean)
  );
  const installedOrigens = new Set(
    localQuestoes.map((q) => (q?.origem || '').toString().trim().toLowerCase()).filter(Boolean)
  );

  const remoteVersaoGlobal = indexData.versao;
  const localVersaoGlobal = metadata.versao;

  const isGlobalVersionNewer = Boolean(
    remoteVersaoGlobal !== undefined &&
    isRemoteNewer(remoteVersaoGlobal, localVersaoGlobal)
  );

  const todosBancos: BankSyncItem[] = [];
  const bancosComAtualizacao: BankSyncItem[] = [];
  const novosBancosDisponiveis: BankSyncItem[] = [];

  const remoteBancos = indexData.bancos || {};
  for (const [nome, item] of Object.entries<IndexItem>(remoteBancos)) {
    const versaoLocal = metadata.bancos[nome];
    const cleanNome = nome.replace(/\.json$/i, '').trim().toLowerCase();
    const espDoBanco = resolverEspecialidadeDoBanco(nome, item, localQuestoes);

    // Um banco é considerado instalado se:
    // 1. Consta nos metadados de sincronização anteriores; OU
    // 2. O usuário já tem questões cuja origem coincide com este banco
    const instalado =
      metadata.bancos[nome] !== undefined ||
      installedOrigens.has(cleanNome);

    let status: BankSyncStatus;
    if (instalado) {
      if (versaoLocal === undefined || isGlobalVersionNewer || isRemoteNewer(item.versao, versaoLocal)) {
        status = 'atualizacao';
      } else {
        status = 'atualizado';
      }
    } else {
      status = 'novo';
    }

    const bankItem: BankSyncItem = {
      nome,
      item,
      versaoLocal,
      status,
      instalado,
      especialidade: espDoBanco,
    };

    todosBancos.push(bankItem);
    if (status === 'atualizacao') {
      bancosComAtualizacao.push(bankItem);
    } else if (status === 'novo') {
      novosBancosDisponiveis.push(bankItem);
    }
  }

  // Pacotes de imagens
  const todosPacotes: PacoteSyncItem[] = [];
  const pacotesComAtualizacao: PacoteSyncItem[] = [];
  const novosPacotesDisponiveis: PacoteSyncItem[] = [];

  const remotePacotes = indexData.pacotes_imagens || {};
  for (const [nome, item] of Object.entries<IndexItem>(remotePacotes)) {
    const versaoLocal = metadata.pacotes_imagens[nome];
    const instalado = metadata.pacotes_imagens[nome] !== undefined;

    let status: BankSyncStatus;
    if (instalado) {
      if (versaoLocal === undefined || isGlobalVersionNewer || isRemoteNewer(item.versao, versaoLocal)) {
        status = 'atualizacao';
      } else {
        status = 'atualizado';
      }
    } else {
      status = 'novo';
    }

    const pacoteItem: PacoteSyncItem = {
      nome,
      item,
      versaoLocal,
      status,
      instalado,
    };

    todosPacotes.push(pacoteItem);
    if (status === 'atualizacao') {
      pacotesComAtualizacao.push(pacoteItem);
    } else if (status === 'novo') {
      novosPacotesDisponiveis.push(pacoteItem);
    }
  }

  // Agrupamento por ESPECIALIDADE para seleção granular e notificações sob OPÇÃO A
  const especialidadesMap = new Map<
    string,
    {
      bancos: BankSyncItem[];
      temasNomes: Set<string>;
      versaoRemota: number | string;
      versaoLocal?: number | string;
      hasAtualizacao: boolean;
      hasInstalado: boolean;
    }
  >();

  for (const banco of todosBancos) {
    const espNome = banco.especialidade || 'Geral';
    let grupo = especialidadesMap.get(espNome);
    if (!grupo) {
      grupo = {
        bancos: [],
        temasNomes: new Set<string>(),
        versaoRemota: banco.item.versao,
        versaoLocal: banco.versaoLocal,
        hasAtualizacao: false,
        hasInstalado: false,
      };
      especialidadesMap.set(espNome, grupo);
    }

    grupo.bancos.push(banco);

    // Extrai o nome do tema/assunto específico
    let temaDisplay = formatarNomeBanco(banco.nome);
    if (temaDisplay.toLowerCase().startsWith(espNome.toLowerCase())) {
      const rest = temaDisplay.slice(espNome.length).replace(/^[\s\-_:]+/, '').trim();
      if (rest) temaDisplay = rest;
    }
    grupo.temasNomes.add(temaDisplay);

    if (banco.instalado) {
      grupo.hasInstalado = true;
      if (banco.versaoLocal !== undefined) {
        if (grupo.versaoLocal === undefined || isRemoteNewer(banco.versaoLocal, grupo.versaoLocal)) {
          grupo.versaoLocal = banco.versaoLocal;
        }
      }
    }
    if (isRemoteNewer(banco.item.versao, grupo.versaoRemota)) {
      grupo.versaoRemota = banco.item.versao;
    }
    if (banco.status === 'atualizacao') {
      grupo.hasAtualizacao = true;
    }
  }

  const especialidades: SpecialtySyncItem[] = [];
  const especialidadesComAtualizacao: SpecialtySyncItem[] = [];
  const novasEspecialidades: SpecialtySyncItem[] = [];

  for (const [espNome, grupo] of especialidadesMap.entries()) {
    // Busca pacotes de imagens compatíveis com a especialidade ou seus bancos
    const pacotesNomesParaEsp = findMatchingPacotesForBancos(
      [espNome, ...grupo.bancos.map((b) => b.nome)],
      remotePacotes
    );
    const pacotesDaEsp = todosPacotes.filter((p) => pacotesNomesParaEsp.includes(p.nome));

    const espInstalada =
      installedEspecialidades.has(espNome.toLowerCase()) ||
      grupo.hasInstalado ||
      grupo.bancos.some((b) => b.instalado);

    let status: BankSyncStatus;
    if (espInstalada) {
      // Se a especialidade (Tag Maior) já está instalada no app, ela precisa de atualização se:
      // 1. Algum banco dela teve versão atualizada; OU
      // 2. Um novo banco foi adicionado a esta especialidade no GitHub; OU
      // 3. Algum pacote de imagens dela teve versão atualizada
      const temBancoNovoOuAtualizado = grupo.bancos.some(
        (b) => b.status === 'atualizacao' || (b.status === 'novo' && metadata.bancos[b.nome] === undefined)
      );
      if (temBancoNovoOuAtualizado || pacotesDaEsp.some((p) => p.status === 'atualizacao')) {
        status = 'atualizacao';
      } else {
        status = 'atualizado';
      }
    } else {
      status = 'novo';
    }

    const espItem: SpecialtySyncItem = {
      nome: espNome,
      status,
      instalado: espInstalada,
      bancos: grupo.bancos,
      pacotesImagens: pacotesDaEsp,
      versaoRemota: grupo.versaoRemota,
      versaoLocal: grupo.versaoLocal,
      temasNomes: Array.from(grupo.temasNomes).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    };

    especialidades.push(espItem);
    if (status === 'atualizacao') {
      especialidadesComAtualizacao.push(espItem);
    } else if (status === 'novo') {
      novasEspecialidades.push(espItem);
    }
  }

  especialidades.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  especialidadesComAtualizacao.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  novasEspecialidades.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  // OPÇÃO A:
  // A notificação (temAtualizacao) SÓ é true se houver atualização para ESPECIALIDADES que o usuário JÁ instalou.
  // Novas especialidades no repositório NÃO acionam a notificação/bolinha no app!
  const temAtualizacao = especialidadesComAtualizacao.length > 0;

  const bancosParaBaixar = localQuestoes.length === 0
    ? todosBancos
    : [...bancosComAtualizacao];
  const pacotesParaBaixar = localQuestoes.length === 0
    ? todosPacotes
    : [...pacotesComAtualizacao];

  return {
    temAtualizacao,
    remoteVersaoGlobal,
    localVersaoGlobal,
    especialidades,
    especialidadesComAtualizacao,
    novasEspecialidades,
    todosBancos,
    todosPacotes,
    bancosComAtualizacao,
    novosBancosDisponiveis,
    pacotesComAtualizacao,
    novosPacotesDisponiveis,
    bancosParaBaixar,
    pacotesParaBaixar,
    totalBancosRemotos: Object.keys(remoteBancos).length,
    totalPacotesRemotos: Object.keys(remotePacotes).length,
    totalEspecialidadesRemotas: especialidades.length,
    totalAtualizacoes: especialidadesComAtualizacao.length,
    totalNovos: novasEspecialidades.length,
  };
}

/**
 * Executa a sincronização completa, incremental ou seletiva dos arquivos do GitHub
 */
export async function syncFromGitHub(options?: SyncOptions): Promise<SyncResult> {
  const fullConfig = await getGitHubConfig(options?.config);
  const onProgress = options?.onProgress;
  const forceAll = Boolean(options?.forceAll);
  const selectedEspecialidades = options?.selectedEspecialidades;
  const selectedBancos = options?.selectedBancos;
  const selectedPacotes = options?.selectedPacotes;
  const baixarImagens = options?.baixarImagens !== false;

  if (onProgress) {
    onProgress({
      etapa: 'verificando',
      progressoAtual: 0,
      totalItens: 1,
      mensagem: 'Conectando ao GitHub...',
      detalhe: 'Verificando versão remota e novidades...',
    });
  }

  const metadata = await getSyncMetadata();
  const indexData = await fetchGitHubJson(fullConfig.indexPath || 'index.json', fullConfig);

  const questoesAtuais = await getQuestoesCache();
  const localQuestoesCount = questoesAtuais.length;
  // Libera espaço no storage antes de sincronizar novos dados
  storage.remove('@athena_questoes');

  const bancosParaBaixar: Array<{ nome: string; item: IndexItem }> = [];
  const pacotesParaBaixar: Array<{ nome: string; item: IndexItem }> = [];

  const isGlobalVersionNewer = Boolean(
    indexData.versao !== undefined &&
    isRemoteNewer(indexData.versao, metadata.versao)
  );

  const remoteBancos = indexData.bancos || {};
  for (const [nome, item] of Object.entries<IndexItem>(remoteBancos)) {
    if (selectedEspecialidades && selectedEspecialidades.length > 0) {
      const espDoBanco = resolverEspecialidadeDoBanco(nome, item, questoesAtuais);
      if (selectedEspecialidades.includes(espDoBanco)) {
        bancosParaBaixar.push({ nome, item });
      }
    } else if (selectedBancos) {
      if (selectedBancos.includes(nome)) {
        bancosParaBaixar.push({ nome, item });
      }
    } else {
      const versaoLocal = metadata.bancos[nome];
      if (forceAll || localQuestoesCount === 0 || isGlobalVersionNewer || isRemoteNewer(item.versao, versaoLocal)) {
        bancosParaBaixar.push({ nome, item });
      }
    }
  }

  const remotePacotes = indexData.pacotes_imagens || {};
  if (baixarImagens) {
    let pacotesAlvo: string[] | undefined = selectedPacotes;
    if (!pacotesAlvo) {
      if (selectedEspecialidades && selectedEspecialidades.length > 0) {
        pacotesAlvo = findMatchingPacotesForBancos(
          [...selectedEspecialidades, ...bancosParaBaixar.map((b) => b.nome)],
          remotePacotes
        );
      } else if (selectedBancos) {
        pacotesAlvo = findMatchingPacotesForBancos(selectedBancos, remotePacotes);
      }
    }

    for (const [nome, item] of Object.entries<IndexItem>(remotePacotes)) {
      if (pacotesAlvo) {
        if (pacotesAlvo.includes(nome)) {
          pacotesParaBaixar.push({ nome, item });
        }
      } else {
        const versaoLocal = metadata.pacotes_imagens[nome];
        if (forceAll || localQuestoesCount === 0 || isGlobalVersionNewer || isRemoteNewer(item.versao, versaoLocal)) {
          pacotesParaBaixar.push({ nome, item });
        }
      }
    }
  }

  if (bancosParaBaixar.length === 0 && pacotesParaBaixar.length === 0) {
    if (onProgress) {
      onProgress({
        etapa: 'concluido',
        progressoAtual: 1,
        totalItens: 1,
        mensagem: 'O banco de questões já está na versão mais recente!',
      });
    }
    return {
      sucesso: true,
      questoesAdicionadas: 0,
      questoesAtualizadas: 0,
      imagensExtraidas: 0,
      totalQuestoesFinal: localQuestoesCount,
      bancosSincronizados: [],
      pacotesSincronizados: [],
      mensagem: 'O banco de dados já está 100% atualizado com a versão mais recente do GitHub.',
    };
  }

  const totalSteps = bancosParaBaixar.length + pacotesParaBaixar.length;
  let currentStep = 0;

  // Mapa de questões por ID para atualização rápida e deduplicação
  const questoesMap = new Map<string, any>();
  for (const q of questoesAtuais) {
    const id = String(q.id ?? q.id_questao ?? '').trim();
    if (id) questoesMap.set(id, q);
  }

  let questoesAdicionadas = 0;
  let questoesAtualizadas = 0;
  const bancosSincronizados: string[] = [];

  // 1. Processar e baixar bancos de questões
  for (let i = 0; i < bancosParaBaixar.length; i++) {
    const banco = bancosParaBaixar[i];
    currentStep++;

    if (onProgress) {
      onProgress({
        etapa: 'baixando_questoes',
        progressoAtual: currentStep,
        totalItens: totalSteps,
        mensagem: `Baixando questões (${i + 1}/${bancosParaBaixar.length})`,
        detalhe: banco.nome,
      });
    }

    try {
      const rawBankData = await fetchGitHubJson(banco.item.url, fullConfig);
      if (Array.isArray(rawBankData)) {
        const bancoOrigem = banco.nome.trim();
        const espDoBanco = resolverEspecialidadeDoBanco(banco.nome, banco.item, questoesAtuais);

        for (let idx = 0; idx < rawBankData.length; idx++) {
          const rawItem = rawBankData[idx];
          const norm = normalizeQuestion(rawItem, idx, bancoOrigem, espDoBanco);
          const qId = String(norm.id).trim();

          if (questoesMap.has(qId)) {
            // Atualiza mantendo o progresso anterior
            const existing = questoesMap.get(qId);
            questoesMap.set(qId, { ...existing, ...norm });
            questoesAtualizadas++;
          } else {
            questoesMap.set(qId, norm);
            questoesAdicionadas++;
          }
        }

        metadata.bancos[banco.nome] = banco.item.versao;
        bancosSincronizados.push(banco.nome);
      }
    } catch (bancoErr: any) {
      console.warn(`Erro ao baixar banco ${banco.nome}:`, bancoErr);
    }
  }

  let imagensExtraidas = 0;
  const pacotesSincronizados: string[] = [];

  // 2. Processar e baixar pacotes de imagens (.zip)
  for (let j = 0; j < pacotesParaBaixar.length; j++) {
    const pacote = pacotesParaBaixar[j];
    currentStep++;

    if (onProgress) {
      onProgress({
        etapa: 'baixando_imagens',
        progressoAtual: currentStep,
        totalItens: totalSteps,
        mensagem: `Baixando imagens (${j + 1}/${pacotesParaBaixar.length})`,
        detalhe: pacote.nome,
      });
    }

    try {
      const extraidas = await downloadAndExtractZip(
        pacote.item.url,
        pacote.nome,
        fullConfig,
        (detail) => {
          if (onProgress) {
            onProgress({
              etapa: 'descompactando_imagens',
              progressoAtual: currentStep,
              totalItens: totalSteps,
              mensagem: `Extraindo imagens (${j + 1}/${pacotesParaBaixar.length})`,
              detalhe: `${pacote.nome} - ${detail}`,
            });
          }
        }
      );

      imagensExtraidas += extraidas;
      metadata.pacotes_imagens[pacote.nome] = pacote.item.versao;
      pacotesSincronizados.push(pacote.nome);
    } catch (pacoteErr: any) {
      console.warn(`Erro ao processar pacote de imagens ${pacote.nome}:`, pacoteErr);
    }
  }

  // 3. Salvar tudo
  if (onProgress) {
    onProgress({
      etapa: 'salvando',
      progressoAtual: totalSteps,
      totalItens: totalSteps,
      mensagem: 'Gravando dados atualizados no armazenamento local...',
    });
  }

  const bancoFinal = Array.from(questoesMap.values());
  await saveQuestoesStorage(bancoFinal);
  invalidateImageCache();

  const totalBancosCount = Object.keys(remoteBancos).length;
  const isSyncingAll =
    (!selectedBancos && !selectedEspecialidades) ||
    (selectedBancos && selectedBancos.length === totalBancosCount);
  if (indexData.versao !== undefined && isSyncingAll) {
    metadata.versao = indexData.versao;
  }
  metadata.ultimaSincronizacao = new Date().toISOString();
  await saveSyncMetadata(metadata);
  await clearUpdateStatus();
  try {
    await checkSilentUpdates(true);
  } catch {}

  if (onProgress) {
    onProgress({
      etapa: 'concluido',
      progressoAtual: totalSteps,
      totalItens: totalSteps,
      mensagem: 'Sincronização concluída com sucesso!',
      detalhe: `${questoesAdicionadas + questoesAtualizadas} questões sincronizadas, ${imagensExtraidas} imagens baixadas.`,
    });
  }

  return {
    sucesso: true,
    questoesAdicionadas,
    questoesAtualizadas,
    imagensExtraidas,
    totalQuestoesFinal: bancoFinal.length,
    bancosSincronizados,
    pacotesSincronizados,
    mensagem: 'Sincronização concluída com sucesso!',
  };
}

/**
 * Baixa e aplica o cronograma de estudos diretamente do repositório GitHub configurado.
 */
export async function syncCronogramaFromGitHub(
  customConfig?: Partial<GitHubConfig>,
  customPath?: string
): Promise<{ success: boolean; data?: CronogramaData; error?: string }> {
  try {
    const config = await getGitHubConfig(customConfig);
    if (!config.owner || !config.repo) {
      return {
        success: false,
        error: 'Repositório GitHub não configurado. Por favor, configure o repositório nas Configurações do GitHub primeiro.',
      };
    }

    let cronogramaJson: any = null;

    // 1. Se um caminho específico foi passado, tenta ele primeiro
    if (customPath) {
      cronogramaJson = await fetchGitHubJson(customPath, config);
    } else {
      // 2. Tenta verificar se o index.json define um campo "cronograma"
      try {
        const indexData = await fetchGitHubJson(config.indexPath || 'index.json', config);
        if (indexData?.cronograma) {
          const cronogramaEntry = indexData.cronograma;
          const urlToFetch = typeof cronogramaEntry === 'string' ? cronogramaEntry : cronogramaEntry.url;
          if (urlToFetch) {
            cronogramaJson = await fetchGitHubJson(urlToFetch, config);
          }
        }
      } catch (idxErr) {
        // Se o index.json não existir ou não tiver cronograma, tenta o fallback cronograma.json direto
      }

      // 3. Fallbacks comuns para encontrar o arquivo no repositório
      if (!cronogramaJson) {
        const candidatePaths = [
          'cronograma.json',
          'cronograma/cronograma.json',
          'cronograma/index.json',
          'data/cronograma.json',
          'cronogramas/cronograma.json',
        ];

        for (const candPath of candidatePaths) {
          try {
            const candidateData = await fetchGitHubJson(candPath, config);
            if (candidateData && (candidateData.semanas || candidateData.cronograma)) {
              cronogramaJson = candidateData.cronograma || candidateData;
              break;
            }
          } catch {
            // Continua tentando os outros caminhos
          }
        }

        if (!cronogramaJson) {
          throw new Error(
            'Arquivo de cronograma ("cronograma.json") não foi localizado no repositório. Certifique-se de que o arquivo está na raiz ou especificado no seu "index.json".'
          );
        }
      }
    }

    if (!cronogramaJson) {
      return {
        success: false,
        error: 'Não foi possível encontrar os dados do cronograma no repositório.',
      };
    }

    // Valida e estrutura os dados do cronograma
    const cronogramaData = parseAndValidateCronogramaJson(cronogramaJson);
    await saveCronograma(cronogramaData);

    return { success: true, data: cronogramaData };
  } catch (err: any) {
    console.error('Erro ao sincronizar cronograma do GitHub:', err);
    return {
      success: false,
      error: err?.message || 'Falha ao baixar cronograma do GitHub.',
    };
  }
}
