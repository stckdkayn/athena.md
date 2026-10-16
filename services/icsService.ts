import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { getDatabase } from '@/services/database';

export interface EventoICS {
  id: string;
  titulo: string;
  tipo: string;
  icone: string;
  data_agendada: string; // YYYY-MM-DD
  hora_inicio: string | null; // HH:MM
  hora_fim: string | null; // HH:MM
  feedback_cansaco: number;
}

interface ParsedDateTime {
  dateStr: string;
  timeStr: string | null;
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

/**
 * Converte data e hora do iCalendar para horário local (YYYY-MM-DD e HH:MM).
 * Trata formatos UTC terminados em Z, formatos com hora local e formatos somente data.
 */
function parseIcsDateTime(val: string): ParsedDateTime | null {
  if (!val) return null;
  const clean = val.trim();

  // 1. Formato UTC: YYYYMMDDTHHMMSSZ (ex: 20261015T143000Z)
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

  // 2. Formato Local/Floating: YYYYMMDDTHHMMSS (ex: 20261015T113000)
  const localMatch = clean.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?$/);
  if (localMatch) {
    const [, y, m, d, h, min] = localMatch;
    return {
      dateStr: `${y}-${m}-${d}`,
      timeStr: `${h}:${min}`,
    };
  }

  // 3. Formato Somente Data: YYYYMMDD (ex: 20261015)
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

/**
 * Lê o conteúdo em texto do padrão iCalendar e extrai os blocos VEVENT.
 */
export function parseICSContent(icsText: string): EventoICS[] {
  // Desdobra linhas longas (RFC 5545)
  const unfolded = icsText.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);

  const eventos: EventoICS[] = [];
  let inEvent = false;
  let currentSummary = '';
  let currentDtStart = '';
  let currentDtEnd = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === 'BEGIN:VEVENT') {
      inEvent = true;
      currentSummary = '';
      currentDtStart = '';
      currentDtEnd = '';
      continue;
    }

    if (trimmed === 'END:VEVENT') {
      if (inEvent && currentSummary && currentDtStart) {
        const start = parseIcsDateTime(currentDtStart);
        const end = currentDtEnd ? parseIcsDateTime(currentDtEnd) : null;

        if (start) {
          eventos.push({
            id: generateUUID(),
            titulo: unescapeIcsText(currentSummary) || 'Aula / Evento',
            tipo: 'Faculdade',
            icone: 'book',
            data_agendada: start.dateStr,
            hora_inicio: start.timeStr,
            hora_fim: end?.timeStr || (start.timeStr ? somarUmaHora(start.timeStr) : null),
            feedback_cansaco: 2,
          });
        }
      }
      inEvent = false;
      continue;
    }

    if (!inEvent) continue;

    // Extrai SUMMARY
    if (trimmed.startsWith('SUMMARY:') || trimmed.startsWith('SUMMARY;')) {
      const idx = trimmed.indexOf(':');
      if (idx !== -1) {
        currentSummary = trimmed.substring(idx + 1);
      }
    }
    // Extrai DTSTART
    else if (trimmed.startsWith('DTSTART:') || trimmed.startsWith('DTSTART;')) {
      const idx = trimmed.indexOf(':');
      if (idx !== -1) {
        currentDtStart = trimmed.substring(idx + 1);
      }
    }
    // Extrai DTEND
    else if (trimmed.startsWith('DTEND:') || trimmed.startsWith('DTEND;')) {
      const idx = trimmed.indexOf(':');
      if (idx !== -1) {
        currentDtEnd = trimmed.substring(idx + 1);
      }
    }
  }

  return eventos;
}

/**
 * Insere os eventos importados do .ics em lote dentro de uma transação exclusiva no SQLite.
 */
export async function salvarEventosICSNoBanco(eventos: EventoICS[]): Promise<number> {
  if (!eventos || eventos.length === 0) return 0;
  const database = getDatabase();
  const ts = Date.now();

  let inseridos = 0;
  await database.withExclusiveTransactionAsync(async (txn) => {
    for (const ev of eventos) {
      await txn.runAsync(
        `INSERT INTO AtividadesAgenda (
          id, titulo, tipo, icone, data_agendada, hora_inicio, hora_fim, feedback_cansaco, concluida, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?);`,
        [
          ev.id,
          ev.titulo,
          ev.tipo,
          ev.icone,
          ev.data_agendada,
          ev.hora_inicio,
          ev.hora_fim,
          ev.feedback_cansaco,
          ts,
        ]
      );
      inseridos++;
    }
  });

  return inseridos;
}

/**
 * Abre o seletor de documentos, lê o arquivo .ics e grava os eventos no SQLite.
 * Retorna a quantidade de eventos importados com sucesso ou null se o usuário cancelar.
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

  const eventos = parseICSContent(text);
  if (eventos.length === 0) {
    throw new Error('Nenhum evento válido foi encontrado no arquivo .ics selecionado.');
  }

  const count = await salvarEventosICSNoBanco(eventos);
  return { count };
}
