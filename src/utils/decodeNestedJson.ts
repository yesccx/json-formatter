export class NestedJsonError extends Error {}

function looksLikeNestedJsonString(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const ch = trimmed[0];
  // Only attempt nested decoding for typical JSON containers / string literals.
  // This avoids converting numeric strings like "2222..." into Numbers (which then
  // render as scientific notation and lose precision).
  return ch === '{' || ch === '[' || ch === '"';
}

function tryParseJson(value: string): unknown | undefined {
  if (!looksLikeNestedJsonString(value)) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function decodeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    const parsed = tryParseJson(value);
    if (parsed === undefined) return value;
    return decodeValue(parsed);
  }

  if (Array.isArray(value)) {
    return value.map((item) => decodeValue(item));
  }

  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      result[key] = decodeValue(v);
    }
    return result;
  }

  return value;
}

export function decodeNestedJson(input: string): unknown {
  let root: unknown;
  try {
    root = JSON.parse(input);
  } catch (error) {
    throw new NestedJsonError(
      error instanceof Error ? error.message : 'Invalid JSON input',
    );
  }

  return decodeValue(root);
}
