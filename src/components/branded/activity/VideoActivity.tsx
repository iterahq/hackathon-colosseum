/**
 * Video — a video-only activity (watch). A subset of Concept promoted to its
 * own kind: renders the video prominently, with an optional InstructionPanel
 * for surrounding context. Non-interactive → completes correct after watch.
 */
import { Video as VideoIcon } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { Activity, VideoSpec } from '@/types/content';
import { InstructionPanel } from './InstructionPanel';
import { ActivityShell, DoneButton } from './parts';

export function VideoActivity({
  activity,
  onComplete,
}: {
  activity: Activity;
  onComplete: (correct: boolean) => void;
}) {
  const { t } = useI18n();
  const spec = activity.spec as unknown as VideoSpec;
  const isDone = activity.status === 'done';
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
          <video src={spec.video_url} controls className="w-full max-h-[28rem] bg-black" />
        </div>
      ) : (
        <div className="flex items-center justify-center gap-3 py-12 text-muted-foreground rounded-2xl border border-border bg-obsidiana/60">
          <VideoIcon className="w-6 h-6 text-menta" />
          <span className="text-sm">{t('activity.video.missing')}</span>
        </div>
      )}
      <DoneButton done={isDone} onClick={() => onComplete(true)} />
    </ActivityShell>
  );
}
