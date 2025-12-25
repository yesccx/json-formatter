# json-formatter：AI 代理开发指引

## 项目概览
- 这是一个纯前端本地工具（React + TypeScript + Vite），JSON 解析/格式化/JSONPath 查询全部在浏览器内完成（不要引入后端或上传逻辑）。
- 入口：src/main.tsx 挂载 App，并包一层 i18n（I18nProvider）。

## 常用命令（package.json）
- 安装依赖：npm install
- 开发启动：npm run dev
- 生产构建：npm run build（先 tsc 再 vite build）
- 本地预览：npm run preview
 说明：仓库内目前没有 test/lint 脚本；改动后以手动冒烟为主。

## 核心数据流（从输入到输出）
- src/App.tsx 维护 input（textarea 文本）与 parsed/lastValid/error。
- 输入变化 300ms debounce 后调用 src/utils/decodeNestedJson.ts：
  - 先 JSON.parse 根字符串；
  - 再递归对“字符串值”尝试 JSON.parse，实现“多层 stringify/转义”的嵌套解码。
- 历史记录：src/utils/historyStorage.ts（localStorage key: jsonFormatter:history，最多 100 条，按 input 去重）。

## 两种输出模式
- Tree：src/components/JsonViewer.tsx
  - 以 JsonPathSegment[]（string | number）定位节点；App 通过不可变更新函数 updateAtPath/addToObjectAtPath/addToArrayAtPath/deleteAtPath/renameKeyAtPath 写回，并同步 setInput(JSON.stringify(updated, null, 2))。
  - 右键菜单仅在传入 onAdd*/onDelete* 等回调时生效；当解析失败时 App 会进入只读预览（传 undefined 以禁用编辑）。
- JSONPath 表格：src/components/JsonPathTable.tsx（依赖 jsonpath-plus）
  - 列配置持久化：src/utils/jsonPathStorage.ts（localStorage key: json-formatter:jsonpath-columns，支持从旧 string[] 迁移）。
  - 查询用 JSONPath({ resultType: 'all' }) 获取 pointer；编辑单元格会把 pointer 回传给 App（onEditAtPointer），App 将 JSON Pointer 转成 JsonPathSegment[] 后复用 tree 的写回逻辑。

## i18n 与主题
- 文案统一走 src/i18n/messages.ts（用 useI18n().t('key')）；locale 存 localStorage key: json-formatter:locale。
- 主题由 App 设置 documentElement 的 data-theme（light/dark），样式基于 src/index.css 的 CSS 变量；主题存 localStorage key: json-formatter-theme。

## 代码约定（本仓库特有）
- 访问 localStorage / clipboard 前先做 typeof window/navigator 检查，并 try/catch（见 src/App.tsx 与各 storage util）。
- 任何“写回 JSON”的改动都要保持不可变更新，且同步更新 input 文本，避免 parsed 与 input 不一致。
