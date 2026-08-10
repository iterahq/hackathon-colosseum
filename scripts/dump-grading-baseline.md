# Regenerating `src/test/fixtures/production-grading-inputs.json`

The fixture is a snapshot of the ITERA production **grading inputs** — every
`itera.activity_defs` and `itera.activities` row whose `rubric` is non-empty —
plus every AI-judge verdict production has recorded
(`itera.activity_results` rows whose `feedback` carries a `criteria` array).
It is what `src/test/judgeGradingBaseline.test.tsx` asserts against.

It exists because plan
[`20260807-itera-activity-defs-registry-restructure`](https://plans.devfellowship.com/20260807-itera-activity-defs-registry-restructure)
folds `rubric` into a typed `spec.evaluation`, and ADR-5 makes a characterization
baseline a **precondition** of that fold. The reason is one line of `itera-api`
(`src/judge/judge.ts:75-76`): when the rubric is empty the judge is instructed to
invent its own criteria, so losing the rubric produces a *different but
plausible* grade — no error, no log, nothing to notice.

It is **checked in** rather than fetched at test time, for the same three reasons
`@iterahq/activity-spec`'s `production-conformance.test.ts` gives: CI has no
ITERA DB credential (and should not get one), a network-dependent test is a flaky
test, and a committed fixture is a diffable record of what the data looked like
before the fold.

## Re-dump

Read-only, via the `itera-supabase-helpers` skill (project `kjefmwlopzeaqgqtlbdn`).
**Never** write to this database from here: schema goes through
`iterahq/itera-player` `db/migrations/` + a human (code-owner) merge, and data
goes through an MCP tool with the caller's user-JWT.

```bash
SKILL=~/.claude/skills/itera-supabase-helpers

# 1. the defs that carry a rubric
bash "$SKILL/run.sh" query "SELECT row_to_json(t)::text FROM (
  SELECT 'activity_defs' AS src, id::text AS id, kind::text AS kind, rubric,
         (spec ? 'prompt') AS has_prompt
  FROM itera.activity_defs WHERE rubric::text <> '{}'
) t;" 2>/dev/null | sed 's/^ *//; s/ *$//' | grep '^{' > defs.jsonl

# 2. the activities that carry a rubric
bash "$SKILL/run.sh" query "SELECT row_to_json(t)::text FROM (
  SELECT 'activities' AS src, id::text AS id, kind::text AS kind, rubric,
         (spec ? 'prompt') AS has_prompt, def_id::text AS def_id
  FROM itera.activities WHERE rubric::text <> '{}'
) t;" 2>/dev/null | sed 's/^ *//; s/ *$//' | grep '^{' > acts.jsonl

# 3. every recorded AI-judge verdict
bash "$SKILL/run.sh" query "SELECT row_to_json(t)::text FROM (
  SELECT id::text AS rid, activity_id::text AS aid, attempt, passed,
         score_internal, feedback, created_at::text AS created_at
  FROM itera.activity_results WHERE feedback ? 'criteria' ORDER BY created_at
) t;" 2>/dev/null | sed 's/^ *//; s/ *$//' | grep '^{' > verdicts.jsonl
```

Then fold the three into the fixture shape, sorted by `kind, source, ref` (rows)
and `activityRef, attempt, ref` (verdicts), keeping `ref` = the first 8 chars of
the uuid, and update `_capturedAt` / `_rowCount` / `_verdictCount`.

⚠️ **`user_id` is deliberately not selected anywhere above.** Neither are
`itera.artifacts` and the learner's submitted text.

## Redaction — what leaves the database and what does not

These rows are NOT purely authored content: `activity_results` holds a model's
prose *about a real learner's submission*. The rule is that the fixture keeps the
grading STRUCTURE and drops the learner:

| field | treatment | why |
|---|---|---|
| `rubric` (whole column) | **kept verbatim** | authored course content; it is the thing being characterized |
| `criteria[].criterion` | **kept verbatim** | the model's paraphrase of the AUTHORED criterion — no learner content, and it is the evidence that text cannot be a key |
| `criteria[].note` | **dropped**, replaced by `noteRedacted: true` | model prose describing what a named learner wrote |
| `feedback` (prose) | **dropped**, replaced by `feedbackRedacted: true` | same |
| `degraded_reason` | kept, with the upstream provider's `"user_id"` masked | the failure shape is the evidence; the id is not |
| `user_id`, submissions, artifacts | **never selected** | not needed to characterize grading |
| `spec` | reduced to `specPromptPresent: boolean` | the only contribution the spec makes to the renderer branch is `Boolean(spec.prompt)` |

The generator refuses to write if it finds an e-mail address, a token prefix
(`sk-`, `eyJ`, `vcp_`, `ghp_`, `gho_`, `github_pat_`) or a `data:` URI anywhere
in a rubric or criterion. The 2026-08-10 capture had zero of each.

**Do not scrub silently.** Anything removed gets a marker and a line in
`_README` — a fixture that quietly differs from production stops being evidence.

## Before committing a new snapshot

1. **Re-run the suite.** A row that no longer matches `BASELINE` in
   `judgeGradingBaseline.test.tsx` is a **finding**, not a reason to edit the
   table. Editing that table changes what learners are graded on, and the PR
   should say so in those words.
2. **New rows are expected.** These tables are live — authoring adds rows. A new
   rubric-bearing row needs a new `BASELINE` entry; the completeness assertion
   fails until it has one, on purpose.
3. **After phase 3e**, the fixture also has to capture `spec.evaluation`, and the
   test's job becomes proving that the evaluation-derived signature equals the
   SAME table. `rubric` stays intact through 3e (the plan's reversibility
   property), so both sources can be compared in the same run.
