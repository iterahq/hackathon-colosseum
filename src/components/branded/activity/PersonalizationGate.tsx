/**
 * O que a atividade pergunta ANTES de aparecer: só os campos que o enunciado
 * dela cita e o aluno ainda não preencheu.
 *
 * Pergunta o mínimo de propósito. O elenco tem nove campos, mas uma atividade
 * que só fala da mãe não é lugar de pedir a idade do amigo — e cada campo a
 * mais é um dado pessoal de terceiro a guardar sem precisar.
 *
 * "Prefiro não dizer" existe porque o dado é de família de adolescente: a saída
 * tem que ser tão fácil quanto a resposta. Quem dispensa segue a aula com os
 * nomes de exemplo e não é perguntado de novo na sessão.
 */
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { TACTILE_CTA } from '@iterahq/activities';
import { useI18n } from '@/i18n';
import { usePersonalization } from '@/personalization/personalizationPort';
import type { PersonalizationField } from '@/types/personalization';
import { sanitizePersonalizationInput } from '@/utils/personalization';

export function PersonalizationGate({ fields }: { fields: PersonalizationField[] }) {
  const { t } = useI18n();
  const { values, save, dismiss } = usePersonalization();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const complete = fields.every((f) => (draft[f.id] ?? '').trim() !== '');

  async function submit() {
    if (!complete || saving) return;
    setSaving(true);
    await save({ ...values, ...draft });
    setSaving(false);
  }

  return (
    <div
      className="rounded-3xl border border-border bg-card p-6 md:p-8"
      data-testid="personalization-form"
    >
      <span className="inline-flex items-center gap-1.5 rounded-full border border-evergreen/30 bg-evergreen-soft px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-evergreen-hi">
        <Sparkles className="h-3.5 w-3.5" /> {t('personalization.eyebrow')}
      </span>

      <h2 className="mt-5 font-display text-xl font-bold text-foreground md:text-2xl">
        {t('personalization.title')}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">{t('personalization.subtitle')}</p>

      <div className="mt-6 space-y-4">
        {fields.map((field) => (
          <label key={field.id} className="block">
            <span className="text-sm text-muted-foreground">
              {t(`personalization.field.${field.labelKey}`)}
            </span>
            <input
              value={draft[field.id] ?? ''}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  [field.id]: sanitizePersonalizationInput(e.target.value, field.kind),
                }))
              }
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              inputMode={field.kind === 'age' ? 'numeric' : 'text'}
              placeholder={field.fallback}
              data-testid="personalization-input"
              data-field={field.id}
              className="mt-1 w-full rounded-2xl border border-border bg-background p-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-evergreen/40"
            />
          </label>
        ))}
      </div>

      <button
        onClick={submit}
        disabled={!complete || saving}
        data-testid="personalization-submit"
        className={`mt-6 inline-flex h-12 w-full items-center justify-center rounded-full px-6 ${TACTILE_CTA}`}
      >
        {saving ? t('personalization.saving') : t('personalization.submit')}
      </button>

      <button
        onClick={dismiss}
        data-testid="personalization-dismiss"
        className="mt-3 w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
      >
        {t('personalization.dismiss')}
      </button>
    </div>
  );
}
