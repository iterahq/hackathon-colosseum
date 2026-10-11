import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import { toGateCheck } from '@/services/gateCheck.service';
import { DirectGateRefusal } from './DirectGateRefusal';

const ask = vi.hoisted(() => vi.fn());
vi.mock('@/services/gateCheck.service', async (original) => ({ ...(await original<typeof import('@/services/gateCheck.service')>()), askGate: ask }));

const INVITEE = 'BRNkmbKCGxqL4p9W67sgiHRev6VAdzScSqBQYmS36Upx';
const reply = (over: Record<string, unknown> = {}) =>
  toGateCheck({
    mode: 'simulated',
    bounty: { slug: 'b', title: 'Bakery table', trail: 'Week 1', min_days: 1 },
    claimant: { address: 'C9xbdUKR3dqJtJ7fnzJEKyVqqQv6VTs6T4quJGNZnv5w', kind: 'made_for_this_check' },
    certification: { address: 'Cert', kind: 'another_wallets' },
    direct: { invitee: INVITEE, team_test: true },
    verdict: { refused: true, error_code: 6020, error_hex: '0x1784', error_name: 'not_invited' },
    logs: ['Program X failed: custom program error: 0x1784'],
    ...over,
  });
const show = () => render(<I18nProvider><MemoryRouter><DirectGateRefusal /></MemoryRouter></I18nProvider>);

describe('DirectGateRefusal', () => {
  beforeEach(() => ask.mockReset());

  it('shows the program refusing, the invitee, the team label and the raw log', async () => {
    ask.mockResolvedValue(reply());
    show();
    fireEvent.click(screen.getByRole('button'));
    const result = await screen.findByTestId('gate-direct-result');
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ direct: true }));
    expect(result).toHaveAttribute('data-error', 'not_invited');
    expect(result).toHaveTextContent('not_invited');
    expect(result).toHaveTextContent('0x1784');
    expect(result).toHaveTextContent('custom program error: 0x1784');
    expect(screen.getByTestId('gate-direct-team')).toBeInTheDocument();
  });

  it('does not claim a refusal when the program accepted', async () => {
    ask.mockResolvedValue(reply({ verdict: { refused: false } }));
    show();
    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByTestId('gate-direct-result')).toHaveAttribute('data-refused', 'false');
  });
});
