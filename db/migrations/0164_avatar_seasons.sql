-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- Shop v3, step 2: seasonal avatars. The window is DATA on the avatar row
-- (`effect.season`: month-day bounds, every year, UTC; a window may wrap the new
-- year). The rule that reads it is `_shared/seasons.ts`. Out of its window an
-- avatar is listed but not buyable (`409 out_of_season`).
-- Idempotent.
-- ============================================================================

update itera.shop_items
   set effect = effect || '{"season": {"key": "halloween", "from": "10-01", "to": "10-31", "label": {"pt": "Halloween", "en": "Halloween"}}}'
 where key = 'event_halloween' and kind = 'avatar';
update itera.shop_items
   set effect = effect || '{"season": {"key": "natal", "from": "12-01", "to": "12-31", "label": {"pt": "Natal", "en": "Christmas"}}}'
 where key = 'event_natal' and kind = 'avatar';
update itera.shop_items
   set effect = effect || '{"season": {"key": "verao", "from": "12-21", "to": "03-20", "label": {"pt": "Verão", "en": "Summer"}}}'
 where key = 'event_verao' and kind = 'avatar';
