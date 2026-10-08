/**
 * The strings of the home screen, the only copy. The web merges them into its dictionary
 * (`src/i18n/index.ts`); the shell reads `pt`. `common.loading` and the three `program.*` keys are shared
 * with other pages of the web: the dictionary gets them from here too, so there is still one value of each.
 * The retry, the catalog link and the catalog's own states come from the catalog screen's strings.
 * A visitor's hint and offer are not here on purpose: they are commerce, the web host words them, and the
 * shell never draws them.
 */
export const HOME_MESSAGES = {
  pt: {
    'home.heroTitle': 'Aprenda construindo',
    'home.heroAccent': 'projetos reais',
    'home.heroSubtitle': 'Microatividades que elevam suas habilidades — uma decisão de cada vez. Cada escolha importa.',
    'home.welcome': 'Bem-vindo de volta',
    'stats.streak': 'Dias seguidos',
    'stats.xp': 'XP total',
    'stats.badges': 'Conquistas',
    'stats.completed': 'Atividades',
    'home.yourPrograms': 'Seus programas',
    'home.visitor.programsTitle': 'Programas disponíveis',
    'home.programsSubtitle': 'Trilhas de aprendizado da sua organização',
    'home.empty': 'Nenhum programa disponível ainda.',
    'home.emptyHint': 'Novos programas estão a caminho.',
    'home.error': 'Não foi possível carregar os programas.',
    'badges.title': 'Sua coleção de conquistas',
    'badges.subtitle': 'Ganhe uma a cada programa concluído',
    'badges.empty': 'Conclua atividades para ganhar conquistas.',
    'common.loading': 'Carregando…',
    'program.start': 'Começar',
    'program.continue': 'Continuar',
    'program.percentComplete': '{n}% concluído',
    'home.footerBrand': 'Itera',
    'home.footerBy': 'by DevFellowship',
  },
  en: {
    'home.heroTitle': 'Learn by building',
    'home.heroAccent': 'real projects',
    'home.heroSubtitle': 'Microactivities that level up your skills — one decision at a time. Every choice matters.',
    'home.welcome': 'Welcome back',
    'stats.streak': 'Day streak',
    'stats.xp': 'Total XP',
    'stats.badges': 'Badges',
    'stats.completed': 'Activities',
    'home.yourPrograms': 'Your programs',
    'home.visitor.programsTitle': 'Available programs',
    'home.programsSubtitle': "Your organization's learning tracks",
    'home.empty': 'No programs available yet.',
    'home.emptyHint': 'New programs are on the way.',
    'home.error': 'Could not load programs.',
    'badges.title': 'Your badge collection',
    'badges.subtitle': 'Earn one for each completed program',
    'badges.empty': 'Complete activities to earn badges.',
    'common.loading': 'Loading…',
    'program.start': 'Start',
    'program.continue': 'Continue',
    'program.percentComplete': '{n}% complete',
    'home.footerBrand': 'Itera',
    'home.footerBy': 'by DevFellowship',
  },
} as const;
