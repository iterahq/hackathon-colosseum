#!/usr/bin/env node
// Seeds itera.video_courses / video_lessons from the exported Learn JSON.
//
//   node scripts/hackathon/seed-video-courses.mjs [exportDir]   (default /tmp/hk/learn)
//
// Reads courses.json, lessons.json, tutors.json and selected-course-ids.txt,
// keeps the source uuids and upserts through psql in one transaction.
// Environment: HACKATHON_DB_PASSWORD (source ~/.config/itera-hackathon/supabase.env).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_REF = 'nyzcbnnbffsizshiolbh';
const DB_URL = `postgresql://postgres.${PROJECT_REF}@aws-1-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require`;
const dir = process.argv[2] ?? '/tmp/hk/learn';
const SLUG_OVERRIDES = {
  '35854995-f14c-4c8f-b2ec-ad9e98eb81da': 'agentes-autonomos',
  '85527388-ba7a-4189-9426-eea87385195c': 'agentes-com-n8n',
  '31ad0c72-cfa5-4346-b40a-5ac19dae1402': 'supabase-do-zero',
  '589bf7c2-c76b-4a7b-845f-0281e7db01ce': 'git-e-github',
  'f4589404-a25c-45ef-bc16-b8aa56ab625b': 'vibe-coding-wiki-gamer',
  '4d6810b9-ea83-4d25-ab14-607a3982eddf': 'modelagem-de-dados',
  'b910faa6-0730-4f27-86ad-730c6cc8d656': 'data-science',
  '29157858-ddcc-46c5-90d0-26f961eb93a9': 'react-do-zero',
  'dc2b32f9-6139-434e-8bb3-047626e645ab': 'ecommerce-react-vite',
};
const STOPWORDS = new Set(['de', 'do', 'da', 'com', 'para', 'e', 'a', 'o', 'na', 'no', 'em']);

if (!process.env.HACKATHON_DB_PASSWORD) {
  console.error('seed-video-courses: HACKATHON_DB_PASSWORD is not set');
  process.exit(1);
}

const read = (name) => readFileSync(join(dir, name), 'utf8');
const courses = JSON.parse(read('courses.json'));
const lessons = JSON.parse(read('lessons.json'));
const tutors = JSON.parse(read('tutors.json'));
const selected = read('selected-course-ids.txt').split(/\s+/).filter(Boolean);

const text = (value) => `'${String(value ?? '').replace(/'/g, "''")}'`;
const q = (value) => (value == null || value === '' ? 'null' : text(value));

function slugify(title) {
  const head = title.split(/[:(]/)[0];
  const words = head
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ');
  const meaningful = words.filter((w, i) => i === 0 || !STOPWORDS.has(w) || words.length <= 3);
  return meaningful.slice(0, 4).join('-');
}

const statements = [];
const seen = new Set();
for (const id of selected) {
  const course = courses.find((c) => c.id === id);
  if (!course) throw new Error(`course ${id} not found in courses.json`);
  const teacher = tutors.find((t) => t.id === course.tutor_id)?.name ?? 'Itera';
  let slug = SLUG_OVERRIDES[id] ?? slugify(course.title);
  if (seen.has(slug)) slug = `${slug}-${id.slice(0, 4)}`;
  seen.add(slug);
  statements.push(
    `insert into itera.video_courses (id, slug, title, description, thumbnail_url, teacher_name, position) values (` +
      `${q(id)}, ${q(slug)}, ${q(course.title)}, ${text(course.description)}, ${q(course.thumbnail)}, ${q(teacher)}, ${Number(course.position) || 0}) ` +
      `on conflict (id) do update set slug = excluded.slug, title = excluded.title, description = excluded.description, ` +
      `thumbnail_url = excluded.thumbnail_url, teacher_name = excluded.teacher_name, position = excluded.position;`,
  );
  for (const lesson of lessons.filter((l) => l.course_id === id && l.video_url)) {
    statements.push(
      `insert into itera.video_lessons (id, course_id, title, description, video_url, duration_seconds, position) values (` +
        `${q(lesson.id)}, ${q(id)}, ${q(lesson.title)}, ${text(lesson.description)}, ${q(lesson.video_url)}, ` +
        `${Math.round(Number(lesson.duration) || 0)}, ${Number(lesson.position) || 0}) ` +
        `on conflict (id) do update set course_id = excluded.course_id, title = excluded.title, description = excluded.description, ` +
        `video_url = excluded.video_url, duration_seconds = excluded.duration_seconds, position = excluded.position;`,
    );
  }
}

const sql = `begin;\n${statements.join('\n')}\ncommit;\n`;
execFileSync('psql', [DB_URL, '-v', 'ON_ERROR_STOP=1', '-q', '-f', '-'], {
  input: sql,
  env: { ...process.env, PGPASSWORD: process.env.HACKATHON_DB_PASSWORD },
  stdio: ['pipe', 'inherit', 'inherit'],
});
console.log(`seeded ${selected.length} courses`);
