/**
 * The strings of the not-found screen, the only copy. The web merges them into its dictionary
 * (`src/i18n/index.ts`); the shell reads `pt`.
 */
export const NOT_FOUND_MESSAGES = {
  pt: {
    'notFound.title': '404',
    'notFound.message': 'Ops! Página não encontrada',
    'notFound.returnHome': 'Voltar para o início',
  },
  en: {
    'notFound.title': '404',
    'notFound.message': 'Oops! Page not found',
    'notFound.returnHome': 'Return to Home',
  },
} as const;
