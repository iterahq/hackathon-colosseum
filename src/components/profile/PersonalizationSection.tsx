/**
 * Onde o aluno vê e MUDA o elenco inteiro — os nove campos, não só os que uma
 * atividade pediu.
 *
 * Existe porque o formulário que aparece antes da atividade pergunta o mínimo:
 * sem esta tela, um nome digitado errado ficaria preso na aula toda. Apagar um
 * campo aqui é a forma de RETIRAR o dado — o valor volta a ser o nome de
 * exemplo, e o banco não guarda string vazia.
 */
import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n';
import { usePersonalization } from '@/personalization/personalizationPort';
import { PERSONALIZATION_FIELDS, sanitizePersonalizationValue } from '@/utils/personalization';

export function PersonalizationSection() {
  const { t } = useI18n();
  const { values, save, ready } = usePersonalization();
  const [draft, setDraft] = useState(values);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => setDraft(values), [values]);

  async function submit() {
    setSaving(true);
    await save(draft);
    setSaving(false);
    setSaved(true);
  }

  return (
    <section
      className="mt-6 rounded-3xl border border-border bg-card p-6 md:p-8"
      data-testid="personalization-section"
    >
      <h2 className="font-display text-xl text-foreground">{t('personalization.section')}</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">{t('personalization.sectionHint')}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {PERSONALIZATION_FIELDS.map((field) => (
          <label key={field.id} className="block">
            <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              {t(`personalization.field.${field.labelKey}`)}
            </span>
            <input
              value={draft[field.id] ?? ''}
              onChange={(e) => {
                setSaved(false);
                setDraft((d) => ({
                  ...d,
                  [field.id]: sanitizePersonalizationValue(e.target.value, field.kind),
                }));
              }}
              inputMode={field.kind === 'age' ? 'numeric' : 'text'}
              placeholder={field.fallback}
              data-testid="personalization-input"
              data-field={field.id}
              className="mt-1.5 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-clay/60"
            />
          </label>
        ))}
      </div>

      {saved && !saving && (
        <p className="mt-5 text-sm text-evergreen-hi" data-testid="personalization-saved">
          {t('personalization.saved')}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={!ready || saving}
        data-testid="personalization-save"
        className="mt-5 h-12 w-full rounded-full bg-evergreen font-medium text-obsidiana transition-colors hover:bg-evergreen-hi disabled:cursor-not-allowed disabled:opacity-40"
      >
        {saving ? t('personalization.saving') : t('profile.save')}
      </button>
    </section>
  );
}
