export interface FormatRecord {
  id: string;
  createdAt: number;
  input: string;
}

const STORAGE_KEY = 'jsonFormatter:history';
const MAX_RECORDS = 100;

function safeParse(raw: string | null): FormatRecord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is FormatRecord => {
        return (
          item &&
          typeof item === 'object' &&
          typeof (item as any).id === 'string' &&
          typeof (item as any).createdAt === 'number' &&
          typeof (item as any).input === 'string'
        );
      })
      .slice(0, MAX_RECORDS);
  } catch {
    return [];
  }
}

export function loadHistory(): FormatRecord[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return safeParse(raw);
}

export function saveHistory(records: FormatRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = records.slice(0, MAX_RECORDS);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore quota errors etc.
  }
}

export function addRecord(input: string): FormatRecord[] {
  const now = Date.now();
  const base: FormatRecord = {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
    input,
  };

  const current = loadHistory();

  const withoutDuplicate = current.filter((r) => r.input !== input);
  const next = [base, ...withoutDuplicate].slice(0, MAX_RECORDS);
  saveHistory(next);
  return next;
}

export function clearHistory(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}
