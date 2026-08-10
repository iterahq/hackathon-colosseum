/**
 * O que o aluno vê em CADA fase do BYOC — a vitrine como contrato.
 *
 * A story `0 · fluxo completo` mostra a transição passo 1 → passo 2 com a
 * geração mockada. Isso é demonstração, não prova: se a fase parar de renderizar
 * o que a story anuncia, o Storybook segue verde e mentindo. Este teste é a
 * prova, sobre o MESMO componente que a story monta.
 *
 * Duas invariantes que não são óbvias e já custaram caro:
 *   - `generating` mantém o formulário na tela (travado), então o aluno enxerga
 *     o próprio contexto enquanto espera;
 *   - `fallback` NÃO ecoa a seed. A árvore ali é a autorada, e ecoar o contexto
 *     do aluno acima dela afirmaria que ela foi montada em cima dele.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { ByocActivityView } from '@/components/branded/activity/byoc/ByocActivityView';
import type { ByocPhase, ByocState } from '@/components/branded/activity/byoc/useByoc';
import type { ByocGeneration } from '@/types/byoc';
import { BYOC_PICK_BEST, BYOC_PICK_BEST_SPEC, byocGeneration } from '@/stories/byocFixtures';
import { byocHostActivity } from '@/stories/byocFlowMock';

const activity = byocHostActivity(BYOC_PICK_BEST_SPEC);

function state(phase: ByocPhase, generation: ByocGeneration | null = null): ByocState {
  return {
    phase,
    generation,
    seedError: null,
    submitSeed: () => {},
    reset: () => {},
  };
}

function show(phase: ByocPhase, generation?: ByocGeneration | null) {
  render(
    <I18nProvider>
      <ByocActivityView
        activity={activity}
        spec={BYOC_PICK_BEST_SPEC}
        onComplete={() => {}}
        state={state(phase, generation ?? null)}
      />
    </I18nProvider>
  );
}

describe('fases do BYOC', () => {
  it('loading: só a espera, sem formulário', () => {
    show('loading');
    expect(screen.getByTestId('byoc-waiting')).toBeInTheDocument();
    expect(screen.queryByTestId('byoc-seed-form')).not.toBeInTheDocument();
  });

  it('seed: o formulário do passo 1, destravado', () => {
    show('seed');
    expect(screen.getByTestId('byoc-seed-form')).toBeInTheDocument();
    // O botão continua desabilitado aqui — o `ByocSeedForm` o solta só quando há
    // texto. Quem separa `seed` de `generating` é o campo.
    expect(screen.getByTestId('byoc-seed-input')).not.toBeDisabled();
    expect(screen.queryByTestId('byoc-waiting')).not.toBeInTheDocument();
  });

  it('generating: formulário travado E a espera, juntos', () => {
    show('generating');
    expect(screen.getByTestId('byoc-seed-input')).toBeDisabled();
    expect(screen.getByTestId('byoc-seed-submit')).toBeDisabled();
    expect(screen.getByTestId('byoc-waiting')).toBeInTheDocument();
  });

  it('ready: a árvore gerada com a seed do aluno ecoada acima', () => {
    show('ready', byocGeneration('fazer bolo', BYOC_PICK_BEST));
    expect(screen.getByTestId('byoc-seed-echo')).toHaveTextContent('fazer bolo');
    expect(screen.getByTestId('byoc-tree')).toHaveAttribute('data-interaction', 'pick_best');
  });

  it('fallback: a árvore autorada, avisada como reserva e SEM eco da seed', () => {
    show('fallback');
    expect(screen.getByTestId('byoc-fallback-note')).toBeInTheDocument();
    expect(screen.queryByTestId('byoc-try-another-seed')).not.toBeInTheDocument();
    expect(screen.getByTestId('byoc-tree')).toBeInTheDocument();
    expect(screen.queryByTestId('byoc-seed-echo')).not.toBeInTheDocument();
  });

  it('unavailable: nenhuma árvore, só o caminho de tentar de novo', () => {
    show('unavailable');
    expect(screen.getByTestId('byoc-retry')).toBeInTheDocument();
    expect(screen.queryByTestId('byoc-tree')).not.toBeInTheDocument();
  });
});
