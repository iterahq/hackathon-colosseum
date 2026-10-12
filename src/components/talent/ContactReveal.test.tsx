import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { parseReveal } from '@/services/talent.service';
import { ShopCallError } from '@/services/shopTransport';
import { ContactReveal } from './ContactReveal';

const reveal = vi.hoisted(() => vi.fn());
vi.mock('@/services/talent.service', async (actual) => ({ ...(await actual<typeof import('@/services/talent.service')>()), revealContact: (wallet: string) => reveal(wallet) }));
vi.mock('@/hooks/useSoundEffects', () => ({ useSoundEffects: () => ({ play: vi.fn() }) }));

const show = (hasContact = true, onRevealed = vi.fn()) => render(<I18nProvider><ContactReveal wallet="Wallet1" hasContact={hasContact} revealsPerDay={10} onRevealed={onRevealed} /></I18nProvider>);

describe('ContactReveal', () => {
  beforeEach(() => {
    reveal.mockReset();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('asks for nothing until the company presses the button', () => {
    show();
    expect(reveal).not.toHaveBeenCalled();
    expect(screen.getByTestId('contact-reveal')).toHaveAttribute('data-state', 'hidden');
  });

  it('shows the contact as plain text, says the look was recorded, and keeps it out of links, the address and storage', async () => {
    const onRevealed = vi.fn();
    reveal.mockResolvedValue(parseReveal({ wallet: 'Wallet1', contact: { email: 'ana@example.com', telegram: 'ana_dev', linkedin: null, link: null }, reveals_left_today: 9 }));
    const { container } = show(true, onRevealed);
    fireEvent.click(screen.getByTestId('contact-show'));
    await waitFor(() => expect(screen.getByTestId('contact-reveal')).toHaveAttribute('data-state', 'shown'));
    expect(reveal).toHaveBeenCalledWith('Wallet1');
    expect(screen.getAllByTestId('contact-row').map((row) => row.getAttribute('data-field'))).toEqual(['email', 'telegram']);
    expect(screen.getByTestId('contact-reveal')).toHaveTextContent('ana@example.com');
    expect(screen.getByTestId('contact-recorded')).toHaveTextContent('Ficou registrado que você viu. Restam 9 hoje.');
    expect(onRevealed).toHaveBeenCalledWith(9);
    expect(container.querySelectorAll('a')).toHaveLength(0);
    for (const element of container.querySelectorAll('*')) for (const attribute of element.getAttributeNames()) expect(element.getAttribute(attribute)).not.toContain('ana@example.com');
    expect(window.location.href).not.toContain('ana');
    expect(JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage })).not.toContain('ana');
    fireEvent.click(screen.getByTestId('contact-hide'));
    expect(screen.queryByText('ana@example.com')).toBeNull();
  });

  it('says in plain words why a contact is refused: the daily cap, a learner who left, not a company', async () => {
    for (const [code, words] of [['reveal_limit', 'Você já viu o contato de 10 pessoas'], ['not_listed', 'o contato foi apagado'], ['not_a_company', 'Só empresas veem contato']] as const) {
      reveal.mockRejectedValueOnce(new ShopCallError(code, 403, code));
      const view = show();
      fireEvent.click(screen.getByTestId('contact-show'));
      await waitFor(() => expect(screen.getByTestId('contact-error')).toHaveTextContent(words));
      view.unmount();
    }
  });

  it('a listing from before contacts existed offers no button', () => {
    show(false);
    expect(screen.queryByTestId('contact-show')).toBeNull();
    expect(screen.getByTestId('contact-none')).toHaveTextContent('Envie uma missão');
  });
});
