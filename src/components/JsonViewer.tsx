import React, { useEffect, useState } from 'react';

interface JsonViewerProps {
  value: unknown;
  treeCommandId?: number;
  treeCommandMode?: 'expand' | 'collapse' | null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface JsonNodeProps {
  name?: string;
  value: unknown;
  level: number;
  treeCommandId: number;
  treeCommandMode: 'expand' | 'collapse' | null;
}

const INDENT_PX = 14;
const STRING_PREVIEW_LIMIT = 80;

function formatString(value: string): { display: string; full: string } {
  if (value.length <= STRING_PREVIEW_LIMIT) {
    return { display: value, full: value };
  }
  const head = value.slice(0, STRING_PREVIEW_LIMIT);
  return { display: `${head}…`, full: value };
}

function getCopyText(value: unknown): string {
  if (value === undefined) return 'undefined';

  // 字符串类型复制时去掉引号，只复制内容本身
  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, null, 4);
  } catch {
    return String(value);
  }
}

function JsonNode({ name, value, level, treeCommandId, treeCommandMode }: JsonNodeProps) {
  const isArray = Array.isArray(value);
  const isObj = isObject(value);
  const isContainer = isArray || isObj;

  const paddingLeft = level * INDENT_PX;

  // 默认全部展开，如有需要用户再手动折叠
  const [collapsed, setCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyText = getCopyText(value);

  useEffect(() => {
    if (!isContainer) return;
    if (!treeCommandMode) return;
    setCollapsed(treeCommandMode === 'collapse');
  }, [treeCommandId, treeCommandMode, isContainer]);

  const handleToggle = () => {
    if (!isContainer) return;
    setCollapsed((prev) => !prev);
  };

  const handleCopyClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!navigator || !('clipboard' in navigator)) return;

    void navigator.clipboard
      .writeText(copyText)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 900);
      })
      .catch(() => {
        /* ignore */
      });
  };

  if (isArray) {
    const items = value as unknown[];
    const summary = `[${items.length} items]`;

    return (
      <div className="json-node">
        <div
          className={`json-line json-line-collapsible${copied ? ' json-line-copied' : ''}`}
          onClick={handleToggle}
          style={{ paddingLeft }}
        >
          <span className="json-toggle" aria-hidden="true">
            {collapsed ? '▸' : '▾'}
          </span>
          <span className="json-line-main">
            {name !== undefined && (
              <>
                <span className="json-key">{name}</span>
                <span className="json-colon">: </span>
              </>
            )}
            <span className="json-summary">{summary}</span>
          </span>
          <button
            className={`json-copy-btn${copied ? ' json-copy-btn-copied' : ''}`}
            type="button"
            onClick={handleCopyClick}
          >
            {copied ? '✓' : '⧉'}
          </button>
        </div>
        {!collapsed &&
          items.map((item, index) => (
            <JsonNode
              // eslint-disable-next-line react/no-array-index-key
              key={index}
              name={String(index)}
              value={item}
              level={level + 1}
              treeCommandId={treeCommandId}
              treeCommandMode={treeCommandMode}
            />
          ))}
      </div>
    );
  }

  if (isObj) {
    const entries = Object.entries(value as Record<string, unknown>);
    const summary = `{${entries.length} key${entries.length === 1 ? '' : 's'}}`;

    return (
      <div className="json-node">
        <div
          className={`json-line json-line-collapsible${copied ? ' json-line-copied' : ''}`}
          onClick={handleToggle}
          style={{ paddingLeft }}
        >
          <span className="json-toggle" aria-hidden="true">
            {collapsed ? '▸' : '▾'}
          </span>
          <span className="json-line-main">
            {name !== undefined && (
              <>
                <span className="json-key">{name}</span>
                <span className="json-colon">: </span>
              </>
            )}
            <span className="json-summary">{summary}</span>
          </span>
          <button
            className={`json-copy-btn${copied ? ' json-copy-btn-copied' : ''}`}
            type="button"
            onClick={handleCopyClick}
          >
            {copied ? '✓' : '⧉'}
          </button>
        </div>
        {!collapsed &&
          entries.map(([childKey, childValue]) => (
            <JsonNode
              key={childKey}
              name={childKey}
              value={childValue}
              level={level + 1}
              treeCommandId={treeCommandId}
              treeCommandMode={treeCommandMode}
            />
          ))}
      </div>
    );
  }

  const renderPrimitive = () => {
    if (value === null) {
      return <span className="json-null">null</span>;
    }
    if (typeof value === 'string') {
      const { display, full } = formatString(value);
      return (
        <span className="json-string" title={full}>
          "{display}"
        </span>
      );
    }
    if (typeof value === 'number') {
      return <span className="json-number">{String(value)}</span>;
    }
    if (typeof value === 'boolean') {
      return <span className="json-boolean">{String(value)}</span>;
    }
    return <span className="json-unknown">{String(value)}</span>;
  };

  return (
    <div className="json-node">
      <div
        className={`json-line${copied ? ' json-line-copied' : ''}`}
        style={{ paddingLeft }}
      >
        <span className="json-toggle json-toggle-placeholder" />
        <span className="json-line-main">
          {name !== undefined && (
            <>
              <span className="json-key">{name}</span>
              <span className="json-colon">: </span>
            </>
          )}
          {renderPrimitive()}
        </span>
        <button
          className={`json-copy-btn${copied ? ' json-copy-btn-copied' : ''}`}
          type="button"
          onClick={handleCopyClick}
        >
          {copied ? '✓' : '⧉'}
        </button>
      </div>
    </div>
  );
}

export function JsonViewer({ value, treeCommandId = 0, treeCommandMode = null }: JsonViewerProps) {
  return (
    <div className="json-viewer">
      <JsonNode
        value={value}
        level={0}
        treeCommandId={treeCommandId}
        treeCommandMode={treeCommandMode}
      />
    </div>
  );
}
