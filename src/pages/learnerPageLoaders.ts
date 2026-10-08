export const loadHomePage = () => import('./HomeRoute');
export const loadCatalogPage = () => import('./CatalogRoute');
export const loadProgramPage = () => import('./ProgramPage');
export const loadLessonPlayer = () => import('./LessonPlayer');

/** The pages a signed-in learner reaches by tapping; fetched ahead so the tap does not wait on a chunk. */
export const LEARNER_PAGE_LOADERS = [loadHomePage, loadProgramPage, loadLessonPlayer, loadCatalogPage];
