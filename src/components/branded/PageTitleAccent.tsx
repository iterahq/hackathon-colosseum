import { lastWord } from '@/utils/lastWord';

/**
 * A page title with its LAST word in evergreen-hi — the guide's "text on
 * dark" stop. Never the whole sentence in green, on purpose.
 */
export function PageTitleAccent({ title }: { title: string }) {
  const { rest, last } = lastWord(title);
  return (
    <>
      {rest}
      <span className="text-evergreen-hi">{last}</span>
    </>
  );
}
