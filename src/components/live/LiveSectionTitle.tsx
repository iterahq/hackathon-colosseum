import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function LiveSectionTitle({
  icon: Icon,
  title,
  compact = false,
  children,
}: {
  icon: LucideIcon;
  title: string;
  compact?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={`flex items-center gap-2 ${compact ? 'mb-2.5' : 'mb-3.5'}`}>
      <Icon className="w-4 h-4 text-evergreen-hi" />
      <h3 className="font-display font-semibold text-base uppercase tracking-wide text-evergreen-hi leading-none">
        {title}
      </h3>
      {children}
    </div>
  );
}
