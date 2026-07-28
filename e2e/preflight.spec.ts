/**
 * PREFLIGHT — the single place this suite is allowed to go red for "we are not
 * testing".
 *
 * Tainan, 2026-07-28: **green has to mean "it ran and passed", never "it didn't
 * run".** The daily `e2e.yml` cron has been green for its entire life while the
 * repo has never had `ITERA_SMOKE_*`, `CLAUDE_SMOKE_*` or
 * `DFL_BATCH_RESULTS_API_KEY` — every spec skipped itself and the run reported
 * success. This test converts that silence into ONE actionable failure that
 * names each missing secret/substrate and what to do about it.
 *
 * Deliberate design choices:
 *  - ONE failure, not N. The individual specs keep skipping, so the report still
 *    shows exactly which tests did not run and why (see the skip census).
 *  - Untagged, so it runs on the `desktop` project only — a capability is not a
 *    viewport-dependent property, and 3 identical failures would be noise.
 *  - Never prints a credential value. Names and presence only.
 *  - Locally (`E2E_REQUIRE_CAPABILITIES` unset) it PASSES and just logs the
 *    audit, so a developer without credentials is not blocked.
 */
import { test, expect } from '@playwright/test';
import { auditCapabilities, explain, ENFORCING } from './support/capabilities';

test('preflight — every capability CI is supposed to provide is actually present', async () => {
  test.setTimeout(60_000);
  const audit = await auditCapabilities();

  const required = audit.filter((c) => c.tier === 'required');
  const optional = audit.filter((c) => c.tier === 'optional');
  const missingRequired = required.filter((c) => !c.present);
  const missingOptional = optional.filter((c) => !c.present);

  const banner =
    `capabilities: ${required.length - missingRequired.length}/${required.length} required present, ` +
    `${optional.length - missingOptional.length}/${optional.length} optional present`;
  console.log(`[preflight] ${banner}`);
  for (const c of [...missingRequired, ...missingOptional]) {
    console.log(`[preflight] ${explain(c)}`);
  }

  if (!ENFORCING) {
    console.log(
      '[preflight] E2E_REQUIRE_CAPABILITIES is not set — reporting only. ' +
        'CI sets it to 1, which turns the list above into a failure.'
    );
    return;
  }

  const message =
    `\n${missingRequired.length} capability/ies that CI is supposed to provide are ABSENT, so the ` +
    `specs that depend on them did not run. A green run here would be a lie.\n\n` +
    missingRequired.map((c) => explain(c)).join('\n\n') +
    `\n\nNothing above is a credential value — only names. Provision the secrets in ` +
    `Settings → Secrets and variables → Actions, then re-run.\n`;

  expect(missingRequired.map((c) => c.name), message).toEqual([]);
});
