import { lazy } from 'react';

/** The landing chunk loads only for a visitor; a signed-in learner never pays for it. */
export const LazyLandingPage = lazy(() => import('@/pages/LandingPage'));
