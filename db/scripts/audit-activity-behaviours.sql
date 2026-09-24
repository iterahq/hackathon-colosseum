-- ============================================================================
-- audit-activity-behaviours.sql — READ-ONLY census of activity BEHAVIOURS.
--
-- Plan: 20260924-activity-type-one-behavior-rule (v3), task T6, Verification V4.
-- Rule: one activity type = one behaviour (input · grading · completion · step
-- pattern). Five kinds and one layer (`spec.byoc`) hold more than one behaviour
-- today. This query counts, per table and per kind, each behaviour SHAPE that
-- the spec or the rubric selects. The remap (T17–T19) moves rows to new,
-- explicit kinds; after it, this query must show 0 rows on the old kinds.
--
-- It only SELECTs. It creates, writes and locks nothing. Run it with the
-- read-only helper (the session is READ ONLY there, so a write would fail):
--
--   bash /root/.claude/skills/itera-supabase-helpers/run.sh query \
--     "$(cat db/scripts/audit-activity-behaviours.sql)"
--
-- Output: one row per (section, tbl, kind, shape) with the row count `n`.
--   section = total     every row of the table
--             kind      rows per stored kind (every kind in the table)
--             shape     rows per behaviour shape of a violating kind
--             new_kind  rows per new kind of plan v3 (0 until the remap)
--   tbl     = activities | activity_defs
--
-- Shapes (the switch that the renderer reads today):
--   code              editor · checks | editor · no checks
--                     | blanks {<set of blank kinds>} [MIXED when >1 kind]
--   chat_sandbox      slots {<set of slot kinds>} · choices yes|no
--                     · evaluate step yes|no
--   terminal_sandbox  inputMode=<freeText|options>
--                     · granularity {<set of expose.optionGranularity>}
--                     [MIXED when >1 value]
--   document          rubric=<ai-judge|word-count|none> · min_words>0 yes|no
--                     · prompt yes|no
--   byoc (any host)   byoc on <host kind> · interaction=<harness.interaction>
--
-- `kind::text` is compared with text on purpose: the new labels are not in
-- itera.activity_kind until T15 merges, and a cast to the enum would fail.
-- ============================================================================
with rows_ as (
  select 'activities'::text as tbl, kind::text as kind, spec, rubric
    from itera.activities
  union all
  select 'activity_defs', kind::text, spec, rubric
    from itera.activity_defs
),
new_kinds(kind, ord) as (
  select k, o
    from unnest(array[
      'code_editor_checks', 'code_editor_ungraded', 'code_fill_bank',
      'code_fill_select', 'code_fill_type',
      'chat_compose', 'chat_fill_select', 'chat_fill_type',
      'chat_pick_context', 'chat_rate_reply',
      'terminal_type_command', 'terminal_pick_command', 'terminal_build_command',
      'document_read', 'document_reflect', 'document_ai_judge',
      'byoc_pick_best', 'byoc_judge_each', 'byoc_build_context',
      'question_pick_one', 'question_pick_many', 'question_write'
    ]) with ordinality as t(k, o)
),
tables_(tbl) as (values ('activities'), ('activity_defs')),
shapes as (
  -- code: open editor (checks or none) vs guided template (blanks by input)
  select tbl, kind,
         case
           when jsonb_typeof(spec->'blanks') = 'array'
                and jsonb_array_length(spec->'blanks') > 0 then
             'blanks {' || b.set || '}' || case when b.n > 1 then ' MIXED' else '' end
           when jsonb_typeof(spec->'checks') = 'array'
                and jsonb_array_length(spec->'checks') > 0 then 'editor · checks'
           else 'editor · no checks'
         end as shape
    from rows_
    left join lateral (
      select string_agg(distinct coalesce(bl->>'kind', '∅'), ',') as set,
             count(distinct coalesce(bl->>'kind', '∅')) as n
        from jsonb_array_elements(
               case when jsonb_typeof(spec->'blanks') = 'array'
                    then spec->'blanks' else '[]'::jsonb end) bl
    ) b on true
   where kind = 'code'
  union all
  -- chat_sandbox: slots (by slot kind) vs choices vs open chat; per-step mode
  select tbl, kind,
         'slots {' || coalesce(sl.set, '') || '}'
         || ' · choices ' || case when jsonb_typeof(spec->'choices') = 'array'
                                   and jsonb_array_length(spec->'choices') > 0
                                  then 'yes' else 'no' end
         || ' · evaluate step ' || case when st.has_eval then 'yes' else 'no' end
    from rows_
    left join lateral (
      select string_agg(distinct coalesce(s->>'kind', '∅'), ',') as set
        from jsonb_array_elements(
               case when jsonb_typeof(spec->'slots') = 'array'
                    then spec->'slots' else '[]'::jsonb end) s
    ) sl on true
    left join lateral (
      select coalesce(bool_or(s->>'mode' = 'evaluate'), false) as has_eval
        from jsonb_array_elements(
               case when jsonb_typeof(spec->'steps') = 'array'
                    then spec->'steps' else '[]'::jsonb end) s
    ) st on true
   where kind = 'chat_sandbox'
  union all
  -- terminal_sandbox: type vs pick; in options mode, command vs token per step
  select tbl, kind,
         'inputMode=' || coalesce(spec->>'inputMode', '∅')
         || ' · granularity {' || coalesce(g.set, '') || '}'
         || case when g.n > 1 then ' MIXED' else '' end
    from rows_
    left join lateral (
      select string_agg(distinct s->'expose'->>'optionGranularity', ',') as set,
             count(distinct s->'expose'->>'optionGranularity') as n
        from jsonb_array_elements(
               case when jsonb_typeof(spec->'steps') = 'array'
                    then spec->'steps' else '[]'::jsonb end) s
    ) g on true
   where kind = 'terminal_sandbox'
  union all
  -- document: the RUBRIC picks read / reflection / AI judge
  select tbl, kind,
         'rubric=' || case
                        when rubric->>'mode' is not null then rubric->>'mode'
                        when rubric ? 'min_words' then 'word-count'
                        else 'none'
                      end
         || ' · min_words>0 ' || case when coalesce(
                                        case when jsonb_typeof(rubric->'min_words') = 'number'
                                             then (rubric->>'min_words')::numeric end, 0) > 0
                                      then 'yes' else 'no' end
         || ' · prompt ' || case when coalesce(spec->>'prompt', '') <> ''
                                 then 'yes' else 'no' end
    from rows_
   where kind = 'document'
  union all
  -- the BYOC layer: rides on ANY host kind and replaces its render
  select tbl, kind,
         'byoc on ' || kind || ' · interaction='
         || coalesce(spec->'byoc'->'harness'->>'interaction', '∅')
    from rows_
   where jsonb_typeof(spec) = 'object' and spec ? 'byoc'
)
select 'total' as section, tbl, '*' as kind, '*' as shape, count(*) as n
  from rows_ group by tbl
union all
select 'kind', tbl, kind, '*', count(*)
  from rows_ group by tbl, kind
union all
select 'shape', tbl, kind, shape, count(*)
  from shapes group by tbl, kind, shape
union all
select 'new_kind', t.tbl, nk.kind, '*', count(r.kind)
  from new_kinds nk
 cross join tables_ t
  left join rows_ r on r.tbl = t.tbl and r.kind = nk.kind
 group by t.tbl, nk.kind, nk.ord
order by 1, 2, 3, 4;
