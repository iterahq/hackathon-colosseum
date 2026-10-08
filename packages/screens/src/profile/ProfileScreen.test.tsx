// @vitest-environment-options { "url": "https://app.iterahq.test/" }
import { describe, expect, it, vi } from 'vitest';
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

describe('ProfileScreen: the page', () => {
  it('has one h1 and the subtitle inside the main landmark, under the header slot', () => {
    const { container } = setup({ kind: 'loading' }, { header: <View testID="app-header" /> });
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent('Meu perfil');
    expect(screen.getByRole('main')).toContainElement(h1);
    expect(screen.getByText('Escolha como você aparece nas aulas e no ranking.').tagName).toBe('P');
    expect(container.firstElementChild?.firstElementChild).toBe(screen.getByTestId('app-header'));
  });

  it('draws no host tag of its own making: every state renders without a slot', () => {
    for (const state of [{ kind: 'loading' }, { kind: 'error' }, ready()] as ProfileFormState[]) {
      const { unmount } = setup(state);
      expect(screen.getByTestId('profile-page')).toBeInTheDocument();
      unmount();
    }
  });
});

describe('ProfileScreen: the states', () => {
  it('loading: the line and no form', () => {
    setup({ kind: 'loading' });
    expect(screen.getByTestId('profile-loading')).toHaveTextContent('Carregando…');
    expect(screen.queryByTestId('profile-form')).not.toBeInTheDocument();
  });

  it('error: the message and a retry, no form', () => {
    const { onRetry } = setup({ kind: 'error' });
    const error = screen.getByTestId('profile-error');
    expect(error).toHaveTextContent('Não foi possível carregar seu perfil.');
    fireEvent.click(within(error).getByRole('button', { name: 'Tentar de novo' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('profile-form')).not.toBeInTheDocument();
  });
});

describe('ProfileScreen: the identity card', () => {
  it('shows the name, the email and the picture; with no picture, the initials', () => {
    const view = setup(ready());
    expect(screen.getByTestId('profile-email')).toHaveTextContent('ana@example.com');
    expect(screen.getByTestId('profile-name-input')).toHaveValue('Ana');
    expect(screen.getByTestId('profile-avatar-preview')).toBeInTheDocument();
    view.unmount();
    setup(ready({ avatarUrl: '', name: '', initials: 'AN' }));
    expect(screen.getByTestId('profile-avatar-initials')).toHaveTextContent('AN');
    expect(screen.queryByTestId('profile-avatar-preview')).not.toBeInTheDocument();
    expect(screen.getAllByText('Seu nome').length).toBeGreaterThan(0);
  });

  it('asks the host for the pictures when it draws them itself', () => {
    const image = vi.fn(({ kind, uri }: { kind: string; uri: string }) => <View testID={`host-${kind}`} aria-label={uri} />);
    setup(ready(), { image });
    expect(screen.getByTestId('host-preview')).toHaveAttribute('aria-label', FORM.avatarUrl);
    expect(screen.getAllByTestId('host-preset')).toHaveLength(2);
    expect(image).toHaveBeenCalledWith({ kind: 'preview', uri: FORM.avatarUrl, label: 'Ana' });
  });

  it('edits the name, saves on the button and on Enter', () => {
    const { onEditName, onSave } = setup(ready());
    const name = screen.getByTestId('profile-name-input');
    expect(name).toHaveAttribute('maxlength', '40');
    expect(name).toHaveAccessibleName('Nome de exibição');
    fireEvent.change(name, { target: { value: 'Ana Clara' } });
    expect(onEditName).toHaveBeenCalledWith('Ana Clara');
    fireEvent.keyDown(name, { key: 'Enter' });
    fireEvent.click(screen.getByTestId('profile-save'));
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it('a form that cannot be saved has a disabled, dimmed button; while saving it says so', () => {
    const { onSave } = setup(ready({ canSave: false, saving: true }));
    const save = screen.getByTestId('profile-save');
    expect(save).toBeDisabled();
    expect(save).toHaveClass('opacity-40');
    expect(save).toHaveTextContent('Carregando…');
    fireEvent.click(save);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('marks the chosen icon and picks another', () => {
    const { onPickPreset } = setup(ready({ avatarUrl: '/avatars/b.svg' }));
    const options = screen.getAllByTestId('profile-avatar-option');
    expect(options.map((o) => o.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
    expect(options[1]).toHaveClass('border-clay');
    fireEvent.click(options[0]);
    expect(onPickPreset).toHaveBeenCalledWith('/avatars/a.svg');
  });

  it('leaves the icon picker out where the host has no icons', () => {
    setup(ready({ presets: [] }));
    expect(screen.queryByTestId('profile-avatar-grid')).not.toBeInTheDocument();
    expect(screen.queryByText('Escolha seu ícone')).not.toBeInTheDocument();
  });

  it('offers the upload and the Learn photo only where the host can do them', () => {
    const view = setup(ready());
    expect(screen.queryByTestId('profile-photo-upload')).not.toBeInTheDocument();
    expect(screen.queryByTestId('profile-use-learn-photo')).not.toBeInTheDocument();
    expect(screen.queryByText('Ou use uma foto sua')).not.toBeInTheDocument();
    expect(screen.queryByText(/2 MB/)).not.toBeInTheDocument();
    view.unmount();

    const onUploadPhoto = vi.fn();
    const onUseLearnPhoto = vi.fn();
    setup(ready(), { onUploadPhoto, onUseLearnPhoto });
    fireEvent.click(screen.getByTestId('profile-photo-upload'));
    fireEvent.click(screen.getByTestId('profile-use-learn-photo'));
    expect(onUploadPhoto).toHaveBeenCalledTimes(1);
    expect(onUseLearnPhoto).toHaveBeenCalledTimes(1);
    expect(screen.getByText('PNG, JPG, WEBP ou GIF — até 2 MB.')).toBeInTheDocument();
  });

  it('while a photo uploads the button is disabled and says so; a failed upload shows its line', () => {
    setup(ready({ uploading: true, uploadFailed: true }), { onUploadPhoto: vi.fn() });
    const upload = screen.getByTestId('profile-photo-upload');
    expect(upload).toBeDisabled();
    expect(upload).toHaveTextContent('Enviando…');
    expect(screen.getByTestId('profile-photo-error')).toHaveTextContent('Não foi possível enviar a foto. Tente outra imagem.');
  });

  it('shows the revert, the saved mark and the save error only when the state says so', () => {
    const view = setup(ready());
    for (const id of ['profile-revert', 'profile-saved', 'profile-save-error']) expect(screen.queryByTestId(id)).not.toBeInTheDocument();
    view.unmount();
    const { onRevert } = setup(ready({ canRevert: true, saved: true, saveFailed: true }));
    fireEvent.click(screen.getByTestId('profile-revert'));
    expect(onRevert).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('profile-saved')).toHaveTextContent('Perfil atualizado!');
    expect(screen.getByTestId('profile-save-error')).toHaveTextContent('Não foi possível salvar. Tente novamente.');
  });
});

describe('ProfileScreen: the cast of the exercises', () => {
  it('is left out where the host does not hold it', () => {
    setup(ready());
    expect(screen.queryByTestId('personalization-section')).not.toBeInTheDocument();
  });

  it('draws one field per entry and reports edits and the save', () => {
    const onChangePersonalization = vi.fn();
    const onSavePersonalization = vi.fn();
    setup(ready(), { personalization: CAST, onChangePersonalization, onSavePersonalization });
    const section = screen.getByTestId('personalization-section');
    expect(within(section).getByRole('heading', { level: 2 })).toHaveTextContent('Quem entra nos exercícios');
    const age = screen.getByTestId('personalization-input-eu.idade');
    expect(age).toHaveAttribute('inputmode', 'numeric');
    expect(age).toHaveAttribute('placeholder', '15');
    expect(screen.getByTestId('personalization-input-eu.nome')).toHaveValue('Bia');
    fireEvent.change(age, { target: { value: '17' } });
    expect(onChangePersonalization).toHaveBeenCalledWith('eu.idade', '17');
    fireEvent.click(screen.getByTestId('personalization-save'));
    expect(onSavePersonalization).toHaveBeenCalledTimes(1);
  });

  it('while saving the button is disabled and says so; then the saved line', () => {
    const view = setup(ready(), { personalization: { ...CAST, canSave: false, saving: true } });
    expect(screen.getByTestId('personalization-save')).toBeDisabled();
    expect(screen.getByTestId('personalization-save')).toHaveTextContent('Salvando…');
    view.unmount();
    setup(ready(), { personalization: { ...CAST, saved: true } });
    expect(screen.getByTestId('personalization-saved')).toHaveTextContent('Pronto! Os exercícios já usam esses nomes.');
  });
});

describe('ProfileScreen: legal and help', () => {
  it('is not drawn while the pages do not exist, in any state', () => {
    for (const state of [{ kind: 'loading' }, { kind: 'error' }, ready()] as ProfileFormState[]) {
      const { unmount, container } = setup(state);
      expect(screen.queryByTestId('profile-legal-help')).not.toBeInTheDocument();
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(container.textContent).not.toMatch(/Política de privacidade|Termos de uso|Suporte/);
      unmount();
    }
  });
});

describe('ProfileScreen: Enter in a field', () => {
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

  it('in the name: saves and the focus stays in the field', async () => {
    const { onSave } = setup(ready());
    const name = screen.getByTestId('profile-name-input');
    name.focus();
    fireEvent.keyDown(name, { key: 'Enter' });
    await settle();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(name).toHaveFocus();
  });

  it('in a field of the cast: nothing is saved and the focus stays in the field', async () => {
    const onSavePersonalization = vi.fn();
    setup(ready(), { personalization: CAST, onSavePersonalization });
    const field = screen.getByTestId('personalization-input-eu.nome');
    field.focus();
    fireEvent.keyDown(field, { key: 'Enter' });
    await settle();
    expect(onSavePersonalization).not.toHaveBeenCalled();
    expect(field).toHaveFocus();
  });
});

describe('ProfileScreen: keyboard focus', () => {
  it('every button and link carries the visible focus ring; the fields keep their own border', () => {
    setup(ready({ canRevert: true }), { personalization: CAST, onUploadPhoto: vi.fn(), onUseLearnPhoto: vi.fn() });
    const controls = screen.getAllByRole('button');
    expect(controls.length).toBeGreaterThanOrEqual(7);
    for (const control of controls) expect(control).toHaveClass('focus-visible:outline-evergreen-hi');
    expect(screen.getByTestId('profile-name-input')).toHaveClass('outline-none', 'focus:border-clay/60');
  });

  it('the retry of the error state carries it too', () => {
    setup({ kind: 'error' });
    expect(within(screen.getByTestId('profile-error')).getByRole('button')).toHaveClass('focus-visible:outline-evergreen-hi');
  });
});

describe('ProfileScreen: what it must not carry', () => {
  it('has no commerce wording, no "coming soon" and no account deletion, with every part drawn', () => {
    const { container } = setup(ready({ canRevert: true, saved: true, saveFailed: true, uploadFailed: true }), {
      personalization: CAST,
      onUploadPhoto: vi.fn(),
      onUseLearnPhoto: vi.fn(),
    });
    expect(container.textContent).not.toMatch(/assin|subscri|plano|preço|price|cobran|billing|em breve|coming soon|excluir|delete/i);
    expect(JSON.stringify(PROFILE_MESSAGES)).not.toMatch(/assin|subscri|plano|preço|price|cobran|billing|em breve|coming soon|excluir|delete/i);
  });

  it('draws the web-only slot between the identity card and the cast, and nothing in its place without it', () => {
    setup(ready(), { personalization: CAST, webOnly: <View testID="web-only" /> });
    const order = [...screen.getByTestId('profile-page').children].map((el) => el.getAttribute('data-testid'));
    expect(order.slice(-3)).toEqual(['profile-form', 'web-only', 'personalization-section']);
  });
});
