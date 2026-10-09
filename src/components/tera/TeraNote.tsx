import type { ReactNode } from 'react';
import { TeraAvatar, type TeraMood, type TeraSize } from '@iterahq/activities';

interface Props {
  mood: TeraMood;
  title: string;
  body?: string;
  size?: TeraSize;
  /** The way out: a button or a link. */
  action?: ReactNode;
  className?: string;
  'data-testid'?: string;
}

/** Tera with a short line and the way out; the one mascot of a screen's empty, dead-end or error state. */
export function TeraNote({ mood, title, body, size = 'xl', action, className = '', 'data-testid': testId }: Props) {
  return (
    <div className={`flex flex-col items-center gap-3 pt-6 text-center ${className}`} data-testid={testId}>
      <TeraAvatar mood={mood} size={size} />
      <p className="[font:700_28px/1.1_'Barlow_Condensed'] text-[#F4EDE2]">{title}</p>
      {body && <p className="max-w-[420px] [font:500_14px/1.4_Inter] text-[#A0978A]">{body}</p>}
      {action}
    </div>
  );
}

export const TERA_BUTTON =
  "inline-flex h-12 items-center justify-center rounded-xl border-0 border-b-[5px] border-b-[#1F8A4F] bg-[#3FD17F] px-6 [font:700_22px_'Barlow_Condensed'] text-[#0A0908] transition-transform duration-75 active:translate-y-1 active:border-b-[1px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F4EDE2]";
