import { createClient } from 'npm:@supabase/supabase-js@2.117.3';

export type IteraClient = ReturnType<typeof serviceClient>;

export const ROW_COLUMNS =
  'id,user_id,achievement_key,ref_id,state,earned_at,mint_status,wallet_address,asset_address,tx_signature,minted_at';
export const CATALOG_COLUMNS = 'key,kind,tier,title_i18n,description_i18n,art';

/** Service-role client: bypasses RLS, so every caller filters by the ids it is entitled to. */
export function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Supabase service credentials are not configured');
  return createClient(url, key, {
    db: { schema: 'itera' },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function loadConfig(db: IteraClient): Promise<Record<string, string>> {
  const { data, error } = await db.from('onchain_config').select('key,value');
  if (error) throw new Error(`onchain_config: ${error.message}`);
  return Object.fromEntries((data ?? []).map((row) => [row.key, row.value]));
}
