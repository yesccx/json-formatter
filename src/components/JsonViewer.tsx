import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

export type JsonPathSegment = string | number;

type JsonNodeAction =
  | { id: number; type: 'add-object'; path: JsonPathSegment[] }
  | { id: number; type: 'add-array'; path: JsonPathSegment[] }
  | null;

type JsonContextMenuState = {
  x: number;
  y: number;
  path: JsonPathSegment[];
  canAddObject: boolean;
  canAddArray: boolean;
  canDelete: boolean;
};

interface JsonViewerProps {
  value: unknown;
  treeCommandId?: number;
  treeCommandMode?: 'expand' | 'collapse' | null;
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
  nodeAction: JsonNodeAction;
  path: JsonPathSegment[];
  parentKind?: 'array' | 'object' | null;
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
  onOpenContextMenu?: (state: JsonContextMenuState) => void;
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

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function pathsEqual(a: JsonPathSegment[], b: JsonPathSegment[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function calcInputWidthCh(text: string, minCh: number, maxCh: number) {
  // +1 给光标留点空间，避免贴边
  const len = (text ?? '').length + 1;
  return `${clamp(len, minCh, maxCh)}ch`;
}

function parseLooseValue(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (trimmed === 'null') return null;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  const maybeNum = Number(trimmed);
  if (Number.isFinite(maybeNum) && String(maybeNum) === trimmed) {
    return maybeNum;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return text;
  }
}

function JsonNode({
  name,
  value,
  level,
  treeCommandId,
  treeCommandMode,
  nodeAction,
  path,
  parentKind = null,
  onEditValue,
  onRenameKey,
  onAddToObject,
  onAddToArray,
  onDeleteAtPath,
  onOpenContextMenu,
}: JsonNodeProps) {
  const isArray = Array.isArray(value);
  const isObj = isObject(value);
  const isContainer = isArray || isObj;

  const paddingLeft = level * INDENT_PX;

  // 默认全部展开；但如果当前处于“折叠全部”模式，后挂载的子节点也应当默认折叠，
  // 否则会出现：展开某一级时，子树先全展开一帧再被 effect 折叠的闪烁。
  const [collapsed, setCollapsed] = useState(() => {
    if (!isContainer) return false;
    if (treeCommandMode === 'collapse') {
      // 折叠全部时保留第 1 级可见：根节点（level=0）不折叠
      return level > 0;
    }
    return false;
  });
  const [copied, setCopied] = useState(false);
  const copyText = getCopyText(value);

  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [draftBool, setDraftBool] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const editCancelledRef = useRef(false);
  const didSelectEditRef = useRef(false);

  const [editingKey, setEditingKey] = useState(false);
  const [draftKey, setDraftKey] = useState('');
  const [keyError, setKeyError] = useState<string | null>(null);
  const keyCancelledRef = useRef(false);
  const didSelectKeyEditRef = useRef(false);

  const [adding, setAdding] = useState<'object' | 'array' | null>(null);
  const [newKey, setNewKey] = useState('');
  const [newValueText, setNewValueText] = useState('null');
  const [addError, setAddError] = useState<string | null>(null);
  const addWrapRef = useRef<HTMLSpanElement | null>(null);
  const didSelectAddKeyRef = useRef(false);
  const didSelectAddValueRef = useRef(false);

  const valueInputWidth = useMemo(
    () => calcInputWidthCh(draftText, 10, 56),
    [draftText],
  );
  const keyInputWidth = useMemo(
    () => calcInputWidthCh(draftKey, 6, 32),
    [draftKey],
  );

  const isEditingMode = editing || editingKey;

  const showActions = !isEditingMode;
  const canDelete = !!onDeleteAtPath && !!parentKind && path.length > 0;
  const canAddObject = !!onAddToObject && isObj;
  const canAddArray = !!onAddToArray && isArray;

  const startAddObject = () => {
    if (!canAddObject) return;
    didSelectAddKeyRef.current = false;
    didSelectAddValueRef.current = false;
    setAdding('object');
    setAddError(null);
    setNewKey('');
    setNewValueText('null');
  };

  const startAddArray = () => {
    if (!canAddArray) return;
    didSelectAddValueRef.current = false;
    setAdding('array');
    setAddError(null);
    setNewValueText('null');
  };

  const primitiveType = useMemo(() => {
    if (value === null) return 'null';
    if (typeof value === 'string') return 'string';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    return 'unknown';
  }, [value]);

  useLayoutEffect(() => {
    if (!isContainer) return;
    if (!treeCommandMode) return;
    if (treeCommandMode === 'collapse') {
      // 折叠全部时保留第 1 级可见：根节点（level=0）不折叠
      setCollapsed(level > 0);
      return;
    }
    // expand
    setCollapsed(false);
  }, [treeCommandId, treeCommandMode, isContainer, level]);

  useEffect(() => {
    if (!nodeAction) return;
    if (isEditingMode) return;

    if (nodeAction.type === 'add-object' && pathsEqual(nodeAction.path, path)) {
      startAddObject();
    }
    if (nodeAction.type === 'add-array' && pathsEqual(nodeAction.path, path)) {
      startAddArray();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeAction?.id]);

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

  const handleContextMenu = (e: React.MouseEvent) => {
    if (isEditingMode || adding) return;

    const hasAnyAction = canAddObject || canAddArray || canDelete;
    if (!hasAnyAction) return;

    e.preventDefault();
    e.stopPropagation();
    onOpenContextMenu?.({
      x: e.clientX,
      y: e.clientY,
      path,
      canAddObject,
      canAddArray,
      canDelete,
    });
  };

  const cancelAdd = () => {
    setAdding(null);
    setAddError(null);
  };

  const handleAddWrapBlurCapture = () => {
    // 让内部按钮 click / 输入框焦点切换先发生
    window.setTimeout(() => {
      if (!adding) return;
      const wrapEl = addWrapRef.current;
      const activeEl = document.activeElement;
      if (!wrapEl) {
        cancelAdd();
        return;
      }
      if (!(activeEl instanceof Node) || !wrapEl.contains(activeEl)) {
        cancelAdd();
      }
    }, 0);
  };

  const commitAdd = () => {
    if (adding === 'object') {
      if (!onAddToObject || !isObj) return;
      const key = newKey.trim();
      if (!key) {
        setAddError('Key 不能为空');
        return;
      }
      const obj = value as Record<string, unknown>;
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        setAddError('Key 已存在');
        return;
      }
      onAddToObject(path, key, parseLooseValue(newValueText));
      setAdding(null);
      setAddError(null);
      return;
    }

    if (adding === 'array') {
      if (!onAddToArray || !isArray) return;
      onAddToArray(path, parseLooseValue(newValueText));
      setAdding(null);
      setAddError(null);
    }
  };

  const beginEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onEditValue) return;
    if (isContainer) return;
    setEditError(null);
    didSelectEditRef.current = false;
    setEditing(true);
    editCancelledRef.current = false;
    if (typeof value === 'boolean') {
      setDraftBool(value);
    } else if (value === null) {
      setDraftText('');
    } else {
      setDraftText(String(value));
    }
  };

  const cancelEdit = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    editCancelledRef.current = true;
    setEditing(false);
    setEditError(null);
  };

