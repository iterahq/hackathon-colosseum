import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { ShellNoAccessScreen } from './ShellNoAccessScreen';

const signOut = vi.fn(async () => undefined);
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => ({ signOut }) }));

const FORBIDDEN = /assin|plano|preço|R\$|criar conta|cadastr|subscri|trial|sign ?up|pagamento/i;

describe('ShellNoAccessScreen', () => {
  it('shows the neutral sentence as the page heading and one button, "Sair"', () => {
    render(
      <I18nProvider>
        <ShellNoAccessScreen />
      </I18nProvider>,
    );
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Esta conta não tem acesso ativo.');
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument();
  });

  it('has no link at all and no commerce wording', () => {
    const { container } = render(
      <I18nProvider>
        <ShellNoAccessScreen />
      </I18nProvider>,
    );
    expect(container.querySelectorAll('a')).toHaveLength(0);
    expect(container.textContent).not.toMatch(FORBIDDEN);
  });

  it('pads itself by the safe-area insets', () => {
    render(
      <I18nProvider>
        <ShellNoAccessScreen />
      </I18nProvider>,
    );
    const cls = screen.getByTestId('shell-no-access').className;
    for (const side of ['top', 'bottom', 'left', 'right']) expect(cls).toContain(`env(safe-area-inset-${side},0px)`);
  });

  it('"Sair" signs the account out', () => {
    render(
      <I18nProvider>
        <ShellNoAccessScreen />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    expect(signOut).toHaveBeenCalledOnce();
  });
});
