// Approval sheet: old SVG doodles vs the painted layers, composited with the same CSS geometry as TeraOutfit.
//   node design-playground/tera-outfits/sheet.mjs <old-outfits.ts from git> <out.png>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [oldPath, outPath = '/tmp/hk/art/outfits-v2.png'] = process.argv.slice(2);
const { chromium } = await import(pathToFileURL(path.join(root, 'node_modules/playwright/index.mjs')).href);
const faces = await import(pathToFileURL(path.join(root, 'packages/activities/src/kinds/scene/guideFaces.ts')).href);
const old = oldPath ? await import(pathToFileURL(path.resolve(oldPath)).href) : null;
const FACE = { neutral: faces.GUIDE_FACE_NEUTRAL, happy: faces.GUIDE_FACE_HAPPY, oops: faces.GUIDE_FACE_OOPS };
const layer = (name) => {
  const file = path.join(root, 'public/mascot/outfits', name);
  return fs.existsSync(file) ? `data:image/webp;base64,${fs.readFileSync(file).toString('base64')}` : null;
};
const front = (key, mood) => layer(`${key}-front-${mood}.webp`) ?? layer(`${key}-front.webp`);

function tera(size, mood, inner) {
  return `<span class="tera" style="width:${size}px;height:${size}px">${inner.back ?? ''}<img class="face" src="${FACE[mood]}">${inner.front ?? ''}</span>`;
}
function oldTera(size, mood, key) {
  const shapes = old.OUTFITS[key]
    .map((s) => `<path d="${s.d}" fill="${s.fill ?? 'none'}" fill-opacity="${s.fillOpacity ?? 1}" stroke="${s.stroke ?? 'none'}" stroke-width="${s.strokeWidth ?? 0}" stroke-opacity="${s.strokeOpacity ?? 1}" stroke-linecap="round" stroke-linejoin="round" transform="${s.transform ?? ''}"/>`)
    .join('');
  const halo = size < 60 ? 0.75 : 1;
  return tera(size, mood, { front: `<svg class="old" viewBox="0 0 240 368" style="filter:drop-shadow(0 0 ${halo}px #0A0908) drop-shadow(0 0 ${halo}px #0A0908)">${shapes}</svg>` });
}
function newTera(size, mood, key) {
  const back = layer(`${key}-back.webp`);
  return tera(size, mood, { back: back ? `<img class="layer" src="${back}">` : '', front: `<img class="layer" src="${front(key, mood)}">` });
}

const rows = [
  ['outfit_glasses', 'Glasses'],
  ['outfit_headphones', 'Headphones'],
  ['outfit_crown', 'Crown'],
  ['outfit_laurel', 'Golden laurel · legendary · NEW'],
];
const cell = (html) => `<td>${html}</td>`;
const body = rows
  .map(([key, label]) => {
    const has = old && old.OUTFITS[key];
    const before = ['neutral', 'happy'].map((m) => cell(has ? oldTera(200, m, key) : '<span class="none">new item</span>')).join('') + cell(has ? oldTera(48, 'neutral', key) : '');
    const after = ['neutral', 'happy', 'oops'].map((m) => cell(newTera(200, m, key))).join('') + cell(newTera(96, 'neutral', key)) + cell(newTera(48, 'neutral', key)) + cell(newTera(32, 'neutral', key));
    return `<tr><th>${label}<br><code>${key}</code></th>${before}<td class="gap"></td>${after}</tr>`;
  })
  .join('');
const html = `<style>
body{margin:0;background:#0A0908;color:#F4EDE2;font:600 14px Inter,system-ui,sans-serif}
table{border-collapse:collapse;margin:24px}
td{padding:150px 26px 34px;vertical-align:bottom;text-align:center;background:#0F0D0B;border-bottom:8px solid #0A0908}
th{padding:0 20px;text-align:left;width:150px}code{font:500 11px monospace;color:#A0978A}
thead td{padding:10px;background:none;color:#A0978A;font-size:12px;letter-spacing:.08em;text-transform:uppercase}
.gap{background:#0A0908;padding:0 10px}.none{color:#544e46}
.tera{position:relative;display:inline-block}
.tera img.face{position:absolute;left:0;bottom:0;width:100%;filter:drop-shadow(0 8px 16px rgba(63,209,127,.35))}
.tera svg.old{position:absolute;left:0;bottom:0;width:100%;overflow:visible}
.tera img.layer{position:absolute;left:-10%;bottom:-10%;width:120%}
</style><table><thead><tr><td></td><td colspan="3">Before · SVG overlay (neutral, happy, 48px)</td><td></td><td colspan="6">After · painted layers (neutral, happy, oops · 96, 48, 32px)</td></tr></thead>${body}</table>`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2300, height: 1700 }, deviceScaleFactor: 1 });
await page.setContent(html);
await page.waitForTimeout(500);
await (await page.$('table')).screenshot({ path: outPath });
await browser.close();
console.log(outPath);
