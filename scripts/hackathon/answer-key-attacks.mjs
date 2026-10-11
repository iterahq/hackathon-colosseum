#!/usr/bin/env node
// The answer key against the LIVE hackathon project: with only what a browser receives, a script
// cannot stamp Day 1 without solving it, and nothing the browser used to write on its own word is
// accepted any more.
//
//   node scripts/hackathon/answer-key-attacks.mjs            # every section
//   node scripts/hackathon/answer-key-attacks.mjs payload    # one section: payload | table | bot | forged | reveal
//
// Environment (source ~/.config/itera-hackathon/supabase.env): HACKATHON_DB_PASSWORD, SUPABASE_ACCESS_TOKEN.
// 0 SOL: nothing is stamped. Leaves throwaway wallet learners behind, tagged as test accounts by id.
import { resolveSpec } from '../../supabase/functions/_shared/grading.ts';
import { authoredLesson, correctSubmission, firstLessonOf } from './day-solver.lib.mjs';
import { FUNCTIONS, SUPABASE_URL, anonKey, check, newLearner, psql, summary, tagOwnLearners } from './social-e2e.lib.mjs';

const KEY_FIELDS = ['correct_option_id', 'correct_option_ids', 'correct_order', 'explanation', 'accept'];
const SEALED_ONLY_FIELDS = { match: ['pairs'], code_editor_checks: ['selector', 'assert'], code_fill_type: ['answer'], code_fill_bank: ['answer'], code_fill_select: ['answer'] };
const BLANK_TOKEN = /\{\{blank:([^{}]*)\}\}/g;

const guestHeaders = (apikey) => ({ apikey, Authorization: `Bearer ${apikey}`, 'Content-Type': 'application/json' });

async function served(headers, lessonId) {
  const response = await fetch(`${FUNCTIONS}/lesson`, { method: 'POST', headers, body: JSON.stringify({ lesson_id: lessonId }) });
  const body = await response.json();
  return { status: response.status, activities: (body.activities ?? []).sort((a, b) => a.ordinal - b.ordinal), raw: JSON.stringify(body) };
}

function fieldNames(value, found = new Set()) {
  if (Array.isArray(value)) value.forEach((item) => fieldNames(item, found));
  else if (value && typeof value === 'object') {
    for (const [name, item] of Object.entries(value)) {
      found.add(name);
      fieldNames(item, found);
    }
  }
  return found;
}

const idsOf = (list) => (Array.isArray(list) ? list.map((item) => item.id) : []);

async function payload(context) {
  const authored = authoredLesson(context.lesson);
  const byId = new Map(authored.map((activity) => [activity.id, activity]));
  const learner = await newLearner(context.apikey, 'reader');
  for (const [who, headers] of [['a visitor', guestHeaders(context.apikey)], ['a signed-in learner', learner.headers]]) {
    const day = await served(headers, context.lesson);
    check(`${who} receives Day 1 from the lesson function`, day.status === 200 && day.activities.length === authored.length, `HTTP ${day.status} · ${day.activities.length}/${authored.length}`);
    const graded = day.activities.filter((activity) => activity.graded_by === 'server');
    check(`${who}: every server-graded activity arrives sealed`, graded.length >= 8 && graded.every((activity) => activity.sealed === true), `${graded.filter((activity) => activity.sealed).length}/${graded.length}`);
    const leaks = [];
    for (const activity of graded) {
      const names = fieldNames(activity.spec);
      for (const field of [...KEY_FIELDS, ...(SEALED_ONLY_FIELDS[activity.kind] ?? [])]) if (names.has(field)) leaks.push(`${activity.kind}.${field}`);
      const real = byId.get(activity.id).spec;
      const authoredIds = [...idsOf(real.options), ...idsOf(real.items), ...idsOf(real.left), ...idsOf(real.right)];
      const shownIds = new Set([...idsOf(activity.spec.options), ...idsOf(activity.spec.items), ...idsOf(activity.spec.left), ...idsOf(activity.spec.right)]);
      if (authoredIds.some((id) => shownIds.has(id))) leaks.push(`${activity.kind}: authored ids`);
      if (activity.kind === 'order' && activity.spec.items.length > 1) {
        const labelOf = (id) => JSON.stringify(real.items.find((item) => item.id === id)?.label);
        const solved = real.correct_order.every((id, index) => labelOf(id) === JSON.stringify(activity.spec.items[index]?.label));
        if (solved) leaks.push('order: served already in order');
      }
      if (activity.kind === 'match') {
        const label = (list, id) => JSON.stringify(list.find((item) => item.id === id)?.label);
        const aligned = activity.spec.left.every((left, index) => real.pairs.some((pair) => label(real.left, pair.left_id) === JSON.stringify(left.label) && label(real.right, pair.right_id) === JSON.stringify(activity.spec.right[index]?.label)));
        if (aligned) leaks.push('match: columns aligned');
      }
    }
    check(`${who}: no answer field, no authored id, no solved arrangement in the payload`, leaks.length === 0, leaks.join(', '));
  }

  // The position of the right option must not be a tell across the whole trail.
  const trail = JSON.parse(
    psql(`select coalesce(json_agg(json_build_object('id', a.id, 'kind', a.kind, 'spec', a.spec, 'lesson', a.lesson_id)), '[]') from itera.activities a join itera.lessons l on l.id = a.lesson_id join itera.units u on u.id = l.unit_id join itera.programs p on p.id = u.program_id where p.slug = 'itera-v2' and a.kind = 'single_choice' and a.status = 'published';`),
  );
  const lessons = [...new Set(trail.map((activity) => activity.lesson))];
  let first = 0;
  let seen = 0;
  for (const lesson of lessons) {
    const day = await served(learner.headers, lesson);
    for (const activity of day.activities.filter((entry) => entry.kind === 'single_choice' && entry.sealed)) {
      const real = trail.find((entry) => entry.id === activity.id);
      if (!real) continue;
      const rightLabel = JSON.stringify(real.spec.options.find((option) => option.id === real.spec.correct_option_id)?.label);
      seen += 1;
      if (JSON.stringify(activity.spec.options[0]?.label) === rightLabel) first += 1;
    }
  }
  check('across the trail the right option is first no more often than chance (it was authored first in most)', seen >= 30 && first / seen < 0.55, `first is right in ${first}/${seen} of this serving; the order changes at every request`);
}

