/** Class sets for `ActivityTextarea`. See that component for why there are only two. */
export const ACTIVITY_TEXTAREA_BASE =
  'w-full text-foreground placeholder:text-muted-foreground focus:outline-none coarse:text-base';

export const ACTIVITY_TEXTAREA_VARIANTS = {
  boxed:
    'rounded-2xl border border-border bg-background p-4 text-sm focus:ring-2 focus:ring-evergreen/40 disabled:opacity-60',
  bare: 'resize-none bg-transparent py-2 text-[15px] leading-relaxed disabled:opacity-60',
} as const;

export type ActivityTextareaVariant = keyof typeof ACTIVITY_TEXTAREA_VARIANTS;
