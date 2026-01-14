
# json-formatter：AI 代理开发指引

## 项目架构与核心流转
- 纯前端本地工具（React + TypeScript + Vite），**所有 JSON 解析/格式化/JSONPath 查询均在浏览器本地完成**，禁止引入后端或上传逻辑。
- 入口：`src/main.tsx` 挂载 `App`，外包一层 `I18nProvider` 实现多语言。
- 主体逻辑集中于 `src/App.tsx`，维护 input（textarea 文本）、parsed/lastValid/error 状态。
- 输入变更 300ms debounce 后，调用 `src/utils/decodeNestedJson.ts`：
  - 先 `JSON.parse` 根字符串，再递归尝试解码“字符串值”实现多层嵌套解码。
- 历史记录通过 `src/utils/historyStorage.ts` 持久化（localStorage key: `jsonFormatter:history`，最多 100 条，按 input 去重）。

## 主要组件与数据写回
- **树形视图**（`src/components/JsonViewer.tsx`）：
  - 以 `JsonPathSegment[]`（string | number）定位节点，所有写回均用不可变更新（如 `updateAtPath` 等），并同步 `setInput(JSON.stringify(updated, null, 2))` 保证 input/parsed 一致。
  - 右键菜单仅在传入 onAdd*/onDelete* 等回调时生效，解析失败时进入只读预览（禁用编辑）。
- **JSONPath 表格**（`src/components/JsonPathTable.tsx`，依赖 `jsonpath-plus`）：
  - 列配置持久化于 `src/utils/jsonPathStorage.ts`（localStorage key: `json-formatter:jsonpath-columns`，支持旧格式迁移）。
  - 查询用 `JSONPath({ resultType: 'all' })` 获取 pointer，单元格编辑通过 onEditAtPointer 回传 pointer，App 将 JSON Pointer 转为 JsonPathSegment[]，复用树的写回逻辑。

## i18n 与主题
- 文案统一走 `src/i18n/messages.ts`，用 `useI18n().t('key')` 获取，locale 存 localStorage key: `json-formatter:locale`。
- 主题由 App 设置 `documentElement` 的 `data-theme`（light/dark），样式基于 `src/index.css` 的 CSS 变量，主题存 localStorage key: `json-formatter-theme`。

## 本项目特有约定
- 访问 localStorage/clipboard 前必须先做 typeof window/navigator 检查，并 try/catch（见 App.tsx 与各 storage util）。
- 任何“写回 JSON”操作都要保持不可变更新，并同步更新 input 文本，避免 parsed/input 不一致。
- 禁止引入后端、上传、云端等逻辑。

## 开发/构建命令
- 安装依赖：`npm install`
- 本地开发：`npm run dev`
- 生产构建：`npm run build`（先 tsc 再 vite build）
- 本地预览：`npm run preview`
  > 无 test/lint 脚本，改动后以手动冒烟为主。

## 典型模式举例
- 组件间通过 props 传递回调（如 onEditValue/onAddToObject/onEditAtPointer），所有数据写回均不可变。
- 主题/i18n/历史/JSONPath 列配置等均本地持久化，需兼容异常/迁移场景。
- 解析失败时只读预览，避免 input/parsed 不一致。

## 参考文件
- 入口：`src/main.tsx`、主逻辑：`src/App.tsx`
- 组件：`src/components/JsonViewer.tsx`、`src/components/JsonPathTable.tsx`
- 存储：`src/utils/historyStorage.ts`、`src/utils/jsonPathStorage.ts`
- i18n/主题：`src/i18n/messages.ts`、`src/index.css`
