import { BookOpen, Layers, ListChecks } from 'lucide-react';
import { useCountLabel } from './useCountLabel';
import type { CatalogProgramCardData } from '@/types/catalogProgramCardData';

/** Lessons · units · activities counts, singular-aware ("1 lição", not "1 lições"). */
export function CatalogCardMeta({ program }: { program: CatalogProgramCardData }) {
  const count = useCountLabel();

  return (
    <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-foreground/60">
      <li className="flex items-center gap-1.5">
        <BookOpen className="w-3.5 h-3.5" />
        {count(program.lessonCount ?? 0, 'label.lesson', 'label.lessons')}
      </li>
      <li className="flex items-center gap-1.5">
        <Layers className="w-3.5 h-3.5" />
        {count(program.unitCount ?? 0, 'label.unit', 'label.units')}
      </li>
      <li className="flex items-center gap-1.5">
        <ListChecks className="w-3.5 h-3.5" />
        {count(program.activityCount ?? 0, 'label.activity', 'label.activities')}
      </li>
    </ul>
  );
}
