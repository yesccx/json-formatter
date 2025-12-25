import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { JSONPath } from 'jsonpath-plus';
import { useI18n } from '../i18n/I18nProvider';
import {
  IconCheck,
  IconCopy,
  IconDownload,
  IconEdit,
  IconPlus,
  IconRefresh,
  IconTrash,
  IconX,
} from './Icons';
import {
  JsonPathColumnStored,
  loadJsonPathColumns,
  saveJsonPathColumns,
} from '../utils/jsonPathStorage';

type ColumnEval = {
  name: string;
  expr: string;
  values: JsonPathMatch[];
  error: string | null;
};

type JsonPathMatch = {
  value: unknown;
  pointer?: string;
  path?: string;
  parent?: unknown;
  parentProperty?: string | number | null;
};

type Suggestion = {
  label: string;
  value: string;
  sample?: string;
  sampleTitle?: string;
};

function toErrorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    const msg = (e as any).message;
    if (typeof msg === 'string' && msg.trim()) return msg;
  }
  return String(e);
}

function stringifyCell(value: unknown): string {
  if (value === undefined) return '';
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function preview(text: string, maxLen: number): { display: string; full: string } {
  if (text.length <= maxLen) return { display: text, full: text };
  return { display: `${text.slice(0, maxLen)}…`, full: text };
}

function toSample(value: unknown): { display: string; full: string } {
  return preview(stringifyCell(value), 56);
}


function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getStringKeys(value: unknown): string[] {
  if (!isPlainObject(value)) return [];
  return Object.keys(value).sort((a, b) => a.localeCompare(b));
}

function findLastTopLevelDot(prefix: string): number {
  // Scan backwards, ignoring dots inside brackets/quotes.
  let bracketDepth = 0;
  let quote: '"' | "'" | null = null;
  for (let i = prefix.length - 1; i >= 0; i -= 1) {
    const ch = prefix[i];
    const prev = i > 0 ? prefix[i - 1] : '';
    if (quote) {
      if (ch === quote && prev !== '\\') {
        quote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      if (prev !== '\\') quote = ch;
      continue;
    }

    if (ch === ']') {
      bracketDepth += 1;
      continue;
    }
    if (ch === '[') {
      bracketDepth = Math.max(0, bracketDepth - 1);
      continue;
    }
    if (bracketDepth > 0) continue;

    if (ch === '.') return i;
  }
  return -1;
}

function isIdentifierKey(key: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key);
}

function escapeSingleQuotedString(raw: string): string {
  return raw.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

type CompletionContext =
  | {
      kind: 'none';
      replace: { start: number; end: number };
    }
  | {
      kind: 'dot';
      base: string;
      partial: string;
      replace: { start: number; end: number };
    }
  | {
      kind: 'descendant';
      base: string;
      partial: string;
      replace: { start: number; end: number };
    }
  | {
      kind: 'bracket-string';
      base: string;
      partial: string;
      replace: { start: number; end: number };
    }
  | {
      kind: 'bracket-index';
      base: string;
      partial: string;
      replace: { start: number; end: number };
    }
  | {
      kind: 'root';
      replace: { start: number; end: number };
    };

function getCompletionContext(expr: string, cursor: number): CompletionContext {
  const safeCursor = Math.max(0, Math.min(cursor, expr.length));
  const prefix = expr.slice(0, safeCursor);
  if (!prefix.startsWith('$')) {
    return { kind: 'root', replace: { start: 0, end: safeCursor } };
  }

  // Fast path: if currently completing a dot-segment
  const lastDot = findLastTopLevelDot(prefix);
  if (lastDot >= 1) {
    if (prefix[lastDot - 1] === '.') {
      const base = prefix.slice(0, lastDot + 1);
      const partial = prefix.slice(lastDot + 1);
      return {
        kind: 'descendant',
        base,
        partial,
        replace: { start: base.length, end: safeCursor },
      };
    }

    const base = prefix.slice(0, lastDot);
    const partial = prefix.slice(lastDot + 1);
    return {
      kind: 'dot',
      base,
      partial,
      replace: { start: lastDot, end: safeCursor },
    };
  }

  // Try bracket context: find last '[' not closed before cursor.
  // We scan prefix to track the most recent bracket start and whether we're in quotes.
  let lastBracket = -1;
  let inQuote: '"' | "'" | null = null;
  for (let i = 0; i < prefix.length; i += 1) {
    const ch = prefix[i];
    const prev = i > 0 ? prefix[i - 1] : '';
    if (inQuote) {
      if (ch === inQuote && prev !== '\\') {
        inQuote = null;
      }
      continue;
    }
    if ((ch === '"' || ch === "'") && prev !== '\\') {
      inQuote = ch;
      continue;
    }
    if (ch === '[') {
      lastBracket = i;
      continue;
    }
    if (ch === ']') {
      lastBracket = -1;
      continue;
    }
  }

  if (lastBracket >= 0) {
    const base = prefix.slice(0, lastBracket);
    const after = prefix.slice(lastBracket + 1);

    // Do not attempt suggestions inside filter/dynamic expressions like:
    // [?(...)], [(...)]. These are scripts, not path segments.
    const afterTrim = after.trimStart();
    if (afterTrim.startsWith('?(') || afterTrim.startsWith('(')) {
      return { kind: 'none', replace: { start: safeCursor, end: safeCursor } };
    }

    if (after.startsWith("'") || after.startsWith('"')) {
      const q = after[0];
      const partial = after.slice(1);
      return {
        kind: 'bracket-string',
        base,
        partial,
        replace: { start: lastBracket, end: safeCursor },
      };
    }
    return {
      kind: 'bracket-index',
      base,
      partial: after,
      replace: { start: lastBracket, end: safeCursor },
    };
  }

  return { kind: 'root', replace: { start: 0, end: safeCursor } };
}

function collectObjectKeysFromMatches(matches: unknown[]): string[] {
  const out = new Set<string>();
  for (const m of matches) {
    if (isPlainObject(m)) {
      for (const k of Object.keys(m)) out.add(k);
    }
  }
  return Array.from(out).sort((a, b) => a.localeCompare(b));
}

function collectArraySampleLength(matches: unknown[]): number {
  let max = 0;
  for (const m of matches) {
    if (Array.isArray(m)) max = Math.max(max, m.length);
  }
  return max;
}

function collectDescendantKeys(root: unknown, maxNodes = 1200): string[] {
  const out = new Set<string>();
  const queue: unknown[] = [root];
  let seen = 0;
  while (queue.length && seen < maxNodes) {
    const cur = queue.shift();
    seen += 1;
    if (cur === null || cur === undefined) continue;
    if (Array.isArray(cur)) {
      for (const v of cur) queue.push(v);
      continue;
    }
    if (isPlainObject(cur)) {
      for (const [k, v] of Object.entries(cur)) {
        out.add(k);
        queue.push(v);
      }
    }
  }
  return Array.from(out).sort((a, b) => a.localeCompare(b));
}

function collectDescendantKeySamples(
  root: unknown,
  maxNodes = 1200,
): Map<string, { display: string; full: string }> {
  const out = new Map<string, { display: string; full: string }>();
  const queue: unknown[] = [root];
  let seen = 0;
  while (queue.length && seen < maxNodes) {
    const cur = queue.shift();
    seen += 1;
    if (cur === null || cur === undefined) continue;
    if (Array.isArray(cur)) {
      for (const v of cur) queue.push(v);
      continue;
    }
    if (isPlainObject(cur)) {
      for (const [k, v] of Object.entries(cur)) {
        if (!out.has(k)) out.set(k, toSample(v));
        queue.push(v);
      }
    }
  }
  return out;
}

function getLastExprSegmentLabel(exprRaw: string): string | null {
  const expr = (exprRaw ?? '').trim();
  if (!expr) return null;
  try {
    const parts = JSONPath.toPathArray(expr);
    for (let i = parts.length - 1; i >= 0; i -= 1) {
      const token = parts[i];
      if (!token || token === '$' || token === '^' || token === '~') continue;
      if (/^@.*\(\)$/u.test(token)) continue;

      if (token === '*') return '*';
      if (token === '..') return '..';
      if (token.startsWith('?(')) return '?()';
      if (token.startsWith('(')) return '()';

      if (/^[0-9]+$/u.test(token) || /^-?\d*:-?\d*:?(\d*)$/u.test(token)) {
        return `[${token}]`;
      }
      return token;
    }
    return null;
  } catch {
    return null;
  }
}

export function JsonPathTable({
  value,
  onEditAtPointer,
}: {
  value: unknown;
  onEditAtPointer?: (pointer: string, nextValue: unknown) => void;
}) {
  const { t } = useI18n();
  const POPOVER_ANIM_MS = 140;
  const [docsOpen, setDocsOpen] = useState(false);
  const [docsLeaving, setDocsLeaving] = useState(false);
  const docsTimerRef = useRef<number | null>(null);
  const [columnsInput, setColumnsInput] = useState<JsonPathColumnStored[]>(() =>
    loadJsonPathColumns(),
  );
  const [exportSuccess, setExportSuccess] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [tableMenu, setTableMenu] = useState<{
    x: number;
    y: number;
    rowIndex: number;
    colIndex: number | null;
  } | null>(null);
  const [tableMenuLeaving, setTableMenuLeaving] = useState(false);
  const tableMenuRef = useRef<HTMLDivElement | null>(null);
  const tableMenuTimerRef = useRef<number | null>(null);

  const [cellEditor, setCellEditor] = useState<{
    x: number;
    y: number;
    rowIndex: number;
    colIndex: number;
    pointer: string;
    originalValue: unknown;
    text: string;
    error: string | null;
  } | null>(null);
  const [cellEditorLeaving, setCellEditorLeaving] = useState(false);
  const cellEditorRef = useRef<HTMLDivElement | null>(null);
  const cellEditorTimerRef = useRef<number | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [headerPopoverLeaving, setHeaderPopoverLeaving] = useState(false);
  const headerPopoverTimerRef = useRef<number | null>(null);
  const tableWrapRef = useRef<HTMLDivElement | null>(null);
  const headerPopoverAnchorRef = useRef<HTMLElement | null>(null);
  const [headerPopoverPos, setHeaderPopoverPos] = useState<{ x: number; y: number; maxH: number } | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  const exprInputRef = useRef<HTMLInputElement | null>(null);
  const suggestRef = useRef<HTMLDivElement | null>(null);
  const suggestItemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const [suggestOpenFor, setSuggestOpenFor] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeSuggest, setActiveSuggest] = useState(0);
  const [suggestReplace, setSuggestReplace] = useState<{ start: number; end: number } | null>(null);

  const ensureSuggestVisible = (index: number) => {
    const container = suggestRef.current;
    const item = suggestItemRefs.current[index];
    if (!container || !item) return;

    // Use DOMRects (instead of offsetTop) so it works regardless of offsetParent.
    const padding = 6;
    const c = container.getBoundingClientRect();
    const r = item.getBoundingClientRect();

    // Item above visible area: scroll up just enough.
    if (r.top < c.top + padding) {
      const delta = (c.top + padding) - r.top;
      container.scrollTop = Math.max(0, container.scrollTop - delta);
      return;
    }

    // Item below visible area: scroll down just enough.
    if (r.bottom > c.bottom - padding) {
      const delta = r.bottom - (c.bottom - padding);
      container.scrollTop = Math.max(0, container.scrollTop + delta);
    }
  };

  useEffect(() => {
    if (suggestOpenFor === null || suggestions.length === 0) return;
    window.requestAnimationFrame(() => ensureSuggestVisible(activeSuggest));
  }, [activeSuggest, suggestOpenFor, suggestions.length]);

  useEffect(() => {
    saveJsonPathColumns(columnsInput);
  }, [columnsInput]);

  useEffect(() => {
    return () => {
      if (docsTimerRef.current) window.clearTimeout(docsTimerRef.current);
      if (tableMenuTimerRef.current) window.clearTimeout(tableMenuTimerRef.current);
      if (cellEditorTimerRef.current) window.clearTimeout(cellEditorTimerRef.current);
      if (headerPopoverTimerRef.current) window.clearTimeout(headerPopoverTimerRef.current);
    };
  }, []);

  const closeDocs = (immediate = false) => {
    if (!docsOpen) return;
    if (docsTimerRef.current) window.clearTimeout(docsTimerRef.current);

    if (immediate) {
      setDocsLeaving(false);
      setDocsOpen(false);
      return;
    }

    setDocsLeaving(true);
    docsTimerRef.current = window.setTimeout(() => {
      setDocsOpen(false);
      setDocsLeaving(false);
    }, POPOVER_ANIM_MS);
  };

  const openDocs = () => {
    if (docsTimerRef.current) window.clearTimeout(docsTimerRef.current);
    setDocsLeaving(false);
    setDocsOpen(true);
  };

  const closeTableMenu = (immediate = false) => {
    if (!tableMenu) return;
    if (tableMenuTimerRef.current) window.clearTimeout(tableMenuTimerRef.current);

    if (immediate) {
      setTableMenuLeaving(false);
      setTableMenu(null);
      return;
    }

    setTableMenuLeaving(true);
    tableMenuTimerRef.current = window.setTimeout(() => {
      setTableMenu(null);
      setTableMenuLeaving(false);
    }, POPOVER_ANIM_MS);
  };

  const closeCellEditor = (immediate = false) => {
    if (!cellEditor) return;
    if (cellEditorTimerRef.current) window.clearTimeout(cellEditorTimerRef.current);

    if (immediate) {
      setCellEditorLeaving(false);
      setCellEditor(null);
      return;
    }

    setCellEditorLeaving(true);
    cellEditorTimerRef.current = window.setTimeout(() => {
      setCellEditor(null);
      setCellEditorLeaving(false);
    }, POPOVER_ANIM_MS);
  };

  const closeHeaderPopover = (immediate = false) => {
    if (editingIndex === null) return;
    if (headerPopoverTimerRef.current) window.clearTimeout(headerPopoverTimerRef.current);

    // Close suggestions immediately when closing popover.
    setSuggestOpenFor(null);
    setSuggestions([]);
    setActiveSuggest(0);
    setSuggestReplace(null);

    if (immediate) {
      setHeaderPopoverLeaving(false);
      setEditingIndex(null);
      return;
    }

    setHeaderPopoverLeaving(true);
    headerPopoverTimerRef.current = window.setTimeout(() => {
      setEditingIndex(null);
      setHeaderPopoverLeaving(false);
    }, POPOVER_ANIM_MS);
  };

  const openHeaderPopover = (idx: number, anchor: HTMLElement) => {
    if (headerPopoverTimerRef.current) window.clearTimeout(headerPopoverTimerRef.current);
    setHeaderPopoverLeaving(false);
    headerPopoverAnchorRef.current = anchor;
    const pos = computeHeaderPopoverPos(anchor);
    if (pos) setHeaderPopoverPos(pos);
    setEditingIndex(idx);
  };

  useEffect(() => {
    if (editingIndex === null) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (popoverRef.current && popoverRef.current.contains(target)) {
        return;
      }
      closeHeaderPopover();
    };

    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [editingIndex]);

  const computeHeaderPopoverPos = (
    anchor: HTMLElement | null,
  ): { x: number; y: number; maxH: number } | null => {
    const wrapEl = tableWrapRef.current;
    if (!wrapEl) return null;
    const wrapRect = wrapEl.getBoundingClientRect();

    // Horizontal: center within the table area.
    const desiredCenterX = wrapRect.left + wrapRect.width / 2;

    // Vertical: keep close to the clicked header (prefer below it).
    const anchorRect = anchor?.getBoundingClientRect();
    const desiredTopY = (anchorRect ? anchorRect.bottom : wrapRect.top) + 8;

    // Keep the popover visible in viewport.
    // Since popover uses translateX(-50%), x is the CENTER.
    const popoverW = Math.min(500, window.innerWidth * 0.9);
    const minCenterX = popoverW / 2 + 8;
    const maxCenterX = Math.max(minCenterX, window.innerWidth - popoverW / 2 - 8);
    const x = Math.max(minCenterX, Math.min(desiredCenterX, maxCenterX));

    // y is TOP (no translateY). "贴近表头" means it must appear BELOW the header.
    // If there's not enough space below, shrink max-height instead of moving the popover upward.
    const availableBelow = Math.max(120, window.innerHeight - desiredTopY - 8);
    const maxH = Math.min(window.innerHeight * 0.7, availableBelow);
    const y = Math.max(8, desiredTopY);

    return { x, y, maxH };
  };

  useLayoutEffect(() => {
    if (editingIndex === null) {
      setHeaderPopoverPos(null);
      headerPopoverAnchorRef.current = null;
      return;
    }

    const updatePos = () => {
      const pos = computeHeaderPopoverPos(headerPopoverAnchorRef.current);
      if (pos) setHeaderPopoverPos(pos);
    };

    updatePos();
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    return () => {
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
    };
  }, [editingIndex]);

  useEffect(() => {
    // Close suggestions when closing popover
    if (editingIndex === null) {
      setSuggestOpenFor(null);
      setSuggestions([]);
      setActiveSuggest(0);
      setSuggestReplace(null);
    }
  }, [editingIndex]);

  useEffect(() => {
    if (!tableMenu && !cellEditor) return;

    const handleMouseDown = (e: MouseEvent) => {
      const menuEl = tableMenuRef.current;
      const editorEl = cellEditorRef.current;
      const target = e.target;
      if (!(target instanceof Node)) return;

      if (menuEl && menuEl.contains(target)) return;
      if (editorEl && editorEl.contains(target)) return;

      closeTableMenu();
      closeCellEditor();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeTableMenu();
        closeCellEditor();
      }
    };

    const handleResize = () => {
      closeTableMenu();
      closeCellEditor();
    };
    const handleScroll = () => {
      // Scrolling should dismiss the context menu (it is position-sensitive),
      // but keep the cell editor open so users can edit while scrolling.
      closeTableMenu();
    };

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
    };
  }, [tableMenu, cellEditor]);

  useEffect(() => {
    if (!docsOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDocs();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [docsOpen]);

  const columns: ColumnEval[] = useMemo(() => {
    return columnsInput.map((colRaw) => {
      const name = (colRaw.name ?? '').trim();
      const exprRaw = colRaw.expr ?? '';
      const expr = exprRaw.trim();
      if (!expr) {
        return {
          name,
          expr: exprRaw,
          values: [],
          error: t('jsonpath.error.empty'),
        };
      }

      try {
        const result = JSONPath({
          path: expr,
          json: value as any,
          wrap: true,
          resultType: 'all',
        }) as unknown;
        const raw = Array.isArray(result) ? (result as any[]) : [result as any];
        const values: JsonPathMatch[] = raw.map((r) => {
          if (r && typeof r === 'object') {
            return {
              value: (r as any).value,
              pointer: typeof (r as any).pointer === 'string' ? (r as any).pointer : undefined,
              path: typeof (r as any).path === 'string' ? (r as any).path : undefined,
              parent: (r as any).parent,
              parentProperty: (r as any).parentProperty,
            };
          }
          return { value: r };
        });
        return { name, expr: exprRaw, values, error: null };
      } catch (e) {
        return { name, expr: exprRaw, values: [], error: toErrorMessage(e) };
      }
    });
  }, [columnsInput, t, value]);

  const rowCount = useMemo(() => {
    let max = 0;
    for (const col of columns) {
      if (col.values.length > max) max = col.values.length;
    }
    return max;
  }, [columns]);

  const addColumn = () => {
    setColumnsInput((prev) => [...prev, { name: '', expr: '$' }]);
  };

  const removeColumn = (index: number) => {
    setColumnsInput((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.slice();
      next.splice(index, 1);
      return next;
    });
  };

  const moveColumn = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setColumnsInput((prev) => {
      if (fromIndex < 0 || toIndex < 0) return prev;
      if (fromIndex >= prev.length || toIndex >= prev.length) return prev;
      const next = prev.slice();
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      return next;
    });
  };

  const updateName = (index: number, nextValue: string) => {
    setColumnsInput((prev) => {
      const next = prev.slice();
      next[index] = { ...next[index], name: nextValue };
      return next;
    });
  };

  const updateExpr = (index: number, nextValue: string) => {
    setColumnsInput((prev) => {
      const next = prev.slice();
      next[index] = { ...next[index], expr: nextValue };
      return next;
    });
  };

  const computeSuggestions = (
    exprRaw: string,
    cursor: number,
  ): { items: Suggestion[]; replace: { start: number; end: number } } => {
    const expr = exprRaw ?? '';
    const safeCursor = Math.max(0, Math.min(cursor, expr.length));
    const ctx = getCompletionContext(expr, safeCursor);

    const makeRoot = (): { items: Suggestion[]; replace: { start: number; end: number } } => {
      const items: Suggestion[] = [];
      items.push({ label: '$', value: '$' });
      items.push({ label: '$.*', value: '$.*' });
      items.push({ label: '$..*', value: '$..*' });
      items.push({ label: '$[*]', value: '$[*]' });
      const rootKeys = getStringKeys(value);
      for (const k of rootKeys.slice(0, 80)) {
        const seg = isIdentifierKey(k) ? `$.${k}` : `$['${escapeSingleQuotedString(k)}']`;
        const sample = toSample((value as any)[k]);
        items.push({ label: seg, value: seg, sample: sample.display, sampleTitle: sample.full });
      }
      return { items, replace: { start: 0, end: expr.length } };
    };

    if (ctx.kind === 'root') {
      return makeRoot();
    }

    if (ctx.kind === 'none') {
      return { items: [], replace: ctx.replace };
    }

    const tryEval = (path: string): unknown[] | null => {
      try {
        const ret = JSONPath({ path, json: value as any, wrap: true }) as unknown;
        if (!Array.isArray(ret)) return [ret];
        return (ret as unknown[]).slice(0, 40);
      } catch {
        return null;
      }
    };

    const base = ctx.base;
    const partialRaw =
      ctx.kind === 'dot' || ctx.kind === 'bracket-string' || ctx.kind === 'descendant'
        ? ctx.partial
        : ctx.kind === 'bracket-index'
          ? ctx.partial
          : '';

    // Descendant operator (..): suggest any keys seen in the document.
    if (ctx.kind === 'descendant') {
      const partial = partialRaw.trim();
      const samples = collectDescendantKeySamples(value);
      const keys = Array.from(samples.keys()).sort((a, b) => a.localeCompare(b));
      const filtered = partial
        ? keys.filter((k) => k.toLowerCase().startsWith(partial.toLowerCase()))
        : keys;
      const items: Suggestion[] = [];
      if (!partial || '*'.startsWith(partial)) {
        items.push({ label: `${ctx.base}*`, value: '*' });
      }
      for (const k of filtered.slice(0, 80)) {
        const sample = samples.get(k);
        items.push({
          label: `${ctx.base}${k}`,
          value: k,
          sample: sample?.display,
          sampleTitle: sample?.full,
        });
      }
      return { items, replace: ctx.replace };
    }

    const matches = tryEval(base);
    if (!matches) {
      return makeRoot();
    }

    const arrayLen = collectArraySampleLength(matches);
    const objectKeys = collectObjectKeysFromMatches(matches);
    const sampleByKey = new Map<string, { display: string; full: string }>();
    for (const m of matches) {
      if (!isPlainObject(m)) continue;
      for (const [k, v] of Object.entries(m)) {
        if (!sampleByKey.has(k)) sampleByKey.set(k, toSample(v));
      }
    }

    // Array index/wildcard suggestions when base resolves to an array.
    if (arrayLen > 0 || matches.some((m) => Array.isArray(m))) {
      const items: Suggestion[] = [];
      const partial = (ctx.kind === 'bracket-index' ? partialRaw : '').trim();
      const options: string[] = ['[*]'];
      if (arrayLen > 0) options.push('[0]');
      if (arrayLen > 1) options.push('[1]');
      if (arrayLen > 2) options.push('[2]');

      const firstArray = matches.find((m) => Array.isArray(m)) as unknown[] | undefined;
      const arraySample = firstArray
        ? firstArray.length
          ? toSample(firstArray[0])
          : toSample(firstArray)
        : null;

      for (const opt of options) {
        if (!partial || opt.startsWith(`[${partial}`) || opt.startsWith(partial)) {
          let sampleText: { display: string; full: string } | null = null;
          if (opt === '[*]') {
            sampleText = arraySample;
          } else if (/^\[\d+\]$/u.test(opt) && firstArray) {
            const i = Number.parseInt(opt.slice(1, -1), 10);
            if (Number.isFinite(i) && i >= 0 && i < firstArray.length) {
              sampleText = toSample(firstArray[i]);
            }
          }
          items.push({
            label: `${base}${opt}`,
            value: opt,
            sample: sampleText?.display ?? (arrayLen ? `len=${arrayLen}` : undefined),
            sampleTitle: sampleText?.full ?? (arrayLen ? `len=${arrayLen}` : undefined),
          });
        }
      }

      // If user typed a dot after an array (e.g. $.arr.), replace the dot with an index/wildcard.
      if (ctx.kind === 'dot') {
        return { items, replace: ctx.replace };
      }

      return { items, replace: ctx.replace };
    }

    // Object key suggestions
    const partial =
      ctx.kind === 'dot' || ctx.kind === 'bracket-string' ? partialRaw.trim() : '';
    const filtered = partial
      ? objectKeys.filter((k) => k.toLowerCase().startsWith(partial.toLowerCase()))
      : objectKeys;

    const items: Suggestion[] = [];
    for (const k of filtered.slice(0, 80)) {
      let seg: string;
      if (ctx.kind === 'dot') {
        seg = isIdentifierKey(k) ? `.${k}` : `['${escapeSingleQuotedString(k)}']`;
      } else {
        seg = `['${escapeSingleQuotedString(k)}']`;
      }
      const sample = sampleByKey.get(k);
      items.push({
        label: `${base}${seg}`,
        value: seg,
        sample: sample?.display,
        sampleTitle: sample?.full,
      });
    }

    return { items, replace: ctx.replace };
  };

  const openSuggestions = (index: number, exprRaw: string, cursor: number) => {
    const next = computeSuggestions(exprRaw, cursor);
    setSuggestions(next.items);
    setActiveSuggest(0);
    setSuggestReplace(next.replace);
    setSuggestOpenFor(next.items.length ? index : null);
  };

  const applySuggestion = (index: number, item: Suggestion) => {
    const current = columnsInput[index]?.expr ?? '';
    // Recompute replace range at apply-time using the current cursor,
    // but do not continuously recompute suggestions as the cursor moves.
    const cursor = exprInputRef.current?.selectionStart ?? current.length;
    const replace = computeSuggestions(current, cursor).replace;
    const next = `${current.slice(0, replace.start)}${item.value}${current.slice(replace.end)}`;
    updateExpr(index, next);
    setSuggestOpenFor(null);

    // Keep typing focus in the expression input (clicking a suggestion is a button press).
    window.requestAnimationFrame(() => {
      exprInputRef.current?.focus();
    });
  };

  const getColumnKey = (col: ColumnEval, index: number): string => {
    const name = (col.name ?? '').trim();
    if (name) return name;
    const expr = (col.expr ?? '').trim();
    if (expr) return expr;
    return `col${index + 1}`;
  };

  const buildExportRows = (): Record<string, unknown>[] => {
    return Array.from({ length: rowCount }).map((_, rowIndex) => {
      const row: Record<string, unknown> = {};
      columns.forEach((col, colIndex) => {
        const key = getColumnKey(col, colIndex);
        row[key] = rowIndex < col.values.length ? col.values[rowIndex]?.value : null;
      });
      return row;
    });
  };

  const buildExportRow = (rowIndex: number): Record<string, unknown> => {
    const row: Record<string, unknown> = {};
    columns.forEach((col, colIndex) => {
      const key = getColumnKey(col, colIndex);
      row[key] = rowIndex < col.values.length ? col.values[rowIndex]?.value : null;
    });
    return row;
  };

  const handleExportJson = () => {
    setExportError(null);
    setExportSuccess(false);

    if (typeof navigator === 'undefined' || !('clipboard' in navigator)) {
      setExportError(t('jsonpath.exportUnavailable'));
      return;
    }

    try {
      const rows = buildExportRows();
      const text = JSON.stringify(rows, null, 2);
      void navigator.clipboard.writeText(text);
      setExportSuccess(true);
      window.setTimeout(() => setExportSuccess(false), 900);
    } catch (e) {
      setExportError(t('jsonpath.exportFailed', { message: toErrorMessage(e) }));
    }
  };

  const isInitialState = useMemo(() => {
    if (columnsInput.length !== 1) return false;
    const col = columnsInput[0];
    const name = (col?.name ?? '').trim();
    const expr = (col?.expr ?? '').trim();
    return name === '' && expr === '$';
  }, [columnsInput]);

  const handleClearExpressions = () => {
    if (isInitialState) return;
    if (typeof window === 'undefined') return;
    if (!window.confirm(t('jsonpath.clearExprConfirm'))) return;

    // Reset to initial/default state.
    closeTableMenu(true);
    closeCellEditor(true);
    closeHeaderPopover(true);
    setExportError(null);
    setColumnsInput([{ name: '', expr: '$' }]);
  };

  const openTableMenu = (rowIndex: number, colIndex: number | null, x: number, y: number) => {
    const MENU_W = 200;
    const MENU_H = colIndex === null ? 52 : 92;
    const nextX = Math.max(8, Math.min(x, window.innerWidth - MENU_W - 8));
    const nextY = Math.max(8, Math.min(y, window.innerHeight - MENU_H - 8));
    if (tableMenuTimerRef.current) window.clearTimeout(tableMenuTimerRef.current);
    setTableMenuLeaving(false);
    setTableMenu({ x: nextX, y: nextY, rowIndex, colIndex });
  };

  const handleCopyRow = async (rowIndex: number) => {
    setExportError(null);
    if (typeof navigator === 'undefined' || !('clipboard' in navigator)) {
      setExportError(t('jsonpath.exportUnavailable'));
      return;
    }
    try {
      const row = buildExportRow(rowIndex);
      const text = JSON.stringify(row, null, 2);
      await navigator.clipboard.writeText(text);
    } catch (e) {
      setExportError(t('jsonpath.exportFailed', { message: toErrorMessage(e) }));
    }
  };

  const handleCopyCell = async (rowIndex: number, colIndex: number) => {
    setExportError(null);
    if (typeof navigator === 'undefined' || !('clipboard' in navigator)) {
      setExportError(t('jsonpath.exportUnavailable'));
      return;
    }
    try {
      const match = columns[colIndex]?.values?.[rowIndex];
      const text = JSON.stringify(match?.value ?? null, null, 2);
      await navigator.clipboard.writeText(text);
    } catch (e) {
      setExportError(t('jsonpath.exportFailed', { message: toErrorMessage(e) }));
    }
  };

  const formatEditorText = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return String(v);
    }
  };

  const openCellEditor = (rowIndex: number, colIndex: number, x: number, y: number) => {
    const match = columns[colIndex]?.values?.[rowIndex];
    const pointer = match?.pointer;
    if (!pointer) return;
    if (!onEditAtPointer) return;

    const MENU_W = 560;
    const MENU_H = 360;
    const nextX = Math.max(8, Math.min(x, window.innerWidth - MENU_W - 8));
    const nextY = Math.max(8, Math.min(y, window.innerHeight - MENU_H - 8));

    const originalValue = match?.value;
    closeTableMenu();
    if (cellEditorTimerRef.current) window.clearTimeout(cellEditorTimerRef.current);
    setCellEditorLeaving(false);
    setCellEditor({
      x: nextX,
      y: nextY,
      rowIndex,
      colIndex,
      pointer,
      originalValue,
      text: formatEditorText(originalValue),
      error: null,
    });
  };

  const cancelCellEditor = () => {
    closeCellEditor();
  };

  const commitCellEditor = () => {
    if (!cellEditor) return;
    if (!onEditAtPointer) return;

    const { pointer, originalValue, text } = cellEditor;
    const trimmed = text.trim();

    // Preserve existing behavior: strings stay strings.
    if (typeof originalValue === 'string') {
      onEditAtPointer(pointer, text);
      closeCellEditor(true);
      return;
    }

    if (typeof originalValue === 'number') {
      if (trimmed === '' || trimmed === 'null') {
        onEditAtPointer(pointer, null);
        closeCellEditor(true);
        return;
      }
      const num = Number(trimmed);
      if (!Number.isFinite(num)) {
        setCellEditor((prev) => (prev ? { ...prev, error: t('jsonViewer.error.invalidNumber') } : prev));
        return;
      }
      onEditAtPointer(pointer, num);
      closeCellEditor(true);
      return;
    }

    if (typeof originalValue === 'boolean') {
      if (trimmed === 'true') {
        onEditAtPointer(pointer, true);
        closeCellEditor(true);
        return;
      }
      if (trimmed === 'false') {
        onEditAtPointer(pointer, false);
        closeCellEditor(true);
        return;
      }
      if (trimmed === '' || trimmed === 'null') {
        onEditAtPointer(pointer, null);
        closeCellEditor(true);
        return;
      }
    }

    // null/object/array/unknown: try JSON first, then loose parsing.
    if (trimmed !== '') {
      try {
        const parsed = JSON.parse(trimmed);
        onEditAtPointer(pointer, parsed);
        closeCellEditor(true);
        return;
      } catch {
        // ignore
      }
    }

    if (trimmed === '' || trimmed === 'null') {
      onEditAtPointer(pointer, null);
      closeCellEditor(true);
      return;
    }
    if (trimmed === 'true') {
      onEditAtPointer(pointer, true);
      closeCellEditor(true);
      return;
    }
    if (trimmed === 'false') {
      onEditAtPointer(pointer, false);
      closeCellEditor(true);
      return;
    }
    const maybeNum = Number(trimmed);
    if (trimmed !== '' && Number.isFinite(maybeNum) && String(maybeNum) === trimmed) {
      onEditAtPointer(pointer, maybeNum);
      closeCellEditor(true);
      return;
    }

    onEditAtPointer(pointer, text);
    closeCellEditor(true);
  };

  const handleCellEditorKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelCellEditor();
      return;
    }
    if (e.key === 'Enter') {
      const isTextarea = e.currentTarget instanceof HTMLTextAreaElement;
      if (isTextarea && !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      commitCellEditor();
    }
  };

  return (
    <div className="jsonpath-root">
      <div className="jsonpath-toolbar">
        <div className="jsonpath-title">
          {t('jsonpath.title')} · {t('jsonpath.columnsCount', { count: columnsInput.length })}
        </div>
        <div className="jsonpath-actions">
          <button
            type="button"
            className={`panel-header-btn panel-header-btn-secondary${exportSuccess ? ' panel-header-btn-success' : ''}`}
            onClick={handleExportJson}
            disabled={rowCount === 0}
          >
            <span className="btn-content">
              {exportSuccess ? (
                <IconCheck className="btn-icon" />
              ) : (
                <IconDownload className="btn-icon" />
              )}
              <span>{exportSuccess ? t('jsonpath.exportCopied') : t('jsonpath.exportJson')}</span>
            </span>
          </button>
          <button
            type="button"
            className="panel-header-btn panel-header-btn-secondary"
            onClick={handleClearExpressions}
            disabled={isInitialState}
          >
            <span className="btn-content">
              <IconRefresh className="btn-icon" />
              <span>{t('jsonpath.clearExpr')}</span>
            </span>
          </button>
        </div>
      </div>

      <div className="jsonpath-help">
        {t('jsonpath.help')}{' '}
        <button
          type="button"
          className="jsonpath-help-link jsonpath-help-link-btn"
          onClick={openDocs}
        >
          {t('jsonpath.docsLink')}
        </button>
      </div>

      {docsOpen && (
        <div
          className={`jsonpath-docs-backdrop${docsLeaving ? ' is-leaving' : ''}`}
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeDocs();
          }}
        >
          <div
            className={`jsonpath-docs-modal${docsLeaving ? ' is-leaving' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-label={t('jsonpath.docsTitle')}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="jsonpath-docs-header">
              <div className="jsonpath-docs-title">{t('jsonpath.docsTitle')}</div>
              <button
                type="button"
                className="panel-header-btn panel-header-btn-secondary"
                onClick={() => closeDocs()}
              >
                <span className="btn-content">
                  <IconX className="btn-icon" />
                  <span>{t('jsonpath.docsClose')}</span>
                </span>
              </button>
            </div>
            <div className="jsonpath-docs-body">
              <p className="jsonpath-docs-intro">{t('jsonpath.docsIntro')}</p>

              <div className="jsonpath-docs-section">
                <div className="jsonpath-docs-h2">{t('jsonpath.docsSectionBasics')}</div>
                <ul className="jsonpath-docs-list">
                  <li>
                    <code>$</code> 表示根节点；过滤表达式里常用 <code>@</code> 表示当前元素。
                  </li>
                  <li>
                    访问字段：<code>$.a.b</code> 或 <code>$['a']['b']</code>（key 有特殊字符更推荐中括号）。
                  </li>
                  <li>
                    表达式可以从 <code>$</code> 开始，也可以直接写相对路径（本应用建议以 <code>$</code> 开头）。
                  </li>
                </ul>
              </div>

              <div className="jsonpath-docs-section">
                <div className="jsonpath-docs-h2">{t('jsonpath.docsSectionSelectors')}</div>
                <ul className="jsonpath-docs-list">
                  <li>
                    通配：<code>*</code>（例如 <code>$.items[*]</code>）。
                  </li>
                  <li>
                    数组下标：<code>[0]</code>、<code>[1]</code>；多选常见写法：<code>[0,2,4]</code>。
                  </li>
                  <li>
                    递归：<code>..</code>（例如 <code>$..id</code> 在任意深度查找 <code>id</code>）。
                  </li>
                  <li>
                    切片：<code>[start:end:step]</code>（不同实现细节略有差异，建议用示例数据先验证）。
                  </li>
                </ul>
              </div>

              <div className="jsonpath-docs-section">
                <div className="jsonpath-docs-h2">{t('jsonpath.docsSectionFilters')}</div>
                <ul className="jsonpath-docs-list">
                  <li>
                    过滤基本形态：<code>$.items[?(@.price &lt; 10)]</code>
                  </li>
                  <li>
                    多条件：<code>$.items[?(@.a == 1 &amp;&amp; @.b != null)]</code>
                  </li>
                  <li>
                    过滤里可以继续取字段：<code>@.name</code>、<code>@['complex-key']</code>
                  </li>
                </ul>
              </div>

              <div className="jsonpath-docs-section">
                <div className="jsonpath-docs-h2">{t('jsonpath.docsSectionExamples')}</div>
                <div className="jsonpath-docs-examples">
                  <pre className="jsonpath-docs-pre"><code>$.data.items[*].id</code></pre>
                  <pre className="jsonpath-docs-pre"><code>$..name</code></pre>
                  <pre className="jsonpath-docs-pre"><code>$.users[?(@.active == true)].email</code></pre>
                  <pre className="jsonpath-docs-pre"><code>$['key.with.dots']['sub-key']</code></pre>
                </div>
              </div>

              <div className="jsonpath-docs-section">
                <div className="jsonpath-docs-h2">{t('jsonpath.docsSectionAppNotes')}</div>
                <ul className="jsonpath-docs-list">
                  <li>每列是一个 JSONPath 表达式；每列返回的结果按下标对齐成行，未命中处填 <code>null</code>。</li>
                  <li>表头右侧括号内的数字为该列命中数量。</li>
                  <li>
                    “编辑单元格”仅在匹配结果能映射回原始 JSON（存在 JSON Pointer）时启用；否则会禁用。
                  </li>
                </ul>
              </div>
            </div>
            <div className="jsonpath-docs-ref">
              <span>{t('jsonpath.docsRef')} </span>
              <a
                className="jsonpath-docs-link"
                href="https://github.com/json-path/JsonPath"
                target="_blank"
                rel="noreferrer"
              >
                https://github.com/json-path/JsonPath
              </a>
            </div>
          </div>
        </div>
      )}

      {exportError && <div className="jsonpath-export-error">{exportError}</div>}

      <div className="jsonpath-table-wrap" ref={tableWrapRef}>
        <table className="jsonpath-table">
          <thead>
            <tr>
              <th className="jsonpath-th jsonpath-th-add jsonpath-sticky-col">
                <button
                  type="button"
                  className="jsonpath-th-btn jsonpath-th-add-btn"
                  onClick={addColumn}
                  title={t('jsonpath.addColumn')}
                  aria-label={t('jsonpath.addColumn')}
                >
                  <IconPlus className="btn-icon" />
                </button>
              </th>

              {columns.map((col, idx) => (
                <th
                  key={idx}
                  className="jsonpath-th"
                  title={editingIndex === idx ? undefined : getColumnKey(col, idx)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    try {
                      e.dataTransfer.dropEffect = 'move';
                    } catch {
                      // ignore
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from =
                      dragIndexRef.current ??
                      Number.parseInt(
                        (() => {
                          try {
                            return e.dataTransfer.getData('text/plain');
                          } catch {
                            return '';
                          }
                        })(),
                        10,
                      );

                    if (!Number.isFinite(from)) return;
                    if (from === idx) return;
                    moveColumn(from, idx);
                    dragIndexRef.current = null;
                  }}
                >
                  <button
                    type="button"
                    className="jsonpath-th-btn"
                    onClick={(e) => {
                      if (editingIndex === idx) {
                        closeHeaderPopover();
                        return;
                      }

                      openHeaderPopover(idx, e.currentTarget as HTMLElement);
                    }}
                    draggable
                    onDragStart={(e) => {
                      dragIndexRef.current = idx;
                      closeHeaderPopover(true);
                      headerPopoverAnchorRef.current = null;
                      try {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', String(idx));
                      } catch {
                        // ignore
                      }
                    }}
                    onDragEnd={() => {
                      dragIndexRef.current = null;
                    }}
                  >
                    <span className="jsonpath-th-title">{getColumnKey(col, idx)}</span>
                    <span
                      className="jsonpath-th-count"
                      title={editingIndex === idx ? undefined : String(col.values.length)}
                    >
                      ({col.values.length})
                    </span>
                    {(() => {
                      const last = getLastExprSegmentLabel(col.expr);
                      return last ? (
                        <span
                          className="jsonpath-th-last"
                          title={editingIndex === idx ? undefined : (col.expr ?? '').trim()}
                        >
                          {last}
                        </span>
                      ) : null;
                    })()}
                  </button>

                  {editingIndex === idx && (
                    <div
                      ref={popoverRef}
                      className={`jsonpath-popover${headerPopoverLeaving ? ' is-leaving' : ''}`}
                      style={
                        headerPopoverPos
                          ? {
                              left: headerPopoverPos.x,
                              top: headerPopoverPos.y,
                              maxHeight: headerPopoverPos.maxH,
                            }
                          : undefined
                      }
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <div className="jsonpath-popover-row">
                        <div className="jsonpath-popover-label">{t('jsonpath.name')}</div>
                        <input
                          className="jsonpath-popover-input"
                          value={col.name}
                          onChange={(e) => updateName(idx, e.target.value)}
                          onKeyDown={(e) => {
                            if ((e as any).isComposing) return;
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              e.stopPropagation();
                              closeHeaderPopover();
                            }
                          }}
                          placeholder={t('jsonpath.namePlaceholder')}
                          spellCheck={false}
                        />
                      </div>
                      <div className="jsonpath-popover-row">
                        <div className="jsonpath-popover-label">{t('jsonpath.expression')}</div>
                        <input
                          className="jsonpath-popover-input"
                          ref={exprInputRef}
                          value={col.expr}
                          onChange={(e) => {
                            const nextVal = e.target.value;
                            updateExpr(idx, nextVal);
                            openSuggestions(
                              idx,
                              nextVal,
                              e.target.selectionStart ?? nextVal.length,
                            );
                          }}
                          onFocus={(e) => {
                            openSuggestions(
                              idx,
                              col.expr,
                              col.expr.length,
                            );
                          }}
                          onKeyDown={(e) => {
                            if ((e as any).isComposing) return;

                            if (suggestOpenFor !== idx || suggestions.length === 0) {
                              if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                e.stopPropagation();
                                const el = e.target as HTMLInputElement;
                                openSuggestions(idx, el.value, el.selectionStart ?? el.value.length);
                                return;
                              }
                              if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                e.stopPropagation();
                                const el = e.target as HTMLInputElement;
                                openSuggestions(idx, el.value, el.selectionStart ?? el.value.length);
                                return;
                              }
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                e.stopPropagation();
                                closeHeaderPopover();
                                return;
                              }
                              return;
                            }
                            if (e.key === 'Escape') {
                              e.preventDefault();
                              e.stopPropagation();
                              setSuggestOpenFor(null);
                              return;
                            }
                            if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              e.stopPropagation();
                              setActiveSuggest((p) => {
                                const next = Math.min(p + 1, suggestions.length - 1);
                                window.requestAnimationFrame(() => ensureSuggestVisible(next));
                                return next;
                              });
                              return;
                            }
                            if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              e.stopPropagation();
                              setActiveSuggest((p) => {
                                const next = Math.max(p - 1, 0);
                                window.requestAnimationFrame(() => ensureSuggestVisible(next));
                                return next;
                              });
                              return;
                            }
                            if (e.key === 'Enter' || e.key === 'Tab') {
                              e.preventDefault();
                              e.stopPropagation();
                              const item = suggestions[activeSuggest];
                              if (item) applySuggestion(idx, item);
                              return;
                            }
                          }}
                          placeholder={t('jsonpath.exprPlaceholder')}
                          spellCheck={false}
                        />
                      </div>

                      {suggestOpenFor === idx && suggestions.length > 0 && (
                        <div ref={suggestRef} className="jsonpath-suggest">
                          {suggestions.slice(0, 12).map((it, sIdx) => (
                            <button
                              key={`${it.label}::${it.value}`}
                              type="button"
                              className={`jsonpath-suggest-item${sIdx === activeSuggest ? ' is-active' : ''}`}
                              ref={(el) => {
                                suggestItemRefs.current[sIdx] = el;
                              }}
                              onPointerDown={(e) => {
                                // Prevent the suggestion button from stealing focus (and causing page scroll on arrow keys).
                                e.preventDefault();
                              }}
                              onClick={() => applySuggestion(idx, it)}
                            >
                              <span className="jsonpath-suggest-label ellipsis-left">
                                <span className="ellipsis-left-inner">{it.label}</span>
                              </span>
                              {it.sample ? (
                                <span
                                  className="jsonpath-suggest-sample ellipsis-right"
                                  title={it.sampleTitle ?? it.sample}
                                >
                                  <span className="ellipsis-left-inner">{it.sample}</span>
                                </span>
                              ) : null}
                            </button>
                          ))}
                        </div>
                      )}
                      {col.error && <div className="jsonpath-popover-error">{col.error}</div>}
                      <div className="jsonpath-popover-actions">
                        <button
                          type="button"
                          className="panel-header-btn panel-header-btn-danger"
                          onClick={() => {
                            closeHeaderPopover();
                            window.setTimeout(() => removeColumn(idx), POPOVER_ANIM_MS);
                          }}
                          disabled={columnsInput.length <= 1}
                        >
                          <span className="btn-content">
                            <IconTrash className="btn-icon" />
                            <span>{t('jsonpath.removeColumn')}</span>
                          </span>
                        </button>
                        <button
                          type="button"
                          className="panel-header-btn panel-header-btn-confirm"
                          onClick={() => closeHeaderPopover()}
                        >
                          <span className="btn-content">
                            <IconCheck className="btn-icon" />
                            <span>{t('jsonpath.done')}</span>
                          </span>
                        </button>
                      </div>
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowCount === 0 ? (
              <tr>
                <td className="jsonpath-empty-cell" colSpan={columns.length + 1}>
                  {t('jsonpath.noMatches')}
                </td>
              </tr>
            ) : (
              Array.from({ length: rowCount }).map((_, rowIndex) => (
                <tr
                  key={rowIndex}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openTableMenu(rowIndex, null, e.clientX, e.clientY);
                  }}
                >
                  <td className="jsonpath-sticky-col jsonpath-addcol-cell">
                    <span className="jsonpath-row-index">{rowIndex + 1}</span>
                  </td>
                  {columns.map((col, colIndex) => {
                    const match = col.values[rowIndex];
                    const cellText = stringifyCell(match?.value);
                    const p = preview(cellText, 120);

                    return (
                      <td
                        key={colIndex}
                        title={p.full}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openTableMenu(rowIndex, colIndex, e.clientX, e.clientY);
                        }}
                      >
                        {p.display}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>

        {tableMenu && (
          <div
            ref={tableMenuRef}
            className={`json-context-menu${tableMenuLeaving ? ' is-leaving' : ''}`}
            style={{ left: tableMenu.x, top: tableMenu.y }}
            role="menu"
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <button
              type="button"
              className="json-context-menu-item"
              role="menuitem"
              onClick={async (e) => {
                e.stopPropagation();
                await handleCopyRow(tableMenu.rowIndex);
                closeTableMenu();
              }}
            >
              <span className="btn-content">
                <IconCopy className="btn-icon" />
                <span>{t('jsonpath.copyRow')}</span>
              </span>
            </button>

            {tableMenu.colIndex !== null && (
              <button
                type="button"
                className="json-context-menu-item"
                role="menuitem"
                onClick={async (e) => {
                  e.stopPropagation();
                  await handleCopyCell(tableMenu.rowIndex, tableMenu.colIndex as number);
                  closeTableMenu();
                }}
              >
                <span className="btn-content">
                  <IconCopy className="btn-icon" />
                  <span>{t('jsonpath.copyCell')}</span>
                </span>
              </button>
            )}

            {tableMenu.colIndex !== null && (
              <button
                type="button"
                className="json-context-menu-item"
                role="menuitem"
                disabled={
                  !columns[tableMenu.colIndex]?.values?.[tableMenu.rowIndex]?.pointer ||
                  !onEditAtPointer
                }
                onClick={(e) => {
                  e.stopPropagation();
                  openCellEditor(
                    tableMenu.rowIndex,
                    tableMenu.colIndex as number,
                    e.clientX,
                    e.clientY,
                  );
                }}
              >
                <span className="btn-content">
                  <IconEdit className="btn-icon" />
                  <span>{t('jsonpath.editCell')}</span>
                </span>
              </button>
            )}
          </div>
        )}

        {cellEditor && (
          <div
            ref={cellEditorRef}
            className={`json-context-menu${cellEditorLeaving ? ' is-leaving' : ''}`}
            style={{ left: cellEditor.x, top: cellEditor.y, minWidth: 320, maxWidth: 680 }}
            role="dialog"
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '4px 6px 8px 6px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              {t('jsonpath.editCell')}
            </div>

            <div className="json-edit-wrap" style={{ width: '100%', flexDirection: 'column', alignItems: 'stretch' }}>
              {typeof cellEditor.originalValue === 'boolean' ? (
                <select
                  className="json-edit-input json-edit-select"
                  value={cellEditor.text.trim() === 'false' ? 'false' : 'true'}
                  onChange={(e) =>
                    setCellEditor((prev) => (prev ? { ...prev, text: e.target.value, error: null } : prev))
                  }
                  onKeyDown={handleCellEditorKeyDown}
                  autoFocus
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : (
                <textarea
                  className="json-edit-input"
                  value={cellEditor.text}
                  onChange={(e) =>
                    setCellEditor((prev) => (prev ? { ...prev, text: e.target.value, error: null } : prev))
                  }
                  onFocus={(e) => e.currentTarget.select()}
                  onKeyDown={handleCellEditorKeyDown}
                  style={{ height: 220, width: '100%', maxWidth: '100%', paddingTop: 10, paddingBottom: 10 }}
                  autoFocus
                />
              )}

              {cellEditor.error && <div className="json-edit-error">{cellEditor.error}</div>}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="panel-header-btn panel-header-btn-secondary"
                  onClick={cancelCellEditor}
                >
                  <span className="btn-content">
                    <IconX className="btn-icon" />
                    <span>{t('jsonViewer.cancel')}</span>
                  </span>
                </button>
                <button type="button" className="panel-header-btn" onClick={commitCellEditor}>
                  <span className="btn-content">
                    <IconCheck className="btn-icon" />
                    <span>{t('jsonViewer.save')}</span>
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