  const commitEdit = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!onEditValue) return;

    if (primitiveType === 'boolean') {
      onEditValue(path, draftBool);
      setEditing(false);
      setEditError(null);
      return;
    }

    const text = draftText;
    const trimmed = text.trim();

    if (primitiveType === 'number') {
      const num = Number(trimmed);
      if (!Number.isFinite(num)) {
        setEditError('请输入合法数字');
        return;
      }
      onEditValue(path, num);
      setEditing(false);
      setEditError(null);
      return;
    }

    if (primitiveType === 'string') {
      onEditValue(path, text);
      setEditing(false);
      setEditError(null);
      return;
    }

    // null/unknown：友好一点的宽松解析
    if (trimmed === '') {
      onEditValue(path, null);
      setEditing(false);
      setEditError(null);
      return;
    }
    if (trimmed === 'null') {
      onEditValue(path, null);
      setEditing(false);
      setEditError(null);
      return;
    }
    if (trimmed === 'true') {
      onEditValue(path, true);
      setEditing(false);
      setEditError(null);
      return;
    }
    if (trimmed === 'false') {
      onEditValue(path, false);
      setEditing(false);
      setEditError(null);
      return;
    }
    const maybeNum = Number(trimmed);
    if (trimmed !== '' && Number.isFinite(maybeNum) && String(maybeNum) === trimmed) {
      onEditValue(path, maybeNum);
      setEditing(false);
      setEditError(null);
      return;
    }
    onEditValue(path, text);
    setEditing(false);
    setEditError(null);
  };

  const handleEditKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit();
    }
  };

  const handleEditBlur = () => {
    if (editCancelledRef.current) {
      editCancelledRef.current = false;
      return;
    }
    commitEdit();
  };

  const canEditKey =
    !!onRenameKey &&
    typeof name === 'string' &&
    path.length > 0 &&
    typeof path[path.length - 1] === 'string';

  const beginKeyEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canEditKey) return;
    setEditingKey(true);
    setDraftKey(String(name));
    setKeyError(null);
    keyCancelledRef.current = false;
    didSelectKeyEditRef.current = false;
  };

  const cancelKeyEdit = () => {
    keyCancelledRef.current = true;
    setEditingKey(false);
    setKeyError(null);
  };

  const commitKeyEdit = () => {
    if (!onRenameKey) return;
    const oldKey = String(name);
    const nextKey = draftKey.trim();
    if (!nextKey) {
      setKeyError('Key 不能为空');
      return;
    }
    if (nextKey === oldKey) {
      setEditingKey(false);
      setKeyError(null);
      return;
    }

    onRenameKey(path.slice(0, -1), oldKey, nextKey);
    setEditingKey(false);
    setKeyError(null);
  };

  const handleKeyEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelKeyEdit();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      commitKeyEdit();
    }
  };

  const handleKeyEditBlur = () => {
    if (keyCancelledRef.current) {
      keyCancelledRef.current = false;
      return;
    }
    commitKeyEdit();
  };

  const renderName = () => {
    if (name === undefined) return null;

    if (editingKey && canEditKey) {
      return (
        <span className="json-key-edit-wrap" onClick={(e) => e.stopPropagation()}>
          <input
            className="json-edit-input json-key-edit-input"
            value={draftKey}
            onChange={(e) => setDraftKey(e.target.value)}
            onFocus={(e) => {
              if (didSelectKeyEditRef.current) return;
              didSelectKeyEditRef.current = true;
              e.currentTarget.select();
            }}
            onKeyDown={handleKeyEditKeyDown}
            onBlur={handleKeyEditBlur}
            style={{ width: keyInputWidth }}
            autoFocus
          />
          {keyError && <span className="json-edit-error">{keyError}</span>}
        </span>
      );
    }

    return (
      <span
        className={`json-key${canEditKey ? ' json-editable' : ''}`}
        onDoubleClick={canEditKey ? beginKeyEdit : undefined}
      >
        {name}
      </span>
    );
  };

  if (isArray) {
    const items = value as unknown[];
    const summary = `[${items.length} items]`;

    return (
      <div className="json-node">
        <div
          className={`json-line json-line-collapsible${copied ? ' json-line-copied' : ''}`}
          onClick={handleToggle}
          onContextMenu={handleContextMenu}
          style={{ paddingLeft }}
          tabIndex={0}
        >
          <span className="json-toggle" aria-hidden="true">
            {collapsed ? '▸' : '▾'}
          </span>
          <span className="json-line-main">
            {name !== undefined && (
              <>
                {renderName()}
                <span className="json-colon">: </span>
              </>
            )}
            <span className="json-summary">{summary}</span>
          </span>
          {showActions && (
            <button
              className={`json-copy-btn${copied ? ' json-copy-btn-copied' : ''}`}
              type="button"
              onClick={handleCopyClick}
            >
              {copied ? '✓' : '⧉'}
            </button>
          )}
        </div>
        {adding === 'array' && (
          <div
            className="json-line json-line-editing"
            style={{ paddingLeft: paddingLeft + INDENT_PX }}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="json-toggle json-toggle-placeholder" />
            <span className="json-line-main">
              <span
                ref={addWrapRef}
                className="json-edit-wrap"
                onBlurCapture={handleAddWrapBlurCapture}
              >
                <input
                  className="json-edit-input"
                  value={newValueText}
                  onChange={(e) => setNewValueText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelAdd();
                    }
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitAdd();
                    }
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  className="json-edit-action json-edit-action-save"
                  onClick={(e) => {
                    e.stopPropagation();
                    commitAdd();
                  }}
                  aria-label="保存"
                  title="保存"
                >
                  ✓
                </button>
                <button
                  type="button"
                  className="json-edit-action"
                  onClick={(e) => {
                    e.stopPropagation();
                    cancelAdd();
                  }}
                  aria-label="取消"
                  title="取消"
                >
                  ✕
                </button>
                {addError && <span className="json-edit-error">{addError}</span>}
              </span>
            </span>
          </div>
        )}
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
              nodeAction={nodeAction}
              path={[...path, index]}
              parentKind="array"
              onEditValue={onEditValue}
              onRenameKey={onRenameKey}
              onAddToObject={onAddToObject}
              onAddToArray={onAddToArray}
              onDeleteAtPath={onDeleteAtPath}
              onOpenContextMenu={onOpenContextMenu}
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
          onContextMenu={handleContextMenu}
          style={{ paddingLeft }}
          tabIndex={0}
        >
          <span className="json-toggle" aria-hidden="true">
            {collapsed ? '▸' : '▾'}
          </span>
          <span className="json-line-main">
            {name !== undefined && (
              <>
                {renderName()}
                <span className="json-colon">: </span>
              </>
            )}
            <span className="json-summary">{summary}</span>
          </span>
          {showActions && (
            <button
              className={`json-copy-btn${copied ? ' json-copy-btn-copied' : ''}`}
              type="button"
              onClick={handleCopyClick}
            >
              {copied ? '✓' : '⧉'}
            </button>
          )}
        </div>
        {adding === 'object' && (
          <div
            className="json-line json-line-editing"
            style={{ paddingLeft: paddingLeft + INDENT_PX }}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="json-toggle json-toggle-placeholder" />
            <span className="json-line-main">
              <span
                ref={addWrapRef}
                className="json-edit-wrap"
                onBlurCapture={handleAddWrapBlurCapture}
              >
                <input
                  className="json-edit-input json-key-edit-input"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="key"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelAdd();
                    }
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitAdd();
                    }
                  }}
                  autoFocus
                />
                <span className="json-colon">: </span>
                <input
                  className="json-edit-input"
                  value={newValueText}
                  onChange={(e) => setNewValueText(e.target.value)}
                  placeholder="value"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelAdd();
                    }
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitAdd();
                    }
                  }}
                />
                <button
                  type="button"
                  className="json-edit-action json-edit-action-save"
                  onClick={(e) => {
                    e.stopPropagation();
                    commitAdd();
                  }}
                  aria-label="保存"
                  title="保存"
                >
                  ✓
                </button>
                <button
                  type="button"
                  className="json-edit-action"
                  onClick={(e) => {
                    e.stopPropagation();
                    cancelAdd();
                  }}
                  aria-label="取消"
                  title="取消"
                >
                  ✕
                </button>
                {addError && <span className="json-edit-error">{addError}</span>}
              </span>
            </span>
          </div>
        )}
        {!collapsed &&
          entries.map(([childKey, childValue]) => (
            <JsonNode
              key={childKey}
              name={childKey}
              value={childValue}
              level={level + 1}
              treeCommandId={treeCommandId}
              treeCommandMode={treeCommandMode}
              nodeAction={nodeAction}
              path={[...path, childKey]}
              parentKind="object"
              onEditValue={onEditValue}
              onRenameKey={onRenameKey}
              onAddToObject={onAddToObject}
              onAddToArray={onAddToArray}
              onDeleteAtPath={onDeleteAtPath}
              onOpenContextMenu={onOpenContextMenu}
            />
          ))}
      </div>
    );
  }

  const renderPrimitive = () => {
    if (editing) {
      return (
        <span className="json-edit-wrap" onClick={(e) => e.stopPropagation()}>
          {primitiveType === 'boolean' ? (
            <select
              className="json-edit-input json-edit-select"
              value={draftBool ? 'true' : 'false'}
              onChange={(e) => setDraftBool(e.target.value === 'true')}
              onKeyDown={handleEditKeyDown}
              onBlur={handleEditBlur}
              autoFocus
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          ) : (
            <input
              className="json-edit-input"
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              onFocus={(e) => {
                if (didSelectEditRef.current) return;
                didSelectEditRef.current = true;
                e.currentTarget.select();
              }}
              onKeyDown={handleEditKeyDown}
              onBlur={handleEditBlur}
              style={{ width: valueInputWidth }}
              autoFocus
            />
          )}
          {editError && <span className="json-edit-error">{editError}</span>}
        </span>
      );
    }

    if (value === null) {
      return (
        <span className="json-null json-editable" onDoubleClick={beginEdit}>
          null
        </span>
      );
    }
    if (typeof value === 'string') {
      const { display, full } = formatString(value);
      return (
        <span
          className="json-string json-editable"
          title={full}
          onDoubleClick={beginEdit}
        >
          "{display}"
        </span>
      );
    }
    if (typeof value === 'number') {
      return (
        <span className="json-number json-editable" onDoubleClick={beginEdit}>
          {String(value)}
        </span>
      );
    }
    if (typeof value === 'boolean') {
      return (
        <span className="json-boolean json-editable" onDoubleClick={beginEdit}>
          {String(value)}
        </span>
      );
    }
    return (
      <span className="json-unknown json-editable" onDoubleClick={beginEdit}>
        {String(value)}
      </span>
    );
  };

  return (
    <div className="json-node">
      <div
        className={`json-line${copied ? ' json-line-copied' : ''}${editing ? ' json-line-editing' : ''}`}
        style={{ paddingLeft }}
        onContextMenu={handleContextMenu}
        tabIndex={0}
      >
        <span className="json-toggle json-toggle-placeholder" />
        <span className="json-line-main">
          {name !== undefined && (
            <>
              {renderName()}
              <span className="json-colon">: </span>
            </>
          )}
          {renderPrimitive()}
        </span>
        {showActions && (
          <button
            className={`json-copy-btn${copied ? ' json-copy-btn-copied' : ''}`}
            type="button"
            onClick={handleCopyClick}
          >
            {copied ? '✓' : '⧉'}
          </button>
        )}
      </div>
    </div>
  );
}

