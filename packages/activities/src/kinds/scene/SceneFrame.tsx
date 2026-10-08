import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ActivityShell } from '../../components/parts.js';
import { GuideBubble } from './GuideBubble.js';

/**
 * The three-beat cycle around a stage: the guide invites (prompt), the learner
 * acts on `children`, and the guide reacts. The frame never resizes between
 * unsolved and solved.
 */
export function SceneFrame({
  kind,
  icon,
  label,
  guideName,
  prompt,
  reaction,
  solved,
  children,
}: {
  kind: string;
  icon: LucideIcon;
  label: string;
  guideName?: string;
  prompt: string;
  reaction: string;
  solved: boolean;
  children: ReactNode;
}) {
  return (
    <ActivityShell kind={kind} icon={icon} label={label} mascot="none">
      <div className="flex flex-col gap-5 max-sm:gap-3" data-testid="scene-frame" data-solved={solved ? 'true' : 'false'}>
        <GuideBubble name={guideName} text={solved ? reaction : prompt} sizers={[prompt, reaction]} happy={solved} />
        <div className="relative">{children}</div>
      </div>
    </ActivityShell>
  );
}
