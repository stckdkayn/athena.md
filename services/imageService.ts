import * as FileSystem from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';

/**
 * Cache em memória de URIs já resolvidas:
 * Chave: `${origem}::${cleanFileName}` -> Valor: `file:///...` ou `null` se não encontrada
 */
const resolvedImageCache = new Map<string, string | null>();

/**
 * Índice rápido de arquivos no disco:
 * Chave: `nome_em_minusculo.ext` ou `origem/nome_em_minusculo.ext` -> Valor: `file:///...`
 */
const indexedFilesMap = new Map<string, string>();
let isIndexBuilt = false;
let isBuildingIndex = false;
let pendingBuildPromise: Promise<void> | null = null;

/**
 * Retorna o caminho base da pasta de imagens offline do app
 */
export function getAthenaImagensFolder(): string {
  const baseDir =
    FileSystemLegacy.documentDirectory ||
    (FileSystem.Paths?.document?.uri ? `${FileSystem.Paths.document.uri}/` : '');
  return baseDir.endsWith('/') ? `${baseDir}AthenaImagens/` : `${baseDir}/AthenaImagens/`;
}

/**
 * Extrai a string de imagem do objeto de questão de forma resiliente
 */
export function extractRawImageString(q: any): string | null {
  if (!q) return null;

  let rawImg: any =
    q.imagem ??
    q.image ??
    q.img ??
    q.figura ??
    q.foto ??
    q.arquivo_imagem ??
    q.url_imagem ??
    q.anexo ??
    (Array.isArray(q.imagens) && q.imagens.length > 0 ? q.imagens[0] : undefined) ??
    (Array.isArray(q.images) && q.images.length > 0 ? q.images[0] : undefined);

  if (rawImg && typeof rawImg === 'object') {
    rawImg = rawImg.url || rawImg.uri || rawImg.arquivo || rawImg.nome || rawImg.src || rawImg.file || '';
  }

  if (rawImg !== undefined && rawImg !== null && typeof rawImg !== 'string') {
    rawImg = String(rawImg);
  }

  // Se não houver campo direto, procura por tags <img> ou Markdown no enunciado
  if (!rawImg || typeof rawImg !== 'string' || !rawImg.trim()) {
    const textToSearch = q.enunciado || q.texto || q.question || '';
    if (typeof textToSearch === 'string' && textToSearch) {
      const imgTagMatch =
        textToSearch.match(/<img[^>]+src=["']([^"']+)["']/i) ||
        textToSearch.match(/!\[.*?\]\((.*?)\)/i) ||
        textToSearch.match(/\[imagem:\s*([^\]]+)\]/i);
      if (imgTagMatch && imgTagMatch[1]) {
        rawImg = imgTagMatch[1].trim();
      }
    }
  }

  if (!rawImg || typeof rawImg !== 'string' || !rawImg.trim()) {
    return null;
  }

  return rawImg.trim();
}

/**
 * Constrói ou reconstrói o índice em memória de todas as imagens presentes em AthenaImagens
 * Executado de forma assíncrona uma única vez, tornando todas as buscas subsequentes O(1).
 */
