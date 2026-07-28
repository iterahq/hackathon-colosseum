/**
 * Skip census — makes "it didn't run" visible in every single run.
 *
 * Prints, at the end of the run and into `$GITHUB_STEP_SUMMARY` when present:
 *   - how many tests ran / passed / failed / SKIPPED, per project;
 *   - every skipped test with its reason, bucketed by tier
 *     (`required` / `optional` / `blocked` / `unclassified`).
 *
 * It also enforces the invariant that motivated the whole change: under
 * `E2E_REQUIRE_CAPABILITIES=1`, a run in which **zero tests executed** is
 * FAILED, not passed. Green must mean "it ran and passed".
 *
 * Reasons are produced by `e2e/support/gate.ts`, which prefixes them with
 * `[required]` / `[optional]` / `[blocked]`. Anything without a prefix shows up
 * as `unclassified` — deliberately ugly, so a hand-rolled `test.skip()` is
 * visible the day someone adds one.
 */
import { appendFileSync } from 'node:fs';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

type Tier = 'required' | 'optional' | 'blocked' | 'unclassified';

interface SkipRow {
  project: string;
  title: string;
  tier: Tier;
  reason: string;
}

const TIERS: Tier[] = ['required', 'optional', 'blocked', 'unclassified'];

function classify(result: TestResult): { tier: Tier; reason: string } {
  const annotated = result.annotations.find((a) => a.type === 'capability-tier')?.description;
  const skipAnnotation = result.annotations.find((a) => a.type === 'skip' || a.type === 'fixme');
  const reason = skipAnnotation?.description?.trim() || '(no reason given)';
  const fromPrefix = /^\[(required|optional|blocked)\]/.exec(reason)?.[1] as Tier | undefined;
  const tier = (annotated as Tier | undefined) ?? fromPrefix ?? 'unclassified';
  return { tier: TIERS.includes(tier) ? tier : 'unclassified', reason };
}

export default class SkipCensusReporter implements Reporter {
  private skips: SkipRow[] = [];
  private executed = 0;
  private passed = 0;
  private failed = 0;

  onTestEnd(test: TestCase, result: TestResult) {
    const project = test.parent.project()?.name ?? 'unknown';
    if (result.status === 'skipped') {
      const { tier, reason } = classify(result);
      // titlePath() is ['', <project>, <file>, ...<describes>, <title>].
      this.skips.push({ project, title: test.titlePath().slice(2).join(' › ') || test.title, tier, reason });
      return;
    }
    this.executed += 1;
    if (result.status === 'passed') this.passed += 1;
    else this.failed += 1;
  }

  private render(): string {
    const lines: string[] = [];
    lines.push('');
    lines.push('══ E2E skip census ═══════════════════════════════════════════════════');
    lines.push(
      `executed: ${this.executed}  (passed ${this.passed} · failed ${this.failed})   skipped: ${this.skips.length}`
    );

    const byProject = new Map<string, { ran: number; skipped: number }>();
    for (const s of this.skips) {
      const e = byProject.get(s.project) ?? { ran: 0, skipped: 0 };
      e.skipped += 1;
      byProject.set(s.project, e);
    }
    if (byProject.size) {
      lines.push('');
      for (const [project, counts] of byProject) lines.push(`  project ${project}: ${counts.skipped} skipped`);
    }

    for (const tier of TIERS) {
      const rows = this.skips.filter((s) => s.tier === tier);
      if (!rows.length) continue;
      lines.push('');
      lines.push(`── ${tier.toUpperCase()} (${rows.length}) ${tierNote(tier)}`);
      for (const r of rows) lines.push(`  · [${r.project}] ${r.title}\n      ${r.reason}`);
    }

    if (this.executed === 0) {
      lines.push('');
      lines.push('  ⚠️  ZERO tests executed. A green here would mean "we are not testing".');
    }
    lines.push('══════════════════════════════════════════════════════════════════════');
    lines.push('');
    return lines.join('\n');
  }

  async onEnd(result: FullResult): Promise<{ status?: FullResult['status'] } | void> {
    // `playwright test --list` reports no test results at all. Nothing to
    // census, and nothing to enforce — bail before printing or failing.
    if (this.executed === 0 && this.skips.length === 0) return;

    const text = this.render();
    console.log(text);

    const summary = process.env.GITHUB_STEP_SUMMARY;
    if (summary) {
      try {
        appendFileSync(summary, `\n### E2E skip census\n\n\`\`\`\n${text}\n\`\`\`\n`);
      } catch {
        /* the console copy above is the source of truth; never fail on this */
      }
    }

    if (process.env.E2E_REQUIRE_CAPABILITIES === '1' && this.executed === 0 && result.status === 'passed') {
      console.error(
        'E2E_REQUIRE_CAPABILITIES=1 and not a single test executed — failing the run. ' +
          'Green must mean "it ran and passed", never "it did not run".'
      );
      return { status: 'failed' };
    }
  }
}

function tierNote(tier: Tier): string {
  switch (tier) {
    case 'required':
      return '— CI is supposed to provide this. The preflight test fails for these.';
    case 'optional':
      return '— foreign/optional substrate. UNVERIFIED, not passing.';
    case 'blocked':
      return '— blocked on an upstream dependency, not on a secret.';
    default:
      return '— a hand-rolled test.skip(): route it through e2e/support/gate.ts.';
  }
}
