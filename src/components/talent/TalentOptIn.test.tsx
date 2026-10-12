import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import type { TalentStatus } from '@/types/talent';
import { TalentOptIn } from './TalentOptIn';

const status = vi.fn();
const list = { mutate: vi.fn(), isPending: false, reset: vi.fn() };
const unlist = { mutate: vi.fn(), isPending: false };
const setProfile = { mutate: vi.fn(), isPending: false };
vi.mock('@/hooks/useTalent', () => ({ useTalentStatus: () => status(), useTalentListing: () => ({ list, unlist }) }));
vi.mock('@/hooks/usePrivacy', () => ({ useSetProfilePublic: () => setProfile }));

const state = (over: Partial<TalentStatus> = {}): TalentStatus => ({ wallet: 'W', listed: false, headline: null, mayList: true, reason: null, stampedDays: 2, totalDays: 15, publicProfile: true, contactKinds: [], companiesLooked: 0, lastLookedAt: null, ...over });
const show = (over: Partial<TalentStatus> = {}, locale: 'pt' | 'en' = 'pt') => {
  localStorage.setItem('itera.locale', locale);
  status.mockReturnValue({ isPending: false, fetchStatus: 'idle', data: state(over) });
  return render(<I18nProvider><MemoryRouter><TalentOptIn /></MemoryRouter></I18nProvider>);
};
const type = (field: string, value: string) => fireEvent.change(screen.getByTestId(`talent-contact-${field}`), { target: { value } });

