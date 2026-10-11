#!/usr/bin/env node
// Every published activity of the stamped trail, as authored in the LIVE database, through the seal
// and the server grader: the sealed copy carries no answer, the authored answer still passes when it
// comes back in the sealed ids, a wrong one is refused, and the gesture kinds are accepted with the
// trace a learner leaves and refused without it.
//
//   node scripts/hackathon/seal-parity.mjs [program-slug]      (default itera-v2)
//
// Environment (source ~/.config/itera-hackathon/supabase.env): HACKATHON_DB_PASSWORD. Reads only.
import { randomBytes } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { blankVerdicts, checkResults, gradeSubmission, gradingMode, resolveSpec } from '../../supabase/functions/_shared/grading.ts';
import { answerKey, sealActivity, sealedId, unsealAnswer } from '../../supabase/functions/_shared/seal.ts';
import { checkSelfReported, isTraceChecked } from '../../supabase/functions/_shared/trace-check.ts';
import { correctSubmission, gestureTrace } from './day-solver.lib.mjs';
import { psql } from './social-e2e.lib.mjs';

const SLUG = process.argv[2] ?? 'itera-v2';
const SECRET = randomBytes(16).toString('hex');
const KEY_FIELDS = ['correct_option_id', 'correct_option_ids', 'correct_order', 'explanation', 'accept'];
const KIND_FIELDS = { match: ['pairs'], code_editor_checks: ['selector', 'assert', 'steps'], code_fill_type: ['answer'], code_fill_bank: ['answer'], code_fill_select: ['answer'] };

const parseHtml = (source) => {
  const { document } = new JSDOM(source).window;
  return {
    count: (selector) => document.querySelectorAll(selector).length,
    text: (selector) => document.querySelector(selector)?.textContent ?? null,
    attr: (selector, name) => document.querySelector(selector)?.getAttribute(name) ?? null,
  };
};

function fieldNames(value, found = new Set()) {
  if (Array.isArray(value)) value.forEach((item) => fieldNames(item, found));
  else if (value && typeof value === 'object') for (const [name, item] of Object.entries(value)) fieldNames(item, found.add(name));
  return found;
}

const activities = JSON.parse(
  psql(
    `select coalesce(json_agg(json_build_object('id', a.id, 'kind', a.kind, 'spec', a.spec) order by u.ordinal, l.ordinal, a.ordinal), '[]')
     from itera.activities a join itera.lessons l on l.id = a.lesson_id join itera.units u on u.id = l.unit_id join itera.programs p on p.id = u.program_id
     where p.slug = :'slug' and a.status = 'published';`,
    { slug: SLUG },
  ),
);

const tally = { server: 0, browser: 0, none: 0, sealed: 0, keyPasses: 0, wrongRefused: 0, tracesAccepted: 0, bareRefused: 0 };
const problems = [];
const problem = (activity, what) => problems.push(`${activity.kind} ${activity.id}: ${what}`);
const idsOf = (list) => (Array.isArray(list) ? list.map((item) => item.id) : []);

