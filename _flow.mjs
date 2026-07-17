import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 720, height: 1000 } });
const base = 'http://localhost:6006/iframe.html?viewMode=story&id=organisms-activities-sandboxscenario--';
async function shot(name){ await p.waitForTimeout(400); await p.screenshot({ path: `/tmp/sbx-${name}.png`, fullPage: true }); }

// c1 vague ask: send -> wait stream -> evaluate
await p.goto(base+'vague-ask', { waitUntil: 'networkidle' });
await p.waitForTimeout(1200);
await p.click('[data-testid="sandbox-send"]');
await p.waitForSelector('[data-testid="sandbox-rate-ruim"]', { timeout: 6000 });
await shot('evaluate');

// done state (reveal story)
await p.goto(base+'revealed-in-live', { waitUntil: 'networkidle' });
await p.waitForTimeout(1200);
await shot('reveal');

// c6 byoc: slots/textareas
await p.goto(base+'bring-your-own-context', { waitUntil: 'networkidle' });
await p.waitForTimeout(1200);
await shot('byoc');
await b.close();
console.log('done');