export async function buildImageIndex(forceReload: boolean = false): Promise<void> {
  if (!forceReload && isIndexBuilt) {
    return;
  }

  if (isBuildingIndex && pendingBuildPromise) {
    return pendingBuildPromise;
  }

  isBuildingIndex = true;
  pendingBuildPromise = (async () => {
    try {
      const folder = getAthenaImagensFolder();
      const folderInfo = await FileSystemLegacy.getInfoAsync(folder);
      if (!folderInfo.exists || !folderInfo.isDirectory) {
        indexedFilesMap.clear();
        isIndexBuilt = true;
        return;
      }

      indexedFilesMap.clear();
      const items = await FileSystemLegacy.readDirectoryAsync(folder);

      for (const item of items) {
        if (item === '__MACOSX' || item.startsWith('.') || item.endsWith('.zip')) continue;
        const itemPath = `${folder}${item}`;

        try {
          const itemInfo = await FileSystemLegacy.getInfoAsync(itemPath);
          if (itemInfo.exists) {
            if (itemInfo.isDirectory) {
              // Subpasta (ex: taquiarritmias, cardiologia, etc.)
              const subItems = await FileSystemLegacy.readDirectoryAsync(itemPath);
              const subNameLower = item.toLowerCase();

              for (const subFile of subItems) {
                if (subFile === '__MACOSX' || subFile.startsWith('.')) continue;
                const subFilePath = `${itemPath}/${subFile}`;
                const subFileLower = subFile.toLowerCase();
                const subFileBase = subFileLower.replace(/\.[^/.]+$/, '');

                // Registra com chave qualificada por pasta
                indexedFilesMap.set(`${subNameLower}/${subFileLower}`, subFilePath);
                indexedFilesMap.set(`${subNameLower}/${subFileBase}`, subFilePath);

                // Registra também globalmente se ainda não ocupado
                if (!indexedFilesMap.has(subFileLower)) {
                  indexedFilesMap.set(subFileLower, subFilePath);
                }
                if (!indexedFilesMap.has(subFileBase)) {
                  indexedFilesMap.set(subFileBase, subFilePath);
                }
              }
            } else {
              // Arquivo na raiz de AthenaImagens/
              const fileLower = item.toLowerCase();
              const fileBase = fileLower.replace(/\.[^/.]+$/, '');
              indexedFilesMap.set(fileLower, itemPath);
              indexedFilesMap.set(fileBase, itemPath);
            }
          }
        } catch (itemErr) {
          console.warn('[imageService] Erro ao indexar item:', item, itemErr);
        }
      }

      isIndexBuilt = true;
    } catch (err) {
      console.error('[imageService] Erro ao construir índice de imagens:', err);
    } finally {
      isBuildingIndex = false;
      pendingBuildPromise = null;
    }
  })();

  return pendingBuildPromise;
}

/**
 * Resolve a URI final da imagem de uma questão de forma ultra rápida com cache O(1)
 */
