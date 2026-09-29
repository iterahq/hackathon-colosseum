import { useActivityI18n } from '../../context.js';
import { localizedText } from '../../internal/localizedText.js';
import type { SceneFrameSpec, SceneLocalizedText } from '../../specs.js';

/** Resolves every authored string of a scene frame for the active locale. */
export function useSceneText(spec: SceneFrameSpec | undefined) {
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
