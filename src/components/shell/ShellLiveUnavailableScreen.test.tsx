import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import { ShellLiveUnavailableScreen } from './ShellLiveUnavailableScreen';

function renderScreen() {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/live/abc']}>
        <Routes>
          <Route path="/" element={<div data-testid="home">HOME</div>} />
          <Route path="/live/:sessionId" element={<ShellLiveUnavailableScreen />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe('ShellLiveUnavailableScreen', () => {
  it('says live class is not available, names the host and has one button', () => {
    renderScreen();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('A aula ao vivo acontece no navegador.');
    expect(screen.getByTestId('shell-live-unavailable')).toHaveTextContent(`abra ${window.location.host} no navegador`);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('"Voltar para o início" goes to "/"', () => {
    renderScreen();
    fireEvent.click(screen.getByTestId('shell-live-unavailable-home'));
    expect(screen.getByTestId('home')).toBeInTheDocument();
    expect(screen.queryByTestId('shell-live-unavailable')).not.toBeInTheDocument();
  });
});
