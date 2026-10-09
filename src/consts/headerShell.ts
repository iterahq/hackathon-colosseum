/** The learner pages' background: near-black with a 26px grid. */
export const APP_GRID_STYLE = {
  backgroundColor: '#0A0908',
  backgroundImage: 'linear-gradient(#15130F 1px,transparent 1px),linear-gradient(90deg,#15130F 1px,transparent 1px)',
  backgroundSize: '26px 26px',
} as const;

/** The content column shared by the dashboard, courses and the pages that follow them. */
export const APP_MAIN_CLASS = 'mx-auto flex max-w-[1440px] flex-col px-4 pb-14 pt-6 sm:px-8 xl:px-20 xl:pt-10';
