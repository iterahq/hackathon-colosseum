/** Strings of the Tera as an NFT: the chest of a stamped day, the origin of a Tera (earned, bought, sponsored), the shelf and the sponsor prize. */
export const TERA_NFT_MESSAGES: Record<'pt' | 'en', Record<string, string>> = {
  pt: {
    'chest.title': 'Baú do dia {n}',
    'chest.tera': 'Tera',
    'chest.sealing': 'Fechando o baú do seu dia…',
    'chest.committed': 'Lacrado na Solana. Só o próximo bloco decide o que tem dentro.',
    'chest.rolling': 'O bloco chegou. Abrindo…',
    'chest.commitLink': 'ver o lacre · slot {slot}',
    'chest.kicker': '{tier} · baú do dia {n}',
    'chest.earned': 'Só seu: não se compra nem se vende.',
    'chest.verify': 'Confira o sorteio você mesmo',
  },
  en: {
    'chest.title': 'Day {n} chest',
    'chest.tera': 'Tera',
    'chest.sealing': "Closing your day's chest…",
    'chest.committed': 'Sealed on Solana. Only the next block decides what is inside.',
    'chest.rolling': 'The block arrived. Opening…',
    'chest.commitLink': 'see the seal · slot {slot}',
    'chest.kicker': '{tier} · day {n} chest',
    'chest.earned': 'Yours only: it cannot be bought or sold.',
    'chest.verify': 'Check the roll yourself',
  },
};
