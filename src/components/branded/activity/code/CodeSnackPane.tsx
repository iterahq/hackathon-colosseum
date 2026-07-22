import { motion } from 'framer-motion';
import { Code2, ExternalLink } from 'lucide-react';
import type { CodeSpec } from '@iterahq/activity-spec';
import { useI18n } from '@/i18n';
import type { Activity } from '@/types/content';
import { CodeEditor } from '@/components/editor/CodeEditor';
import { useCodeSnack } from '@/hooks/useCodeSnack';
import { DoneButton } from '@/components/branded/activity/parts';
import { CodeLivePreview } from './CodeLivePreview';

/**
 * The split-pane snack surface: Monaco (seeded from `spec.starter`) + optional
 * help link on the LEFT, a live react-live preview on the RIGHT. Thin view over
 * `useCodeSnack` (source + debounced autosave + completion).
 */
export function CodeSnackPane({
  activity,
  spec,
  onComplete,
}: {
  activity: Activity;
  spec: CodeSpec;
  onComplete: (correct: boolean) => void;
}) {
  const { t } = useI18n();
  const { code, setCode, complete } = useCodeSnack(activity.id, spec, { onComplete });
  const isDone = activity.status === 'done';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-border bg-card p-4 md:p-6"
      data-testid="activity-shell"
      data-activity-kind="code"
    >
      <h2 className="font-display text-foreground">{spec.prompt}</h2>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col">
          <div className="h-[360px] overflow-hidden rounded-2xl border border-border bg-[#0a0a0a]">
            <CodeEditor value={code} onChange={setCode} language="typescript" />
          </div>
          {spec.help && (
            <a
              href={spec.help.url}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="code-help-link"
              className="mt-2 inline-flex items-center gap-1.5 text-sm text-evergreen-hi hover:underline"
            >
              <ExternalLink className="w-3.5 h-3.5" /> {spec.help.label}
            </a>
          )}
        </div>

        <div className="h-[360px] overflow-hidden rounded-2xl border border-border">
          <CodeLivePreview code={code} />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <Code2 className="w-3.5 h-3.5" /> {t('activity.codeSnackHint')}
      </div>

      <DoneButton done={isDone} onClick={complete} />
    </motion.div>
  );
}
