/** Shared class strings of the shop, the lives gate and the purchase dialog: the dashboard's chunky language. */
export const SHOP_GRID = {
  backgroundColor: '#0A0908',
  backgroundImage: 'linear-gradient(#15130F 1px,transparent 1px),linear-gradient(90deg,#15130F 1px,transparent 1px)',
  backgroundSize: '26px 26px',
} as const;

export const HEART = '#E0655A';
export const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F4EDE2]';

const BUTTON = `inline-flex min-h-12 items-center justify-center gap-2 rounded-[12px] px-5 text-center [font:700_15px_Inter] transition-[transform,border-width,background-color] duration-100 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;

/** Green key with a thick ledge that sinks when pressed. */
export const BTN_PRIMARY = `${BUTTON} border-b-[5px] border-[#249457] bg-[#3FD17F] text-[#0A0908] hover:bg-[#5BE095] active:translate-y-[3px] active:border-b-2 disabled:translate-y-0 disabled:border-b-[5px]`;
/** Outlined key, same ledge. */
export const BTN_SECONDARY = `${BUTTON} border-2 border-b-[5px] border-[#2E2A25] bg-[#141210] text-[#F4EDE2] hover:border-[#5E574E] active:translate-y-[3px] active:border-b-2 disabled:translate-y-0 disabled:border-b-[5px]`;
export const BTN_SMALL = 'min-h-11 px-4 [font:700_14px_Inter]';

export const CARD = 'rounded-[14px] border border-[#262320] bg-[#141210]';
export const MONO_LABEL = '[font:600_11px_JetBrains_Mono] uppercase tracking-[.08em]';
export const DEVNET_BADGE = 'rounded-full border border-[#2E2A25] px-[7px] py-[2px] [font:600_9px_JetBrains_Mono] uppercase tracking-[.1em] text-[#A0978A]';
