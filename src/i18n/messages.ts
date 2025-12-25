export type Locale = 'zh-CN' | 'en';

export const LOCALE_STORAGE_KEY = 'json-formatter:locale';

export function normalizeLocale(locale: string | null | undefined): Locale {
  const raw = (locale ?? '').trim().toLowerCase();
  if (raw.startsWith('zh')) return 'zh-CN';
  return 'en';
}

export function getSystemLocale(): Locale {
  if (typeof navigator === 'undefined') return 'zh-CN';
  return normalizeLocale(navigator.language);
}

export function getInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'zh-CN';
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored === 'zh-CN' || stored === 'en') return stored;
  } catch {
    // ignore
  }
  return getSystemLocale();
}

type Params = Record<string, string | number>;

type Messages = Record<string, string>;

export const MESSAGES: Record<Locale, Messages> = {
  'zh-CN': {
    'seo.title': 'JSON Formatter - 本地 JSON 格式化与嵌套解码',
    'seo.description':
      '本地运行的 JSON 格式化工具：支持多层嵌套 JSON 解码、树形视图查看/编辑、一键复制美化或压缩结果与历史记录。所有解析均在浏览器本地完成。',

    'app.h1': 'JSON Formatter',
    'app.themeToLight': '切换到亮色主题',
    'app.themeToDark': '切换到暗色主题',
    'app.language': '语言',
    'app.githubAria': '在 GitHub 查看 json-formatter 源码',

    'panel.inputTitle': '输入 JSON',
    'panel.outputTitle': '格式化结果',

    'btn.format': '格式化',
    'btn.clearInput': '清空输入',
    'btn.expandAll': '展开全部',
    'btn.collapseAll': '折叠全部',
    'btn.copy': '复制',
    'btn.copied': '已复制',
    'btn.copyMinify': '压缩并复制',
    'btn.viewJsonPath': 'JSONPath',
    'btn.viewTree': '树视图',

    'input.placeholder': '在此粘贴或输入 JSON 文本',

    'history.title': '格式化记录',
    'history.clear': '清空',
    'history.clearConfirm': '确定要清空所有格式化记录吗？',
    'history.empty': '暂无记录，格式化后会记录在这里（最多保存 100 条）',

    'error.parseFailed': '解析失败：{message}',
    'error.parseFailedUnknown': '解析失败：未知错误',

    'empty.title': '使用说明',
    'empty.step1': '在左侧粘贴或输入 JSON 文本。',
    'empty.step2': '点击“格式化”可自动排版；右侧支持树形展开/折叠。',
    'empty.step3': '树视图支持：双击编辑值、重命名 key、右键增删节点（仅在 JSON 合法时可编辑）。',
    'empty.step4': '切换到“JSONPath”可用多列表格查询；可导出 JSON，并支持“重置 JSONPath”。',
    'empty.hint': '提示：支持解码“字符串里套 JSON”的多层嵌套场景；表达式/列名输入框在无候选时按 Enter 可直接完成。',

    'jsonViewer.save': '保存',
    'jsonViewer.cancel': '取消',
    'jsonViewer.addProperty': '新增属性',
    'jsonViewer.addArrayItem': '新增数组项',
    'jsonViewer.delete': '删除',
    'jsonViewer.keyPlaceholder': 'key',
    'jsonViewer.valuePlaceholder': 'value',
    'jsonViewer.error.keyRequired': 'Key 不能为空',
    'jsonViewer.error.keyExists': 'Key 已存在',
    'jsonViewer.error.invalidNumber': '请输入合法数字',

    'jsonpath.title': 'JSONPath',
    'jsonpath.columnsCount': '{count} 列',
    'jsonpath.help': '提示：点击表头编辑列；拖拽表头排序；“+”新增列',
    'jsonpath.docsLink': 'JSONPath 文档',
    'jsonpath.docsTitle': 'JSONPath 文档（速查）',
    'jsonpath.docsClose': '关闭',
    'jsonpath.docsIntro': '以下为基于 JsonPath README 的“用法速查与示例”（非原文拷贝），覆盖本项目表格场景的常用写法。',
    'jsonpath.docsSectionBasics': '基础概念',
    'jsonpath.docsSectionSelectors': '选择器与数组',
    'jsonpath.docsSectionFilters': '过滤（Filter）',
    'jsonpath.docsSectionExamples': '常见示例',
    'jsonpath.docsSectionAppNotes': '在本应用中的行为',
    'jsonpath.docsRef': '完整文档：',
    'jsonpath.editColumns': '列设置',
    'jsonpath.hideColumns': '收起列设置',
    'jsonpath.name': '列名',
    'jsonpath.expression': '表达式',
    'jsonpath.done': '完成',
    'jsonpath.addColumn': '添加列',
    'jsonpath.removeColumn': '删除',
    'jsonpath.namePlaceholder': '列名（可选）',
    'jsonpath.exprPlaceholder': '例如：$.data.items[*].id',
    'jsonpath.noMatches': '暂无匹配结果',
    'jsonpath.error.empty': '表达式为空',
    'jsonpath.exportJson': '导出 JSON',
    'jsonpath.exportCopied': '已复制',
    'jsonpath.exportUnavailable': '当前环境不支持剪贴板复制',
    'jsonpath.exportFailed': '导出失败：{message}',
    'jsonpath.clearExpr': '重置 JSONPath',
    'jsonpath.clearExprConfirm': '确定要将表格重置为初始状态吗？',
    'jsonpath.copyRow': '复制行',
    'jsonpath.copyCell': '复制单元格',
    'jsonpath.editCell': '编辑单元格',
  },
  en: {
    'seo.title': 'JSON Formatter - Local JSON formatter & nested decoder',
    'seo.description':
      'A local JSON formatter that runs in your browser: nested JSON string decoding, tree viewer with editing, one-click copy (pretty/minified), and history. No data is uploaded.',

    'app.h1': 'JSON Formatter',
    'app.themeToLight': 'Switch to light theme',
    'app.themeToDark': 'Switch to dark theme',
    'app.language': 'Language',
    'app.githubAria': 'View json-formatter source on GitHub',

    'panel.inputTitle': 'Input JSON',
    'panel.outputTitle': 'Formatted JSON',

    'btn.format': 'Format',
    'btn.clearInput': 'Clear',
    'btn.expandAll': 'Expand all',
    'btn.collapseAll': 'Collapse all',
    'btn.copy': 'Copy',
    'btn.copied': 'Copied',
    'btn.copyMinify': 'Minify & Copy',
    'btn.viewJsonPath': 'JSONPath Table',
    'btn.viewTree': 'Tree',

    'input.placeholder': 'Paste or type JSON here',

    'history.title': 'History',
    'history.clear': 'Clear',
    'history.clearConfirm': 'Clear all history records?',
    'history.empty': 'No records yet. Formatting will be saved here (up to 100).',

    'error.parseFailed': 'Parse failed: {message}',
    'error.parseFailedUnknown': 'Parse failed: unknown error',

    'empty.title': 'How to use',
    'empty.step1': 'Paste or type JSON on the left.',
    'empty.step2': 'Click “Format” to pretty-print; the right panel supports tree expand/collapse.',
    'empty.step3': 'Tree view: double-click to edit values, rename keys, right-click to add/delete nodes (only when JSON is valid).',
    'empty.step4': 'Switch to “JSONPath Table” for multi-column queries; export JSON and reset JSONPath are available.',
    'empty.hint': 'Tip: Supports decoding nested JSON strings. In the name/expression inputs, press Enter to finish when there are no suggestions.',

    'jsonViewer.save': 'Save',
    'jsonViewer.cancel': 'Cancel',
    'jsonViewer.addProperty': 'Add property',
    'jsonViewer.addArrayItem': 'Add array item',
    'jsonViewer.delete': 'Delete',
    'jsonViewer.keyPlaceholder': 'key',
    'jsonViewer.valuePlaceholder': 'value',
    'jsonViewer.error.keyRequired': 'Key is required',
    'jsonViewer.error.keyExists': 'Key already exists',
    'jsonViewer.error.invalidNumber': 'Please enter a valid number',

    'jsonpath.title': 'JSONPath',
    'jsonpath.columnsCount': '{count} cols',
    'jsonpath.help': 'Tip: Click headers to edit name/expression; drag to reorder; use "+" to add columns.',
    'jsonpath.docsLink': 'JSONPath docs',
    'jsonpath.docsTitle': 'JSONPath docs (quick reference)',
    'jsonpath.docsClose': 'Close',
    'jsonpath.docsIntro': 'A quick reference and examples based on the JsonPath README (not a verbatim copy), focused on the table use-cases in this app.',
    'jsonpath.docsSectionBasics': 'Basics',
    'jsonpath.docsSectionSelectors': 'Selectors & arrays',
    'jsonpath.docsSectionFilters': 'Filters',
    'jsonpath.docsSectionExamples': 'Examples',
    'jsonpath.docsSectionAppNotes': 'How this app behaves',
    'jsonpath.docsRef': 'Full docs:',
    'jsonpath.editColumns': 'Columns',
    'jsonpath.hideColumns': 'Hide columns',
    'jsonpath.name': 'Name',
    'jsonpath.expression': 'Expression',
    'jsonpath.done': 'Done',
    'jsonpath.addColumn': 'Add column',
    'jsonpath.removeColumn': 'Remove',
    'jsonpath.namePlaceholder': 'Column name (optional)',
    'jsonpath.exprPlaceholder': 'e.g. $.data.items[*].id',
    'jsonpath.noMatches': 'No matches',
    'jsonpath.error.empty': 'Empty expression',
    'jsonpath.exportJson': 'Export JSON',
    'jsonpath.exportCopied': 'Copied',
    'jsonpath.exportUnavailable': 'Clipboard is not available',
    'jsonpath.exportFailed': 'Export failed: {message}',
    'jsonpath.clearExpr': 'Reset JSONPath',
    'jsonpath.clearExprConfirm': 'Reset the table to its initial state?',
    'jsonpath.copyRow': 'Copy row',
    'jsonpath.copyCell': 'Copy cell',
    'jsonpath.editCell': 'Edit cell and sync to JSON',
  },
} as const;

export type MessageKey = keyof (typeof MESSAGES)['en'];

export function formatMessage(
  locale: Locale,
  key: MessageKey,
  params?: Params,
): string {
  const template = MESSAGES[locale][key] ?? MESSAGES.en[key] ?? String(key);
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_m, name: string) => {
    const value = params[name];
    return value === undefined ? `{${name}}` : String(value);
  });
}