export function JsonViewer({
  value,
  treeCommandId = 0,
  treeCommandMode = null,
  onEditValue,
  onRenameKey,
  onAddToObject,
  onAddToArray,
  onDeleteAtPath,
}: JsonViewerProps) {
  const [contextMenu, setContextMenu] = useState<JsonContextMenuState | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const [nodeAction, setNodeAction] = useState<JsonNodeAction>(null);
  const nodeActionSeqRef = useRef(0);

  useEffect(() => {
    if (!contextMenu) return;

    const handleMouseDown = (e: MouseEvent) => {
      const menuEl = contextMenuRef.current;
      if (!menuEl) {
        setContextMenu(null);
        return;
      }
      if (e.target instanceof Node && !menuEl.contains(e.target)) {
        setContextMenu(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null);
      }
    };

    const handleResize = () => setContextMenu(null);
    const handleScroll = () => setContextMenu(null);

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
  }, [contextMenu]);

  const issueNodeAction = (action: Omit<Exclude<JsonNodeAction, null>, 'id'>) => {
    const nextId = nodeActionSeqRef.current + 1;
    nodeActionSeqRef.current = nextId;
    setNodeAction({ id: nextId, ...action });
  };

  const openContextMenu = (state: JsonContextMenuState) => {
    const MENU_W = 200;
    const MENU_H = 132;
    const x = clamp(state.x, 8, window.innerWidth - MENU_W - 8);
    const y = clamp(state.y, 8, window.innerHeight - MENU_H - 8);
    setContextMenu({ ...state, x, y });
  };

  return (
    <div className="json-viewer">
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="json-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          {contextMenu.canAddObject && (
            <button
              type="button"
              className="json-context-menu-item"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                issueNodeAction({ type: 'add-object', path: contextMenu.path });
                setContextMenu(null);
              }}
            >
              新增属性
            </button>
          )}
          {contextMenu.canAddArray && (
            <button
              type="button"
              className="json-context-menu-item"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                issueNodeAction({ type: 'add-array', path: contextMenu.path });
                setContextMenu(null);
              }}
            >
              新增数组项
            </button>
          )}
          {contextMenu.canDelete && (
            <button
              type="button"
              className="json-context-menu-item json-context-menu-item-danger"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteAtPath?.(contextMenu.path);
                setContextMenu(null);
              }}
            >
              删除
            </button>
          )}
        </div>
      )}
      <JsonNode
        value={value}
        level={0}
        treeCommandId={treeCommandId}
        treeCommandMode={treeCommandMode}
        nodeAction={nodeAction}
        path={[]}
        parentKind={null}
        onEditValue={onEditValue}
        onRenameKey={onRenameKey}
        onAddToObject={onAddToObject}
        onAddToArray={onAddToArray}
        onDeleteAtPath={onDeleteAtPath}
        onOpenContextMenu={openContextMenu}
      />
    </div>
  );
}
