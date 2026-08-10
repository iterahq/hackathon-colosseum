/**
 * The authoring control for "what persists?".
 *
 * Plan: 20260728-itera-artifact-storage. Migration `0027`.
 *
 * Tainan's correction, verbatim:
 *
 * > "pelo que eu tô entendendo, você já inferiu quais tarefas geram
 * >  persistência. Você colocou só nas de AI Judge? Isso poderia ou deveria ser
 * >  DEFINIDO lá na ferramenta de autoria. Ter um default por activity type,
 * >  claro, mas ser definido no authoring. Porque às vezes uma resposta
 * >  determinística ainda pode gerar algo útil que deve ser persistido — seria
 * >  como um template que, a partir de uma pré-engenharia do nosso usuário, gera
 * >  algo útil mesmo sem usar IA. Pra mim ainda tá obscura essa questão de o que
 * >  persiste, quais tarefas persistem."
 *
 * Two things follow from that, and both are load-bearing here:
 *
 * 1. **The default is shown, not hidden.** The "automático" option spells out
 *    what the kind default actually resolves to for THIS activity ("persiste ·
 *    reflection.md"). The complaint was that the rule was obscure — an editor
 *    that silently defaults would reproduce the same opacity in a nicer shape.
 * 2. **A deterministic activity can be turned into a deliverable** by choosing
 *    "sempre" and writing a template. That is the "pré-engenharia" case, and it
 *    needs no AI at all.
 *
 * ⚠️ This is the FIRST author-facing edit form in this repo — every other
 * content field is written by the `itera-mcp` agent (ADR-5). It is deliberately
 * scoped to `artifact_policy` alone and does not touch `spec`/`rubric`, so that
 * rule is bent for exactly one cross-kind, non-content concern rather than
 * quietly repealed.
 */
import { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea,
} from '@devfellowship/components';
import { useI18n } from '@/i18n';
import type { Activity } from '@/types/content';
import {
  KIND_ARTIFACT_DEFAULTS,
  parseArtifactPolicy,
  resolveArtifactPolicy,
  type ArtifactMode,
} from '@/services/artifactPolicy';
import type { ArtifactType } from '@/services/artifact.service';

const MODES: ArtifactMode[] = ['auto', 'always', 'never'];
const TYPES: ArtifactType[] = ['text', 'code', 'document', 'diagram', 'site'];

export function ArtifactPolicyEditor({
  activity,
  open,
  onOpenChange,
  onSave,
  saving = false,
}: {
  activity: Activity;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (policy: Record<string, unknown>) => void;
  saving?: boolean;
}) {
  const { t } = useI18n();
  const stored = parseArtifactPolicy(activity.artifactPolicy);

  const [mode, setMode] = useState<ArtifactMode>(stored.mode ?? 'auto');
  const [type, setType] = useState<ArtifactType | ''>(stored.type ?? '');
  const [filename, setFilename] = useState(stored.filename ?? '');
  const [template, setTemplate] = useState(stored.template ?? '');

  // Re-seed when the dialog opens on a different activity — otherwise the form
  // would show the previously edited activity's values.
  useEffect(() => {
    if (!open) return;
    const s = parseArtifactPolicy(activity.artifactPolicy);
    setMode(s.mode ?? 'auto');
    setType(s.type ?? '');
    setFilename(s.filename ?? '');
    setTemplate(s.template ?? '');
  }, [open, activity.id, activity.artifactPolicy]);

  const kindDefault = KIND_ARTIFACT_DEFAULTS[activity.kind];
  // What the CURRENT form state would actually produce — recomputed through the
  // real resolver rather than re-derived here, so the preview cannot disagree
  // with runtime behaviour.
  const preview = resolveArtifactPolicy({
    kind: activity.kind,
    artifactPolicy: {
      ...(mode !== 'auto' ? { mode } : {}),
      ...(type !== '' ? { type } : {}),
      ...(filename.trim() !== '' ? { filename } : {}),
    },
  });

  function handleSave() {
    // Only non-default keys are written, so an activity left on "automático"
    // stores `{}` and keeps inheriting the kind default forever — including any
    // future change to that default. Freezing the resolved values into the row
    // would silently opt the activity out of later improvements.
    const policy: Record<string, unknown> = {};
    if (mode !== 'auto') policy.mode = mode;
    if (type !== '') policy.type = type;
    if (filename.trim() !== '') policy.filename = filename.trim();
    if (template.trim() !== '') policy.template = template;
    onSave(policy);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="artifact-policy-editor">
        <DialogHeader>
          <DialogTitle>{t('authoring.artifact.title')}</DialogTitle>
          <DialogDescription>
            {t('authoring.artifact.subtitle', { kind: activity.kind })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <fieldset>
            <legend className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              {t('authoring.artifact.mode')}
            </legend>
            <div className="mt-2 grid gap-2">
              {MODES.map((m) => (
                <label
                  key={m}
                  data-testid={`artifact-mode-${m}`}
                  className={`flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer transition-colors ${
                    mode === m ? 'border-evergreen/60 bg-evergreen-soft' : 'border-border hover:border-border'
                  }`}
                >
                  <input
                    type="radio"
                    name="artifact-mode"
                    className="mt-1"
                    checked={mode === m}
                    onChange={() => setMode(m)}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm text-foreground">
                      {t(`authoring.artifact.mode.${m}`)}
                    </span>
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      {m === 'auto'
                        ? t('authoring.artifact.mode.autoHint', {
                            // Spelling the default out is the whole point — the
                            // complaint was that this rule was obscure.
                            outcome: kindDefault?.persist
                              ? t('authoring.artifact.persists')
                              : t('authoring.artifact.doesNotPersist'),
                            filename: kindDefault?.filename ?? '—',
                          })
                        : t(`authoring.artifact.mode.${m}Hint`)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                {t('authoring.artifact.type')}
              </span>
              <select
                data-testid="artifact-type-select"
                value={type}
                onChange={(e) => setType(e.target.value as ArtifactType | '')}
                className="mt-1.5 w-full h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground"
              >
                <option value="">{t('authoring.artifact.inherit')}</option>
                {TYPES.map((ty) => (
                  <option key={ty} value={ty}>
                    {ty}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                {t('authoring.artifact.filename')}
              </span>
              <input
                data-testid="artifact-filename-input"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                placeholder={kindDefault?.filename ?? 'artifact.txt'}
                className="mt-1.5 w-full h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              {t('authoring.artifact.template')}
            </span>
            <span className="block text-xs text-muted-foreground mt-1">
              {t('authoring.artifact.templateHint')}
            </span>
            <Textarea
              data-testid="artifact-template-input"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              rows={5}
              placeholder={'# {{title}}\n\n{{response}}\n'}
              className="mt-1.5 font-mono text-[13px]"
            />
          </label>

          <div
            className="rounded-xl border border-border bg-background p-3"
            data-testid="artifact-policy-preview"
          >
            <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              {t('authoring.artifact.preview')}
            </span>
            <p className="mt-1 text-sm text-foreground">
              {preview.persist
                ? t('authoring.artifact.previewOn', {
                    filename: preview.filename,
                    type: preview.type,
                  })
                : t('authoring.artifact.previewOff')}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving} data-testid="artifact-policy-save">
            {saving ? t('common.loading') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
