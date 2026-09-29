import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ActivityShell } from '../../components/parts.js';
import { GuideBubble } from './GuideBubble.js';
import { SceneStamp } from './SceneStamp.js';

/**
 * The four-beat cycle around a stage: the guide invites (prompt), the learner
 * acts on `children`, the guide reacts, and only then the stamp names it.
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
    <ActivityShell kind={kind} icon={icon} label={label}>
      <div className="flex flex-col gap-5" data-testid="scene-frame" data-solved={solved ? 'true' : 'false'}>
        <GuideBubble name={guideName} text={solved ? reaction : prompt} happy={solved} />
        {children}
        <div className="min-h-[56px]">{solved && <SceneStamp text={stamp} />}</div>
      </div>
    </ActivityShell>
  );
}
