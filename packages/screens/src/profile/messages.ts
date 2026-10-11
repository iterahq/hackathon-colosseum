/**
 * The strings of the profile screen, the only copy. The web merges them into its dictionary
 * (`src/i18n/index.ts`); the shell reads `pt`. `common.loading` is a shared key: the dictionary gets it from
 * here too, so there is still one value of it. The retry label comes from the catalog screen's strings.
 * The subscription section is not here on purpose: it is commerce, the web host owns it, and the shell
 * never draws it.
 */
export const PROFILE_MESSAGES = {
  pt: {
    'common.loading': 'Carregando…',
    'profile.title': 'Meu perfil',
    'profile.subtitle': 'Escolha como você aparece para os outros alunos.',
    'profile.nameLabel': 'Nome de exibição',
    'profile.namePlaceholder': 'Seu nome',
    'profile.avatarLabel': 'Escolha seu ícone',
    'profile.photoLabel': 'Ou use uma foto sua',
    'profile.uploadCta': 'Enviar foto',
    'profile.uploading': 'Enviando…',
    'profile.uploadHint': 'PNG, JPG, WEBP ou GIF — até 2 MB.',
    'profile.uploadError': 'Não foi possível enviar a foto. Tente outra imagem.',
    'profile.useLearnPhoto': 'Usar foto do Learn',
    'profile.revert': 'Desfazer alteração da foto',
    'profile.save': 'Salvar alterações',
    'profile.saved': 'Perfil atualizado!',
    'profile.saveError': 'Não foi possível salvar. Tente novamente.',
    'profile.loadError': 'Não foi possível carregar seu perfil.',
    'profile.legal.title': 'Ajuda e informações legais',
    'profile.legal.privacy': 'Política de privacidade',
    'profile.legal.terms': 'Termos de uso',
    'profile.legal.support': 'Suporte',
    'personalization.saving': 'Salvando…',
    'personalization.section': 'Quem entra nos exercícios',
    'personalization.sectionHint':
      'Esses nomes aparecem nos enunciados das atividades. Só você vê — instrutor e administrador não têm acesso.',
    'personalization.saved': 'Pronto! Os exercícios já usam esses nomes.',
  },
  en: {
    'common.loading': 'Loading…',
    'profile.title': 'My profile',
    'profile.subtitle': 'Choose how you show up to other learners.',
    'profile.nameLabel': 'Display name',
    'profile.namePlaceholder': 'Your name',
    'profile.avatarLabel': 'Pick your icon',
    'profile.photoLabel': 'Or use a photo of yours',
    'profile.uploadCta': 'Upload photo',
    'profile.uploading': 'Uploading…',
    'profile.uploadHint': 'PNG, JPG, WEBP or GIF — up to 2 MB.',
    'profile.uploadError': 'Could not upload the photo. Try another image.',
    'profile.useLearnPhoto': 'Use Learn photo',
    'profile.revert': 'Undo photo change',
    'profile.save': 'Save changes',
    'profile.saved': 'Profile updated!',
    'profile.saveError': 'Could not save. Please try again.',
    'profile.loadError': 'Could not load your profile.',
    'profile.legal.title': 'Help and legal',
    'profile.legal.privacy': 'Privacy policy',
    'profile.legal.terms': 'Terms of use',
    'profile.legal.support': 'Support',
    'personalization.saving': 'Saving…',
    'personalization.section': 'Who shows up in the exercises',
    'personalization.sectionHint':
      'These names appear in the activity prompts. Only you can see them — instructors and admins cannot.',
    'personalization.saved': 'Done! The exercises now use these names.',
  },
} as const;
