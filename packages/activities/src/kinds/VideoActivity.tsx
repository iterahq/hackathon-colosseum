/**
 * Video — a video-only activity (watch). A subset of Concept promoted to its
 * own kind: renders the video prominently, with an optional InstructionPanel
 * for surrounding context. Non-interactive → completes correct after watch.
 *
 * O player é o MESMO `InstructionVideo` do painel de instrução, só mais alto:
 * um vídeo que não toca precisa cair no cartão de link aqui também, e essa era
 * a segunda cópia da mesma tag `<video>`.
 */
import { Video as VideoIcon } from 'lucide-react';
import { useActivityI18n } from '../context.js';
import type { PortableActivity } from '../renderer.js';
import type { VideoSpec } from '../specs.js';
import { InstructionPanel } from '../components/InstructionPanel.js';
import { InstructionVideo } from '../components/InstructionVideo.js';
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

  return (
    <ActivityShell kind="video" icon={VideoIcon} label={t('activity.video')}>
      {spec?.instruction && (
        <div className="mb-5">
          <InstructionPanel spec={spec.instruction} inlineVideo />
        </div>
      )}
      {spec?.video_url ? (
        <div data-testid="video-player">
          <InstructionVideo src={spec.video_url} height="h-[28rem]" maxHeight="max-h-[28rem]" />
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