async function table(context) {
  const learner = await newLearner(context.apikey, 'table-reader');
  const get = async (headers, path) => {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { ...headers, 'Accept-Profile': 'itera' } });
    return { status: response.status, text: await response.text() };
  };
  for (const [who, headers] of [['anon', guestHeaders(context.apikey)], ['a learner', learner.headers]]) {
    const spec = await get(headers, `activities?lesson_id=eq.${context.lesson}&select=id,spec`);
    const everything = await get(headers, `activities?lesson_id=eq.${context.lesson}&select=*`);
    const rubric = await get(headers, `activities?lesson_id=eq.${context.lesson}&select=id,rubric`);
    const embedded = await get(headers, `lessons?id=eq.${context.lesson}&select=id,activities(id,spec)`);
    const defs = await get(headers, 'activity_defs?select=id,spec&limit=1');
    const index = await get(headers, `activities?lesson_id=eq.${context.lesson}&select=id,kind,ordinal,status`);
    const refused = [spec, everything, rubric, embedded, defs].every((answer) => answer.status >= 400 && !answer.text.includes('correct_option_id'));
    check(`${who} cannot read spec or rubric from the tables (direct, *, embedded, activity_defs)`, refused, [spec, everything, rubric, embedded, defs].map((answer) => answer.status).join(' '));
    check(`${who} still reads the columns the trail needs`, index.status === 200 && JSON.parse(index.text).length > 0, `HTTP ${index.status}`);
  }
}

/** What a script that has only the served lesson can send without solving anything. */
function blindSubmission(activity) {
  const spec = resolveSpec(activity.spec, 'en');
  switch (activity.kind) {
    case 'single_choice':
      return { answer: { option_ids: [spec.options[0].id] }, response: null };
    case 'multi_choice':
      return { answer: { option_ids: spec.options.map((option) => option.id) }, response: null };
    case 'order':
      return { answer: { order: spec.items.map((item) => item.id) }, response: null };
    case 'match':
      return { answer: { pairs: spec.left.slice(0, activity.pair_count).map((left, index) => [left.id, spec.right[index].id]) }, response: null };
    case 'code_fill_type':
    case 'code_fill_bank':
    case 'code_fill_select': {
      const guess = (blank) => blank.options?.[0] ?? spec.word_bank?.[0] ?? blank.placeholder ?? 'x';
      const values = Object.fromEntries(spec.blanks.map((blank) => [blank.id, String(guess(blank))]));
      return { answer: { blanks: values }, response: spec.starter.replace(BLANK_TOKEN, (token, id) => values[id] ?? token) };
    }
    case 'code_editor_checks':
      return { answer: null, response: spec.starter };
    default:
      return { answer: null, response: null };
  }
}