export async function resolveQuestionImageUri(q: any): Promise<string | null> {
  const rawImg = extractRawImageString(q);
  if (!rawImg) return null;

  // 1. Data URI direta
  if (rawImg.startsWith('data:image/')) {
    return rawImg;
  }

  const isRemoteUrl = rawImg.startsWith('http://') || rawImg.startsWith('https://');

  // Normaliza o nome do arquivo
  const normalizedPath = rawImg.replace(/\\/g, '/');
  const noQuery = normalizedPath.split('?')[0];
  let cleanFileName = noQuery.split('/').pop() || noQuery;
  try {
    cleanFileName = decodeURIComponent(cleanFileName);
  } catch {}
  const cleanFileNameLower = cleanFileName.toLowerCase();
  const nameWithoutExt = cleanFileNameLower.replace(/\.[^/.]+$/, '');

  const rawOrigem = q?.origem || q?.origin || q?.pacote || q?.banco || '';
  const cleanOrigem = typeof rawOrigem === 'string'
    ? rawOrigem.trim().replace(/^\/+|\/+$/g, '').toLowerCase()
    : '';

  // Chave de cache
  const cacheKey = `${cleanOrigem}::${cleanFileNameLower}`;
  if (resolvedImageCache.has(cacheKey)) {
    return resolvedImageCache.get(cacheKey)!;
  }

  const formatUri = (p: string) => (p.startsWith('file://') ? p : `file://${p}`);

  // Se o índice de imagens ainda não foi construído, constrói agora
  if (!isIndexBuilt) {
    await buildImageIndex();
  }

  // 2. Consulta no índice em memória O(1)
  // 2.1 Busca por origem/arquivo
  if (cleanOrigem) {
    const keyWithOrigem = `${cleanOrigem}/${cleanFileNameLower}`;
    if (indexedFilesMap.has(keyWithOrigem)) {
      const uri = formatUri(indexedFilesMap.get(keyWithOrigem)!);
      resolvedImageCache.set(cacheKey, uri);
      return uri;
    }
    const keyWithOrigemBase = `${cleanOrigem}/${nameWithoutExt}`;
    if (indexedFilesMap.has(keyWithOrigemBase)) {
      const uri = formatUri(indexedFilesMap.get(keyWithOrigemBase)!);
      resolvedImageCache.set(cacheKey, uri);
      return uri;
    }
  }

  // 2.2 Busca global por nome do arquivo
  if (indexedFilesMap.has(cleanFileNameLower)) {
    const uri = formatUri(indexedFilesMap.get(cleanFileNameLower)!);
    resolvedImageCache.set(cacheKey, uri);
    return uri;
  }

  // 2.3 Busca global por nome sem extensão
  if (indexedFilesMap.has(nameWithoutExt)) {
    const uri = formatUri(indexedFilesMap.get(nameWithoutExt)!);
    resolvedImageCache.set(cacheKey, uri);
    return uri;
  }

  // 3. Fallback no disco direto caso o arquivo tenha sido adicionado externamente
  const folder = getAthenaImagensFolder();
  try {
    if (cleanOrigem) {
      const directOrigPath = `${folder}${cleanOrigem}/${cleanFileName}`;
      const checkOrig = await FileSystemLegacy.getInfoAsync(directOrigPath);
      if (checkOrig.exists) {
        const uri = formatUri(directOrigPath);
        resolvedImageCache.set(cacheKey, uri);
        indexedFilesMap.set(`${cleanOrigem}/${cleanFileNameLower}`, directOrigPath);
        return uri;
      }
    }

    const rootPath = `${folder}${cleanFileName}`;
    const checkRoot = await FileSystemLegacy.getInfoAsync(rootPath);
    if (checkRoot.exists) {
      const uri = formatUri(rootPath);
      resolvedImageCache.set(cacheKey, uri);
      indexedFilesMap.set(cleanFileNameLower, rootPath);
      return uri;
    }
  } catch {}

  // 4. Fallback para URL remota se aplicável
  if (isRemoteUrl) {
    resolvedImageCache.set(cacheKey, rawImg);
    return rawImg;
  }

  // Não encontrada
  resolvedImageCache.set(cacheKey, null);
  return null;
}

/**
 * Pré-carrega de forma assíncrona as imagens das próximas N questões
 * para que estejam quentes no cache quando o usuário avançar
 */
export function preloadQuestionImages(questions: any[], startIndex: number, count: number = 3): void {
  if (!Array.isArray(questions) || questions.length === 0) return;

  const endIndex = Math.min(startIndex + count, questions.length);
  for (let i = startIndex; i < endIndex; i++) {
    const q = questions[i];
    if (q) {
      resolveQuestionImageUri(q).catch(() => {});
    }
  }
}

/**
 * Invalida todo o cache de imagens forçando releitura da pasta
 * (chamar após download de novos pacotes zip ou exclusão de imagens)
 */
export function invalidateImageCache(): void {
  resolvedImageCache.clear();
  indexedFilesMap.clear();
  isIndexBuilt = false;
  isBuildingIndex = false;
  pendingBuildPromise = null;
}

/**
 * Remove todos os arquivos e pastas de imagem em AthenaImagens e recria o diretório vazio
 */
export async function clearAllAthenaImages(): Promise<void> {
  try {
    const folder = getAthenaImagensFolder();
    const folderInfo = await FileSystemLegacy.getInfoAsync(folder);
    if (folderInfo.exists) {
      await FileSystemLegacy.deleteAsync(folder, { idempotent: true });
    }
    await FileSystemLegacy.makeDirectoryAsync(folder, { intermediates: true });
  } catch (err) {
    console.error('[imageService] Erro ao limpar diretório de imagens:', err);
  } finally {
    invalidateImageCache();
  }
}

