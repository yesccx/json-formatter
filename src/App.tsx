import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { decodeNestedJson, NestedJsonError } from './utils/decodeNestedJson';
import { JsonPathSegment, JsonViewer } from './components/JsonViewer';
import { JsonPathTable } from './components/JsonPathTable';
import {
  IconCheck,
  IconClock,
  IconCollapse,
  IconCopy,
  IconExpand,
  IconGlobe,
  IconSparkles,
  IconTable,
  IconTrash,
  IconTree,
} from './components/Icons';
import { useI18n } from './i18n/I18nProvider';
import type { Locale } from './i18n/messages';
import {
  addRecord,
  clearHistory,
  FormatRecord,
  loadHistory,
} from './utils/historyStorage';

const THEME_STORAGE_KEY = 'json-formatter-theme';
const INPUT_STORAGE_KEY = 'json-formatter:last-input';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function updateAtPath(
  current: unknown,
  path: JsonPathSegment[],
  nextValue: unknown,
): unknown {
  if (path.length === 0) return nextValue;
  const [head, ...rest] = path;

  if (Array.isArray(current) && typeof head === 'number') {
    const nextArr = current.slice();
    nextArr[head] = updateAtPath(nextArr[head], rest, nextValue);
    return nextArr;
  }

  if (isPlainObject(current) && typeof head === 'string') {
    const obj = current as Record<string, unknown>;
    return {
      ...obj,
      [head]: updateAtPath(obj[head], rest, nextValue),
    };
  }

  return current;
}

function addToObjectAtPath(
  current: unknown,
  objectPath: JsonPathSegment[],
  key: string,
  value: unknown,
): unknown {
  if (objectPath.length === 0) {
    if (!isPlainObject(current)) return current;
    if (Object.prototype.hasOwnProperty.call(current, key)) return current;
    return {
      ...(current as Record<string, unknown>),
      [key]: value,
    };
  }

  const [head, ...rest] = objectPath;
  if (Array.isArray(current) && typeof head === 'number') {
    const nextArr = current.slice();
    nextArr[head] = addToObjectAtPath(nextArr[head], rest, key, value);
    return nextArr;
  }
  if (isPlainObject(current) && typeof head === 'string') {
    const obj = current as Record<string, unknown>;
    return {
      ...obj,
      [head]: addToObjectAtPath(obj[head], rest, key, value),
    };
  }

  return current;
}

function addToArrayAtPath(
  current: unknown,
  arrayPath: JsonPathSegment[],
  value: unknown,
): unknown {
  if (arrayPath.length === 0) {
    if (!Array.isArray(current)) return current;
    return [...current, value];
  }

  const [head, ...rest] = arrayPath;
  if (Array.isArray(current) && typeof head === 'number') {
    const nextArr = current.slice();
    nextArr[head] = addToArrayAtPath(nextArr[head], rest, value);
    return nextArr;
  }
  if (isPlainObject(current) && typeof head === 'string') {
    const obj = current as Record<string, unknown>;
    return {
      ...obj,
      [head]: addToArrayAtPath(obj[head], rest, value),
    };
  }

  return current;
}

function deleteAtPath(current: unknown, path: JsonPathSegment[]): unknown {
  if (path.length === 0) return current;
  const [head, ...rest] = path;

  if (rest.length === 0) {
    if (Array.isArray(current) && typeof head === 'number') {
      if (head < 0 || head >= current.length) return current;
      const nextArr = current.slice();
      nextArr.splice(head, 1);
      return nextArr;
    }
    if (isPlainObject(current) && typeof head === 'string') {
      if (!Object.prototype.hasOwnProperty.call(current, head)) return current;
      const nextObj = { ...(current as Record<string, unknown>) };
      delete nextObj[head];
      return nextObj;
    }
    return current;
  }

  if (Array.isArray(current) && typeof head === 'number') {
    const nextArr = current.slice();
    nextArr[head] = deleteAtPath(nextArr[head], rest);
    return nextArr;
  }
  if (isPlainObject(current) && typeof head === 'string') {
    const obj = current as Record<string, unknown>;
    return {
      ...obj,
      [head]: deleteAtPath(obj[head], rest),
    };
  }

  return current;
}

