import { createElement, type ReactNode } from 'react';
import { ArrowRight, BookOpen, CheckCircle2, Layers, ListChecks, Lock } from 'lucide-react';
import type { CatalogIcon } from '@iterahq/shell-core';
import { iconForCategory } from '@/utils/iconForCategory';

/** The glyphs of the universal catalog screen on the web: the lucide icons the old cards drew, at the sizes they drew them. */
export function catalogScreenIcon(icon: CatalogIcon): ReactNode {
  switch (icon.kind) {
    case 'category':
      return createElement(iconForCategory(icon.icon), { className: 'w-10 h-10 text-brand-bg', strokeWidth: 2.25 });
    case 'lessons':
      return <BookOpen className="w-3.5 h-3.5" />;
    case 'units':
      return <Layers className="w-3.5 h-3.5" />;
    case 'activities':
      return <ListChecks className="w-3.5 h-3.5" />;
    case 'lock-badge':
      return <Lock className="w-3.5 h-3.5" />;
    case 'lock-cta':
      return <Lock className="w-4 h-4" />;
    case 'open':
      return <CheckCircle2 className="w-4 h-4" />;
    case 'next':
      return <ArrowRight className="w-4 h-4" />;
  }
}