describe('TalentOptIn', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders nothing when signed out', () => {
    status.mockReturnValue({ isPending: true, fetchStatus: 'idle', data: undefined });
    const { container } = render(<I18nProvider><MemoryRouter><TalentOptIn /></MemoryRouter></I18nProvider>);
    expect(container).toBeEmptyDOMElement();
  });

  it('says at the moment of choice what becomes visible, to whom, and how to leave', () => {
    show();
    const body = screen.getByTestId('talent-optin-body');
    expect(body).toHaveTextContent('qualquer pessoa vê o seu cartão');
    expect(body).toHaveTextContent('Só empresas veem o seu contato.');
    expect(body).toHaveTextContent('o cartão some e o contato é apagado');
  });

  it('the notice beside the contact fields says the three things, in Portuguese and in English', () => {
    const pt = show();
    expect(screen.getByTestId('talent-contact-notice')).toHaveTextContent('Só empresas veem o seu contato. Ele é usado só enquanto você está na vitrine. Saiu da vitrine, ele é apagado.');
    pt.unmount();
    show({}, 'en');
    expect(screen.getByTestId('talent-contact-notice')).toHaveTextContent('Only companies see your contact. It is used only while you are listed. Leave the board and it is deleted.');
    localStorage.setItem('itera.locale', 'pt');
  });

  it('does not list without a contact, and says why', () => {
    show();
    fireEvent.click(screen.getByTestId('talent-optin-save'));
    expect(screen.getByTestId('talent-contact-required')).toHaveTextContent('Preencha pelo menos um contato');
    expect(list.mutate).not.toHaveBeenCalled();
  });

  it('does not send a contact the server would refuse, and names the field', () => {
    show();
    type('email', 'not an address');
    fireEvent.click(screen.getByTestId('talent-optin-save'));
    expect(screen.getByTestId('talent-contact-email-error')).toHaveTextContent('Isso não parece um e-mail.');
    expect(list.mutate).not.toHaveBeenCalled();
  });

  it('lists with the headline and only the contacts that were filled', () => {
    show();
    fireEvent.change(screen.getByTestId('talent-optin-headline'), { target: { value: 'Oi' } });
    expect(screen.getByTestId('talent-optin-counter')).toHaveTextContent('2/120');
    type('email', ' ana@example.com ');
    type('telegram', '@ana_dev');
    fireEvent.click(screen.getByTestId('talent-optin-save'));
    expect(list.mutate).toHaveBeenCalledWith({ headline: 'Oi', contact: { email: 'ana@example.com', telegram: 'ana_dev' } }, expect.any(Object));
    expect(setProfile.mutate).not.toHaveBeenCalled();
    expect(screen.queryByTestId('talent-optin-remove')).toBeNull();
  });

  it('a private profile: says before the click that joining makes the profile public, then switches it on and lists', () => {
    show({ publicProfile: false });
    expect(screen.getByTestId('talent-optin-needs-public')).toHaveTextContent('qualquer pessoa com o link passa a ver');
    expect(screen.getByTestId('talent-optin-save')).toHaveTextContent('Tornar meu perfil público e entrar na vitrine');
    type('link', 'https://ana.dev');
    fireEvent.click(screen.getByTestId('talent-optin-save'));
    expect(setProfile.mutate).toHaveBeenCalledWith({ isPublic: true }, expect.any(Object));
    expect(list.mutate).not.toHaveBeenCalled();
    setProfile.mutate.mock.calls[0][1].onSuccess();
    expect(list.mutate).toHaveBeenCalledWith({ headline: '', contact: { link: 'https://ana.dev' } }, expect.any(Object));
  });

  it('listed: never draws the saved contact, only which kinds exist, and how many companies looked', () => {
    show({ listed: true, headline: 'Hi there', contactKinds: ['email', 'telegram'], companiesLooked: 2 });
    expect(screen.getByTestId('talent-optin-state')).toHaveTextContent('Você está listado.');
    expect(screen.getByTestId('talent-contact-saved')).toHaveTextContent('Contato salvo: e-mail, Telegram. Ele não aparece aqui de novo.');
    expect(screen.queryByTestId('talent-contact-email')).toBeNull();
    expect(screen.getByTestId('talent-optin-looked')).toHaveTextContent('2 empresas viram o seu contato.');
    expect(screen.getByTestId('talent-optin-headline')).toHaveValue('Hi there');
    fireEvent.click(screen.getByTestId('talent-optin-save'));
    expect(list.mutate).toHaveBeenCalledWith({ headline: 'Hi there', contact: undefined }, expect.any(Object));
  });

  it('listed: changing the contact opens empty fields, and leaving the board is one button', () => {
    show({ listed: true, contactKinds: ['email'], companiesLooked: 1 });
    expect(screen.getByTestId('talent-optin-looked')).toHaveTextContent('1 empresa viu o seu contato.');
    fireEvent.click(screen.getByTestId('talent-contact-change'));
    expect(screen.getByTestId('talent-contact-email')).toHaveValue('');
    expect(screen.getByTestId('talent-optin-remove')).toHaveTextContent('Sair da vitrine');
    fireEvent.click(screen.getByTestId('talent-optin-remove'));
    expect(unlist.mutate).toHaveBeenCalled();
  });

  it('says why a learner cannot list and hides the form', () => {
    show({ mayList: false, reason: 'nothing_proven' });
    expect(screen.getByTestId('talent-optin-reason')).toHaveTextContent('Termine um dia');
    expect(screen.queryByTestId('talent-optin-save')).toBeNull();
    expect(screen.queryByTestId('talent-optin-headline')).toBeNull();
    expect(screen.queryByTestId('talent-contact')).toBeNull();
  });

  it('says a wallet is needed', () => {
    show({ mayList: false, reason: 'no_wallet', wallet: null });
    expect(screen.getByTestId('talent-optin-reason')).toHaveTextContent('Ligue uma carteira');
  });

  it('a backend from before contacts: the card is the one it was', () => {
    show({ publicProfile: null, contactKinds: undefined });
    expect(screen.queryByTestId('talent-contact')).toBeNull();
    fireEvent.click(screen.getByTestId('talent-optin-save'));
    expect(list.mutate).toHaveBeenCalledWith({ headline: '', contact: undefined }, expect.any(Object));
  });
});
