-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- Shop item for the legendary outfit drawn in `_shared/outfit-art.ts`:
-- `outfit_laurel`, bought and equipped like the other outfits. Same pinned
-- rate (1 US cent = 55 000 lamports). The "earned at level 5" unlock is not
-- part of this file.
-- Idempotent.
-- ============================================================================

insert into itera.shop_items (key, kind, price_lamports, price_usd_cents, price_label, title_i18n, description_i18n, effect, art, active, sort) values
  ('outfit_laurel', 'outfit', 2750000, 50, 'US$ 0.50 ≈ 0.00275 SOL',
   '{"pt": "Louro dourado", "en": "Golden laurel"}',
   '{"pt": "Um louro lendário em volta do Tera. Conquistado no nível 5 ou comprado.", "en": "A legendary laurel around Tera. Earned at level 5 or bought."}',
   '{}', '{"outfit": "outfit_laurel"}', true, 65)
on conflict (key) do update set
  kind = excluded.kind,
  price_lamports = excluded.price_lamports,
  price_usd_cents = excluded.price_usd_cents,
  price_label = excluded.price_label,
  title_i18n = excluded.title_i18n,
  description_i18n = excluded.description_i18n,
  effect = excluded.effect,
  art = excluded.art,
  sort = excluded.sort;
