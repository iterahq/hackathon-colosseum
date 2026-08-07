/**
 * Video — a video-only activity (watch). A subset of Concept promoted to its
 * own kind: renders the video prominently, with an optional InstructionPanel
 * for surrounding context. Non-interactive → completes correct after watch.
 *
 * Skeleton: a pulse placeholder reserves space at the video's natural height
 * (h-[28rem]) while the media loads, preventing layout shift.
 */
import { useState } from 'react';
import { Video as VideoIcon } from 'lucide-react';
import { useActivityI18n } from '../context.js';
import type { PortableActivity } from '../renderer.js';
import type { VideoSpec } from '../specs.js';
import { InstructionPanel } from '../components/InstructionPanel.js';
import { ActivityShell } from '../components/parts.js';

export function VideoActivity({
  activity,
}: {
  activity: PortableActivity;
  /** Part of the shared renderer contract; a video has nothing to grade. */
  onComplete: (correct: boolean) => void;
}) {
  const { t } = useActivityI18n();
  const spec = activity.spec as unknown as VideoSpec;
  const [videoLoaded, setVideoLoaded] = useState(false);

  return (
    <ActivityShell kind="video" icon={VideoIcon} label={t('activity.video')}>
      {spec?.instruction && (
        <div className="mb-5">
          <InstructionPanel spec={spec.instruction} />
        </div>
      )}
      {spec?.video_url ? (
        <div
          className="rounded-2xl border border-border bg-obsidiana/60 overflow-hidden"
          data-testid="video-player"
        >
          {!videoLoaded && (
            <div
              className="w-full h-[28rem] animate-pulse bg-muted-foreground/10"
              aria-hidden="true"
              data-testid="video-skeleton"
            />
          )}
          <video
            src={spec.video_url}
            controls
            className={`w-full max-h-[28rem] bg-black transition-opacity duration-300 ${videoLoaded ? 'opacity-100' : 'opacity-0 h-0'}`}
            onLoadedMetadata={() => setVideoLoaded(true)}
          />
        </div>
      ) : (
        <div className="flex items-center justify-center gap-3 py-12 text-muted-foreground rounded-2xl border border-border bg-obsidiana/60">
          <VideoIcon className="w-6 h-6 text-menta" />
          <span className="text-sm">{t('activity.video.missing')}</span>
        </div>
      )}
    </ActivityShell>
  );
}
