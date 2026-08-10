import { safeParseActivitySpec } from '@iterahq/activity-spec';
import { useActivityI18n } from '../context.js';
import type { ActivityRendererProps } from '../renderer.js';
import { CodeSnackPane } from './CodeSnackPane.js';
import { isGuidedCodeSpec } from './guided/guidedCode.js';
import { GuidedCodePane } from './guided/GuidedCodePane.js';

/**
 * `code` — a single-file, client-only React code snack, and the only kind that
 * lives behind its own entrypoint (`@iterahq/activities/code`, ADR-5).
 *
 * It validates the spec against the shared Zod schema (a friendly card on an
 * authoring mistake instead of a crash), then hands off to the split-pane
 * surface: the host's editor on the left, a live preview (sucrase-transpiled,
 * inside a sandboxed iframe) on the right.
 *
 * The source is autosaved (debounced) through the `storage` port while the
 * learner works, and the SETTLED source rides up with the verdict as
 * `detail.response` — until that second half existed, a code attempt recorded a
 * boolean and the work itself never left the machine.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT IS NOT IN `BUILT_IN_ACTIVITY_KINDS`, AND THAT IS THE FEATURE
 * ─────────────────────────────────────────────────────────────────────────────
 * The base dispatcher answers "no, ask the host" for `code`, because a
 * consumer that never renders a code snack must not pay for the preview
 * runtime, the transpiler, or whatever editor a host wires in. To render it:
 *
 *   import { CodeActivity } from '@iterahq/activities/code';
 *
 *   <ActivityProvider i18n={…} codeEditor={MyEditor} renderers={{ code: CodeActivity }}>
 *     <ActivityRenderer activity={row} onComplete={…} />
 *   </ActivityProvider>
 *
 * — or mount `<CodeActivity>` directly, which is what the Itera Player does
 * through its own dispatcher. Registering through `renderers` is the same seam
 * a host uses for any kind the package does not ship; there is no second
 * registry.
 */
export function CodeActivity({ activity, onComplete }: ActivityRendererProps) {
  const { t } = useActivityI18n();
  // `site: 'component'` in the Player's boundary registry: the `code` kind
  // validates HERE, the historical way, because this component is also rendered
  // directly (outside any dispatcher) by stories and tests. Same card, same
  // testid — `code-invalid` is depended on by the e2e and by the invalid-spec
  // coverage sweep, so it crosses into the package unchanged.
  const parsed = safeParseActivitySpec('code', activity.spec);
  if (!parsed.success) {
    return (
      <div
        className="rounded-3xl border border-border bg-card p-8 text-center text-muted-foreground"
        data-testid="code-invalid"
        data-activity-kind="code"
        data-invalid-spec="true"
      >
        {t('activity.codeInvalid')}
      </div>
    );
  }
  /**
   * Guided or open, decided by the SHAPE of the spec — `blanks` present means the
   * template is locked and only the authored holes are interactive.
   *
   * Not a new `ActivityKind`: that would cost a DB enum migration, an itera-mcp
   * sync and an entry in every exhaustiveness map, all to express something the
   * spec already says. The schema forbids `blanks` and `checks` together, so the
   * two surfaces cannot both claim one activity.
   */
  if (isGuidedCodeSpec(parsed.data)) {
    return <GuidedCodePane activity={activity} spec={parsed.data} onComplete={onComplete} />;
  }
  return <CodeSnackPane activity={activity} spec={parsed.data} onComplete={onComplete} />;
}
