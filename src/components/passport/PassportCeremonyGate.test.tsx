import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import { PassportCeremonyGate } from '@/components/passport/PassportCeremonyGate';

describe('PassportCeremonyGate', () => {
  it('falls back to the plain card when the passport machinery cannot run', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(
      <I18nProvider>
        <MemoryRouter>
          <PassportCeremonyGate lessonId="l1" card={<p>plain card</p>} />
        </MemoryRouter>
      </I18nProvider>
    );
    expect(screen.getByText('plain card')).toBeInTheDocument();
  });
});
