import type { CSSProperties } from 'react';
import type { SceneTag } from '../../specs.js';

/**
 * The scene kinds' fixed palette. The PAGE is pastel on purpose — never the
 * Itera palette — so the learner always tells "the site" from "the tool".
 */
export const SCENE_CODE_COLORS = {
  bracket: '#6B6660',
  tag: '#3FD17F',
  attr: '#E07A4A',
  value: '#F2C66D',
  text: '#EDE8E1',
};

export const SCENE_PAGE_BACKGROUND =
  'radial-gradient(120% 90% at 0% 0%, #FFE4EC 0%, #FFF4E6 55%, #FDEBD3 100%)';

export const SCENE_CODE_BACKGROUND = '#0E0D0B';

const HEADING: CSSProperties = {
  display: 'block',
  fontFamily: "'Barlow Condensed', sans-serif",
  fontWeight: 800,
  lineHeight: 1,
  color: '#3B1F2B',
  letterSpacing: '-0.01em',
  minHeight: '1em',
};

const BODY: CSSProperties = { fontFamily: 'Inter, sans-serif', fontSize: 16, color: '#6B4452' };

/** How the page draws each tag. A scene is not an HTML sandbox: the renderer owns the look. */
export const SCENE_TAG_STYLES: Record<SceneTag, CSSProperties> = {
  h1: { ...HEADING, fontSize: 'clamp(28px, 4vw, 44px)' },
  h2: { ...HEADING, fontSize: 'clamp(22px, 3vw, 32px)' },
  h3: { ...HEADING, fontSize: 'clamp(18px, 2.4vw, 24px)' },
  p: BODY,
  li: { ...BODY, display: 'list-item', marginLeft: 20 },
  span: BODY,
  strong: { ...BODY, fontWeight: 700, color: '#3B1F2B' },
  em: { ...BODY, fontStyle: 'italic' },
  a: {
    ...BODY,
    fontSize: 15,
    color: '#C2410C',
    textDecoration: 'underline',
    textUnderlineOffset: 4,
    fontWeight: 600,
  },
  button: {
    display: 'inline-block',
    fontFamily: 'Inter, sans-serif',
    fontWeight: 700,
    fontSize: 15,
    color: '#fff',
    background: '#DB2777',
    padding: '10px 20px',
    borderRadius: 999,
    boxShadow: '0 6px 0 #9D174D',
  },
};

/**
 * The page with no stylesheet at all: what a browser draws from bare HTML.
 * `plug` shows it while the cable is out, so the learner sees the colour, the
 * sizes and the fonts disappear together.
 */
export const SCENE_RAW_PAGE_BACKGROUND = '#FFFFFF';

const RAW_BODY: CSSProperties = {
  display: 'block',
  fontFamily: "'Times New Roman', Times, serif",
  fontSize: 16,
  color: '#000000',
};

const RAW_HEADING: CSSProperties = { ...RAW_BODY, fontWeight: 700, lineHeight: 1.2 };

export const SCENE_RAW_TAG_STYLES: Record<SceneTag, CSSProperties> = {
  h1: { ...RAW_HEADING, fontSize: 32 },
  h2: { ...RAW_HEADING, fontSize: 24 },
  h3: { ...RAW_HEADING, fontSize: 19 },
  p: RAW_BODY,
  li: { ...RAW_BODY, display: 'list-item', marginLeft: 40 },
  span: { ...RAW_BODY, display: 'inline' },
  strong: { ...RAW_BODY, display: 'inline', fontWeight: 700 },
  em: { ...RAW_BODY, display: 'inline', fontStyle: 'italic' },
  a: { ...RAW_BODY, display: 'inline', color: '#0000EE', textDecoration: 'underline' },
  button: {
    display: 'inline-block',
    fontFamily: 'system-ui, sans-serif',
    fontSize: 13,
    color: '#000000',
    background: '#EFEFEF',
    border: '1px solid #767676',
    borderRadius: 2,
    padding: '1px 6px',
  },
};
