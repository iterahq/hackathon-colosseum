import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { ShellAccessUnverifiedScreen } from './ShellAccessUnverifiedScreen';

const signOut = vi.fn(async () => undefined);
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => ({ signOut }) }));

const FORBIDDEN = /assin|plano|preço|R\$|criar conta|cadastr|subscri|trial|sign ?up|pagamento/i;

function renderScreen(onRetry = vi.fn()) {
  const view = render(
    <I18nProvider>
      <ShellAccessUnverifiedScreen onRetry={onRetry} />
    </I18nProvider>,
  );
  return { ...view, onRetry };
}

describe('ShellAccessUnverifiedScreen', () => {
  it('says the access could not be checked, never that there is none', () => {
    const { container } = renderScreen();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Não foi possível verificar seu acesso.');
    expect(container.textContent).not.toContain('não tem acesso ativo');
    expect(container.textContent).not.toMatch(FORBIDDEN);
    expect(container.querySelectorAll('a')).toHaveLength(0);
  });

  it('offers exactly "Tentar de novo" and "Sair"', () => {
    const { onRetry } = renderScreen();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Tentar de novo', 'Sair']);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(onRetry).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    expect(signOut).toHaveBeenCalledOnce();
  });
});
