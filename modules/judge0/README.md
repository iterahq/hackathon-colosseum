# modules/judge0 — code execution (PLACEHOLDER)

Placeholder for the judge0-based code-execution module (ADR-30). Lives INSIDE
the Itera monorepo (ADR-F1). NOT implemented in the foundation batch — this is a
stub so the layout + the fold-in path are decided.

A later batch will build:
- A judge0 deployment (self-hosted or managed) for sandboxed code runs.
- A thin API the player calls to grade `kind='code'` activities.
- Wiring into `itera.activity_results` (passed/score_internal/feedback).

Until then, `kind='code'` activities render in Monaco but are not auto-graded.
