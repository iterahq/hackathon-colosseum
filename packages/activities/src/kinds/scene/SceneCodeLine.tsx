import type { CSSProperties, ReactNode } from 'react';
import type { ScenePageElementSpec } from '../../specs.js';
import { SCENE_CODE_COLORS as C } from './sceneTheme.js';

/** One element as its source line: `<tag attr="v">text</tag>`, syntax-coloured. */
export function SceneCodeLine({
  element,
  text,
  children,
  style,
}: {
  element: ScenePageElementSpec;
  text?: string;
  /** Replaces the text slot entirely (the live-type input, the ghost cursor). */
  children?: ReactNode;
  style?: CSSProperties;
}) {
  const attrs = Object.entries(element.attrs ?? {});
  return (
    <span style={{ fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'pre', ...style }}>
      <span style={{ color: C.bracket }}>&lt;</span>
      <span style={{ color: C.tag }}>{element.tag}</span>
      {attrs.map(([name, value]) => (
        <span key={name}>
          {' '}
          <span style={{ color: C.attr }}>{name}</span>
          <span style={{ color: C.bracket }}>=</span>
          <span style={{ color: C.value }}>&quot;{value}&quot;</span>
        </span>
      ))}
      <span style={{ color: C.bracket }}>&gt;</span>
      {children ?? <span style={{ color: C.text }}>{text ?? element.text}</span>}
      <span style={{ color: C.bracket }}>&lt;/</span>
      <span style={{ color: C.tag }}>{element.tag}</span>
      <span style={{ color: C.bracket }}>&gt;</span>
    </span>
  );
}
