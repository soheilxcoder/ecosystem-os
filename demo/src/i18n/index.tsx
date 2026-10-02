/**
 * Tiny i18n layer for the static showcase.
 *
 * Two languages (English / فارسی), a React context, localStorage persistence,
 * and the document-level side effects (dir, lang, font class) that make RTL
 * work. Locale-aware formatters produce Persian digits and Persian dates in
 * `fa` mode.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { STRINGS, type StringKey } from './translations';

export type Lang = 'en' | 'fa';

const STORAGE_KEY = 'ecosystem-os-demo-lang';

export interface I18n {
  lang: Lang;
  dir: 'ltr' | 'rtl';
  setLang: (lang: Lang) => void;
  /** Translate a key, with optional {placeholder} interpolation. */
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
  /** Locale-aware integer / decimal formatting (Persian digits in fa). */
  num: (value: number, digits?: number) => string;
  /** Locale-aware thousands-separated amount (Persian digits in fa). */
  money: (amount: number) => string;
  /** Short locale date, e.g. "15 Aug 2026" / «۲۴ مرداد ۱۴۰۵». */
  date: (iso: string, style?: 'short' | 'long') => string;
}

const I18nContext = createContext<I18n | null>(null);

export function readStoredLang(): Lang | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'fa' || stored === 'en' ? stored : null;
  } catch {
    return null;
  }
}

function applyDocumentLang(lang: Lang): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
  document.documentElement.classList.toggle('lang-fa', lang === 'fa');
}

function interpolate(
  text: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars[name] !== undefined ? String(vars[name]) : `{${name}}`,
  );
}

export function I18nProvider({
  initialLang = 'en',
  children,
}: {
  initialLang?: Lang;
  children: ReactNode;
}) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  // Apply document attributes after mount (and when the language changes).
  useEffect(() => {
    applyDocumentLang(lang);
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* private mode — the choice just won't persist */
    }
  }, [lang]);

  const value = useMemo<I18n>(() => {
    const t = (key: StringKey, vars?: Record<string, string | number>) => {
      const pair = STRINGS[key];
      if (!pair) return key;
      return interpolate(pair[lang], vars);
    };

    const numberFormat = new Intl.NumberFormat(lang === 'fa' ? 'fa-IR' : 'en-US');
    const decimalFormat = new Intl.NumberFormat(lang === 'fa' ? 'fa-IR' : 'en-US', {
      maximumFractionDigits: 2,
    });

    return {
      lang,
      dir: lang === 'fa' ? 'rtl' : 'ltr',
      setLang: setLangState,
      t,
      num: (value, digits = 0) =>
        digits === 0 ? numberFormat.format(value) : decimalFormat.format(value),
      money: (amount) => numberFormat.format(Math.round(amount)),
      date: (iso, style = 'short') => {
        const parsed = new Date(`${iso}T00:00:00Z`);
        const formatter = new Intl.DateTimeFormat(
          lang === 'fa' ? 'fa-IR' : 'en-GB',
          style === 'long'
            ? { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }
            : { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' },
        );
        return formatter.format(parsed);
      },
    };
  }, [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}
