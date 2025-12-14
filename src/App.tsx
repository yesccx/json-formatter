import React, { useEffect, useState } from 'react';
import { decodeNestedJson, NestedJsonError } from './utils/decodeNestedJson';
import { JsonViewer } from './components/JsonViewer';
import {
  addRecord,
  clearHistory,
  FormatRecord,
  loadHistory,
} from './utils/historyStorage';

const THEME_STORAGE_KEY = 'json-formatter-theme';

function App() {
  const [input, setInput] = useState('');
  const [parsed, setParsed] = useState<unknown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<FormatRecord[]>([]);
  const [copyPrettySuccess, setCopyPrettySuccess] = useState(false);
  const [copyMinifySuccess, setCopyMinifySuccess] = useState(false);
  const [formatError, setFormatError] = useState<string | null>(null);
      // 已移除高亮层，无需同步滚动和高度
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
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  useEffect(() => {
    const trimmed = input.trim();

    if (!trimmed) {
      setParsed(null);
      setError(null);
      return;
    }

    const id = window.setTimeout(() => {
      try {
        const decoded = decodeNestedJson(trimmed);
        setParsed(decoded);
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
    setInput('');
  };

  const copyOutput = (minify: boolean): boolean => {
    if (parsed === null || error) return false;
    if (typeof navigator === 'undefined' || !('clipboard' in navigator)) {
      return false;
    }

    try {
      const text = minify
        ? JSON.stringify(parsed)
        : JSON.stringify(parsed, null, 4);
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
      setInput(formatted);
      setFormatError(null);
    } catch (e) {
      setFormatError('当前输入不是合法 JSON，无法格式化');
    }
  };

  const handleToggleTree = () => {
    if (parsed === null || error) return;
    const nextMode: 'expand' | 'collapse' = allCollapsed
      ? 'expand'
      : 'collapse';
    setTreeCommandMode(nextMode);
    setTreeCommandId((prev) => prev + 1);
    setAllCollapsed(nextMode === 'collapse');
  };

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
                      disabled={parsed === null || !!error}
                    >
                      {allCollapsed ? '展开全部' : '折叠全部'}
                    </button>
                    <button
                      type="button"
                      className={`panel-header-btn${copyPrettySuccess ? ' panel-header-btn-success' : ''}`}
                      onClick={handleCopyPretty}
                      disabled={parsed === null || !!error}
                    >
                      {copyPrettySuccess ? '已复制' : '复制'}
                    </button>
                    <button
                      type="button"
                      className={`panel-header-btn panel-header-btn-secondary${copyMinifySuccess ? ' panel-header-btn-success' : ''}`}
                      onClick={handleCopyMinify}
                      disabled={parsed === null || !!error}
                    >
                      {copyMinifySuccess ? '已复制' : '压缩并复制'}
                    </button>
                  </div>
                </div>
                <div className="panel-body">
                  {error ? (
                    <div className="error-box">{error}</div>
                  ) : parsed !== null ? (
                    <JsonViewer
                      value={parsed}
                      treeCommandId={treeCommandId}
                      treeCommandMode={treeCommandMode}
                    />
                  ) : (
                    <div className="empty-state">等待输入有效的 JSON…</div>
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
