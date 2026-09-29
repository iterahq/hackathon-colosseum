import { useActivityI18n } from '../../context.js';
import { localizedText } from '../../internal/localizedText.js';
import type { ScenePageSpec, SceneLocalizedText } from '../../specs.js';

/**
 * The subset of a scene-mechanics spec every kind shares — the frame text plus
 * an OPTIONAL `page` (batch B's `wire`/`bucket`/`intercept`/`query` have no
 * page of their own; `spot`'s `page` is itself optional). `SceneFrameSpec`
 * requires `page`, which is why this is its own narrower type rather than a
 * reuse: a kind with no stage should not have to fake one to borrow the text
 * helper.
 */
export interface SceneTextSpec {
  guide?: { name: SceneLocalizedText };
  prompt?: SceneLocalizedText;
  reaction?: SceneLocalizedText;
  stamp?: SceneLocalizedText;
  page?: ScenePageSpec;
}

/** Resolves every authored string of a scene frame for the active locale. */
export function useSceneText(spec: SceneTextSpec | undefined) {
  const { locale } = useActivityI18n();
  const text = (value: SceneLocalizedText | undefined) => localizedText(value ?? '', locale);
  return {
    text,
    guideName: spec?.guide ? text(spec.guide.name) : undefined,
    prompt: text(spec?.prompt),
    reaction: text(spec?.reaction),
    stamp: text(spec?.stamp),
    url: spec?.page?.url_label || 'site',
  };
}
