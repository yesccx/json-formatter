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
    'empty.step3': '右侧可直接编辑值、重命名 key、增删节点（仅在输入为合法 JSON 时使用右键弹出菜单）。',
    'empty.step4': '“复制 / 压缩并复制”用于导出结果。',
    'empty.hint': '小提示：支持解析“JSON 字符串里套 JSON”的场景，同时会自动解析 unicode、转义字符等。',

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
    'empty.step3': 'Edit values, rename keys, add/delete nodes via right-click (only when input is valid JSON).',
    'empty.step4': 'Use “Copy / Minify & Copy” to export the result.',
    'empty.hint': 'Tip: Supports decoding nested JSON strings and common escapes.',

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