function renameKeyAtPath(
  current: unknown,
  parentPath: JsonPathSegment[],
  oldKey: string,
  newKey: string,
): unknown {
  const target = parentPath.reduce<unknown>((acc, seg) => {
    if (acc === null || acc === undefined) return acc;
    if (typeof seg === 'number' && Array.isArray(acc)) return acc[seg];
    if (typeof seg === 'string' && isPlainObject(acc)) {
      return (acc as Record<string, unknown>)[seg];
    }
    return acc;
  }, current);

  if (!target || typeof target !== 'object' || Array.isArray(target)) {
    return current;
  }

  const obj = target as Record<string, unknown>;
  if (!(oldKey in obj)) return current;
  if (newKey in obj) {
    return current;
  }

  const patchObject = (node: unknown, pathToNode: JsonPathSegment[]): unknown => {
    if (pathToNode.length === 0) {
      const next: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        if (k === oldKey) {
          next[newKey] = v;
        } else {
          next[k] = v;
        }
      }
      return next;
    }

    const [head, ...rest] = pathToNode;
    if (Array.isArray(node) && typeof head === 'number') {
      const nextArr = node.slice();
      nextArr[head] = patchObject(nextArr[head], rest);
      return nextArr;
    }
    if (isPlainObject(node) && typeof head === 'string') {
      const nextObj = { ...(node as Record<string, unknown>) };
      nextObj[head] = patchObject(nextObj[head], rest);
      return nextObj;
    }
    return node;
  };

  return patchObject(current, parentPath);
}

