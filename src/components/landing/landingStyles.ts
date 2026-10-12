/** A wallet whose certification, claims and medals are already on devnet: the landing reads it live. */
export const EXAMPLE_WALLET = 'CHJBdsVLj3ZUJSRWc2EkxXFfG2nU98dUx5Gam94kGfya';

/** The HTML certification of that wallet: its public page at /c/<asset> shows the certificate and reads it from the chain. */
export const EXAMPLE_CERTIFICATION = 'Fkd4BibqhKNjUWLHJg9ZDh1CaGsDCXWfyZ7pkKJkbteC';

export const PRIMARY_CTA =
  'inline-flex min-h-12 items-center justify-center rounded-[12px] border-b-[5px] border-[#249457] bg-[#3FD17F] px-6 [font:700_16px_Inter] text-[#0A0908] hover:bg-[#5BE095] active:translate-y-[2px] active:border-b-[3px]';

export const SECONDARY_CTA =
  'inline-flex min-h-12 items-center justify-center rounded-[12px] border border-[#2E2A25] bg-[#141210] px-6 [font:600_16px_Inter] text-[#F4EDE2] hover:border-[#5E574E]';

export const PILL = 'min-h-11 inline-flex items-center rounded-full border border-[#2E2A25] px-4 hover:border-[#5E574E]';

export const KNOWN_TIERS: ReadonlySet<string> = new Set(['gold', 'silver', 'bronze']);
