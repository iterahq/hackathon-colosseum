import { borderOf, isThemeDefault, type BorderSpec } from './crystals.ts';
import { GLOBAL_REF } from './awards.ts';
import type { IteraClient } from './db.ts';

/**
 * The border a learner wears, for the `border` of an avatar block: what they chose
 * while it is still theirs, otherwise `null` (the art's own ring). Never throws:
 * a picture without its border is better than no picture.
 */
export async function loadWornBorder(db: IteraClient, userId: string): Promise<BorderSpec | null> {
  try {
    const { data: choice, error } = await db.from('learner_themes').select('border_key').eq('user_id', userId).maybeSingle();
    if (error) throw new Error(error.message);
    const key = choice?.border_key as string | null | undefined;
    if (!key) return null;
    const { data: item, error: itemError } = await db.from('shop_items').select('key,kind,effect').eq('key', key).eq('kind', 'border').maybeSingle();
    if (itemError) throw new Error(itemError.message);
    if (!item || isThemeDefault(item as { effect: Record<string, unknown> })) return null;
    const { data: owned, error: ownedError } = await db
      .from('user_inventory')
      .select('qty')
      .eq('user_id', userId)
      .eq('item_key', key)
      .eq('ref_id', GLOBAL_REF)
      .gt('qty', 0)
      .maybeSingle();
    if (ownedError) throw new Error(ownedError.message);
    return owned ? borderOf(item as { kind: string; effect: Record<string, unknown> }) : null;
  } catch (error) {
    console.error('worn border failed', error instanceof Error ? error.message : error);
    return null;
  }
}
