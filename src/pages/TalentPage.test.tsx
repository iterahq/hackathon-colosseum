import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import type { TalentBoard } from '@/types/talent';
import TalentPage from './TalentPage';

const useTalentBoard = vi.fn();
const company = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock('@/hooks/useTalent', () => ({ useTalentBoard: (filters: unknown) => useTalentBoard(filters), useCompanyAccess: () => company }));
vi.mock('@/hooks/useSoundEffects', () => ({ useSoundEffects: () => ({ play: vi.fn() }) }));
vi.mock('@/components/bounty/bountyUi', async (original) => ({ ...(await original<object>()), BountyShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

const board = (over: Partial<TalentBoard> = {}): TalentBoard => ({
  source: 'recorded',
  readAt: '2026-10-11T12:00:00Z',
  totalListed: 1,
  capabilities: [{ key: 'html-tags', title: 'Reads HTML' }],
  learners: [{ wallet: 'W1111111111111111111111111111111', name: 'Ana', avatar: null, headline: null, stampedDays: 2, totalDays: 15, certifications: 1, capabilities: [], bountiesPaid: 0, bountiesPaidLamports: 0, lastStampAt: null, profileUrl: '/u/W1', teamTest: false }],
  ...over,
});
const show = (path = '/talent') => render(<I18nProvider><MemoryRouter initialEntries={[path]}><TalentPage /></MemoryRouter></I18nProvider>);

describe('TalentPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('explains the board, says the numbers are recorded and lists the cards', () => {
    useTalentBoard.mockReturnValue({ isPending: false, isError: false, data: board() });
    show();
    expect(screen.getByTestId('talent-intro')).toHaveTextContent('conferível na chain pelo perfil');
    expect(within(screen.getByTestId('talent-how')).getAllByRole('listitem').slice(0, 4).map((step) => step.textContent)).toEqual(['Escolha alguém', 'Trave recompensa', 'Ela entrega', 'Escrow paga']);
    expect(screen.getByTestId('talent-how')).toHaveTextContent('escolha uma pessoa, trave uma recompensa para ela, ela entrega, você aprova e o programa de escrow paga');
    expect(screen.getByTestId('talent-source')).toHaveTextContent('Abra o perfil para ler a chain agora');
    expect(screen.getAllByTestId('talent-card')).toHaveLength(1);
  });

  it('reads the filters from the address and passes them on', () => {
    useTalentBoard.mockReturnValue({ isPending: false, isError: false, data: board() });
    show('/talent?capability=html-tags&min_days=3');
    expect(useTalentBoard).toHaveBeenCalledWith({ capability: 'html-tags', minDays: 3 });
    fireEvent.click(screen.getByTestId('talent-filter-clear'));
    expect(useTalentBoard).toHaveBeenLastCalledWith({ capability: '', minDays: 0 });
  });

  it('shows the loading state', () => {
    useTalentBoard.mockReturnValue({ isPending: true, isError: false, data: undefined });
    show();
    expect(screen.getByTestId('talent-loading')).toBeInTheDocument();
  });

  it('shows an error with a retry', () => {
    const refetch = vi.fn();
    useTalentBoard.mockReturnValue({ isPending: false, isError: true, data: undefined, refetch });
    show();
    fireEvent.click(screen.getByRole('button', { name: /tentar|try/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('shows the honest empty state with a link to the trails', () => {
    useTalentBoard.mockReturnValue({ isPending: false, isError: false, data: board({ learners: [], totalListed: 0 }) });
    show();
    expect(screen.getByTestId('talent-empty')).toHaveTextContent('Nenhuma pessoa listada ainda. Termine um dia e liste a si mesmo.');
    expect(screen.getByTestId('talent-empty-cta')).toHaveAttribute('href', '/');
  });

  it('shows another message when a filter leaves nobody', () => {
    useTalentBoard.mockReturnValue({ isPending: false, isError: false, data: board({ learners: [], totalListed: 3 }) });
    show('/talent?min_days=9');
    expect(screen.getByTestId('talent-empty')).toHaveTextContent('Ninguém com esse filtro.');
    expect(screen.queryByTestId('talent-empty-cta')).toBeNull();
  });

  it('a visitor or a learner is told contacts are for companies only, and no card offers one', () => {
    company.data = undefined;
    useTalentBoard.mockReturnValue({ isPending: false, isError: false, data: board({ learners: board().learners.map((l) => ({ ...l, hasContact: true })) }) });
    show();
    expect(screen.getByTestId('talent-contact-rule')).toHaveAttribute('data-company', 'false');
    expect(screen.getByTestId('talent-contact-rule')).toHaveTextContent('só empresas veem');
    expect(screen.getByTestId('talent-contact-rule')).not.toHaveAttribute('open');
    expect(screen.getByTestId('talent-contact-rule').querySelector('summary')).toHaveTextContent('Contato: só empresas');
    expect(screen.getByTestId('talent-contact-full')).toHaveTextContent('Empresa é uma conta da equipe de um patrocinador ou uma carteira que já travou a recompensa de uma missão.');
    expect(screen.queryByTestId('contact-show')).toBeNull();
  });

  it('a company sees how many contacts it may still ask for, and "show contact" only on a listing that has one', () => {
    company.data = { isCompany: true, via: 'funded_bounty', revealsLeftToday: 7, revealsPerDay: 10 };
    const [first] = board().learners;
    useTalentBoard.mockReturnValue({ isPending: false, isError: false, data: board({ learners: [{ ...first, hasContact: true }, { ...first, wallet: 'W2222222222222222222222222222222', hasContact: false }] }) });
    show();
    expect(screen.getByTestId('talent-contact-rule')).toHaveTextContent('até 10 pessoas por dia (7 restantes hoje)');
    expect(screen.getByTestId('talent-contact-rule').querySelector('summary')).toHaveTextContent('Contatos: 7/10 hoje');
    expect(screen.getAllByTestId('contact-show')).toHaveLength(1);
    expect(screen.getAllByTestId('contact-none')).toHaveLength(1);
    company.data = undefined;
  });

  it('a trail keeps only the people who proved a skill of it, without asking the server again', () => {
    const [first] = board().learners;
    const data = board({
      capabilities: [{ key: 'html-tags', title: 'Reads HTML' }, { key: 'css-rules', title: 'Writes CSS' }],
      learners: [{ ...first, capabilities: [{ key: 'html-tags', title: 'Reads HTML' }] }, { ...first, wallet: 'W2222222222222222222222222222222', capabilities: [{ key: 'html-tags', title: 'Reads HTML' }, { key: 'css-rules', title: 'Writes CSS' }] }],
    });
    useTalentBoard.mockReturnValue({ isPending: false, isError: false, data });
    show();
    expect(screen.getAllByTestId('talent-card')).toHaveLength(2);
    const trail = (key: string) => screen.getAllByTestId('talent-filter-trail').find((tab) => tab.getAttribute('data-trail') === key)!;
    fireEvent.click(trail('css'));
    expect(screen.getAllByTestId('talent-card')).toHaveLength(1);
    expect(trail('css')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByTestId('talent-filter-skill').map((chip) => chip.getAttribute('data-skill'))).toEqual(['css-rules']);
    expect(useTalentBoard).toHaveBeenLastCalledWith({ capability: '', minDays: 0 });
    expect(screen.getAllByTestId('talent-filter-trail').map((tab) => tab.getAttribute('data-trail'))).toEqual(['', 'html', 'css']);
    fireEvent.click(screen.getByTestId('talent-filter-clear'));
    expect(screen.getAllByTestId('talent-card')).toHaveLength(2);
  });

  it('offers no tab for a trail nobody proved, and a direct link to one still shows the empty state', () => {
    useTalentBoard.mockReturnValue({ isPending: false, isError: false, data: board() });
    show('/talent?trail=js');
    expect(screen.getByTestId('talent-empty')).toHaveTextContent('Ninguém com esse filtro.');
    expect(screen.queryByTestId('talent-empty-cta')).toBeNull();
    expect(screen.getAllByTestId('talent-filter-trail').map((tab) => tab.getAttribute('data-trail'))).toEqual(['', 'html', 'js']);
    fireEvent.click(screen.getByTestId('talent-filter-clear'));
    expect(screen.getAllByTestId('talent-filter-trail').map((tab) => tab.getAttribute('data-trail'))).toEqual(['', 'html']);
  });

  it('a skill badge, in the filter row or on a card, filters by that skill and a second tap lifts it', () => {
    const [first] = board().learners;
    useTalentBoard.mockReturnValue({ isPending: false, isError: false, data: board({ learners: [{ ...first, capabilities: [{ key: 'html-tags', title: 'Reads HTML' }] }] }) });
    show();
    fireEvent.click(screen.getByTestId('talent-filter-skill'));
    expect(useTalentBoard).toHaveBeenLastCalledWith({ capability: 'html-tags', minDays: 0 });
    expect(screen.getByTestId('talent-filter-skill')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('talent-card-skill'));
    expect(useTalentBoard).toHaveBeenLastCalledWith({ capability: '', minDays: 0 });
  });

  it('ignores a trail in the address that is not one', () => {
    useTalentBoard.mockReturnValue({ isPending: false, isError: false, data: board() });
    show('/talent?trail=%3Cscript%3E');
    expect(screen.getAllByTestId('talent-card')).toHaveLength(1);
    expect(screen.queryByTestId('talent-filter-clear')).toBeNull();
  });
});
