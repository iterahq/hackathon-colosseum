import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { LessonTitle, PHONE_STRIP, TITLE_POPOVER_MS } from './LessonTitle';

const TEXT = 'A very long lesson title that does not fit on one line of a phone';

function setWidths(scroll: number, client: number) {
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(scroll);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(client);
}

function renderTitle() {
  return render(
    <I18nProvider>
      <LessonTitle text={TEXT} className="truncate" />
    </I18nProvider>
  );
}

describe('LessonTitle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('offers nothing when the title fits', () => {
    setWidths(200, 200);
    renderTitle();
    expect(screen.queryByTestId('lesson-title-more')).toBeNull();
    expect(screen.getByTestId('lesson-title')).not.toHaveAttribute('title');
  });

  it('shows the full title on tap when cut, and hides it after 3 s', () => {
    setWidths(420, 200);
    renderTitle();
    const button = screen.getByTestId('lesson-title-more');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('lesson-title-full')).toHaveTextContent(TEXT);
    act(() => {
      vi.advanceTimersByTime(TITLE_POPOVER_MS);
    });
    expect(screen.queryByTestId('lesson-title-full')).toBeNull();
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes on a press outside and on Escape', () => {
    setWidths(420, 200);
    renderTitle();
    const button = screen.getByTestId('lesson-title-more');
    fireEvent.click(button);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByTestId('lesson-title-full')).toBeNull();
    fireEvent.click(button);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('lesson-title-full')).toBeNull();
  });

  it('keeps the heading as the only element with the title text for assistive tech', () => {
    setWidths(420, 200);
    renderTitle();
    fireEvent.click(screen.getByTestId('lesson-title-more'));
    expect(screen.getByRole('heading', { level: 1, name: TEXT })).toBeInTheDocument();
  });

  it('is a single 20 px line on a phone and still carries the full text', () => {
    setWidths(200, 200);
    renderTitle();
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveAccessibleName(TEXT);
    expect(heading.className).toContain('truncate');
    for (const cls of PHONE_STRIP.split(' ')) expect(heading.className).toContain(cls);
    expect(PHONE_STRIP).toContain('max-sm:leading-5');
  });
});
