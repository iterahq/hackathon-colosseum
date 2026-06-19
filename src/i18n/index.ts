/**
 * Lightweight bilingual (PT + EN) i18n scaffold — ADR-35 bilingual day-1.
 *
 * No heavy framework; a small typed dictionary + a hook with a switchable
 * locale persisted to localStorage. Default locale follows the browser.
 */
import { createContext, createElement, useContext, useMemo, useState, type ReactNode } from 'react';

export type Locale = 'pt' | 'en';

const resources: Record<Locale, Record<string, string>> = {
  pt: {
    'app.name': 'Itera',
    'app.tagline': 'Aprenda fazendo.',
    'nav.programs': 'Programas',
    'nav.units': 'Unidades',
    'nav.lessons': 'Lições',
    'nav.activities': 'Atividades',
    'auth.login': 'Entrar',
    'auth.logout': 'Sair',
    'auth.email': 'E-mail',
    'auth.password': 'Senha',
    'auth.signIn': 'Entrar',
    'auth.signInWith': 'Entrar com {provider}',
    'auth.welcome': 'Bem-vindo de volta',
    'auth.subtitle': 'Entre para continuar aprendendo.',
    'auth.error': 'Não foi possível entrar. Verifique suas credenciais.',
    'home.title': 'Suas lições',
    'home.subtitle': 'Continue de onde parou.',
    'common.loading': 'Carregando…',
    'locale.switch': 'EN',
  },
  en: {
    'app.name': 'Itera',
    'app.tagline': 'Learn by doing.',
    'nav.programs': 'Programs',
    'nav.units': 'Units',
    'nav.lessons': 'Lessons',
    'nav.activities': 'Activities',
    'auth.login': 'Log in',
    'auth.logout': 'Log out',
    'auth.email': 'Email',
    'auth.password': 'Password',
    'auth.signIn': 'Sign in',
    'auth.signInWith': 'Sign in with {provider}',
    'auth.welcome': 'Welcome back',
    'auth.subtitle': 'Sign in to keep learning.',
    'auth.error': 'Could not sign in. Check your credentials.',
    'home.title': 'Your lessons',
    'home.subtitle': 'Pick up where you left off.',
    'common.loading': 'Loading…',
    'locale.switch': 'PT',
  },
};

function detectLocale(): Locale {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('itera.locale') : null;
  if (stored === 'pt' || stored === 'en') return stored;
  const nav = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : 'en';
  return nav.startsWith('pt') ? 'pt' : 'en';
}

interface I18nState {
  locale: Locale;
  setLocale: (l: Locale) => void;
  toggleLocale: () => void;
  t: (key: string, vars?: Record<string, string>) => string;
}

const I18nCtx = createContext<I18nState | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);

  const value = useMemo<I18nState>(() => {
    const setLocale = (l: Locale) => {
      setLocaleState(l);
      if (typeof localStorage !== 'undefined') localStorage.setItem('itera.locale', l);
    };
    return {
      locale,
      setLocale,
      toggleLocale: () => setLocale(locale === 'pt' ? 'en' : 'pt'),
      t: (key, vars) => {
        let str = resources[locale][key] ?? resources.en[key] ?? key;
        if (vars) for (const [k, v] of Object.entries(vars)) str = str.replace(`{${k}}`, v);
        return str;
      },
    };
  }, [locale]);

  return createElement(I18nCtx.Provider, { value }, children);
}

export function useI18n(): I18nState {
  const ctx = useContext(I18nCtx);
  if (!ctx) throw new Error('useI18n must be used within <I18nProvider>');
  return ctx;
}
