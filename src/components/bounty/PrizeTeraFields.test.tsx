import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import type { PrizeTeraInput, PrizeTeraOptions } from '@/types/bounty';
import { PrizeTeraFields } from './PrizeTeraFields';

const OPTIONS: PrizeTeraOptions = {
  enabled: true,
  bases: [
    { key: 'tera_normal', title: 'Calm Tera', imageUrl: 'https://x/a.webp', thumbUrl: 'https://x/a_128.webp' },
    { key: 'tera_feliz', title: 'Happy Tera', imageUrl: 'https://x/b.webp', thumbUrl: 'https://x/b_128.webp' },
  ],
  mintLamports: 4_000_000,
  feeLamports: 10_000_000,
  totalLamports: 14_000_000,
  brandMin: 2,
  brandMax: 24,
  previewUrl: 'https://x/preview.svg',
};

let last: PrizeTeraInput | null = null;
function Host({ strict = false }: { strict?: boolean }) {
  const [value, setValue] = useState<PrizeTeraInput | null>(null);
  last = value;
  return (
    <I18nProvider>
      <PrizeTeraFields options={OPTIONS} value={value} onChange={setValue} strict={strict} />
    </I18nProvider>
  );
}
const wait = () => act(() => new Promise((resolve) => setTimeout(resolve, 520)));

describe('PrizeTeraFields', () => {
  it('is off until the sponsor ticks it, then starts with the first base and a colour', () => {
    render(<Host />);
    expect(screen.queryByTestId('prize-brand')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('prize-toggle'));
    expect(last).toEqual({ brand: '', accent: '#3fd17f', base: 'tera_normal' });
    expect(screen.getByTestId('prize-preview')).toHaveTextContent('Escreva o nome da marca para ver a arte.');
    fireEvent.click(screen.getByTestId('prize-toggle'));
    expect(last).toBeNull();
  });

  it('asks the server for the art once the name is valid, and follows the colour and the base', async () => {
    render(<Host />);
    fireEvent.click(screen.getByTestId('prize-toggle'));
    fireEvent.change(screen.getByTestId('prize-brand'), { target: { value: 'Acme Labs' } });
    fireEvent.click(screen.getAllByTestId('prize-swatch')[1]);
    fireEvent.click(screen.getAllByTestId('prize-base')[1]);
    await wait();
    expect(screen.getByTestId('prize-preview-art')).toHaveAttribute('src', 'https://x/preview.svg?brand=Acme+Labs&accent=%23f2c66d&base=tera_feliz');
    expect(last).toEqual({ brand: 'Acme Labs', accent: '#f2c66d', base: 'tera_feliz' });
  });

  it('says why a name is refused and asks for no art', async () => {
    render(<Host />);
    fireEvent.click(screen.getByTestId('prize-toggle'));
    fireEvent.change(screen.getByTestId('prize-brand'), { target: { value: '<b>Acme</b>' } });
    await wait();
    expect(screen.getByRole('alert')).toHaveTextContent('Sem emoji, aspas, código ou letras de outro alfabeto.');
    expect(screen.queryByTestId('prize-preview-art')).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('prize-brand'), { target: { value: 'DevFellowship' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTestId('prize-brand-team')).toHaveTextContent('Só passa se a sua conta for da equipe daquele time');
    expect(screen.getByTestId('prize-brand')).not.toHaveAttribute('aria-invalid', 'true');
    await wait();
    expect(screen.getByTestId('prize-preview')).toHaveTextContent('A prévia pública não desenha nome de time.');
  });

  it('an empty name is only called short after a submit attempt', () => {
    const first = render(<Host />);
    fireEvent.click(screen.getByTestId('prize-toggle'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    first.unmount();
    render(<Host strict />);
    fireEvent.click(screen.getByTestId('prize-toggle'));
    expect(screen.getByRole('alert')).toHaveTextContent('Use pelo menos 2 caracteres.');
  });
});
