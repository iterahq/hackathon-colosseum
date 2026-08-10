import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CodeHelpLink } from '@iterahq/activities/code';

/**
 * O guard de esquema do link de ajuda, provado pela borda que o aluno realmente
 * vê. O `safeExternalUrl` é interno ao pacote de propósito — o que o host precisa
 * garantir é que um `help.url` executável não chega ao `href`, e isso se lê aqui.
 */
afterEach(cleanup);

const linkFor = (url: string | undefined) => {
  render(<CodeHelpLink help={{ label: 'Ver referência', url: url as string }} />);
  return screen.queryByTestId('code-help-link');
};

describe('CodeHelpLink', () => {
  it('deixa passar o link de referência que o autor quis', () => {
    expect(linkFor('https://react.dev/reference/react/useState')).toHaveAttribute(
      'href',
      'https://react.dev/reference/react/useState',
    );
    cleanup();
    expect(linkFor('http://localhost:3000/doc')).toHaveAttribute(
      'href',
      'http://localhost:3000/doc',
    );
  });

  it('recusa esquema executável — o Zod do spec valida FORMA de URL, não esquema', () => {
    expect(linkFor('javascript:alert(1)')).toBeNull();
    expect(linkFor('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(linkFor('vbscript:msgbox(1)')).toBeNull();
  });

  it('recusa o que nem é URL, e o ausente', () => {
    expect(linkFor('react.dev')).toBeNull();
    expect(linkFor('')).toBeNull();
    expect(linkFor(undefined)).toBeNull();
    render(<CodeHelpLink help={undefined} />);
    expect(screen.queryByTestId('code-help-link')).toBeNull();
  });

  it('abre fora sem entregar a aba de volta — noopener é o mínimo', () => {
    const link = linkFor('https://react.dev');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