async function bot(context) {
  const learner = await newLearner(context.apikey, 'blind-bot');
  const day = await served(learner.headers, context.lesson);
  const tally = { pass: 0, fail: 0 };
  const passedKinds = [];
  for (const activity of day.activities) {
    const answer = await learner.call('grade', { activity_id: activity.id, passed: true, results: 'server', ...blindSubmission(activity) });
    if (answer.body.verdict === 'pass') {
      tally.pass += 1;
      passedKinds.push(`${activity.kind}:${answer.body.mode}`);
    } else tally.fail += 1;
  }
  const serverPasses = passedKinds.filter((entry) => entry.endsWith(':server'));
  const browserPasses = passedKinds.filter((entry) => entry.endsWith(':self_reported')).length;
  const gradedByServer = day.activities.filter((activity) => activity.graded_by === 'server').length;
  // The first option of a single choice is right one time in three by chance; nothing else can be guessed from the payload.
  const luckyGuesses = serverPasses.filter((entry) => entry.startsWith('single_choice:')).length;
  check(
    'a script sending "passed" for everything, with what the payload gives it, passes what nobody grades and at most a lucky single choice',
    browserPasses === 0 && serverPasses.length === luckyGuesses && serverPasses.length < gradedByServer,
    `${JSON.stringify(tally)} · server passes ${serverPasses.length}/${gradedByServer} (all single-choice guesses: ${luckyGuesses}) · browser-reported passes ${browserPasses}`,
  );
  const completed = Number(psql(`select count(*) from itera.progress where user_id = :'u'::uuid and status = 'completed';`, { u: learner.userId }));
  const stamped = await learner.call('passport', { lang: 'en', lesson_id: context.lesson });
  const awards = (stamped.body.awards ?? []).map((award) => award.key);
  const achievements = Number(psql(`select count(*) from itera.user_achievements where user_id = :'u'::uuid;`, { u: learner.userId }));
  check('Day 1 is not stamped for it: no award, nothing minted', stamped.status === 200 && !awards.includes('day_stamp') && achievements === 0 && completed < day.activities.length, `completed ${completed}/${day.activities.length} · awards [${awards.join(',')}] · mint ${JSON.stringify(stamped.body.mint ?? null)}`);
}

async function forged(context) {
  const authored = authoredLesson(context.lesson);
  const learner = await newLearner(context.apikey, 'writer');
  const choice = authored.find((activity) => activity.kind === 'single_choice');
  const xray = authored.find((activity) => activity.kind === 'xray');
  const inspect = authored.find((activity) => activity.kind === 'inspect');
  const rest = async (method, path, body) => {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method, headers: { ...learner.headers, 'Content-Profile': 'itera', 'Accept-Profile': 'itera' }, body: JSON.stringify(body) });
    return { status: response.status, text: await response.text() };
  };
  const count = (tableName) => Number(psql(`select count(*) from itera.${tableName} where user_id = :'u'::uuid;`, { u: learner.userId }));
  const passedResults = () => Number(psql(`select count(*) from itera.activity_results where user_id = :'u'::uuid and passed;`, { u: learner.userId }));

  const result = await rest('POST', 'activity_results', { user_id: learner.userId, activity_id: choice.id, passed: true, feedback: {} });
  check('the browser cannot insert an activity result', result.status >= 400 && count('activity_results') === 0, `HTTP ${result.status} ${result.text.slice(0, 90)}`);
  const xp = await rest('POST', 'rpc/award_activity_xp', { p_activity_id: choice.id, p_amount: 2_000_000_000 });
  check('the browser cannot award itself xp, whatever the amount', xp.status >= 400 && count('xp_events') === 0, `HTTP ${xp.status} ${xp.text.slice(0, 90)}`);
  const direct = await rest('POST', 'xp_events', { user_id: learner.userId, amount: 500, reason: 'because' });
  check('nor write the xp ledger', direct.status >= 400 && count('xp_events') === 0, `HTTP ${direct.status}`);

  const bare = await learner.call('grade', { activity_id: xray.id, passed: true, results: 'server', answer: null, response: null });
  check('a bare "passed" on a gesture activity is refused: the trace is required', bare.body.verdict === 'fail' && bare.body.reason === 'trace_required', JSON.stringify(bare.body).slice(0, 160));
  const half = [{ type: 'element_found', at: Date.now() - 2000, payload: { element_id: resolveSpec(inspect.spec, 'en').page.elements[0].id } }, { type: 'gate_opened', at: Date.now(), payload: { found: 2 } }];
  const partial = await learner.call('grade', { activity_id: inspect.id, passed: true, results: 'server', answer: null, response: null, trace: half });
  check('a trace that does not end where the activity ends is refused', partial.body.verdict === 'fail' && partial.body.reason === 'trace_rejected', JSON.stringify(partial.body).slice(0, 160));
  check('neither completed anything', Number(psql(`select count(*) from itera.progress where user_id = :'u'::uuid and status = 'completed';`, { u: learner.userId })) === 0);

  const honest = await learner.call('grade', { activity_id: choice.id, passed: true, results: 'server', ...correctSubmission(choice) });
  check('a real pass is where the passed result row and the xp come from: one of each, written by the server (the two refused claims are in the log as misses)', honest.body.verdict === 'pass' && honest.body.xp_awarded === 10 && passedResults() === 1 && count('activity_results') === 3 && count('xp_events') === 1, `${JSON.stringify({ verdict: honest.body.verdict, xp: honest.body.xp_awarded })} · passed results ${passedResults()} of ${count('activity_results')} rows · xp rows ${count('xp_events')}`);
  const again = await learner.call('grade', { activity_id: choice.id, passed: true, results: 'server', ...correctSubmission(choice) });
  check('the same pass again awards nothing more', again.body.xp_awarded === 0 && count('xp_events') === 1, `${again.body.xp_awarded} · xp rows ${count('xp_events')}`);
}