function decodeJsonPointerToken(token: string): string {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

function jsonPointerToPath(pointer: string, root: unknown): JsonPathSegment[] | null {
  if (pointer === '') return [];
  if (!pointer.startsWith('/')) return null;
  const parts = pointer
    .split('/')
    .slice(1)
    .map(decodeJsonPointerToken);
  const path: JsonPathSegment[] = [];
  let current: unknown = root;
  for (const part of parts) {
    const isIndex = /^(0|[1-9]\d*)$/u.test(part);
    if (Array.isArray(current) && isIndex) {
      const idx = Number(part);
      path.push(idx);
      current = current[idx];
    } else {
      path.push(part);
      if (isPlainObject(current)) {
        current = (current as Record<string, unknown>)[part];
      } else {
        current = undefined;
      }
    }
  }
  return path;
}

const OutputPanel = React.memo(function OutputPanel({
  displayValue,
  errorText,
  isReadonlyPreview,
  onEditValue,
  onRenameKey,
  onAddToObject,
  onAddToArray,
  onDeleteAtPath,
  onEditAtPointer,
}: {
  displayValue: unknown | null;
  errorText: string | null;
  isReadonlyPreview: boolean;
  onEditValue?: (path: JsonPathSegment[], nextValue: unknown) => void;
  onRenameKey?: (
    parentPath: JsonPathSegment[],
    oldKey: string,
    newKey: string,
  ) => void;
  onAddToObject?: (
    objectPath: JsonPathSegment[],
    key: string,
    value: unknown,
  ) => void;
  onAddToArray?: (arrayPath: JsonPathSegment[], value: unknown) => void;
  onDeleteAtPath?: (path: JsonPathSegment[]) => void;
  onEditAtPointer?: (pointer: string, nextValue: unknown) => void;
}) {
  const { t } = useI18n();
  const [copyPrettySuccess, setCopyPrettySuccess] = useState(false);
  const [copyMinifySuccess, setCopyMinifySuccess] = useState(false);
  const [treeCommandId, setTreeCommandId] = useState(0);
  const [treeCommandMode, setTreeCommandMode] = useState<
    'expand' | 'collapse' | null
  >(null);
  const [allCollapsed, setAllCollapsed] = useState(false);
  const [outputMode, setOutputMode] = useState<'tree' | 'jsonpath'>('tree');

  const copyOutput = (minify: boolean): boolean => {
    if (displayValue === null) return false;
    if (typeof navigator === 'undefined' || !('clipboard' in navigator)) {
      return false;
    }

    try {
      const text = minify
        ? JSON.stringify(displayValue)
        : JSON.stringify(displayValue, null, 4);
      void navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };

  const handleCopyPretty = () => {
    const ok = copyOutput(false);
    if (!ok) return;
    setCopyPrettySuccess(true);
    window.setTimeout(() => setCopyPrettySuccess(false), 900);
  };

  const handleCopyMinify = () => {
    const ok = copyOutput(true);
    if (!ok) return;
    setCopyMinifySuccess(true);
    window.setTimeout(() => setCopyMinifySuccess(false), 900);
  };

  const handleToggleTree = () => {
    if (displayValue === null) return;
    const nextMode: 'expand' | 'collapse' = allCollapsed ? 'expand' : 'collapse';
    setTreeCommandMode(nextMode);
    setTreeCommandId((prev) => prev + 1);
    setAllCollapsed(nextMode === 'collapse');
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-header-title">{t('panel.outputTitle')}</span>
        <div className="panel-header-actions">
          <button
            type="button"
            className="panel-header-btn panel-header-btn-secondary"
            onClick={() => {
              setOutputMode((prev) => (prev === 'tree' ? 'jsonpath' : 'tree'));
            }}
            disabled={displayValue === null}
          >
            <span className="btn-content">
              {outputMode === 'tree' ? (
                <IconTable className="btn-icon" />
              ) : (
                <IconTree className="btn-icon" />
              )}
              <span>{outputMode === 'tree' ? t('btn.viewJsonPath') : t('btn.viewTree')}</span>
            </span>
          </button>
          {outputMode === 'tree' && (
            <button
              type="button"
              className="panel-header-btn panel-header-btn-secondary"
              onClick={handleToggleTree}
              disabled={displayValue === null}
            >
              <span className="btn-content">
                {allCollapsed ? (
                  <IconExpand className="btn-icon" />
                ) : (
                  <IconCollapse className="btn-icon" />
                )}
                <span>{allCollapsed ? t('btn.expandAll') : t('btn.collapseAll')}</span>
              </span>
            </button>
          )}
          <button
            type="button"
            className={`panel-header-btn${copyPrettySuccess ? ' panel-header-btn-success' : ''}`}
            onClick={handleCopyPretty}
            disabled={displayValue === null}
          >
            <span className="btn-content">
              {copyPrettySuccess ? (
                <IconCheck className="btn-icon" />
              ) : (
                <IconCopy className="btn-icon" />
              )}
              <span>{copyPrettySuccess ? t('btn.copied') : t('btn.copy')}</span>
            </span>
          </button>
          <button
            type="button"
            className={`panel-header-btn panel-header-btn-secondary${copyMinifySuccess ? ' panel-header-btn-success' : ''}`}
            onClick={handleCopyMinify}
            disabled={displayValue === null}
          >
            <span className="btn-content">
              {copyMinifySuccess ? (
                <IconCheck className="btn-icon" />
              ) : (
                <IconCopy className="btn-icon" />
              )}
              <span>{copyMinifySuccess ? t('btn.copied') : t('btn.copyMinify')}</span>
            </span>
          </button>
        </div>
      </div>
      <div className="panel-body panel-body-output">
        {errorText && <div className="panel-overlay-error error-box">{errorText}</div>}
        {displayValue !== null ? (
          outputMode === 'jsonpath' ? (
            <JsonPathTable value={displayValue} onEditAtPointer={onEditAtPointer} />
          ) : (
            <JsonViewer
              value={displayValue}
              treeCommandId={treeCommandId}
              treeCommandMode={treeCommandMode}
              onEditValue={isReadonlyPreview ? undefined : onEditValue}
              onRenameKey={isReadonlyPreview ? undefined : onRenameKey}
              onAddToObject={isReadonlyPreview ? undefined : onAddToObject}
              onAddToArray={isReadonlyPreview ? undefined : onAddToArray}
              onDeleteAtPath={isReadonlyPreview ? undefined : onDeleteAtPath}
            />
          )
        ) : (
          <div className="empty-state">
            <p className="empty-state-title">{t('empty.title')}</p>
            <ol className="empty-state-list">
              <li>{t('empty.step1')}</li>
              <li>{t('empty.step2')}</li>
              <li>{t('empty.step3')}</li>
              <li>{t('empty.step4')}</li>
            </ol>
            <p className="empty-state-hint">{t('empty.hint')}</p>
          </div>
        )}
      </div>
    </div>
  );
});

function App() {
  const { locale, setLocale, t } = useI18n();
  const [input, setInput] = useState(() => {
    if (typeof window === 'undefined') return '';
    try {
      return window.localStorage.getItem(INPUT_STORAGE_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [parsed, setParsed] = useState<unknown | null>(null);
  const [lastValid, setLastValid] = useState<unknown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<FormatRecord[]>([]);
  const [formatError, setFormatError] = useState<string | null>(null);
  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);
  const currentInputRef = useRef('');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') {
      return 'dark';
    }

    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') {
        return stored;
      }
    } catch {
      // ignore
    }

    if (!window.matchMedia) {
      return 'dark';
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  });

  const [inputSizeText, setInputSizeText] = useState('0.00KB');

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(INPUT_STORAGE_KEY, input);
    } catch {
      // ignore
    }
  }, [input]);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const setMetaByName = (name: string, content: string) => {
      let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute('name', name);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    const setMetaByProperty = (property: string, content: string) => {
      let el = document.querySelector(
        `meta[property="${property}"]`,
      ) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute('property', property);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    const title = t('seo.title');
    const description = t('seo.description');

    document.documentElement.setAttribute('lang', locale);
    document.title = title;

    setMetaByName('description', description);
    setMetaByProperty('og:title', title);
    setMetaByProperty('og:description', description);
    setMetaByName('twitter:title', title);
    setMetaByName('twitter:description', description);

    const ld = document.querySelector(
      'script[type="application/ld+json"]',
    ) as HTMLScriptElement | null;
    if (ld?.textContent) {
      try {
        const parsed = JSON.parse(ld.textContent) as any;
        if (parsed && typeof parsed === 'object') {
          parsed.description = description;
          parsed.name = 'JSON Formatter';
          ld.textContent = JSON.stringify(parsed, null, 2);
        }
      } catch {
        // ignore
      }
    }
  }, [locale, t]);

  useEffect(() => {
    currentInputRef.current = input;
  }, [input]);

  useEffect(() => {
    const text = input ?? '';
    if (!text) {
      setInputSizeText('0.00KB');
      return;
    }

    let cancelled = false;
    const compute = () => {
      if (cancelled) return;
      let bytes = 0;
      try {
        if (typeof TextEncoder !== 'undefined') {
          bytes = new TextEncoder().encode(text).length;
        } else {
          bytes = text.length;
        }
      } catch {
        bytes = text.length;
      }

      const kbRaw = bytes / 1024;
      const kb = kbRaw > 0 ? Math.max(0.01, kbRaw) : 0;
      setInputSizeText(`${kb.toFixed(2)}KB`);
    };

    // Avoid doing TextEncoder work on the keystroke path for large inputs.
    const w = typeof window !== 'undefined' ? (window as any) : null;
    if (w && typeof w.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(compute, { timeout: 300 });
      return () => {
        cancelled = true;
        if (typeof w.cancelIdleCallback === 'function') {
          w.cancelIdleCallback(id);
        }
      };
    }

    const id = window.setTimeout(compute, 160);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [input]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const isUndo = (e.ctrlKey || e.metaKey) && !e.shiftKey && key === 'z';
      const isRedo =
        ((e.ctrlKey || e.metaKey) && key === 'y') ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'z');
      if (!isUndo && !isRedo) return;

      const active = document.activeElement as HTMLElement | null;
      const tag = active?.tagName?.toLowerCase();
      if (tag === 'textarea' || tag === 'input' || tag === 'select') {
        return;
      }

      if (isUndo) {
        const stack = undoStackRef.current;
        if (stack.length === 0) return;
        e.preventDefault();
        const current = currentInputRef.current;
        const prev = stack.pop();
        if (prev === undefined) return;
        redoStackRef.current.push(current);
        if (redoStackRef.current.length > 100) {
          redoStackRef.current.shift();
        }
        setInput(prev);
        return;
      }

      if (isRedo) {
        const stack = redoStackRef.current;
        if (stack.length === 0) return;
        e.preventDefault();
        const current = currentInputRef.current;
        const next = stack.pop();
        if (next === undefined) return;
        undoStackRef.current.push(current);
        if (undoStackRef.current.length > 100) {
          undoStackRef.current.shift();
        }
        setInput(next);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const trimmed = input.trim();

    if (!trimmed) {
      setParsed(null);
      setLastValid(null);
      setError(null);
      return;
    }

    const id = window.setTimeout(() => {
      try {
        const decoded = decodeNestedJson(trimmed);
        setParsed(decoded);
        setLastValid(decoded);
        setError(null);
        setHistory(addRecord(trimmed));
      } catch (e) {
        if (e instanceof NestedJsonError) {
          setError(t('error.parseFailed', { message: e.message }));
        } else {
          setError(t('error.parseFailedUnknown'));
        }
        setParsed(null);
      }
    }, 300);

    return () => window.clearTimeout(id);
  }, [input]);

  const handleClearInput = () => {
    if (!input) return;
    redoStackRef.current = [];
    setInput('');
  };

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleFormatInput = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    try {
      const decoded = decodeNestedJson(trimmed);
      const formatted = JSON.stringify(decoded, null, 2);
      redoStackRef.current = [];
      setInput(formatted);
      setFormatError(null);
    } catch (e) {
      if (e instanceof NestedJsonError) {
        setFormatError(t('error.parseFailed', { message: e.message }));
      } else {
        setFormatError(t('error.parseFailedUnknown'));
      }
    }
  };

  const pushUndoSnapshot = useCallback(() => {
    undoStackRef.current.push(currentInputRef.current);
    if (undoStackRef.current.length > 100) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
  }, []);

  const commitParsedUpdate = useCallback((updated: unknown) => {
    setParsed(updated);
    setError(null);
    try {
      setInput(JSON.stringify(updated, null, 2));
    } catch {
      // ignore
    }
  }, []);

  const handleEditValue = useCallback(
    (path: JsonPathSegment[], nextValue: unknown) => {
      if (parsed === null || error) return;
      pushUndoSnapshot();
      const updated = updateAtPath(parsed, path, nextValue);
      setParsed(updated);
      setError(null);
      try {
        setInput(JSON.stringify(updated, null, 2));
      } catch {
        // ignore
      }
    },
    [error, parsed, pushUndoSnapshot],
  );

  const handleEditAtPointer = useCallback(
    (pointer: string, nextValue: unknown) => {
      if (parsed === null) return;
      const path = jsonPointerToPath(pointer, parsed);
      if (!path) return;
      handleEditValue(path, nextValue);
    },
    [handleEditValue, parsed],
  );

  const handleAddToObject = useCallback(
    (objectPath: JsonPathSegment[], key: string, value: unknown) => {
      if (parsed === null || error) return;
      const trimmedKey = key.trim();
      if (!trimmedKey) return;
      pushUndoSnapshot();
      const updated = addToObjectAtPath(parsed, objectPath, trimmedKey, value);
      if (updated === parsed) return;
      commitParsedUpdate(updated);
    },
    [commitParsedUpdate, error, parsed, pushUndoSnapshot],
  );

  const handleAddToArray = useCallback(
    (arrayPath: JsonPathSegment[], value: unknown) => {
      if (parsed === null || error) return;
      pushUndoSnapshot();
      const updated = addToArrayAtPath(parsed, arrayPath, value);
      if (updated === parsed) return;
      commitParsedUpdate(updated);
    },
    [commitParsedUpdate, error, parsed, pushUndoSnapshot],
  );

  const handleDeleteAtPath = useCallback(
    (path: JsonPathSegment[]) => {
      if (parsed === null || error) return;
      if (!path.length) return;
      pushUndoSnapshot();
      const updated = deleteAtPath(parsed, path);
      if (updated === parsed) return;
      commitParsedUpdate(updated);
    },
    [commitParsedUpdate, error, parsed, pushUndoSnapshot],
  );

  const handleRenameKey = useCallback(
    (parentPath: JsonPathSegment[], oldKey: string, newKey: string) => {
      if (parsed === null || error) return;
      const trimmed = newKey.trim();
      if (!trimmed) return;

      pushUndoSnapshot();
      const updated = renameKeyAtPath(parsed, parentPath, oldKey, trimmed);
      if (updated === parsed) return;
      commitParsedUpdate(updated);
    },
    [commitParsedUpdate, error, parsed, pushUndoSnapshot],
  );

  const displayValue = error ? lastValid : parsed;
  const isReadonlyPreview = !!error;

  return (
    <div className="app-root">
      <main className="app-main">
        <section className="tool-hero">
          <div className="tool-card">
            <div className="tool-card-header">
              <div className="tool-card-title">
                <h1>{t('app.h1')}</h1>
                <button
                  type="button"
                  className="theme-toggle-btn"
                  onClick={handleToggleTheme}
                  aria-label={
                    theme === 'dark' ? t('app.themeToLight') : t('app.themeToDark')
                  }
                >
                  <span className="theme-toggle-icon" aria-hidden="true">
                    {theme === 'dark' ? '☀️' : '🌙'}
                  </span>
                </button>
              </div>
              <div className="tool-card-actions">
                <button
                  type="button"
                  className="lang-toggle-btn"
                  aria-label={t('app.language')}
                  onClick={() => {
                    setLocale((locale === 'zh-CN' ? 'en' : 'zh-CN') as Locale);
                  }}
                >
                  <span className="btn-content">
                    <IconGlobe className="btn-icon" />
                    <span>{locale === 'zh-CN' ? '简体中文' : 'EN'}</span>
                  </span>
                </button>
                <a
                  className="github-link"
                  href="https://github.com/yesccx/json-formatter"
                  target="_blank"
                  rel="noreferrer"
                  aria-label={t('app.githubAria')}
                >
                  <span aria-hidden="true">GitHub</span>
                </a>
              </div>
            </div>

            <div className="tool-grid">
              <div className="panel">
                <div className="panel-header">
                  <span className="panel-header-title">
                    {t('panel.inputTitle')}
                    <span className="panel-header-size">{inputSizeText}</span>
                  </span>
                  <div className="panel-header-actions">
                    <button
                      type="button"
                      className="panel-header-btn panel-header-btn-secondary"
                      onClick={handleFormatInput}
                      disabled={!input.trim()}
                    >
                      <span className="btn-content">
                        <IconSparkles className="btn-icon" />
                        <span>{t('btn.format')}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="panel-header-btn"
                      onClick={handleClearInput}
                      disabled={!input}
                    >
                      <span className="btn-content">
                        <IconTrash className="btn-icon" />
                        <span>{t('btn.clearInput')}</span>
                      </span>
                    </button>
                  </div>
                </div>
                <div className="panel-body panel-body-input">
                  <textarea
                    className="json-input"
                    placeholder={t('input.placeholder')}
                    value={input}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                      if (redoStackRef.current.length) {
                        redoStackRef.current = [];
                      }
                      setInput(e.target.value);
                      if (formatError) setFormatError(null);
                    }}
                    spellCheck={false}
                  />
                  {formatError && (
                    <div className="format-error-box">{formatError}</div>
                  )}
                  <div className="history-section">
                    <div className="history-header">
                      <span className="history-title">
                        {t('history.title')}
                        <span className="history-title-hint">
                            {history.length}/100
                        </span>
                      </span>
                      {history.length > 0 && (
                        <button
                          type="button"
                          className="history-clear-btn"
                          onClick={() => {
                            if (
                              window.confirm(t('history.clearConfirm'))
                            ) {
                              clearHistory();
                              setHistory([]);
                            }
                          }}
                        >
                          <span className="btn-content">
                            <IconTrash className="btn-icon btn-icon-sm" />
                            <span>{t('history.clear')}</span>
                          </span>
                        </button>
                      )}
                    </div>
                    {history.length === 0 ? (
                      <div className="history-empty">
                        {t('history.empty')}
                      </div>
                    ) : (
                      <ul className="history-list">
                        {history.map((item) => {
                          const date = new Date(item.createdAt);
                          const preview = item.input.length > 80
                            ? `${item.input.slice(0, 80)}…`
                            : item.input;

                          return (
                            <li key={item.id} className="history-item">
                              <button
                                type="button"
                                className="history-item-btn"
                                onClick={() => setInput(item.input)}
                              >
                                <span className="history-item-time">
                                  <span className="btn-content">
                                    <IconClock className="btn-icon btn-icon-sm" />
                                    <span>
                                      {date.toLocaleTimeString([], {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        second: '2-digit',
                                      })}
                                    </span>
                                  </span>
                                </span>
                                <span className="history-item-preview">
                                  {preview}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              </div>

              <OutputPanel
                displayValue={displayValue}
                errorText={error}
                isReadonlyPreview={isReadonlyPreview}
                onEditValue={handleEditValue}
                onRenameKey={handleRenameKey}
                onAddToObject={handleAddToObject}
                onAddToArray={handleAddToArray}
                onDeleteAtPath={handleDeleteAtPath}
                onEditAtPointer={isReadonlyPreview ? undefined : handleEditAtPointer}
              />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