for (const activity of activities) {
  const sealed = sealActivity(activity, SECRET);
  tally[sealed.graded_by] += 1;
  const mode = gradingMode(activity.kind, activity.spec);

  if (mode === 'server') {
    if (!sealed.sealed) problem(activity, 'graded by the server but served unsealed');
    else tally.sealed += 1;
    const names = fieldNames(sealed.spec);
    for (const field of [...KEY_FIELDS, ...(KIND_FIELDS[activity.kind] ?? [])]) if (names.has(field)) problem(activity, `sealed copy still has "${field}"`);
    const authoredIds = [...idsOf(activity.spec.options), ...idsOf(activity.spec.items), ...idsOf(activity.spec.left), ...idsOf(activity.spec.right)];
    const shown = new Set([...idsOf(sealed.spec.options), ...idsOf(sealed.spec.items), ...idsOf(sealed.spec.left), ...idsOf(sealed.spec.right)]);
    if (authoredIds.some((id) => shown.has(id))) problem(activity, 'sealed copy shows an authored id');

    for (const locale of ['pt', 'en']) {
      const right = correctSubmission(activity, locale);
      if (activity.kind === 'code_editor_checks') {
        const starter = resolveSpec(activity.spec, locale).starter ?? '';
        const untouched = gradeSubmission(activity.kind, activity.spec, { answer: null, response: starter }, true, parseHtml);
        if (untouched.passed) problem(activity, `the unchanged starter passes (${locale})`);
        else tally.wrongRefused += 1;
        const results = checkResults(activity.kind, activity.spec, starter, parseHtml);
        if (!results || results.length !== activity.spec.checks.length) problem(activity, 'no result per check');
        continue;
      }
      const key = answerKey(activity, SECRET);
      const sealedAnswer = key
        ? activity.kind === 'single_choice'
          ? { option_ids: [key.correct_option_id] }
          : activity.kind === 'multi_choice'
            ? { option_ids: key.correct_option_ids }
            : activity.kind === 'order'
              ? { order: key.correct_order }
              : { pairs: key.pairs.map((pair) => [pair.left_id, pair.right_id]) }
        : right.answer;
      const answer = unsealAnswer(activity, sealedAnswer, SECRET);
      const good = gradeSubmission(activity.kind, activity.spec, { answer, response: right.response }, true, parseHtml);
      if (!good.passed) problem(activity, `the authored answer is refused (${locale}, ${good.reason})`);
      else tally.keyPasses += 1;
      if (right.answer?.blanks) {
        const verdicts = blankVerdicts(activity.kind, activity.spec, right.answer.blanks);
        if (!verdicts || !Object.values(verdicts).every(Boolean)) problem(activity, `a right blank is marked wrong (${locale})`);
      }
      const spec = resolveSpec(activity.spec, locale);
      const wrong =
        activity.kind === 'single_choice'
          ? { answer: { option_ids: [sealedId(SECRET, activity.id, spec.options.find((option) => option.id !== spec.correct_option_id).id)] }, response: null }
          : activity.kind === 'multi_choice'
            ? { answer: { option_ids: spec.correct_option_ids.length > 1 ? spec.correct_option_ids.slice(1) : spec.options.map((option) => option.id) }, response: null }
            : activity.kind === 'order'
              ? { answer: { order: [...spec.correct_order].reverse() }, response: null }
              : activity.kind === 'match'
                ? { answer: { pairs: spec.pairs.map((pair, index) => [pair.left_id, spec.pairs[(index + 1) % spec.pairs.length].right_id]) }, response: null }
                : { answer: null, response: spec.starter.replace(/\{\{blank:([^{}]*)\}\}/g, 'zzz-wrong') };
      const bad = gradeSubmission(activity.kind, activity.spec, { answer: unsealAnswer(activity, wrong.answer, SECRET), response: wrong.response }, true, parseHtml);
      if (bad.passed && !(activity.kind === 'match' && spec.pairs.length === 1) && !(activity.kind === 'order' && spec.correct_order.length === 1)) problem(activity, `a wrong answer passes (${locale})`);
      else tally.wrongRefused += 1;
    }
    continue;
  }

  if (sealed.sealed) problem(activity, 'not graded by the server but sealed');
  if (mode === 'self_reported' && isTraceChecked(activity.kind)) {
    if (activity.kind === 'code_editor_checks') {
      const starter = resolveSpec(activity.spec, 'pt').starter ?? '';
      const refused = checkSelfReported(activity.kind, activity.spec, { response: starter, trace: null }, parseHtml);
      if (!refused) problem(activity, 'browser-graded editor: the unchanged starter is accepted');
      else tally.bareRefused += 1;
      continue;
    }
    const trace = gestureTrace({ ...activity, spec: resolveSpec(activity.spec, 'pt') });
    const accepted = checkSelfReported(activity.kind, activity.spec, { response: null, trace }, parseHtml);
    if (accepted !== null) problem(activity, `the trace a learner leaves is refused (${accepted})`);
    else tally.tracesAccepted += 1;
    const bare = checkSelfReported(activity.kind, activity.spec, { response: null, trace: null }, parseHtml);
    if (bare !== 'trace_required') problem(activity, 'a pass with no trace is accepted');
    else tally.bareRefused += 1;
  }
}

console.log(`${SLUG}: ${activities.length} published activities · ${JSON.stringify(tally)}`);
if (problems.length > 0) {
  console.log(`PROBLEMS (${problems.length}):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('seal parity: every server-graded activity is sealed, every authored answer passes through the sealed ids, every wrong one is refused, every gesture kind needs its trace');
