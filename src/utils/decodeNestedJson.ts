export class NestedJsonError extends Error {}

function tryParseJson(value: string): unknown | undefined {
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
