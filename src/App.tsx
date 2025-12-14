import React, { useEffect, useRef, useState } from 'react';
import { decodeNestedJson, NestedJsonError } from './utils/decodeNestedJson';
import { JsonPathSegment, JsonViewer } from './components/JsonViewer';
import {
  addRecord,
  clearHistory,
  FormatRecord,
  loadHistory,
} from './utils/historyStorage';

const THEME_STORAGE_KEY = 'json-formatter-theme';
const INPUT_STORAGE_KEY = 'json-formatter:last-input';

function App() {
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
  const [copyPrettySuccess, setCopyPrettySuccess] = useState(false);
  const [copyMinifySuccess, setCopyMinifySuccess] = useState(false);
  const [formatError, setFormatError] = useState<string | null>(null);
  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);
  const currentInputRef = useRef('');
  const [treeCommandId, setTreeCommandId] = useState(0);
  const [treeCommandMode, setTreeCommandMode] = useState<
    'expand' | 'collapse' | null
  >(null);
  const [allCollapsed, setAllCollapsed] = useState(false);
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
    currentInputRef.current = input;
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
          setError(`解析失败：${e.message}`);
        } else {
          setError('解析失败：未知错误');
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

  const copyOutput = (minify: boolean): boolean => {
    const valueToCopy = error ? lastValid : parsed;
    if (valueToCopy === null) return false;
    if (typeof navigator === 'undefined' || !('clipboard' in navigator)) {
      return false;
    }

    try {
      const text = minify
        ? JSON.stringify(valueToCopy)
        : JSON.stringify(valueToCopy, null, 4);
      void navigator.clipboard.writeText(text);
      return true;
    } catch {
      // ignore
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

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleFormatInput = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    try {
      const parsedValue = JSON.parse(trimmed);
      const formatted = JSON.stringify(parsedValue, null, 2);
      redoStackRef.current = [];
      setInput(formatted);
      setFormatError(null);
    } catch (e) {
      setFormatError('当前输入不是合法 JSON，无法格式化');
    }
  };

  const handleToggleTree = () => {
    const valueToUse = error ? lastValid : parsed;
    if (valueToUse === null) return;
    const nextMode: 'expand' | 'collapse' = allCollapsed
      ? 'expand'
      : 'collapse';
    setTreeCommandMode(nextMode);
    setTreeCommandId((prev) => prev + 1);
    setAllCollapsed(nextMode === 'collapse');
  };

  const updateAtPath = (
    current: unknown,
    path: JsonPathSegment[],
    nextValue: unknown,
  ): unknown => {
    if (path.length === 0) return nextValue;
    const [head, ...rest] = path;

    if (Array.isArray(current) && typeof head === 'number') {
      const nextArr = current.slice();
      nextArr[head] = updateAtPath(nextArr[head], rest, nextValue);
      return nextArr;
    }

    if (
      current &&
      typeof current === 'object' &&
      !Array.isArray(current) &&
      typeof head === 'string'
    ) {
      const obj = current as Record<string, unknown>;
      return {
        ...obj,
        [head]: updateAtPath(obj[head], rest, nextValue),
      };
    }

    return current;
  };

  const handleEditValue = (path: JsonPathSegment[], nextValue: unknown) => {
    if (parsed === null || error) return;
    undoStackRef.current.push(input);
    if (undoStackRef.current.length > 100) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
    const updated = updateAtPath(parsed, path, nextValue);
    setParsed(updated);
    setError(null);
    try {
      setInput(JSON.stringify(updated, null, 2));
    } catch {
      // ignore
    }
  };

  const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  };

  const pushUndoSnapshot = () => {
    undoStackRef.current.push(input);
    if (undoStackRef.current.length > 100) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
  };

  const commitParsedUpdate = (updated: unknown) => {
    setParsed(updated);
    setError(null);
    try {
      setInput(JSON.stringify(updated, null, 2));
    } catch {
      // ignore
    }
  };

  const addToObjectAtPath = (
    current: unknown,
    objectPath: JsonPathSegment[],
    key: string,
    value: unknown,
  ): unknown => {
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
  };

  const addToArrayAtPath = (
    current: unknown,
    arrayPath: JsonPathSegment[],
    value: unknown,
  ): unknown => {
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
  };

  const deleteAtPath = (current: unknown, path: JsonPathSegment[]): unknown => {
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
  };

  const handleAddToObject = (
    objectPath: JsonPathSegment[],
    key: string,
    value: unknown,
  ) => {
    if (parsed === null || error) return;
    const trimmedKey = key.trim();
    if (!trimmedKey) return;
    pushUndoSnapshot();
    const updated = addToObjectAtPath(parsed, objectPath, trimmedKey, value);
    if (updated === parsed) return;
    commitParsedUpdate(updated);
  };

  const handleAddToArray = (arrayPath: JsonPathSegment[], value: unknown) => {
    if (parsed === null || error) return;
    pushUndoSnapshot();
    const updated = addToArrayAtPath(parsed, arrayPath, value);
    if (updated === parsed) return;
    commitParsedUpdate(updated);
  };

  const handleDeleteAtPath = (path: JsonPathSegment[]) => {
    if (parsed === null || error) return;
    if (!path.length) return;
    pushUndoSnapshot();
    const updated = deleteAtPath(parsed, path);
    if (updated === parsed) return;
    commitParsedUpdate(updated);
  };

  const renameKeyAtPath = (
    current: unknown,
    parentPath: JsonPathSegment[],
    oldKey: string,
    newKey: string,
  ): unknown => {
    const target = parentPath.reduce<unknown>((acc, seg) => {
      if (acc === null || acc === undefined) return acc;
      if (typeof seg === 'number' && Array.isArray(acc)) return acc[seg];
      if (typeof seg === 'string' && typeof acc === 'object' && !Array.isArray(acc)) {
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
      // 冲突则不改
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
      if (node && typeof node === 'object' && !Array.isArray(node) && typeof head === 'string') {
        const nextObj = { ...(node as Record<string, unknown>) };
        nextObj[head] = patchObject(nextObj[head], rest);
        return nextObj;
      }
      return node;
    };

    return patchObject(current, parentPath);
  };

  const handleRenameKey = (
    parentPath: JsonPathSegment[],
    oldKey: string,
    newKey: string,
  ) => {
    if (parsed === null || error) return;
    const trimmed = newKey.trim();
    if (!trimmed) return;

    undoStackRef.current.push(input);
    if (undoStackRef.current.length > 100) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];

    const updated = renameKeyAtPath(parsed, parentPath, oldKey, trimmed);
    if (updated === parsed) {
      return;
    }
    setParsed(updated);
    setError(null);
    try {
      setInput(JSON.stringify(updated, null, 2));
    } catch {
      // ignore
    }
  };

  const displayValue = error ? lastValid : parsed;
  const isReadonlyPreview = !!error;

  return (
    <div className="app-root">
      <main className="app-main">
        <section className="tool-hero">
          <div className="tool-card">
            <div className="tool-card-header">
              <div className="tool-card-title">
                <h1>JSON Formatter</h1>
                <button
                  type="button"
                  className="theme-toggle-btn"
                  onClick={handleToggleTheme}
                  aria-label={
                    theme === 'dark' ? '切换到亮色主题' : '切换到暗色主题'
                  }
                >
                  <span className="theme-toggle-icon" aria-hidden="true">
                    {theme === 'dark' ? '☀️' : '🌙'}
                  </span>
                </button>
              </div>
              <a
                className="github-link"
                href="https://github.com/yesccx/json-formatter"
                target="_blank"
                rel="noreferrer"
                aria-label="在 GitHub 查看 json-formatter 源码"
              >
                <span aria-hidden="true">GitHub</span>
              </a>
            </div>

            <div className="tool-grid">
              <div className="panel">
                <div className="panel-header">
                  <span className="panel-header-title">Input JSON</span>
                  <div className="panel-header-actions">
                    <button
                      type="button"
                      className="panel-header-btn panel-header-btn-secondary"
                      onClick={handleFormatInput}
                      disabled={!input.trim()}
                    >
                      格式化
                    </button>
                    <button
                      type="button"
                      className="panel-header-btn"
                      onClick={handleClearInput}
                      disabled={!input}
                    >
                      清空输入
                    </button>
                  </div>
                </div>
                <div className="panel-body panel-body-input">
                  <textarea
                    className="json-input"
                    placeholder="在此粘贴或输入 JSON 文本"
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
                        格式化记录
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
                              window.confirm('确定要清空所有格式化记录吗？')
                            ) {
                              clearHistory();
                              setHistory([]);
                            }
                          }}
                        >
                          清空
                        </button>
                      )}
                    </div>
                    {history.length === 0 ? (
                      <div className="history-empty">
                        暂无记录，格式化后会记录在这里（最多保存 100 条）
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
                                  {date.toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    second: '2-digit',
                                  })}
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

              <div className="panel">
                <div className="panel-header">
                  <span className="panel-header-title">Formatted JSON</span>
                  <div className="panel-header-actions">
                    <button
                      type="button"
                      className="panel-header-btn panel-header-btn-secondary"
                      onClick={handleToggleTree}
                      disabled={displayValue === null}
                    >
                      {allCollapsed ? '展开全部' : '折叠全部'}
                    </button>
                    <button
                      type="button"
                      className={`panel-header-btn${copyPrettySuccess ? ' panel-header-btn-success' : ''}`}
                      onClick={handleCopyPretty}
                      disabled={displayValue === null}
                    >
                      {copyPrettySuccess ? '已复制' : '复制'}
                    </button>
                    <button
                      type="button"
                      className={`panel-header-btn panel-header-btn-secondary${copyMinifySuccess ? ' panel-header-btn-success' : ''}`}
                      onClick={handleCopyMinify}
                      disabled={displayValue === null}
                    >
                      {copyMinifySuccess ? '已复制' : '压缩并复制'}
                    </button>
                  </div>
                </div>
                <div className="panel-body panel-body-output">
                  {error && <div className="panel-overlay-error error-box">{error}</div>}
                  {displayValue !== null ? (
                    <JsonViewer
                      value={displayValue}
                      treeCommandId={treeCommandId}
                      treeCommandMode={treeCommandMode}
                      onEditValue={isReadonlyPreview ? undefined : handleEditValue}
                      onRenameKey={isReadonlyPreview ? undefined : handleRenameKey}
                      onAddToObject={isReadonlyPreview ? undefined : handleAddToObject}
                      onAddToArray={isReadonlyPreview ? undefined : handleAddToArray}
                      onDeleteAtPath={isReadonlyPreview ? undefined : handleDeleteAtPath}
                    />
                  ) : (
                    <div className="empty-state">
                      <p className="empty-state-title">使用说明</p>
                      <ol className="empty-state-list">
                        <li>在左侧粘贴或输入 JSON 文本。</li>
                        <li>点击“格式化”可自动排版；右侧支持树形展开/折叠。</li>
                        <li>右侧可直接编辑值、重命名 key、增删节点（仅在输入为合法 JSON 时使用右键弹出菜单）。</li>
                        <li>“复制 / 压缩并复制”用于导出结果。</li>
                      </ol>
                      <p className="empty-state-hint">
                        小提示：支持解析“JSON 字符串里套 JSON”的场景，同时会自动解析unicode、转义字符等。
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
