import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { Medal } from '@/components/passport/Medal';
import { OnChainMark } from '@/components/passport/OnChainMark';
import { PassportPage } from '@/components/passport/PassportPage';
import { TRAIL_COLORS } from '@/utils/trailDashboard';

const wrap = (node: React.ReactNode) => render(<I18nProvider>{node}</I18nProvider>);

describe('PassportPage', () => {
  it('draws one stamp per finished day and a text alternative', () => {
    wrap(<PassportPage title="HTML" color={TRAIL_COLORS[1]} total={5} done={3} />);
    expect(screen.getAllByTestId('passport-stamp')).toHaveLength(3);
    expect(screen.getByRole('img', { name: /HTML/ })).toBeInTheDocument();
    expect(screen.getByTestId('passport-counter')).toHaveTextContent('3/5');
  });

  it('renders the dropping stamp once, over its slot', () => {
    wrap(<PassportPage title="HTML" color={TRAIL_COLORS[1]} total={5} done={2} dropDay={2} dropAfterMs={600} />);
    expect(screen.getAllByTestId('passport-stamp')).toHaveLength(2);
  });

  it('shows the ribbon on a gold page and no stamps on a locked one', () => {
    wrap(<PassportPage title="HTML" color={TRAIL_COLORS[1]} total={2} done={2} variant="gold" ribbon="COMPLETA" />);
    expect(screen.getByText('COMPLETA')).toBeInTheDocument();
  });
});

describe('OnChainMark and Medal', () => {
  it('links to the transaction on devnet', () => {
    wrap(<OnChainMark txSignature="sig1" assetAddress="A1" />);
    expect(screen.getByTestId('onchain-mark')).toHaveAttribute('href', 'https://explorer.solana.com/tx/sig1?cluster=devnet');
  });

  it('shows the requirement while locked and the mark when minted', () => {
    const { rerender } = wrap(<Medal glyph="D3" title="Streak 3" caption="3 days in a row" earned={false} accent="#3FD17F" accentDark="#1F8A4F" />);
    expect(screen.getByText('3 days in a row')).toBeInTheDocument();
    rerender(
      <I18nProvider>
        <Medal glyph="D3" title="Streak 3" caption="x" earned minted assetAddress="A1" accent="#3FD17F" accentDark="#1F8A4F" />
      </I18nProvider>
    );
    expect(screen.getByTestId('onchain-mark')).toBeInTheDocument();
  });
});
