/** Wallet sign-ins get a placeholder address the learner never typed; it is not something to show. */
const WALLET_PLACEHOLDER = /@wallets\.hackathon\.invalid$/i;

/** The e-mail to show a learner as theirs, or `null` when the account only has the wallet placeholder. */
export const contactEmail = (email: string | null | undefined): string | null => (email && !WALLET_PLACEHOLDER.test(email) ? email : null);
