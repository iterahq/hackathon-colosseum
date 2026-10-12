import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import { ShopCallError } from '@/services/shopTransport';
import type { Privacy } from '@/types/privacy';
import { ProfileVisibilityCard } from './ProfileVisibilityCard';

const hooks = vi.hoisted(() => ({ privacy: { data: null as unknown }, set: { mutate: vi.fn(), isPending: false } }));
vi.mock('@/hooks/usePrivacy', () => ({ usePrivacy: () => hooks.privacy, useSetProfilePublic: () => hooks.set }));

const state = (over: Partial<Privacy> = {}): Privacy => ({ wallet: 'W', publicProfile: false, source: 'new_account', talentListed: false, contactKinds: [], companiesLooked: 0, lastLookedAt: null, company: { isCompany: false, via: null, revealsLeftToday: 0, revealsPerDay: 10 }, ...over });
const show = (over: Partial<Privacy> | null = {}, locale: 'pt' | 'en' = 'pt') => {
  localStorage.setItem('itera.locale', locale);
  hooks.privacy.data = over === null ? null : state(over);
  return render(<I18nProvider><MemoryRouter><ProfileVisibilityCard /></MemoryRouter></I18nProvider>);
};

describe('ProfileVisibilityCard', () => {
  beforeEach(() => hooks.set.mutate.mockReset());

  it('draws nothing while the choices are not known', () => {
    expect(show(null).container).toBeEmptyDOMElement();
  });

  it('private: says what becomes visible, to whom and how to undo it, and shows the one line a stranger sees', () => {
    show();
    const card = screen.getByTestId('privacy-card');
    expect(card).toHaveAttribute('data-public', 'false');
    expect(screen.getByTestId('privacy-card-state')).toHaveTextContent('Seu perfil está privado.');
    expect(card).toHaveTextContent('Sua carteira é anônima até você dizer o contrário.');
    expect(card).toHaveTextContent('qualquer pessoa que tenha o link vê esta página: seu avatar, seus dias carimbados, o que você provou e seus Teras');
    expect(card).toHaveTextContent('Ela não mostra nome, e-mail nem contato.');
    expect(card).toHaveTextContent('Para desfazer, desligue aqui.');
    expect(screen.getByTestId('privacy-card-source')).toHaveTextContent('contas novas começam privadas');
    expect(screen.getByTestId('profile-private-preview')).toHaveTextContent('Este aluno mantém o perfil privado.');
    expect(screen.getByRole('switch', { name: /Mostrar minha página de perfil para outras pessoas/ })).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(screen.getByTestId('privacy-switch'));
    expect(hooks.set.mutate).toHaveBeenCalledWith({ isPublic: true, leaveBoard: false }, expect.any(Object));
  });

  it('public, in English: one read says who sees what, and switching off is one click', () => {
    show({ publicProfile: true, source: 'existing_account' }, 'en');
    expect(screen.getByTestId('privacy-card-state')).toHaveTextContent('Your profile is public.');
    expect(screen.getByTestId('privacy-card')).toHaveTextContent('anyone who has the link sees this page');
    expect(screen.getByTestId('privacy-card-source')).toHaveTextContent('accounts created before this option stay visible until you switch it off');
    expect(screen.getByTestId('privacy-preview-public')).toHaveTextContent('This page, without this box');
    fireEvent.click(screen.getByTestId('privacy-switch'));
    expect(hooks.set.mutate).toHaveBeenCalledWith({ isPublic: false, leaveBoard: false }, expect.any(Object));
    localStorage.setItem('itera.locale', 'pt');
  });

  it('listed on the talent board: switching off asks first, because it deletes the contact', () => {
    show({ publicProfile: true, source: 'chosen', talentListed: true, contactKinds: ['email'] });
    fireEvent.click(screen.getByTestId('privacy-switch'));
    expect(hooks.set.mutate).not.toHaveBeenCalled();
    expect(screen.getByTestId('privacy-listed-confirm')).toHaveTextContent('tira você da vitrine e apaga o seu contato');
    fireEvent.click(screen.getByTestId('privacy-listed-no'));
    expect(screen.queryByTestId('privacy-listed-confirm')).toBeNull();
    fireEvent.click(screen.getByTestId('privacy-switch'));
    fireEvent.click(screen.getByTestId('privacy-listed-yes'));
    expect(hooks.set.mutate).toHaveBeenCalledWith({ isPublic: false, leaveBoard: true }, expect.any(Object));
  });

  it('the server saying "listed" asks the same question, and any other refusal says it could not save', () => {
    show({ publicProfile: true, source: 'chosen' });
    fireEvent.click(screen.getByTestId('privacy-switch'));
    act(() => hooks.set.mutate.mock.calls[0][1].onError(new ShopCallError('listed_on_talent_board', 409, 'listed_on_talent_board')));
    expect(screen.getByTestId('privacy-listed-confirm')).toBeInTheDocument();
    act(() => hooks.set.mutate.mock.calls[0][1].onError(new ShopCallError('boom', 500, null)));
    expect(screen.getByTestId('privacy-card-error')).toHaveTextContent('Não consegui salvar agora.');
  });
});
