/**
 * RichCodeBlock — a fenced block as a small code window: a title strip with
 * the language, and line numbers when there is more than one line, because
 * the prose around it says "line 3" and the learner should find it.
 *
 * Numbers are drawn with `::before`, so they are not in the text the learner
 * selects and copies.
 */
export function RichCodeBlock({ language, value }: { language: string; value: string }) {
  const lines = value.split('\n');
  const numbered = lines.length > 1;

  return (
    <div
      className="overflow-hidden rounded-2xl border border-border bg-obsidiana/80"
      data-rich-block="code"
      data-language={language || undefined}
    >
      <div className="flex items-center gap-1.5 border-b border-border/70 px-4 py-2" aria-hidden="true">
        <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
        {language && (
          <span className="ml-auto font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {language}
          </span>
        )}
      </div>
      <pre className="overflow-x-auto px-4 py-3">
        <code className="block font-mono text-sm leading-6 text-menta">
          {numbered
            ? lines.map((line, i) => (
                <span
                  key={i}
                  data-line={i + 1}
                  className="block min-h-6 before:mr-4 before:inline-block before:w-5 before:select-none before:text-right before:tabular-nums before:text-foreground/30 before:content-[attr(data-line)]"
                >
                  {line}
                </span>
              ))
            : value}
        </code>
      </pre>
    </div>
  );
}
