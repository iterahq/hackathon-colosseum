import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PRIMARY_COLOR } from '@/utils/trailDashboard';
import { PassportArt } from './PassportArt';

const page = { title: 'HTML', color: PRIMARY_COLOR, total: 5, done: 4, ribbon: 'Tera' };
const preloader = (container: HTMLElement) => container.querySelector('img[aria-hidden]') as HTMLImageElement;

describe('PassportArt', () => {
  it('shows a quiet placeholder, not our own page, while the first art loads', () => {
    const { container } = render(<PassportArt {...page} src="https://art/pt.svg" />);
    expect(screen.getByTestId('passport-art-loading')).toBeInTheDocument();
    fireEvent.load(preloader(container));
    expect(screen.getByTestId('passport-art')).toHaveAttribute('src', 'https://art/pt.svg');
  });

  it('keeps the art on screen while another language loads, then swaps', () => {
    const { container, rerender } = render(<PassportArt {...page} src="https://art/pt.svg" />);
    fireEvent.load(preloader(container));
    rerender(<PassportArt {...page} src="https://art/en.svg" />);
    expect(screen.getByTestId('passport-art')).toHaveAttribute('src', 'https://art/pt.svg');
    expect(screen.queryByTestId('passport-art-loading')).not.toBeInTheDocument();
    fireEvent.load(preloader(container));
    expect(screen.getByTestId('passport-art')).toHaveAttribute('src', 'https://art/en.svg');
  });

  it('keeps the old art when the new one fails', () => {
    const { container, rerender } = render(<PassportArt {...page} src="https://art/pt.svg" />);
    fireEvent.load(preloader(container));
    rerender(<PassportArt {...page} src="https://art/en.svg" />);
    fireEvent.error(preloader(container));
    expect(screen.getByTestId('passport-art')).toHaveAttribute('src', 'https://art/pt.svg');
  });
});
