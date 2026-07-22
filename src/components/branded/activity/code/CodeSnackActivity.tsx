import { safeParseActivitySpec } from '@iterahq/activity-spec';
import { useI18n } from '@/i18n';
import type { Activity } from '@/types/content';
import { CodeSnackPane } from './CodeSnackPane';

/**
 * `code` — a single-file, client-only React code snack. Validates the spec
 * against the shared Zod schema (a friendly card on an authoring mistake instead
 * of a crash), then hands off to the split-pane surface: Monaco on the left, a
 * live react-live preview (inside a sandboxed iframe) on the right. No grading in
 * the MVP — Done completes; source is autosaved (debounced) for a later pull.
 */
export function CodeSnackActivity({
  activity,
  onComplete,
}: {
  activity: Activity;
  onComplete: (correct: boolean) => void;
}) {
  const { t } = useI18n();
  const parsed = safeParseActivitySpec('code', activity.spec);
  if (!parsed.success) {
    return (
      <div
        className="rounded-3xl border border-border bg-card p-8 text-center text-muted-foreground"
        data-testid="code-invalid"
        data-activity-kind="code"
      >
        {t('activity.codeInvalid')}
      </div>
    );
  }
  return <CodeSnackPane activity={activity} spec={parsed.data} onComplete={onComplete} />;
}
