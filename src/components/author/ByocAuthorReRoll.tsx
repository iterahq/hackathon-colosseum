/**
 * Author-side re-roll for a BYOC activity under test.
 *
 * Generation is idempotent per (learner, activity) because the question a
 * learner is graded on cannot change under them (ADR-13). For the AUTHOR that
 * same stickiness breaks the edit-test loop in silence: they change the
 * activity's generation prompt, re-open this page, get their FIRST roll back and
 * read the edit as a no-op. The server honors `regenerate` over a real
 * generation only for someone who can author the activity — this is the only
 * caller that asks for it.
 *
 * It talks to the API directly instead of reaching into the activity: the
 * renderer's prop surface is a declared contract (`activity/contract/`), and an
 * author-preview concern has no business widening it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button, Textarea } from '@devfellowship/components';
import { generateByoc, readByoc } from '@/api/iteraByoc';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n';

export function ByocAuthorReRoll({
  activityId,
  onRegenerated,
}: {
  activityId: string;
  /** Remount the renderer so it re-reads the row this just replaced. */
  onRegenerated: () => void;
}) {
  const { t } = useI18n();
  const { session } = useAuth();
  const token = session?.access_token ?? '';
  const [seed, setSeed] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<'error' | 'declined' | null>(null);
  const runRef = useRef(0);

  // Prefill with the seed already on file so re-rolling the SAME context is one
  // click — that is the loop when what changed is the prompt, not the context.
  useEffect(() => {
    if (!token) return;
    const run = ++runRef.current;
    readByoc(activityId, token)
      .then((row) => {
        if (runRef.current === run && row) setSeed((s) => s || row.seed);
      })
      .catch(() => {});
  }, [activityId, token]);

  // A DECLINED re-roll is a 200 carrying the old row (`reused`), not an error —
  // the server refuses whoever cannot author this activity, and both halves of
  // this fix have to be deployed for it to say yes. Remounting on that answer
  // would put the identical tree back on screen under a button claiming it
  // regenerated: the original bug, now lying about itself.
  const reRoll = useCallback(() => {
    setBusy(true);
    setFailed(null);
    generateByoc(activityId, seed, token, true)
      .then((row) => (row.reused ? setFailed('declined') : onRegenerated()))
      .catch(() => setFailed('error'))
      .finally(() => setBusy(false));
  }, [activityId, seed, token, onRegenerated]);

  return (
    <div
      className="rounded-xl border border-border bg-card px-4 py-3 flex flex-col gap-2"
      data-testid="byoc-author-reroll"
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Sparkles className="h-4 w-4" />
        {t('authorTest.byoc.title')}
      </div>
      <p className="text-xs text-muted-foreground">{t('authorTest.byoc.hint')}</p>
      <Textarea
        value={seed}
        onChange={(e) => setSeed(e.target.value)}
        rows={2}
        aria-label={t('authorTest.byoc.seedLabel')}
        placeholder={t('authorTest.byoc.seedPlaceholder')}
        data-testid="byoc-author-seed"
      />
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          onClick={reRoll}
          disabled={busy || !token || !seed.trim()}
          data-testid="byoc-author-regenerate"
        >
          {busy ? t('authorTest.byoc.busy') : t('authorTest.byoc.action')}
        </Button>
        {failed && (
          <span className="text-xs text-destructive" data-testid="byoc-author-error">
            {t(failed === 'declined' ? 'authorTest.byoc.declined' : 'authorTest.byoc.error')}
          </span>
        )}
      </div>
    </div>
  );
}
