/**
 * RichCodeBlock — a fenced block as a small code window: a title strip with
 * the language, and line numbers when there is more than one line, because
 * the prose around it says "line 3" and the learner should find it.
 *
 * Numbers are drawn with `::before`, so they are not in the text the learner
 * selects and copies.
 *
 * On a phone the gutter is narrower and the type one step smaller: lesson
 * code is written to 34 columns, and the full gutter pushed the end of those
 * lines out of a 390 px screen.
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
      {language && (
        <div className="flex items-center gap-1.5 border-b border-border/70 px-4 py-2" aria-hidden="true" data-testid="code-block-bar">
          <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
          <span className="ml-auto font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {language}
          </span>
        </div>
      )}
      <pre className={`overflow-x-auto px-3 sm:px-4 ${language ? 'py-3' : 'py-2.5'}`}>
        <code className="block font-mono text-[13px] leading-6 text-menta max-[380px]:text-[12px] sm:text-[14px]">
          {numbered
            ? lines.map((line, i) => (
                <span
                  key={i}
                  data-line={i + 1}
                  className="block min-h-6 before:mr-2 before:inline-block before:w-4 before:select-none before:text-right before:tabular-nums before:text-foreground/30 before:content-[attr(data-line)] sm:before:mr-4 sm:before:w-5"
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
