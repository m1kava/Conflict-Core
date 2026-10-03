/**
 * Browser smoke test: opens the game in headless Chromium (WebGL via SwiftShader), starts a match against
 * the AI, issues a few commands and saves screenshots. Usage: node scripts/smoke.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:8080';
const out = process.argv[3] ?? 'screenshots';
mkdirSync(out, { recursive: true });
const executablePath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));

const browser = await chromium.launch({ executablePath, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
});

await page.goto(url);
await page.waitForSelector('text=Play vs AI');
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/01-menu.png` });

await page.click('button:has-text("Play vs AI")');
await page.waitForSelector('.hud', { state: 'attached', timeout: 30000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}/02-match-start.png` });

// Select the HQ (screen centre-ish is the base) by clicking the engineer area, then use the API-free path:
// press Space to centre on base, click HQ, queue an engineer.
await page.keyboard.press('Space');
await page.waitForTimeout(600);
const box = await page.locator('#scene').boundingBox();
await page.mouse.click(box.width / 2, box.height / 2);
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/03-selected.png` });

const stats = await page.evaluate(() => document.querySelector('.resource-bar')?.textContent ?? '');
console.log('HUD:', stats);
console.log('Errors:', errors.length ? errors.slice(0, 15).join('\n') : 'none');
await browser.close();
