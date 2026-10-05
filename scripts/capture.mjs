import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
await mkdir('reports', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-unsafe-webgpu'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  page.on('pageerror', e => console.log('PAGE ERROR', e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log(m.type(), m.text()); });
  await page.goto(process.env.TEST_URL || 'http://127.0.0.1:5218');
  await page.waitForFunction(() => window.coastDiagnostics?.ready || window.coastDiagnostics?.errors.length, null, { timeout: 120000 });
  console.log(await page.evaluate(() => coastDiagnostics));
  if (await page.evaluate(() => coastDiagnostics.ready)) { await page.evaluate(() => coastLab.seek(12)); console.log(await page.evaluate(() => coastLab.inspect())); }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'reports/first-scene.png' });
} finally { await browser.close(); }
