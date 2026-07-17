import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 720, height: 1100 } });
const url = 'http://localhost:6006/iframe.html?id=organisms-activities-sandboxscenario--vague-ask&viewMode=story';
await p.goto(url, { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
await p.screenshot({ path: '/tmp/sbx-student.png', fullPage: true });
await b.close();
console.log('done');
