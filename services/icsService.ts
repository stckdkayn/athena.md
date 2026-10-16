import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { getDatabase } from '@/services/database';
import { storage } from '@/services/storage';

export interface EventoICS {
  id: string;
  titulo: string;
  tipo: string;
  icone: string;
  detalhes?: string | null;
  data_agendada: string; // YYYY-MM-DD
  hora_inicio: string | null; // HH:MM
  hora_fim: string | null; // HH:MM
  feedback_cansaco: number;
}

export interface ICalFeed {
  id: string;
  nome: string;
  url: string;
  tipo: string; // 'Faculdade', 'Estudos', 'Saúde', 'Pessoal', 'Lazer'
  ultimaSincronizacao?: number;
  totalEventos?: number;
}

interface ParsedDateTime {
  dateStr: string;
  timeStr: string | null;
}

const STORAGE_KEY_FEEDS = '@athena_ical_feeds';
const STORAGE_KEY_AUTOSYNC = '@athena_ical_autosync';
const STORAGE_KEY_LAST_SYNC = '@athena_ical_last_sync_timestamp';

// Cooldown para sincronização silenciosa automática: 15 minutos
const SILENT_SYNC_COOLDOWN_MS = 15 * 60 * 1000;

// Listeners reativos para avisar a timeline quando novos eventos chegarem
type ICalSyncListener = () => void;
const syncListeners = new Set<ICalSyncListener>();

export function subscribeToICalSync(listener: ICalSyncListener): () => void {
  syncListeners.add(listener);
  return () => {
    syncListeners.delete(listener);
  };
}

