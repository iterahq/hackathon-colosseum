/**
 * A single sandbox chat bubble. User → right/evergreen; assistant → left/surface.
 * Answers never wear a quality tag — judging weak vs strong is the learner's job
 * (the "evaluate" step), so a badge here would spoil the exercise.
 */
export function SandboxBubble({ role, text }: { role: 'user' | 'assistant'; text: string }) {
  const mine = role === 'user';
  return (
    <div className={`flex flex-col gap-1 ${mine ? 'items-end' : 'items-start'}`} data-testid="sandbox-bubble">
      <div
        className={`max-w-[82%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          mine
            ? 'rounded-br-md bg-evergreen text-obsidiana'
            : 'rounded-bl-md border border-border bg-obsidiana/60 text-foreground'
        }`}
      >
        {text}
      </div>
    </div>
  );
}
