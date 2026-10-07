/**
 * InlineLabel — a short author-written label (an option, a pair, a piece to
 * order) with its inline marks drawn: `code`, **bold** and ==mark==. These
 * labels were printed as plain text, so an author's backticks reached the
 * learner as backticks.
 */
import { RichSpans } from './RichSpans.js';
import { parseInline } from '../internal/richText.js';

export function InlineLabel({ text }: { text: string }) {
  return <RichSpans spans={parseInline(text)} />;
}