function notifySyncListeners() {
  syncListeners.forEach((listener) => {
    try {
      listener();
    } catch (e) {
      console.warn('[icsService] Erro ao notificar listener de sync:', e);
    }
  });
}

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function unescapeIcsText(text: string): string {
  return text
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

function somarUmaHora(timeStr: string): string {
  const [h, m] = timeStr.split(':').map((v) => parseInt(v, 10));
  const newH = (h + 1) % 24;
  return `${String(newH).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
}

function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Converte data e hora do iCalendar para horário local (YYYY-MM-DD e HH:MM).
 */
function parseIcsDateTime(val: string): ParsedDateTime | null {
  if (!val) return null;
  const clean = val.trim();

  // 1. Formato UTC: YYYYMMDDTHHMMSSZ
  const utcMatch = clean.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?Z$/);
  if (utcMatch) {
    const [, y, m, d, h, min, s] = utcMatch;
    const utcDate = new Date(
      Date.UTC(
        parseInt(y, 10),
        parseInt(m, 10) - 1,
        parseInt(d, 10),
        parseInt(h, 10),
        parseInt(min, 10),
        parseInt(s || '0', 10)
      )
    );
    const year = utcDate.getFullYear();
    const month = String(utcDate.getMonth() + 1).padStart(2, '0');
    const day = String(utcDate.getDate()).padStart(2, '0');
    const hours = String(utcDate.getHours()).padStart(2, '0');
    const minutes = String(utcDate.getMinutes()).padStart(2, '0');

    return {
      dateStr: `${year}-${month}-${day}`,
      timeStr: `${hours}:${minutes}`,
    };
  }

  // 2. Formato Local/Floating: YYYYMMDDTHHMMSS
  const localMatch = clean.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?$/);
  if (localMatch) {
    const [, y, m, d, h, min] = localMatch;
    return {
      dateStr: `${y}-${m}-${d}`,
      timeStr: `${h}:${min}`,
    };
  }

  // 3. Formato Somente Data: YYYYMMDD
  const dateOnlyMatch = clean.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnlyMatch) {
    const [, y, m, d] = dateOnlyMatch;
    return {
      dateStr: `${y}-${m}-${d}`,
      timeStr: null,
    };
  }

  return null;
}

const DAY_NAME_TO_NUM: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

/**
 * Expande regras de recorrência (RRULE) para eventos semanais/diários comuns do Google Calendar.
 */
function expandRecurringDates(
  startDateStr: string,
  rruleStr: string,
  exdates: Set<string>,
  windowStartStr: string,
  windowEndStr: string
): string[] {
  const result: string[] = [];
  const parts = rruleStr.split(';');
  let freq = 'WEEKLY';
  let interval = 1;
  let untilDateStr: string | null = null;
  let count: number | null = null;
  let byDays: number[] | null = null;

  for (const part of parts) {
    const [k, v] = part.split('=');
    if (!k || !v) continue;
    const key = k.trim().toUpperCase();
    const val = v.trim().toUpperCase();

    if (key === 'FREQ') freq = val;
    else if (key === 'INTERVAL') interval = parseInt(val, 10) || 1;
    else if (key === 'COUNT') count = parseInt(val, 10) || null;
    else if (key === 'UNTIL') {
      const parsedUntil = parseIcsDateTime(val);
      if (parsedUntil) untilDateStr = parsedUntil.dateStr;
    } else if (key === 'BYDAY') {
      byDays = val
        .split(',')
        .map((dayStr) => {
          const code = dayStr.trim().slice(-2);
          return DAY_NAME_TO_NUM[code] !== undefined ? DAY_NAME_TO_NUM[code] : -1;
        })
        .filter((n) => n >= 0);
    }
  }

  const [sY, sM, sD] = startDateStr.split('-').map((n) => parseInt(n, 10));
  const current = new Date(sY, sM - 1, sD);
  const [eY, eM, eD] = windowEndStr.split('-').map((n) => parseInt(n, 10));
  const maxDate = new Date(eY, eM - 1, eD);

  let generatedCount = 0;
  let safetyLoop = 0;

  while (current <= maxDate && safetyLoop < 400) {
    safetyLoop++;
    const curDateStr = toLocalDateString(current);

    if (untilDateStr && curDateStr > untilDateStr) {
      break;
    }

    if (count !== null && generatedCount >= count) {
      break;
    }

    const curDayOfWeek = current.getDay();
    let matchesDay = true;
    if (byDays && byDays.length > 0) {
      matchesDay = byDays.includes(curDayOfWeek);
    }

    if (matchesDay) {
      if (curDateStr >= windowStartStr && !exdates.has(curDateStr)) {
        result.push(curDateStr);
      }
      generatedCount++;
    }

    if (freq === 'WEEKLY' && byDays && byDays.length > 0) {
      current.setDate(current.getDate() + 1);
    } else if (freq === 'DAILY') {
      current.setDate(current.getDate() + interval);
    } else if (freq === 'WEEKLY') {
      current.setDate(current.getDate() + 7 * interval);
    } else if (freq === 'MONTHLY') {
      current.setMonth(current.getMonth() + interval);
    } else {
      current.setDate(current.getDate() + 1);
    }
  }

  return result;
}

/**
 * Lê o conteúdo em texto do iCalendar e extrai os blocos VEVENT,
 * com suporte a UID, recorrência (RRULE), STATUS, DESCRIPTION e LOCATION.
 */
export function parseICSContent(
  icsText: string,
  defaultTipo: string = 'Faculdade',
  feedId?: string
): EventoICS[] {
  const unfolded = icsText.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);

  const hoje = new Date();
  const windowStart = new Date(hoje.getTime() - 14 * 86400000);
  const windowEnd = new Date(hoje.getTime() + 120 * 86400000);
  const windowStartStr = toLocalDateString(windowStart);
  const windowEndStr = toLocalDateString(windowEnd);

  const eventos: EventoICS[] = [];
  let inEvent = false;
  let currentSummary = '';
  let currentDtStart = '';
  let currentDtEnd = '';
  let currentUid = '';
  let currentStatus = '';
  let currentRrule = '';
  let currentDescription = '';
  let currentLocation = '';
  const currentExdates = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === 'BEGIN:VEVENT') {
      inEvent = true;
      currentSummary = '';
      currentDtStart = '';
      currentDtEnd = '';
      currentUid = '';
      currentStatus = '';
      currentRrule = '';
      currentDescription = '';
      currentLocation = '';
      currentExdates.clear();
      continue;
    }

    if (trimmed === 'END:VEVENT') {
      if (inEvent && currentSummary && currentDtStart && currentStatus !== 'CANCELLED') {
        const start = parseIcsDateTime(currentDtStart);
        const end = currentDtEnd ? parseIcsDateTime(currentDtEnd) : null;

        if (start) {
          const horaFimCalculada = end?.timeStr || (start.timeStr ? somarUmaHora(start.timeStr) : null);
          const tituloLimpo = unescapeIcsText(currentSummary) || 'Aula / Evento';
          const detalhesLimpos = [
            currentLocation ? `Local: ${unescapeIcsText(currentLocation)}` : '',
            currentDescription ? unescapeIcsText(currentDescription) : '',
          ]
            .filter(Boolean)
            .join('\n\n') || null;

          const baseUid = currentUid ? currentUid.replace(/[^a-zA-Z0-9_-]/g, '_') : generateUUID();

          if (currentRrule) {
            const recurringDates = expandRecurringDates(
              start.dateStr,
              currentRrule,
              currentExdates,
              windowStartStr,
              windowEndStr
            );

            for (const dStr of recurringDates) {
              const eventoId = feedId
                ? `ical_${feedId}_${baseUid}_${dStr}`
                : `ical_${baseUid}_${dStr}`;

              eventos.push({
                id: eventoId,
                titulo: tituloLimpo,
                tipo: defaultTipo,
                icone: defaultTipo === 'Estudos' ? 'book' : 'calendar',
                detalhes: detalhesLimpos,
                data_agendada: dStr,
                hora_inicio: start.timeStr,
                hora_fim: horaFimCalculada,
                feedback_cansaco: 2,
              });
            }
          } else {
            const eventoId = feedId
              ? `ical_${feedId}_${baseUid}_${start.dateStr}`
              : (currentUid ? `ical_${baseUid}_${start.dateStr}` : generateUUID());

            eventos.push({
              id: eventoId,
              titulo: tituloLimpo,
              tipo: defaultTipo,
              icone: defaultTipo === 'Estudos' ? 'book' : 'calendar',
              detalhes: detalhesLimpos,
              data_agendada: start.dateStr,
              hora_inicio: start.timeStr,
              hora_fim: horaFimCalculada,
              feedback_cansaco: 2,
            });
          }
        }
      }
      inEvent = false;
      continue;
    }

    if (!inEvent) continue;

    if (trimmed.startsWith('SUMMARY:') || trimmed.startsWith('SUMMARY;')) {
      const idx = trimmed.indexOf(':');
      if (idx !== -1) currentSummary = trimmed.substring(idx + 1);
    } else if (trimmed.startsWith('DTSTART:') || trimmed.startsWith('DTSTART;')) {
      const idx = trimmed.indexOf(':');
      if (idx !== -1) currentDtStart = trimmed.substring(idx + 1);
    } else if (trimmed.startsWith('DTEND:') || trimmed.startsWith('DTEND;')) {
      const idx = trimmed.indexOf(':');
      if (idx !== -1) currentDtEnd = trimmed.substring(idx + 1);
    } else if (trimmed.startsWith('UID:') || trimmed.startsWith('UID;')) {
      const idx = trimmed.indexOf(':');
      if (idx !== -1) currentUid = trimmed.substring(idx + 1).trim();
    } else if (trimmed.startsWith('STATUS:') || trimmed.startsWith('STATUS;')) {
      const idx = trimmed.indexOf(':');
      if (idx !== -1) currentStatus = trimmed.substring(idx + 1).trim().toUpperCase();
    } else if (trimmed.startsWith('RRULE:') || trimmed.startsWith('RRULE;')) {
      const idx = trimmed.indexOf(':');
      if (idx !== -1) currentRrule = trimmed.substring(idx + 1).trim();
    } else if (trimmed.startsWith('DESCRIPTION:') || trimmed.startsWith('DESCRIPTION;')) {
      const idx = trimmed.indexOf(':');
      if (idx !== -1) currentDescription = trimmed.substring(idx + 1);
    } else if (trimmed.startsWith('LOCATION:') || trimmed.startsWith('LOCATION;')) {
      const idx = trimmed.indexOf(':');
      if (idx !== -1) currentLocation = trimmed.substring(idx + 1);
    } else if (trimmed.startsWith('EXDATE:') || trimmed.startsWith('EXDATE;')) {
      const idx = trimmed.indexOf(':');
      if (idx !== -1) {
        const val = trimmed.substring(idx + 1);
        val.split(',').forEach((dRaw) => {
          const parsed = parseIcsDateTime(dRaw.trim());
          if (parsed) currentExdates.add(parsed.dateStr);
        });
      }
    }
  }

  return eventos;
}

/**
 * Insere ou atualiza os eventos importados do iCal no SQLite de forma idempotente.
 * Se o usuário já concluiu o evento no app (concluida = 1), preserva o status.
 */
export async function salvarEventosICSNoBanco(eventos: EventoICS[], feedId?: string): Promise<number> {
  if (!eventos || eventos.length === 0) return 0;
  const database = getDatabase();
  const ts = Date.now();
  const feedRecorrenteId = feedId
    ? (feedId === 'manual' ? 'ics_manual' : `ical_${feedId}`)
    : 'ics_manual';

  let inseridos = 0;
  await database.withExclusiveTransactionAsync(async (txn) => {
    for (const ev of eventos) {
      await txn.runAsync(
        `INSERT INTO AtividadesAgenda (
          id, id_recorrente, titulo, tipo, icone, detalhes, data_agendada, hora_inicio, hora_fim, feedback_cansaco, concluida, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
        ON CONFLICT(id) DO UPDATE SET
          titulo = excluded.titulo,
          tipo = excluded.tipo,
          icone = excluded.icone,
          detalhes = excluded.detalhes,
          data_agendada = excluded.data_agendada,
          hora_inicio = excluded.hora_inicio,
          hora_fim = excluded.hora_fim,
          timestamp = excluded.timestamp;`,
        [
          ev.id,
          feedRecorrenteId,
          ev.titulo,
          ev.tipo,
          ev.icone,
          ev.detalhes || null,
          ev.data_agendada,
          ev.hora_inicio,
          ev.hora_fim,
          ev.feedback_cansaco,
          ts,
        ]
      );
      inseridos++;
    }

    // Se vier de um feed registrado, remove eventos pendentes do banco que foram apagados no Google Calendar
    if (feedRecorrenteId) {
      const idsValidos = new Set(eventos.map((e) => e.id));
      const eventosAtuais = await txn.getAllAsync<{ id: string }>(
        `SELECT id FROM AtividadesAgenda WHERE id_recorrente = ? AND concluida = 0;`,
        [feedRecorrenteId]
      );

      for (const evBanco of eventosAtuais) {
        if (!idsValidos.has(evBanco.id)) {
          await txn.runAsync(`DELETE FROM AtividadesAgenda WHERE id = ?;`, [evBanco.id]);
        }
      }
    }
  });

  notifySyncListeners();
  return inseridos;
}

// ---------------------------------------------------------------------------
// GERENCIAMENTO DE FEEDS (LINKS DE ICAL / GOOGLE CALENDAR)
// ---------------------------------------------------------------------------

export function getICalFeeds(): ICalFeed[] {
  try {
    const raw = storage.getString(STORAGE_KEY_FEEDS);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error('[icsService] Erro ao ler feeds iCal do storage:', e);
    return [];
  }
}

export function saveICalFeeds(feeds: ICalFeed[]): void {
  try {
    storage.set(STORAGE_KEY_FEEDS, JSON.stringify(feeds));
  } catch (e) {
    console.error('[icsService] Erro ao salvar feeds iCal no storage:', e);
  }
}

export function getAutoSyncEnabled(): boolean {
  try {
    const val = storage.getBoolean(STORAGE_KEY_AUTOSYNC);
    return val !== undefined ? val : true;
  } catch {
    return true;
  }
}

export function setAutoSyncEnabled(enabled: boolean): void {
  try {
    storage.set(STORAGE_KEY_AUTOSYNC, enabled);
  } catch (e) {
    console.error('[icsService] Erro ao salvar auto-sync no storage:', e);
  }
}

export function getLastSyncTimestamp(): number | null {
  try {
    const raw = storage.getString(STORAGE_KEY_LAST_SYNC);
    return raw ? parseInt(raw, 10) : null;
  } catch {
    return null;
  }
}

export function setLastSyncTimestamp(ts: number): void {
  try {
    storage.set(STORAGE_KEY_LAST_SYNC, String(ts));
  } catch (e) {
    console.error('[icsService] Erro ao salvar last sync timestamp:', e);
  }
}

/**
 * Normaliza URLs do Google Calendar e iCal:
 * - Converte `webcal://` para `https://`
 * - Remove espaços e barras residuais
 */
export function normalizarICalUrl(url: string): string {
  let clean = url.trim();
  if (clean.toLowerCase().startsWith('webcal://')) {
    clean = 'https://' + clean.slice(9);
  }
  return clean;
}

/**
 * Baixa o conteúdo de texto da URL do iCal.
 */
export async function fetchICalText(url: string): Promise<string> {
  const normalizedUrl = normalizarICalUrl(url);

  const response = await fetch(normalizedUrl, {
    headers: {
      Accept: 'text/calendar, application/ics, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (compatible; AthenaMD/1.0)',
    },
  });

  if (!response.ok) {
    throw new Error(`Erro ao acessar o calendário (Status HTTP ${response.status}). Verifique o link.`);
  }

  const text = await response.text();
  if (!text || !text.includes('BEGIN:VCALENDAR')) {
    throw new Error('O link informado não retornou um calendário válido no formato iCalendar.');
  }

  return text;
}

/**
 * Adiciona um novo feed de iCal e já realiza a primeira sincronização.
 */
export async function addICalFeed(novo: {
  nome: string;
  url: string;
  tipo?: string;
}): Promise<ICalFeed> {
  const feeds = getICalFeeds();
  const cleanUrl = normalizarICalUrl(novo.url);

  if (!cleanUrl) {
    throw new Error('A URL do calendário não pode estar vazia.');
  }

  const feed: ICalFeed = {
    id: generateUUID(),
    nome: novo.nome.trim() || 'Google Calendar',
    url: cleanUrl,
    tipo: novo.tipo || 'Faculdade',
    ultimaSincronizacao: Date.now(),
    totalEventos: 0,
  };

  // Faz a primeira sincronização para validar o feed antes de salvar
  const text = await fetchICalText(feed.url);
  const eventos = parseICSContent(text, feed.tipo, feed.id);
  const totalInseridos = await salvarEventosICSNoBanco(eventos, feed.id);

  feed.totalEventos = totalInseridos;
  feed.ultimaSincronizacao = Date.now();

  feeds.push(feed);
  saveICalFeeds(feeds);
  setLastSyncTimestamp(Date.now());

  return feed;
}

/**
 * Remove um feed e limpa todas as atividades correspondentes do banco.
 */
export async function removeICalFeed(feedId: string): Promise<void> {
  const database = getDatabase();
  const feedRecorrenteId = `ical_${feedId}`;

  // Remove as atividades importadas por esse feed
  await database.runAsync(
    `DELETE FROM AtividadesAgenda WHERE id_recorrente = ?;`,
    [feedRecorrenteId]
  );

  const feeds = getICalFeeds().filter((f) => f.id !== feedId);
  saveICalFeeds(feeds);
  notifySyncListeners();
}

/**
 * Sincroniza um feed específico pelo ID.
 */
export async function syncICalFeed(feedId: string): Promise<{ count: number }> {
  const feeds = getICalFeeds();
  const feed = feeds.find((f) => f.id === feedId);
  if (!feed) {
    throw new Error('Calendário não encontrado.');
  }

  const text = await fetchICalText(feed.url);
  const eventos = parseICSContent(text, feed.tipo, feed.id);
  const count = await salvarEventosICSNoBanco(eventos, feed.id);

  feed.ultimaSincronizacao = Date.now();
  feed.totalEventos = count;
  saveICalFeeds(feeds);
  setLastSyncTimestamp(Date.now());

  return { count };
}

/**
 * Sincroniza todos os feeds configurados.
 */
export async function syncAllICalFeeds(
  isSilent: boolean = false
): Promise<{ total: number; feedsCount: number }> {
  const feeds = getICalFeeds();
  if (feeds.length === 0) {
    return { total: 0, feedsCount: 0 };
  }

  let totalEventosGeral = 0;
  let sincronizadosComSucesso = 0;

  for (const feed of feeds) {
    try {
      const text = await fetchICalText(feed.url);
      const eventos = parseICSContent(text, feed.tipo, feed.id);
      const count = await salvarEventosICSNoBanco(eventos, feed.id);
      feed.ultimaSincronizacao = Date.now();
      feed.totalEventos = count;
      totalEventosGeral += count;
      sincronizadosComSucesso++;
    } catch (err) {
      console.warn(`[icsService] Falha ao sincronizar feed "${feed.nome}":`, err);
      if (!isSilent) {
        throw err;
      }
    }
  }

  saveICalFeeds(feeds);
  setLastSyncTimestamp(Date.now());
  notifySyncListeners();

  return { total: totalEventosGeral, feedsCount: sincronizadosComSucesso };
}

/**
 * Checagem silenciosa e automática em segundo plano (respeita cooldown e toggle).
 */
export async function checkSilentICalSync(): Promise<boolean> {
  try {
    if (!getAutoSyncEnabled()) return false;
    const feeds = getICalFeeds();
    if (feeds.length === 0) return false;

    const lastSync = getLastSyncTimestamp();
    const agora = Date.now();
    if (lastSync && agora - lastSync < SILENT_SYNC_COOLDOWN_MS) {
      // Cooldown ativo, não precisa buscar novamente
      return false;
    }

    await syncAllICalFeeds(true);
    return true;
  } catch (err) {
    console.warn('[icsService] Erro na sincronização silenciosa automática do iCal:', err);
    return false;
  }
}

/**
 * Abre o seletor de documentos, lê o arquivo .ics local e grava os eventos no SQLite.
 */
export async function importarArquivoICS(): Promise<{ count: number } | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['text/calendar', 'application/ics', '*/*'],
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  const file = result.assets[0];
  let text = '';

  try {
    text = await FileSystemLegacy.readAsStringAsync(file.uri, {
      encoding: FileSystemLegacy.EncodingType.UTF8,
    });
  } catch {
    try {
      text = await new FileSystem.File(file.uri).text();
    } catch {
      if (!file.uri.startsWith('content://')) {
        text = await (await fetch(file.uri)).text();
      } else {
        throw new Error('Não foi possível ler o arquivo selecionado.');
      }
    }
  }

  const eventos = parseICSContent(text, 'Faculdade', 'manual');
  if (eventos.length === 0) {
    throw new Error('Nenhum evento válido foi encontrado no arquivo .ics selecionado.');
  }

  const count = await salvarEventosICSNoBanco(eventos, 'manual');
  return { count };
}

/**
 * Conta quantos eventos adicionados via .ICS local existem na agenda.
 * Considera tags 'ics_manual', 'ics_local', 'ical_manual' ou registros legados do importador ICS.
 */
export async function contarEventosICSLocais(): Promise<number> {
  const database = getDatabase();
  const row = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM AtividadesAgenda 
     WHERE id_recorrente IN ('ics_manual', 'ics_local', 'ical_manual') 
        OR id LIKE 'ical_manual_%'
        OR (id_recorrente IS NULL AND icone = 'book' AND tipo = 'Faculdade' AND feedback_cansaco = 2);`
  );
  return row?.count || 0;
}

/**
 * Remove todos os eventos adicionados via .ICS da agenda no SQLite.
 */
export async function limparEventosICSLocais(): Promise<number> {
  const database = getDatabase();
  const res = await database.runAsync(
    `DELETE FROM AtividadesAgenda 
     WHERE id_recorrente IN ('ics_manual', 'ics_local', 'ical_manual') 
        OR id LIKE 'ical_manual_%'
        OR (id_recorrente IS NULL AND icone = 'book' AND tipo = 'Faculdade' AND feedback_cansaco = 2);`
  );
  notifySyncListeners();
  return res.changes;
}
