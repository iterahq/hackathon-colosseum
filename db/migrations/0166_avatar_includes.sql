-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- Shop v3, step 4: what an avatar INCLUDES. Data on the avatar row
-- (`effect.includes`, a list of `shop_items` keys): buying the avatar, with SOL
-- or crystals, grants them in the same apply step (idempotent). Every epic-or-
-- higher avatar includes its signature border; Caju (summer) also includes the
-- glasses its picture shows.
-- Idempotent.
-- ============================================================================

update itera.shop_items as item
   set effect = item.effect || jsonb_build_object('includes', to_jsonb(inc.keys))
  from (values
    ('base_focado_no_objetivo', array['border_ravi']),
    ('base_mistico',            array['border_vesper']),
    ('special_azul_eletrico',   array['border_volt']),
    ('special_roxo_estelar',    array['border_astro']),
    ('special_dourado',         array['border_sol']),
    ('special_prata',           array['border_luan']),
    ('special_verde_neon',      array['border_vigo']),
    ('base_guerreiro',          array['border_ardo']),
    ('base_sombrio',            array['border_breu']),
    ('base_evoluido',           array['border_kaio']),
    ('special_preto_cosmico',   array['border_nulo']),
    ('event_halloween',         array['border_susto']),
    ('event_natal',             array['border_pinho']),
    ('event_verao',             array['border_caju', 'outfit_glasses']),
    ('base_sabedoria',          array['border_alvo']),
    ('special_arco_iris',       array['border_prisma']),
    ('event_space',             array['border_nebu']),
    ('brand_phoenix_full',      array['border_fenix'])
  ) as inc(key, keys)
 where item.key = inc.key and item.kind = 'avatar';
