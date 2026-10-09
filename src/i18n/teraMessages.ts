/** Strings of Tera's appearances (not found, errors, empty states) and the locked-trails disclosure. */
export const TERA_MESSAGES: Record<'pt' | 'en', Record<string, string>> = {
  pt: {
    'dash.trails.lockedGroup': 'Bloqueadas ({n})',
    'tera.notFound.title': 'O Tera procurou em todo lugar e não achou essa página.',
    'tera.notFound.body': 'O endereço pode ter mudado ou nunca ter existido.',
    'tera.notFound.cta': 'Voltar para o painel',
    'tera.error.title': 'Algo quebrou aqui. O Tera já foi avisado.',
    'tera.error.retry': 'Tentar de novo',
    'tera.credential.notFound': 'O Tera não achou nada neste endereço.',
    'tera.credential.unverified': 'O Tera não reconhece este asset.',
  },
  en: {
    'dash.trails.lockedGroup': 'Locked ({n})',
    'tera.notFound.title': "Tera looked everywhere and couldn't find this page.",
    'tera.notFound.body': 'The address may have changed or never existed.',
    'tera.notFound.cta': 'Back to the dashboard',
    'tera.error.title': 'Something broke here. Tera has been told.',
    'tera.error.retry': 'Try again',
    'tera.credential.notFound': "Tera found nothing at this address.",
    'tera.credential.unverified': "Tera doesn't recognize this asset.",
  },
};
