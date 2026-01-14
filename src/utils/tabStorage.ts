const TABS_STORAGE_KEY = 'json-formatter:tabs';
const INPUT_STORAGE_KEY = 'json-formatter:last-input';

export type StoredTab = {
  id: string;
  title: string;
  input: string;
  createdAt: number;
  updatedAt: number;
};

export type StoredTabsState = {
  activeId: string | null;
  tabs: StoredTab[];
};

function safeParse(raw: string | null): StoredTabsState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;

    const obj = parsed as any;
    if (!Array.isArray(obj.tabs)) return null;

    const tabs: StoredTab[] = (obj.tabs as unknown[])
      .filter((t: unknown): t is StoredTab => {
        if (!t || typeof t !== 'object') return false;
        const tab = t as any;
        return (
          typeof tab.id === 'string' &&
          typeof tab.title === 'string' &&
          typeof tab.input === 'string' &&
          typeof tab.createdAt === 'number' &&
          typeof tab.updatedAt === 'number'
        );
      })
      .map((t: StoredTab) => ({
        id: t.id,
        title: t.title,
        input: t.input,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      }));

    if (!tabs.length) return null;

    const activeId = typeof obj.activeId === 'string' ? obj.activeId : tabs[0].id;

    return { activeId, tabs };
  } catch {
    return null;
  }
}

export function loadTabsState(): StoredTabsState {
  if (typeof window === 'undefined') {
    const now = Date.now();
    const id = `${now}-tab-1`;
    return {
      activeId: id,
      tabs: [
        {
          id,
          title: 'Tab 1',
          input: '',
          createdAt: now,
          updatedAt: now,
        },
      ],
    };
  }

  try {
    const raw = window.localStorage.getItem(TABS_STORAGE_KEY);
    const parsed = safeParse(raw);
    if (parsed) {
      return parsed;
    }
  } catch {
    // ignore and fall through to migration
  }

  const now = Date.now();
  let initialInput = '';
  try {
    const lastInput = window.localStorage.getItem(INPUT_STORAGE_KEY);
    if (typeof lastInput === 'string') {
      initialInput = lastInput;
    }
  } catch {
    // ignore
  }

  const id = `${now}-tab-1`;
  return {
    activeId: id,
    tabs: [
      {
        id,
        title: 'Tab 1',
        input: initialInput,
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
}

export function saveTabsState(state: StoredTabsState): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: StoredTabsState = {
      activeId: state.activeId,
      tabs: state.tabs.map((t) => ({
        id: t.id,
        title: t.title,
        input: t.input,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
    };
    window.localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota errors etc.
  }
}
