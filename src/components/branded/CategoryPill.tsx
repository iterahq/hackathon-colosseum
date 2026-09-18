import { SlashBar } from './SlashBar';
import { categoryLabel } from '@/utils/categoryLabel';

/** The category eyebrow pill, pinned to the thumbnail's top-left corner. */
export function CategoryPill({ icon }: { icon?: string }) {
  return (
    <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 h-6 pl-2 pr-2.5 rounded-full bg-brand-bg/75 border border-foreground/10 font-mono text-[11px] uppercase tracking-wider text-foreground">
      <SlashBar className="h-[11px]" />
      {categoryLabel(icon)}
    </span>
  );
}
