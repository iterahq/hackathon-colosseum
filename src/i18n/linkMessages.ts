/** Strings of "Vincular carteira" (linking a Solana wallet to an e-mail account). */
export const LINK_MESSAGES: Record<'pt' | 'en', Record<string, string>> = {
  pt: {
    'wallet.balance.title': 'Saldo da carteira',
    'wallet.balance.label': 'Saldo',
    'wallet.balance.shop': 'Usar na loja',
    'wallet.link.cta': 'Vincular carteira',
    'wallet.link.title': 'Vincular carteira',
    // not-commerce: a cryptographic signature or a devnet bounty payout in the text, not a price or a subscription
    'wallet.link.why': 'Assinar uma mensagem prova que a carteira é sua. Não é uma transação e não custa nada.',
    'wallet.link.start': 'Escolher carteira',
    'wallet.link.connecting': 'Conectando sua carteira…',
    // not-commerce: a cryptographic signature or a devnet bounty payout in the text, not a price or a subscription
    'wallet.link.signing': 'Assine a mensagem na sua carteira',
    // not-commerce: a cryptographic signature or a devnet bounty payout in the text, not a price or a subscription
    'wallet.link.verifying': 'Conferindo a assinatura…',
    'wallet.link.minting': 'Gravando suas certificações na Solana… {n} restantes',
    'wallet.link.mintingStart': 'Gravando suas certificações na Solana…',
    'wallet.link.done.title': 'Carteira vinculada',
    'wallet.link.done.body': 'Agora a loja, as vidas e as certificações usam esta carteira.',
    'wallet.link.explorer': 'ver no explorer',
    'wallet.link.close': 'Fechar',
    'wallet.link.retry': 'Tentar de novo',
    'wallet.link.noWallet.title': 'Nenhuma carteira encontrada',
    'wallet.link.noWallet.body': 'Instale a Phantom (ou outra carteira Solana) neste navegador e tente de novo.',
    'wallet.link.noWallet.install': 'Instalar a Phantom',
    'wallet.link.error.title': 'Não deu para vincular',
    'wallet.link.error.generic': 'Algo deu errado ao vincular. Tente de novo.',
    'wallet.link.error.wallet_in_use': 'Esta carteira já pertence a outra conta. Escolha outra carteira.',
    'wallet.link.error.already_linked': 'Esta conta já tem uma carteira vinculada. Ela não pode ser trocada.',
    'wallet.link.error.already_wallet_account': 'Você entrou com uma carteira, então ela já é a sua conta.',
    'wallet.link.error.challenge_expired': 'A mensagem venceu. Tente de novo.',
    'wallet.link.error.challenge_not_found': 'A mensagem venceu. Tente de novo.',
    'wallet.link.error.signature_invalid': 'A assinatura não confere com esta carteira. Tente de novo.',
    'wallet.link.error.invalid_address': 'Esse endereço de carteira não é válido.',
    // not-commerce: a cryptographic signature or a devnet bounty payout in the text, not a price or a subscription
    'wallet.link.hint': 'Vincule uma carteira Solana à sua conta. Sem cartão de crédito.',
    'wallet.chip.linked': 'carteira vinculada',
  },
  en: {
    'wallet.balance.title': 'Wallet balance',
    'wallet.balance.label': 'Balance',
    'wallet.balance.shop': 'Spend it in the Shop',
    'wallet.link.cta': 'Link wallet',
    'wallet.link.title': 'Link wallet',
    // not-commerce: a cryptographic signature or a devnet bounty payout in the text, not a price or a subscription
    'wallet.link.why': "Sign a message to prove the wallet is yours. It isn't a transaction and it costs nothing.",
    'wallet.link.start': 'Choose wallet',
    'wallet.link.connecting': 'Connecting your wallet…',
    // not-commerce: a cryptographic signature or a devnet bounty payout in the text, not a price or a subscription
    'wallet.link.signing': 'Sign the message in your wallet',
    // not-commerce: a cryptographic signature or a devnet bounty payout in the text, not a price or a subscription
    'wallet.link.verifying': 'Checking the signature…',
    'wallet.link.minting': 'Writing your certifications to Solana… {n} left',
    'wallet.link.mintingStart': 'Writing your certifications to Solana…',
    'wallet.link.done.title': 'Wallet linked',
    'wallet.link.done.body': 'The shop, lives and certifications now use this wallet.',
    'wallet.link.explorer': 'View on explorer',
    'wallet.link.close': 'Close',
    'wallet.link.retry': 'Try again',
    'wallet.link.noWallet.title': 'No wallet found',
    'wallet.link.noWallet.body': 'Install Phantom (or another Solana wallet) in this browser and try again.',
    'wallet.link.noWallet.install': 'Get Phantom',
    'wallet.link.error.title': 'Could not link',
    'wallet.link.error.generic': 'Something went wrong while linking. Try again.',
    'wallet.link.error.wallet_in_use': 'This wallet already belongs to another account. Pick another wallet.',
    'wallet.link.error.already_linked': 'This account already has a linked wallet. It cannot be changed.',
    'wallet.link.error.already_wallet_account': 'You signed in with a wallet, so it already is your account.',
    'wallet.link.error.challenge_expired': 'The message expired. Try again.',
    'wallet.link.error.challenge_not_found': 'The message expired. Try again.',
    'wallet.link.error.signature_invalid': 'The signature does not match this wallet. Try again.',
    'wallet.link.error.invalid_address': 'That wallet address is not valid.',
    // not-commerce: a cryptographic signature or a devnet bounty payout in the text, not a price or a subscription
    'wallet.link.hint': 'Link a Solana wallet to your account. No credit card.',
    'wallet.chip.linked': 'linked wallet',
  },
};

export const LINK_ERROR_CODES: ReadonlySet<string> = new Set(['wallet_in_use', 'already_linked', 'already_wallet_account', 'challenge_expired', 'challenge_not_found', 'signature_invalid', 'invalid_address']);
export const LINK_FINAL_ERRORS: ReadonlySet<string> = new Set(['already_linked', 'already_wallet_account']);
