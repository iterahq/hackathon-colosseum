# `e2e/` — Playwright harness

Two kinds of spec live here, and they run in different places.

| | where it runs | what it needs |
|---|---|---|
| **Hermetic** (`activity-baseline`, `source-stamp`, `capture-*`) | blocking on **every PR** (`ci.yml`) | a `vite preview` of this tree. No credential. |
| **Live** (everything else) | `e2e.yml` only — `workflow_dispatch` + daily cron | the deployed player, plus real identities |

Every live spec is capability-gated through `support/gate.ts`. Read
`support/capabilities.ts` first: it holds the registry, the tiers, and the rule
that makes a missing secret a **failure** instead of a silent skip.

---

## What is NOT covered

A gap that only exists as an absent file is a gap nobody can find. This section
is the record.

### The DFL↔ITERA federated embed — no automated coverage since 2026-08-13

**The flow:** a DFL fellow logs into `learn.devfellowship.com`, opens the
`/itera` mini-app, and the `itera-player` iframe renders a real activity —
without a second login. The session crosses the boundary by the `DFL_READY` →
`DFL_SET_TOKEN` handshake (`src/auth/embedBridge.ts` on this side,
`src/remotes/DflRemote.tsx` in `devfellowship/dfl-learn`).

**Nothing tests it.** `itera-fellowship.spec.ts` did, and it was deleted in this
PR. What went with it:

- the federated no-re-login assertion (the iframe shows an activity, never a
  password field);
- the completion → `itera.activity_results` write;
- the dfl-batch **Results-API poll-readback** (ADR-701);
- the **tenant-isolation** assertion (a `dfl-batch` key gets 404, never 403, for
  a foreign tenant's result — a 403 would leak existence);
- a permanently-skipped E3/Gantt join, gated on `dfl-schema` #527, which is
  still unmerged.

**Why it was deleted rather than fixed.** The spec had never executed a single
assertion in its life: the Actions secrets it declared did not exist until
2026-08-13. Its first real run failed, and the cause was upstream and not
technical — `CommunityMemberProtected` in `dfl-learn` redirects `/itera` to
`/projects` for any account with no `public.github_links` row, and the e2e
identity (`CLAUDE_SMOKE_*`) has none. Giving a test identity a
`github_links` row is an **identity decision, not an engineering one**: it hands
a smoke account a community-member attribute it has not earned.

Tainan chose to accept the gap (2026-08-13). The alternative was carrying a red
test nobody was allowed to fix, and a red test nobody can fix trains everyone to
ignore red.

**What would close it**, if it is ever reopened: an identity that legitimately
holds the community-member attribute on the DFL side. The mechanism itself is
not suspect — both halves of the handshake exist and are unit-tested
(`src/test/embedBridge.test.ts` here, `src/remotes/__tests__/` in `dfl-learn`).

**What still guards the cheap half.** The defect that actually shipped was not
the login gate: `dfl-learn` framed `https://iterahq.dev` (the Astro marketing
site) instead of `https://app.iterahq.dev` (the player) from 2026-06-19 to
2026-08-13, and both hosts are allowlisted, so it failed silently. That is a
static fact about configuration and needs no session to check.
`devfellowship/dfl-learn` asserts it in
`src/remotes/__tests__/itera-registration.test.ts`, on the unit-test gate of
every PR.
