/**
 * The strings of the catalog screen, the only copy. The web merges them into its dictionary
 * (`src/i18n/index.ts`); the shell reads `pt`. `nav.catalog`, `common.retry` and the six `label.*` counts
 * are shared keys: the dictionary gets them from here too, so there is still one value of each.
 * The "Assine para desbloquear" offer is not here on purpose: it is commerce, the web host words it,
 * and the shell never draws it.
 */
export const CATALOG_MESSAGES = {
  pt: {
    'nav.catalog': 'Cursos',
    'common.retry': 'Tentar de novo',
    'label.unit': 'Unidade',
    'label.units': 'Unidades',
    'label.lesson': 'Lição',
    'label.lessons': 'Lições',
    'label.activity': 'Atividade',
    'label.activities': 'Atividades',
    'catalog.title': 'Catálogo de cursos',
    'catalog.subtitle': 'Explore os cursos disponíveis e matricule-se para começar.',
    'catalog.empty': 'Nenhum curso no catálogo ainda.',
    'catalog.emptyHint': 'Novos cursos estão a caminho.',
    'catalog.error': 'Não foi possível carregar o catálogo.',
    'catalog.enroll': 'Matricular',
    'catalog.enrolling': 'Matriculando…',
    'catalog.open': 'Abrir curso',
    'catalog.enrollError': 'Não foi possível matricular. Tente de novo.',
  },
  en: {
    'nav.catalog': 'Courses',
    'common.retry': 'Try again',
    'label.unit': 'Unit',
    'label.units': 'Units',
    'label.lesson': 'Lesson',
    'label.lessons': 'Lessons',
    'label.activity': 'Activity',
    'label.activities': 'Activities',
    'catalog.title': 'Course catalog',
    'catalog.subtitle': 'Browse the available courses and enroll to get started.',
    'catalog.empty': 'No courses in the catalog yet.',
    'catalog.emptyHint': 'New courses are on the way.',
    'catalog.error': 'Could not load the catalog.',
    'catalog.enroll': 'Enroll',
    'catalog.enrolling': 'Enrolling…',
    'catalog.open': 'Open course',
    'catalog.enrollError': 'Could not enroll. Please try again.',
  },
} as const;
