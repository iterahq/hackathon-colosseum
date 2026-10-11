import { restoreCosmetics } from './cosmetics-store.ts';
import type { AchievementRow, CatalogEntry } from './credential.ts';
import { CATALOG_COLUMNS, ROW_COLUMNS, type IteraClient } from './db.ts';
import { isUuid } from './http.ts';

export interface Credential {
  row: AchievementRow;
  catalog: CatalogEntry;
  passport: AchievementRow | null;
}

/** A credential row with its catalog entry and, for a medal of a trail, the certification it belongs to. */
export async function loadCredential(db: IteraClient, rowId: string): Promise<Credential | null> {
  const { data: row, error } = await db.from('user_achievements').select(ROW_COLUMNS).eq('id', rowId).maybeSingle();
  if (error) throw new Error(`user_achievements: ${error.message}`);
  if (!row) return null;
  const [credential] = await restoreCosmetics(db, [row as AchievementRow]);

  const { data: catalog, error: catalogError } = await db
    .from('achievements')
    .select(CATALOG_COLUMNS)
    .eq('key', credential.achievement_key)
    .single();
  if (catalogError) throw new Error(`achievements: ${catalogError.message}`);

  let passport: AchievementRow | null = null;
  const unitId = credential.achievement_key === 'trail_complete' ? credential.ref_id : credential.state.unit_id;
  if (credential.achievement_key !== 'trail_pass' && typeof unitId === 'string' && isUuid(unitId)) {
    const { data: parent, error: parentError } = await db
      .from('user_achievements')
      .select(ROW_COLUMNS)
      .eq('user_id', credential.user_id)
      .eq('achievement_key', 'trail_pass')
      .eq('ref_id', unitId)
      .maybeSingle();
    if (parentError) throw new Error(`user_achievements parent: ${parentError.message}`);
    passport = parent ? (await restoreCosmetics(db, [parent as AchievementRow]))[0] : null;
  }
  return { row: credential, catalog: catalog as CatalogEntry, passport };
}

