import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ActivityShell } from '../../components/parts.js';
import { GuideBubble } from './GuideBubble.js';
import { SceneStamp } from './SceneStamp.js';

/**
 * The four-beat cycle around a stage: the guide invites (prompt), the learner
 * acts on `children`, the guide reacts, and only then the stamp names it. The
 * stamp is an overlay on the stage's top edge: zero layout height, so the
 * frame never resizes between unsolved and solved.
 */
export function SceneFrame({
  kind,
  icon,
  label,
  guideName,
  prompt,
  reaction,
  stamp,
  solved,
  children,
}: {
  kind: string;
  icon: LucideIcon;
  label: string;
  guideName?: string;
  prompt: string;
  reaction: string;
  stamp: string;
  solved: boolean;
  children: ReactNode;
}) {
  return (
    <ActivityShell kind={kind} icon={icon} label={label} mascot="none">
      <div className="flex flex-col gap-5 max-sm:gap-3" data-testid="scene-frame" data-solved={solved ? 'true' : 'false'}>
        <GuideBubble name={guideName} text={solved ? reaction : prompt} sizers={[prompt, reaction]} happy={solved} />
        <div className="relative">
          {children}
          {solved && (
            <div className="pointer-events-none absolute -top-3 right-3 z-10 max-w-[calc(100%-1.5rem)]">
              <SceneStamp text={stamp} />
            </div>
          )}
        </div>
      </div>
    </ActivityShell>
  );
}
