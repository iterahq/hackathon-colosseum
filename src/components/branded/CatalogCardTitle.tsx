import { SlashBar } from './SlashBar';
import type { CategoryTone } from '@/types/categoryTone';

/**
 * The v3 card title: a 32px display headline in the category's accent color
 * (the same color as the icon tile — title and tile read as one identity),
 * plus an optional "Headline: subline" support line marked with the brand
 * slash bar.
 */
export function CatalogCardTitle({
  headline,
  subline,
  tone,
}: {
  headline: string;
  subline: string | null;
  tone: CategoryTone;
}) {
  return (
    <>
      <h3 className="font-display font-semibold text-[26px] md:text-[30px] lg:text-[28px] xl:text-[32px] leading-[1.12] tracking-[-0.6px]">
        <span style={{ color: tone.accent }}>{headline}</span>
      </h3>
      {subline && (
        <p className="mt-2 flex items-start gap-2 text-base leading-snug text-foreground/70">
          <SlashBar className="h-[15px] mt-[4px]" />
          <span>{subline}</span>
        </p>
      )}
    </>
  );
}