async function reveal(context) {
  const learner = await newLearner(context.apikey, 'guesser');
  const day = await served(learner.headers, context.lesson);
  const choice = day.activities.find((activity) => activity.kind === 'single_choice');
  const real = authoredLesson(context.lesson).find((activity) => activity.id === choice.id);
  const rightLabel = JSON.stringify(real.spec.options.find((option) => option.id === real.spec.correct_option_id).label);
  const wrong = choice.spec.options.filter((option) => JSON.stringify(option.label) !== rightLabel);
  const right = choice.spec.options.find((option) => JSON.stringify(option.label) === rightLabel);
  const send = (option) => learner.call('grade', { activity_id: choice.id, passed: true, results: 'server', answer: { option_ids: [option.id] }, response: null });

  const first = await send(wrong[0]);
  check('a miss comes back with the explanation and without the key', first.body.verdict === 'fail' && Boolean(first.body.shown?.explanation) && first.body.shown?.key === undefined, JSON.stringify(first.body.shown ?? null).slice(0, 200));
  const second = await send(wrong[wrong.length - 1]);
  check('a second miss still does not hand the key over', second.body.verdict === 'fail' && second.body.shown?.key === undefined && second.body.tries === 2, JSON.stringify({ tries: second.body.tries, key: second.body.shown?.key ?? null }));
  const pass = await send(right);
  check('the pass names the key (the learner just sent it) and counts the tries', pass.body.verdict === 'pass' && pass.body.shown?.key?.correct_option_id === right.id && pass.body.tries === 3, JSON.stringify({ tries: pass.body.tries, key: pass.body.shown?.key ?? null }));
  const attempts = psql(`select count(*) || ' attempts, ' || count(*) filter (where not passed) || ' misses' from itera.graded_attempts where user_id = :'u'::uuid and activity_id = :'a'::uuid;`, { u: learner.userId, a: choice.id });
  check('every guess is on the record', attempts === '3 attempts, 2 misses', attempts);

  const guest = await fetch(`${FUNCTIONS}/grade`, { method: 'POST', headers: guestHeaders(context.apikey), body: JSON.stringify({ activity_id: choice.id, passed: true, answer: { option_ids: [wrong[0].id] }, response: null }) });
  const guestBody = await guest.json();
  check('a visitor gets the same: explanation on a miss, no key', guestBody.verdict === 'fail' && guestBody.guest === true && Boolean(guestBody.shown?.explanation) && guestBody.shown?.key === undefined, JSON.stringify(guestBody.shown ?? guestBody).slice(0, 160));
}

const SECTIONS = { payload, table, bot, forged, reveal };

async function main() {
  const wanted = process.argv.slice(2);
  const names = wanted.length > 0 ? wanted : Object.keys(SECTIONS);
  const unknown = names.filter((name) => !SECTIONS[name]);
  if (unknown.length > 0) throw new Error(`unknown section(s): ${unknown.join(', ')}`);
  const context = { apikey: await anonKey(), lesson: firstLessonOf() };
  for (const name of names) {
    console.log(`\n=== ${name} ===`);
    await SECTIONS[name](context);
  }
  const tagged = tagOwnLearners('answer-key-attacks');
  const { total, failed } = summary();
  console.log(`\n${total - failed.length}/${total} checks passed · ${tagged} throwaway learners tagged as test accounts${failed.length ? `\nFAILED:\n  ${failed.join('\n  ')}` : ''}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('answer-key-attacks failed:', error);
  process.exit(1);
});
