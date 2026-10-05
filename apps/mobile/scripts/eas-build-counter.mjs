#!/usr/bin/env node
/**
 * Provenance: devfellowship/dfl-lesson-studio, apps/ios/scripts/eas-build-counter.mjs (the iOS-only
 * counter of its plan 20261002-lesson-studio-native-migration, T20). Changes: the account is `iterahq`,
 * the platform is a parameter (EAS_PLATFORM = ios | android: the Free plan meters each platform
 * separately), and the "one approved build above the hold" path is removed (a build above the hold is
 * Tainan's call and he raises EAS_BUILD_MAX in the workflow himself).
 *
 * EAS build counter. The Expo account `iterahq` is on the Free plan: 30 builds a month, at most 15 per
 * platform (read from the meter, not assumed). The counter holds each platform at EAS_BUILD_MAX (12)
 * and fails the job BEFORE any build starts. The count is Expo's own usage meter for the account (every
 * project of the account shares it), not the build list of one project.
 *
 *   EXPO_TOKEN=... EAS_PLATFORM=android node scripts/eas-build-counter.mjs   # check, exit 0/3
 *   EAS_PLATFORM=ios node scripts/eas-build-counter.mjs --simulate-used 12    # dry run, no network
 *
 * Exit codes: 0 allowed (the next build is number <= MAX); 3 REFUSED; 2 cannot read the meter (fail
 * closed). It writes `used`, `limit`, `max`, `allowed` to $GITHUB_OUTPUT and a table to
 * $GITHUB_STEP_SUMMARY when they are set.
 */
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const PLATFORMS = ['ios', 'android'];

/** Pure: is the next build of this platform inside the hold? */
export function decide({ used, max }) {
  const next = used + 1;
  return next <= max ? { next, allowed: true, reason: 'within the hold' } : { next, allowed: false, reason: `above the hold of ${max}` };
}

/** Pure: the build metric of one platform out of the `byBillingPeriod` answer. */
export function pickPlatformMetric(period, platform) {
  if (!PLATFORMS.includes(platform)) throw new Error(`EAS_PLATFORM must be ios or android, got "${platform}"`);
  const metric = period?.planMetrics?.find((m) => m.serviceMetric === 'BUILDS');
  const slot = metric?.platformBreakdown?.[platform];
  if (!slot || typeof slot.value !== 'number') throw new Error(`Expo API: no ${platform} BUILDS metric`);
  return { used: slot.value, limit: slot.limit };
}

const appendTo = (file, text) => {
  if (file) appendFileSync(file, text);
};

async function readMeter(account, platform) {
  const token = process.env.EXPO_TOKEN;
  if (!token) throw new Error('EXPO_TOKEN is not set');
  const date = new Date().toISOString();
  const query = `{ account { byName(accountName: ${JSON.stringify(account)}) {
    subscription { name }
    usageMetrics { byBillingPeriod(date: ${JSON.stringify(date)}, service: BUILDS) {
      billingPeriod { start end }
      planMetrics { serviceMetric platformBreakdown { ios { value limit } android { value limit } } }
    } } } } }`;
  const res = await fetch('https://api.expo.dev/graphql', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const body = await res.json();
  if (!res.ok || body.errors) throw new Error(`Expo API: HTTP ${res.status} ${JSON.stringify(body.errors ?? '')}`);
  const acct = body.data.account.byName;
  const period = acct.usageMetrics.byBillingPeriod;
  return { ...pickPlatformMetric(period, platform), plan: acct.subscription?.name, period: period.billingPeriod };
}

async function main() {
  const account = process.env.EAS_ACCOUNT || 'iterahq';
  const platform = (process.env.EAS_PLATFORM || '').trim();
  const max = Number(process.env.EAS_BUILD_MAX || 12);
  const outputs = (kv) => appendTo(process.env.GITHUB_OUTPUT, Object.entries(kv).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
  if (!PLATFORMS.includes(platform)) {
    console.error(`eas-build-counter: EAS_PLATFORM must be ios or android, got "${platform}"`);
    outputs({ allowed: 'false' });
    process.exit(2);
  }
  const i = process.argv.indexOf('--simulate-used');
  let meter;
  if (i > 0) {
    meter = { used: Number(process.argv[i + 1]), limit: 15, plan: 'simulated', period: { start: '-', end: '-' } };
  } else {
    try {
      meter = await readMeter(account, platform);
    } catch (e) {
      console.error(`eas-build-counter: cannot read the meter, refusing (fail closed): ${e.message}`);
      outputs({ allowed: 'false' });
      process.exit(2);
    }
  }
  const { next, allowed, reason } = decide({ used: meter.used, max });
  console.log(
    `eas-build-counter: account=${account} plan=${meter.plan} period=${meter.period.start}..${meter.period.end} ` +
      `${platform}_used=${meter.used} plan_limit=${meter.limit} hold_at=${max} next_build=${next} -> ${allowed ? 'ALLOWED' : 'REFUSED'} (${reason})`,
  );
  outputs({ used: meter.used, limit: meter.limit, max, allowed: String(allowed) });
  appendTo(
    process.env.GITHUB_STEP_SUMMARY,
    `### EAS ${platform} builds this period\n\n| used | hold | plan limit | next build |\n|---|---|---|---|\n| ${meter.used} | ${max} | ${meter.limit} | ${next} (${allowed ? 'allowed' : 'REFUSED'}) |\n`,
  );
  if (!allowed) {
    console.error(`eas-build-counter: build ${next} refused: ${reason}. A build above the hold or a plan upgrade is Tainan's decision.`);
    process.exit(3);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
