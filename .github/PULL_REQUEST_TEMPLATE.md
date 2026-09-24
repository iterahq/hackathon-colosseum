## Summary
{describe what was done}

## Issue
[DEV-{number}](https://ppclip.tainanfidelis.com/DEV/issues/DEV-{number})

## Evidence
- [ ] Build passes
- [ ] Screenshot (if UI change)
- [ ] Tests pass (if applicable)
- [ ] Lint clean

## New activity kind or new spec enum field
<!-- Delete this section when the PR adds no activity kind and no enum /
     literal / discriminator field to an activity spec.
     Rule: one activity type = one behaviour (plan
     20260924-activity-type-one-behavior-rule, packages/activities/CONTRACT.md
     "One activity type = one behaviour"). -->
- [ ] One behaviour per kind: the kind has ONE input method, ONE grading, ONE completion event, and ONE input for every step. The one-line test: "If an author flips this field, does the learner do something different with their hands, does a different judge decide, or does a different event finish it?" Yes → a new kind, not a field.
- [ ] The renderer does not pick a sub-renderer from spec shape (`slots?.length`, `blanks?.length`) and does not change behaviour when a host port is absent.
- [ ] One `*.stories.tsx` file per new kind (title `Activities/<family>/<kind>`). Its stories are states and presentation variants only.
- [ ] One row per new kind in `src/test/activityMatrixCoverage.test.ts`, and `COVERAGE_SNAPSHOT` is updated.
- [ ] Enum label decision: the kind is STORED → a migration `ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS …` (the label is permanent; Tainan approves the name first). The kind is NOT stored → no label, and the PR body says why.
- [ ] A new enum or discriminator field in a spec is classified: `presentation` (with a reason) or `behaviour` (allowed only for a kind on the transition list).
- [ ] Transition list: the PR adds no row and no new behaviour to a deprecated kind (`code`, `chat_sandbox`, `terminal_sandbox`, `document`, `question`, `spec.byoc`). A PR that retires an old kind cites the audit (`db/scripts/audit-activity-behaviours.sql`) with 0 rows.
- [ ] `@taigfs` reviews the PR (CODEOWNERS on the renderer registry; merge by Tainan).
