// @vitest-environment-options { "url": "https://app.iterahq.test/" }
// The profile screen with the legal and help pages switched ON (`LEGAL_HELP_PAGES_LIVE`): what turning the constant on draws.
import { describe, expect, it, vi } from 'vitest';

vi.mock('@iterahq/shell-core', async (original) => ({ ...(await original<typeof import('@iterahq/shell-core')>()), LEGAL_HELP_PAGES_LIVE: true }));

import { fireEvent, render, screen, within } from '@testing-library/react';
import { View } from 'react-native';
import { legalHelpLinks, translatorOf, type PersonalizationView, type ProfileFormState, type ProfileFormView } from '@iterahq/shell-core';
import { ProfileScreen, type ProfileScreenProps } from './ProfileScreen';
import { CATALOG_MESSAGES } from '../catalog/messages';
import { PROFILE_MESSAGES } from './messages';

const t = translatorOf({ ...CATALOG_MESSAGES.pt, ...PROFILE_MESSAGES.pt });

const FORM: ProfileFormView = {
  name: 'Ana',
  email: 'ana@example.com',
  avatarUrl: 'https://photos.example/ana.png',
  initials: 'AN',
  presets: ['/avatars/a.svg', '/avatars/b.svg'],
  canSave: true,
  canRevert: false,
  saving: false,
  saved: false,
  saveFailed: false,
  uploading: false,
  uploadFailed: false,
};

const ready = (over: Partial<ProfileFormView> = {}): ProfileFormState => ({ kind: 'ready', form: { ...FORM, ...over } });

const CAST: PersonalizationView = {
  fields: [
    { id: 'eu.nome', label: 'Seu nome', placeholder: 'Alex', value: 'Bia', numeric: false },
    { id: 'eu.idade', label: 'Sua idade', placeholder: '15', value: '', numeric: true },
  ],
  canSave: true,
  saving: false,
  saved: false,
};

function setup(state: ProfileFormState, over: Partial<ProfileScreenProps> = {}) {
  const props = {
    t,
    state,
    onRetry: vi.fn(),
    onEditName: vi.fn(),
    onPickPreset: vi.fn(),
    onRevert: vi.fn(),
    onSave: vi.fn(),
    legalHelp: legalHelpLinks(),
    ...over,
  };
  return { ...props, ...render(<ProfileScreen {...props} />) };
}

describe('ProfileScreen with the legal and help pages live', () => {
  it('is there in every state, three rows in order, each an anchor to its page in a new tab', () => {
    for (const state of [{ kind: 'loading' }, { kind: 'error' }, ready()] as ProfileFormState[]) {
      const { unmount } = setup(state);
      const card = screen.getByTestId('profile-legal-help');
      expect(within(card).getByRole('heading', { level: 2 })).toHaveTextContent('Ajuda e informações legais');
      const rows = within(card).getAllByRole('link');
      expect(rows.map((a) => `${a.textContent} ${a.getAttribute('href')} ${a.getAttribute('target')}`)).toEqual([
        'Política de privacidade https://iterahq.dev/privacidade _blank',
        'Termos de uso https://iterahq.dev/termos _blank',
        'Suporte https://iterahq.dev/suporte _blank',
      ]);
      unmount();
    }
  });
});


describe('ProfileScreen with the legal and help pages live: order and focus', () => {
  it('the card is the last one, after the cast, and its rows carry the focus ring', () => {
    setup(ready(), { personalization: CAST, webOnly: <View testID="web-only" /> });
    const order = [...screen.getByTestId('profile-page').children].map((el) => el.getAttribute('data-testid'));
    expect(order.slice(-4)).toEqual(['profile-form', 'web-only', 'personalization-section', 'profile-legal-help']);
    for (const row of screen.getAllByRole('link')) expect(row).toHaveClass('focus-visible:outline-evergreen-hi');
  });
});
