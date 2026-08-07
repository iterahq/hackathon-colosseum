import { Lightbulb } from 'lucide-react';
import { t, type I18n, type Locale } from '@iterahq/activity-spec/runtime';
import { RichSpans } from '../RichSpans';
import { parseInline } from '@/utils/richText';

/**
 * Post-success reveal — the recap + optional master lines (the ONE place a
 * technical name may appear).
 *
 * Takes the recap BAG rather than the whole scenario so the chat sandbox and
 * the terminal sandbox — whose specs no longer share an `initialState` shape —
 * can render the identical celebration card. Nothing else about it changed.
 */
export function SandboxReveal({ recap, locale, lines }: { recap: I18n; locale: Locale; lines: string[] }) {
  return (
    <div className="mt-4 rounded-2xl border border-evergreen/30 bg-evergreen-soft p-5" data-testid="sandbox-reveal">
      <div className="flex items-start gap-2">
        <Lightbulb className="mt-0.5 h-5 w-5 flex-shrink-0 text-evergreen-hi" />
        <p className="font-display text-lg leading-snug text-foreground">
          <RichSpans spans={parseInline(t(recap, locale))} />
        </p>
      </div>
      {lines.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {lines.map((line, i) => (
            <div key={i} className="rounded-xl border border-menta/30 bg-menta/10 px-3.5 py-2 text-sm font-medium text-menta">
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
