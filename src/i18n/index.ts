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
    'common.retry': 'Tentar de novo',
    'common.back': 'Voltar',
    'locale.switch': 'EN',
    'nav.discover': 'Descobrir',
    'nav.library': 'Biblioteca',
    'nav.search': 'Buscar cursos, tópicos, conquistas…',
    'nav.notifications': 'Notificações',
    'nav.settings': 'Configurações',
    'nav.language': 'Idioma',
    'role.learner': 'Aluno',
    'role.admin': 'Admin',
    'home.welcome': 'Bem-vindo de volta',
    'home.heroTitle': 'Aprenda construindo',
    'home.heroAccent': 'projetos reais',
    'home.heroSubtitle':
      'Microatividades que transformam você em um desenvolvedor melhor. Cada decisão importa.',
    'home.pickUp': 'Escolha um programa para começar',
    'home.yourPrograms': 'Seus programas',
    'home.programsSubtitle': 'Trilhas de aprendizado da sua organização',
    'home.empty': 'Nenhum programa disponível ainda.',
    'home.emptyHint': 'Volte em breve — novos programas estão a caminho.',
    'home.error': 'Não foi possível carregar os programas.',
    'stats.streak': 'Dias seguidos',
    'stats.xp': 'XP total',
    'stats.badges': 'Conquistas',
    'stats.completed': 'Atividades',
    'label.program': 'Programa',
    'label.programs': 'Programas',
    'label.unit': 'Unidade',
    'label.units': 'Unidades',
    'label.lesson': 'Lição',
    'label.lessons': 'Lições',
    'label.activity': 'Atividade',
    'label.activities': 'Atividades',
    'badges.title': 'Sua coleção de conquistas',
    'badges.subtitle': 'Ganhe uma a cada programa concluído',
    'badges.seeAll': 'Ver todas',
    'badges.empty': 'Conclua atividades para ganhar conquistas.',
    'program.start': 'Começar',
    'program.continue': 'Continuar',
    'program.percentComplete': '{n}% concluído',
    'program.notFound': 'Programa não encontrado.',
    'journey.title': 'Jornada',
    'journey.basecamp': 'Acampamento base · sua jornada começa aqui',
    'journey.summit': 'Conclua o programa',
    'journey.badge': 'Conquista',
    'level.beginner': 'Iniciante',
    'level.intermediate': 'Intermediário',
    'level.advanced': 'Avançado',
    'lesson.start': 'Iniciar atividade',
    'lesson.next': 'Próxima',
    'lesson.prev': 'Anterior',
    'lesson.complete': 'Concluir lição',
    'lesson.notFound': 'Lição não encontrada.',
    'lesson.noActivities': 'Esta lição ainda não tem atividades.',
    'activity.document': 'Documento',
    'activity.diagram': 'Diagrama',
    'activity.quiz': 'Quiz',
    'activity.code': 'Código',
    'activity.codeSoon': 'O editor de código chega em breve (judge0).',
    'activity.submit': 'Enviar',
    'activity.quizPrompt': 'Selecione a resposta correta',
    'activity.markDone': 'Marcar como concluída',
    'activity.done': 'Concluída',
    // Tenant-admin observability (plan #6)
    'admin.kicker': 'Painel do administrador',
    'admin.title': 'Observabilidade da sua organização',
    'admin.subtitle': 'Acompanhe o progresso dos alunos de {tenant}. Somente leitura.',
    'admin.nav.roster': 'Alunos',
    'admin.nav.completion': 'Conclusão',
    'admin.nav.engagement': 'Engajamento',
    'admin.error': 'Não foi possível carregar os dados.',
    'admin.noTenant': 'Nenhuma organização associada à sua conta de administrador.',
    'admin.never': 'Nunca',
    'admin.today': 'Hoje',
    'admin.yesterday': 'Ontem',
    'admin.daysAgo': 'há {n} dias',
    'admin.col.learner': 'Aluno',
    'admin.col.completion': 'Conclusão',
    'admin.col.activities': 'Atividades',
    'admin.col.lastActive': 'Última atividade',
    'admin.roster.empty': 'Nenhum aluno nesta organização ainda.',
    'admin.roster.learners': 'Alunos',
    'admin.roster.avgCompletion': 'Conclusão média',
    'admin.roster.active': 'Ativos',
    'admin.chart.completion': 'Distribuição de conclusão',
    'admin.recent.title': 'Atividade recente',
    'admin.recent.empty': 'Sem atividade recente.',
    'admin.completion.empty': 'Nenhum programa para reportar ainda.',
    'admin.completion.label': 'concluído',
    'admin.completion.activities': 'Atividades',
    'admin.completion.enrolled': 'Inscritos',
    'admin.completion.activeLearners': 'Ativos',
    'admin.engagement.empty': 'Sem sinais de engajamento ainda.',
    'admin.engagement.hint': 'Atividades concluídas e recência da última atividade por aluno.',
    'admin.engagement.done': 'concl.',
    // Self-serve subscribe (PLG) — canonical label "Assinar".
    'subscribe.cta': 'Assinar',
    'subscribe.title': 'Assine o Itera',
    'subscribe.subtitle': 'Desbloqueie acesso completo aos programas e atividades.',
    'subscribe.button': 'Assinar agora',
    'subscribe.loading': 'Redirecionando para o pagamento…',
    'subscribe.error': 'Não foi possível iniciar a assinatura. Tente novamente.',
    'subscribe.sandbox': 'Pagamento de teste (sandbox). Nenhuma cobrança real será feita.',
    'subscribe.return.successTitle': 'Assinatura concluída',
    'subscribe.return.successBody': 'Obrigado! Sua assinatura foi processada.',
    'subscribe.return.cancelTitle': 'Pagamento cancelado',
    'subscribe.return.cancelBody': 'Você cancelou o pagamento. Pode tentar novamente quando quiser.',
    'subscribe.return.backHome': 'Voltar ao início',
    'subscribe.return.tryAgain': 'Tentar de novo',
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
    'common.retry': 'Try again',
    'common.back': 'Back',
    'locale.switch': 'PT',
    'nav.discover': 'Discover',
    'nav.library': 'Library',
    'nav.search': 'Search courses, topics, badges…',
    'nav.notifications': 'Notifications',
    'nav.settings': 'Settings',
    'nav.language': 'Language',
    'role.learner': 'Learner',
    'role.admin': 'Admin',
    'home.welcome': 'Welcome back',
    'home.heroTitle': 'Learn by building',
    'home.heroAccent': 'real projects',
    'home.heroSubtitle':
      'Microactivities that turn you into a better developer. Every decision matters.',
    'home.pickUp': 'Choose a program to start',
    'home.yourPrograms': 'Your programs',
    'home.programsSubtitle': "Your organization's learning tracks",
    'home.empty': 'No programs available yet.',
    'home.emptyHint': 'Check back soon — new programs are on the way.',
    'home.error': 'Could not load programs.',
    'stats.streak': 'Day streak',
    'stats.xp': 'Total XP',
    'stats.badges': 'Badges',
    'stats.completed': 'Activities',
    'label.program': 'Program',
    'label.programs': 'Programs',
    'label.unit': 'Unit',
    'label.units': 'Units',
    'label.lesson': 'Lesson',
    'label.lessons': 'Lessons',
    'label.activity': 'Activity',
    'label.activities': 'Activities',
    'badges.title': 'Your badge collection',
    'badges.subtitle': 'Earn one for each completed program',
    'badges.seeAll': 'See all',
    'badges.empty': 'Complete activities to earn badges.',
    'program.start': 'Start',
    'program.continue': 'Continue',
    'program.percentComplete': '{n}% complete',
    'program.notFound': 'Program not found.',
    'journey.title': 'Journey',
    'journey.basecamp': 'Base camp · your climb starts here',
    'journey.summit': 'Finish the program',
    'journey.badge': 'Badge',
    'level.beginner': 'Beginner',
    'level.intermediate': 'Intermediate',
    'level.advanced': 'Advanced',
    'lesson.start': 'Start activity',
    'lesson.next': 'Next',
    'lesson.prev': 'Previous',
    'lesson.complete': 'Finish lesson',
    'lesson.notFound': 'Lesson not found.',
    'lesson.noActivities': 'This lesson has no activities yet.',
    'activity.document': 'Document',
    'activity.diagram': 'Diagram',
    'activity.quiz': 'Quiz',
    'activity.code': 'Code',
    'activity.codeSoon': 'The code editor is coming soon (judge0).',
    'activity.submit': 'Submit',
    'activity.quizPrompt': 'Select the correct answer',
    'activity.markDone': 'Mark as done',
    'activity.done': 'Done',
    // Tenant-admin observability (plan #6)
    'admin.kicker': 'Admin dashboard',
    'admin.title': "Your organization's observability",
    'admin.subtitle': "Track {tenant}'s learners. Read-only.",
    'admin.nav.roster': 'Learners',
    'admin.nav.completion': 'Completion',
    'admin.nav.engagement': 'Engagement',
    'admin.error': 'Could not load the data.',
    'admin.noTenant': 'No organization is linked to your admin account.',
    'admin.never': 'Never',
    'admin.today': 'Today',
    'admin.yesterday': 'Yesterday',
    'admin.daysAgo': '{n} days ago',
    'admin.col.learner': 'Learner',
    'admin.col.completion': 'Completion',
    'admin.col.activities': 'Activities',
    'admin.col.lastActive': 'Last active',
    'admin.roster.empty': 'No learners in this organization yet.',
    'admin.roster.learners': 'Learners',
    'admin.roster.avgCompletion': 'Avg. completion',
    'admin.roster.active': 'Active',
    'admin.chart.completion': 'Completion distribution',
    'admin.recent.title': 'Recent activity',
    'admin.recent.empty': 'No recent activity.',
    'admin.completion.empty': 'No programs to report yet.',
    'admin.completion.label': 'completed',
    'admin.completion.activities': 'Activities',
    'admin.completion.enrolled': 'Enrolled',
    'admin.completion.activeLearners': 'Active',
    'admin.engagement.empty': 'No engagement signals yet.',
    'admin.engagement.hint': 'Completed activities and last-active recency per learner.',
    'admin.engagement.done': 'done',
    // Self-serve subscribe (PLG) — canonical label "Subscribe".
    'subscribe.cta': 'Subscribe',
    'subscribe.title': 'Subscribe to Itera',
    'subscribe.subtitle': 'Unlock full access to programs and activities.',
    'subscribe.button': 'Subscribe now',
    'subscribe.loading': 'Redirecting to checkout…',
    'subscribe.error': 'Could not start the subscription. Please try again.',
    'subscribe.sandbox': 'Test payment (sandbox). No real charge will be made.',
    'subscribe.return.successTitle': 'Subscription complete',
    'subscribe.return.successBody': 'Thank you! Your subscription has been processed.',
    'subscribe.return.cancelTitle': 'Payment canceled',
    'subscribe.return.cancelBody': 'You canceled the payment. You can try again whenever you like.',
    'subscribe.return.backHome': 'Back to home',
    'subscribe.return.tryAgain': 'Try again',
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
  /** Resolve a bilingual jsonb bag ({ pt, en }) for the current locale. */
  tText: (bag: Record<string, string | undefined> | null | undefined) => string;
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
      tText: (bag) => {
        if (!bag) return '';
        return bag[locale] ?? bag.en ?? bag.pt ?? Object.values(bag).find(Boolean) ?? '';
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
