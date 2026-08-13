# `scripts/ux-paths/` — a vendored copy, and why it is allowed to exist

`guard.mjs` and `schema-v1.json` in this directory are **byte-identical copies**
of files that live in `devfellowship/dfl-ci`. Nothing in this repo should ever
edit them. Changes go upstream and come back as a re-copy.

| File here | Upstream | sha256 |
|---|---|---|
| `guard.mjs` | `devfellowship/dfl-ci:scripts/ux-paths-guard.mjs` | `4d744547ee5dc100393e73e8a8217aa9fbb15c28b2982c4a266552c2ae490722` |
| `schema-v1.json` | `devfellowship/dfl-ci:schema/ux-paths-v1.json`, itself a copy of `devfellowship/dfl-ux-paths:spec/schema/v1.json` | `80d221b21fc60d35ba3d95586f18dcb7060068d6619f1e5b7e1cbabadd547da1` |

Introduced by [devfellowship/dfl-ci#76](https://github.com/devfellowship/dfl-ci/pull/76).
Last re-synced 2026-08-13 from [devfellowship/dfl-ci#77](https://github.com/devfellowship/dfl-ci/pull/77),
which added check 7 — `action-targets`: every `screen.actions[].next_screen` must
name a declared screen — and [devfellowship/dfl-ci#78](https://github.com/devfellowship/dfl-ci/pull/78),
which fixed how the guard loads `@devfellowship/ux-paths-spec`. The package
published at `1.3.0` that morning; the guard resolved it with
`createRequire(…).resolve()`, the package is correctly ESM-only, and Node threw
`ERR_PACKAGE_PATH_NOT_EXPORTED`. That took this repo's ux-paths job red on every
PR for a reason with nothing to do with the map. `schema-v1.json` did **not**
move in either change; only `guard.mjs` did.

## Why a copy instead of the reusable workflow

Every `devfellowship/*` repo adopts this guard in one job:

```yaml
uses: devfellowship/dfl-ci/.github/workflows/ux-paths-guard.yml@main
```

**This repo cannot.** A reusable workflow that lives in a *private* repository is
callable only from the **same organization**. `dfl-ci`'s Actions access level is
`organization` — verified, not assumed:

```
$ gh api repos/devfellowship/dfl-ci/actions/permissions/access
{"access_level":"organization"}
```

The setting that could widen it beyond one org is `enterprise`, and `iterahq` is
on the GitHub **Free** plan, so no enterprise scope exists to widen it to. This
is a platform limit, not a switch somebody declined to flip. The same limit is
why the schema is here too: `dfl-ux-paths` is private, and a workflow in this org
has no token that can read it.

## What keeps the copy honest

Three links, and it is worth being precise about which are mechanical and which
are not:

1. **`dfl-ci`'s schema copy == `dfl-ux-paths` upstream.** Mechanical —
   `dfl-ci:.github/workflows/ux-paths-schema-drift.yml` compares byte for byte on
   every touching PR, on every push to `main`, and daily.
2. **This copy == what was recorded above.** Mechanical — the `vendored-copy`
   job in `.github/workflows/ux-paths.yml` recomputes both digests on every PR
   and fails when either moves. That catches the realistic accident: someone
   fixes a bug *here*, the fleet never gets it, and the two implementations
   quietly diverge.
3. **What was recorded above == `dfl-ci` at re-sync time.** **Manual.** Whoever
   re-copies updates the digests in this table. Nothing in this org can read
   `dfl-ci` to check it, so an upstream change lands here only when a human
   brings it. That is the real cost of the copy, and it is stated rather than
   papered over.

## How to re-sync

```bash
gh api repos/devfellowship/dfl-ci/contents/scripts/ux-paths-guard.mjs \
  --jq .content | base64 -d > scripts/ux-paths/guard.mjs
gh api repos/devfellowship/dfl-ci/contents/schema/ux-paths-v1.json \
  --jq .content | base64 -d > scripts/ux-paths/schema-v1.json
sha256sum scripts/ux-paths/guard.mjs scripts/ux-paths/schema-v1.json
```

Then paste the two digests into the table above, in the same PR. CI fails
otherwise, which is the point.

## When this directory goes away

The guard prefers `@devfellowship/ux-paths-spec` — a zero-dependency package
that carries the schema and a `validate()` — and only falls back to a vendored
schema when that package does not resolve. The package is **not on the registry
yet** (`npm view` returned E404 on 2026-08-12); its publish workflow exists and
is `workflow_dispatch`, and the `NPM_TOKEN` it was blocked on now exists as an
org secret.

The day it publishes, `schema-v1.json` can be deleted from here with no other
change: the workflow already installs the package first and falls back second.
`guard.mjs` still has to be a copy, because the cross-org workflow limit is
about GitHub, not about npm — unless the guard itself ships as a package too.
