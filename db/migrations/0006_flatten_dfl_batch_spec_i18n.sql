-- ============================================================================
-- Flatten _i18n-suffixed activity spec keys to the flat shape the player renders.
--
-- Context: the legacy dfl-batch / dfl-pilot seed (migration 0007 in the API repo)
-- wrote `_i18n`-suffixed keys INTO activity spec objects (e.g. spec.prompt_i18n,
-- spec.title_i18n). The player's ActivityRenderer reads FLAT spec keys only
-- (spec.prompt, spec.body, spec.question, ...) — it has NO _i18n reader for
-- specs (only program/unit/lesson TITLES use *_i18n bags). So those activities
-- rendered their fallback label instead of the authored prompt.
--
-- All ACTIVE content (tenant `itera`: ia-na-pratica, fundamentos-web) was
-- authored with flat specs and is unaffected. As of authoring this, the ONLY
-- activity carrying a `_i18n` spec key is a single dfl-batch document activity.
-- Itera is pt-default (itera.users.locale defaults to 'pt'), so we flatten to
-- the `pt` value, falling back to `en` if `pt` is absent.
--
-- Idempotent: re-running only touches rows that still carry a `*_i18n` spec key
-- without the corresponding flat key, and the SET drops the `_i18n` keys after.
-- ============================================================================

update itera.activities a
set spec =
  (a.spec - 'prompt_i18n' - 'title_i18n' - 'body_i18n' - 'question_i18n' - 'explanation_i18n')
  || coalesce(
       case when a.spec ? 'prompt_i18n' and not (a.spec ? 'prompt')
            then jsonb_build_object('prompt',
                   coalesce(a.spec #>> '{prompt_i18n,pt}', a.spec #>> '{prompt_i18n,en}'))
            else '{}'::jsonb end, '{}'::jsonb)
  || coalesce(
       case when a.spec ? 'title_i18n' and not (a.spec ? 'title')
            then jsonb_build_object('title',
                   coalesce(a.spec #>> '{title_i18n,pt}', a.spec #>> '{title_i18n,en}'))
            else '{}'::jsonb end, '{}'::jsonb)
  || coalesce(
       case when a.spec ? 'body_i18n' and not (a.spec ? 'body')
            then jsonb_build_object('body',
                   coalesce(a.spec #>> '{body_i18n,pt}', a.spec #>> '{body_i18n,en}'))
            else '{}'::jsonb end, '{}'::jsonb)
  || coalesce(
       case when a.spec ? 'question_i18n' and not (a.spec ? 'question')
            then jsonb_build_object('question',
                   coalesce(a.spec #>> '{question_i18n,pt}', a.spec #>> '{question_i18n,en}'))
            else '{}'::jsonb end, '{}'::jsonb)
  || coalesce(
       case when a.spec ? 'explanation_i18n' and not (a.spec ? 'explanation')
            then jsonb_build_object('explanation',
                   coalesce(a.spec #>> '{explanation_i18n,pt}', a.spec #>> '{explanation_i18n,en}'))
            else '{}'::jsonb end, '{}'::jsonb)
where a.spec ?| array['prompt_i18n','title_i18n','body_i18n','question_i18n','explanation_i18n'];
