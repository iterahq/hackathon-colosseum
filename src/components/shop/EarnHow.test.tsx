import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { FALLBACK_CATALOG } from '@/services/teraCatalog.service';
import { EarnHow } from './EarnHow';

const catalog = vi.hoisted(() => ({ value: null as unknown }));
vi.mock('@/hooks/useTeraCatalog', () => ({ useTeraCatalog: () => catalog.value }));

describe('EarnHow', () => {
  it('prints the rule in the words of the catalog', () => {
    catalog.value = { ...FALLBACK_CATALOG, source: 'live', tiers: FALLBACK_CATALOG.tiers.map((tier) => (tier.rarity === 'primordial' ? { ...tier, how: { pt: 'Só do último dia do programa.', en: 'Only the last day of the program.' } } : tier)) };
    render(<I18nProvider><EarnHow rarity="primordial" /></I18nProvider>);
    expect(screen.getByTestId('earn-how')).toHaveTextContent('Só do último dia do programa.');
  });

  it('says nothing of its own while the catalog has no sentence', () => {
    catalog.value = FALLBACK_CATALOG;
    const { container } = render(<I18nProvider><EarnHow rarity="primordial" /></I18nProvider>);
    expect(container).toBeEmptyDOMElement();
  });
});
