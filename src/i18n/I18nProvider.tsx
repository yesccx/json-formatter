import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  formatMessage,
  getInitialLocale,
  LOCALE_STORAGE_KEY,
  Locale,
  MessageKey,
} from './messages';

type I18nContextValue = {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
};

const I18nContext = React.createContext<I18nContextValue | null>(null);

export function I18nProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [locale, setLocale] = useState<Locale>(() => getInitialLocale());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // ignore
    }
  }, [locale]);

  const t = useCallback(
    (key: MessageKey, params?: Record<string, string | number>) =>
      formatMessage(locale, key, params),
    [locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t }),
    [locale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = React.useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return ctx;
}
