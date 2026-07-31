import { Bot } from 'lucide-react';
import { RichSpans } from '../RichSpans';
import { parseInline } from '@/utils/richText';

/**
 * A single sandbox chat bubble. User → right/evergreen; assistant → left/surface
 * with an IA avatar. Answers never wear a quality tag — judging weak vs strong is
 * the learner's job (the "evaluate" step), so a badge here would spoil it.
 *
 * When `streaming` the assistant bubble shows either the typing dots (empty text)
 * or the partially-revealed text with a caret, so the reply reads as typed live.
 *
 * ⚠️ Marcação aqui é INLINE-only (`parseInline`, nunca `parseRichText`): a bolha
 * carrega saída de terminal de verdade, e `* [new branch] favoritar` viraria
 * item de lista — perdendo o `*` e a indentação que o `whitespace-pre-wrap`
 * preserva. Nenhuma marcação inline atravessa `\n`, então as quebras seguem
 * intactas.
 */
export function SandboxBubble({
  role,
  text,
  streaming = false,
  dots = false,
}: {
  role: 'user' | 'assistant';
  text: string;
  streaming?: boolean;
  dots?: boolean;
}) {
  const mine = role === 'user';
  return (
    <div
      className={`flex animate-fade-in items-end gap-2 ${mine ? 'flex-row-reverse' : 'flex-row'}`}
      data-testid="sandbox-bubble"
    >
      {!mine && (
        <div className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-obsidiana/80 text-menta">
          <Bot className="h-4 w-4" />
        </div>
      )}
      <div
        className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          mine
            ? 'rounded-br-md bg-evergreen text-obsidiana'
            : 'rounded-bl-md border border-border bg-obsidiana/60 text-foreground'
        }`}
      >
        {dots ? (
          <span className="inline-flex items-center gap-1 py-1" data-testid="sandbox-typing" aria-label="digitando">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-menta [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-menta [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-menta" />
          </span>
        ) : (
          <>
            <RichSpans spans={parseInline(text)} />
            {streaming && <span className="ml-0.5 inline-block w-1.5 animate-pulse-glow text-menta">▍</span>}
          </>
        )}
      </div>
    </div>
  );
}
