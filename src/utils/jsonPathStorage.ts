const JSONPATH_STORAGE_KEY = 'json-formatter:jsonpath-columns';

export type JsonPathColumnStored = {
  name: string;
  expr: string;
};

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isColumnsArray(value: unknown): value is JsonPathColumnStored[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item &&
        typeof item === 'object' &&
        'name' in item &&
        'expr' in item &&
        typeof (item as any).name === 'string' &&
        typeof (item as any).expr === 'string',
    )
  );
}

export function loadJsonPathColumns(): JsonPathColumnStored[] {
  if (typeof window === 'undefined') return [{ name: '', expr: '$' }];

  try {
    const raw = window.localStorage.getItem(JSONPATH_STORAGE_KEY);
    if (!raw) return [{ name: '', expr: '$' }];

    const parsed = JSON.parse(raw) as unknown;

    // Migration: old format was string[] of expressions.
    if (isStringArray(parsed)) {
      const migrated = parsed.map((expr) => ({ name: '', expr }));
      return migrated.length ? migrated : [{ name: '', expr: '$' }];
    }

    if (!isColumnsArray(parsed)) return [{ name: '', expr: '$' }];

    const cleaned = parsed.map((c) => ({
      name: (c.name ?? '').trim(),
      expr: (c.expr ?? '').trim(),
    }));
    return cleaned.length ? cleaned : [{ name: '', expr: '$' }];
  } catch {
    return [{ name: '', expr: '$' }];
  }
}

export function saveJsonPathColumns(columns: JsonPathColumnStored[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(JSONPATH_STORAGE_KEY, JSON.stringify(columns));
  } catch {
    // ignore
  }
}
