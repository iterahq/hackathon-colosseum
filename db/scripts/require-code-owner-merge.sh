#!/usr/bin/env bash
# require-code-owner-merge.sh — fail if a PR touches db/migrations/** without a
# code-owner sign-off.
#
# Merging a migration APPLIES it (db-apply.yml → the ITERA production database),
# so the merge button is the deploy button and it belongs to a named human.
# This script is the visible half of that rule; the half that actually refuses
# is the `safe-admin-merge` path gate (protected_paths.conf,
# reason=protected_path, no override flag) — see db/README.md.
#
# It lives in db/scripts/ rather than inline in the workflow so it can be
# unit-tested (test-require-code-owner-merge.sh stubs `gh` and asserts every
# verdict) and run by hand. A gate nobody can test is a gate nobody can trust.
#
# Env:
#   REPO         owner/repo                       (required)
#   PR           pull request number              (required)
#   AUTHOR       PR author login                  (required)
#   CODE_OWNERS  space-separated logins; keep in sync with .github/CODEOWNERS
#   GH_TOKEN     token for `gh`                   (required by gh)
#
# Exit 0 = gate satisfied (or not applicable). Exit 1 = needs a code owner.
# Any API failure is also a non-zero exit: fail-closed, never fail-open.

set -euo pipefail

REPO="${REPO:?REPO is required}"
PR="${PR:?PR is required}"
AUTHOR="${AUTHOR:-}"
CODE_OWNERS="${CODE_OWNERS:-taigfs}"

lc() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

files="$(gh api "repos/$REPO/pulls/$PR/files" --paginate --jq '.[].filename')"
touched="$(printf '%s\n' "$files" | grep -E '^db/migrations/' || true)"

if [ -z "$touched" ]; then
  echo "This PR touches no db/migrations/** file — the migration gate does not apply."
  exit 0
fi

echo "Migration files in this PR:"
printf '%s\n' "$touched" | sed 's/^/  /'

# A code owner who authored the PR cannot approve it — GitHub forbids
# self-approval — and is exactly the person the gate wants at the merge button.
for o in $CODE_OWNERS; do
  if [ -n "$AUTHOR" ] && [ "$(lc "$AUTHOR")" = "$(lc "$o")" ]; then
    echo "PR author @$AUTHOR is a code owner of db/migrations/ — gate satisfied by authorship."
    echo "Reminder: @$AUTHOR merges this himself. Agents must not admin-merge it."
    exit 0
  fi
done

# Latest review state per reviewer: an APPROVED later dismissed or superseded by
# CHANGES_REQUESTED must not still count as a sign-off.
approvers="$(gh api "repos/$REPO/pulls/$PR/reviews" --paginate --jq '
  [ .[] | select(.state == "APPROVED" or .state == "CHANGES_REQUESTED" or .state == "DISMISSED") ]
  | group_by(.user.login) | map(last)
  | .[] | select(.state == "APPROVED") | .user.login
')"

for o in $CODE_OWNERS; do
  for a in $approvers; do
    if [ "$(lc "$a")" = "$(lc "$o")" ]; then
      echo "Approved by code owner @$a — gate satisfied."
      echo "Reminder: @$a merges this himself. Agents must not admin-merge it."
      exit 0
    fi
  done
done

echo "::error title=Migration needs a code-owner merge::This PR changes db/migrations/**. Merging it to main runs db-apply, which applies the migration to the ITERA production database (Supabase kjefmwlopzeaqgqtlbdn) — merging IS deploying. It needs an approving review from a code owner (${CODE_OWNERS}), and that person merges it himself. Agents must not admin-merge: safe-admin-merge refuses this path with reason=protected_path and has no override flag. Everything in this repo outside db/migrations/** is unaffected and still auto-merges on green CI."
exit 1
