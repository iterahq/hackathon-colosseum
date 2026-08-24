import { useState } from 'react';
import { ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { RichText } from '@iterahq/activities';
import { useI18n } from '@/i18n';
import type { Activity } from '@/types/content';
import { activityPromptText } from '@/utils/activityPromptText';

/**
 * Pulling a learner onto the stage replaces the professor's own screen with
 * theirs, and the statement of the exercise lives INSIDE the activity that was
 * replaced — so the professor had to clear the stage to re-read what the task
 * asked. This keeps the statement on screen next to the projected work.
 */
export function LiveStagePrompt({ activity }: { activity: Activity }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(true);
  const prompt = activityPromptText(activity);

  if (!prompt) return null;

  return (
    <div className="mt-7 rounded-2xl border border-border bg-card" data-testid="live-stage-prompt">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-4 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-evergreen-hi"
      >
        <FileText className="w-3.5 h-3.5" />
        {t('live.stage.prompt')}
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 ml-auto" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 ml-auto" />
        )}
      </button>
      {open && (
        <div className="px-4 pb-4 text-sm text-foreground" data-testid="live-stage-prompt-body">
          <RichText text={prompt} />
        </div>
      )}
    </div>
  );
}
