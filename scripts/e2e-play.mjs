/**
 * End-to-end gameplay check through the real UI in headless Chromium: starts a match vs the AI, selects the
 * engineer, builds structures with hotkeys + mouse placement, trains units and captures screenshots.
 * Usage: node scripts/e2e-play.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const url = (process.argv[2] ?? 'http://localhost:8080') + '/?debug';
const out = process.argv[3] ?? 'screenshots';
mkdirSync(out, { recursive: true });
const executablePath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
const browser = await chromium.launch({ executablePath, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => { errors.push(`pageerror: ${e.message}`); console.log('PAGEERROR', e.message, e.stack?.split('\n').slice(0, 4).join(' | ')); });
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
page.on('websocket', (ws) => ws.on('framesent', (f) => typeof f.payload === 'string' && f.payload.includes('"command"') && console.log('  sent', f.payload.slice(0, 160))));

const api = (fn, arg) => page.evaluate(([source, a]) => new Function('api', 'arg', `return (${source})(api, arg)`)(window.__conflict, a), [fn.toString(), arg]);
const own = async (defId) => (await api((a) => a.entities().filter((e) => e.owner === a.slot))).filter((e) => !defId || e.defId === defId);
const credits = async () => (await api((a) => a.privateState()))?.credits;
const step = (text) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${text}`);

/** Waits until the client has rendered a few more frames (software rendering in CI can be slow). */
async function frames(count = 3) {
  const start = await api((a) => a.frame());
  await page.waitForFunction((target) => window.__conflict.frame() >= target, start + count, { timeout: 30000 });
}

async function clickEntity(entity) {
  await api((a, p) => a.focus(p.x, p.y), entity);
  await frames();
  const [fresh] = (await own()).filter((e) => e.id === entity.id);
  await page.mouse.click(fresh.screen.x, fresh.screen.y);
  await page.waitForTimeout(250);
}

async function placeStructure(hotkey, x, y) {
  const engineer = (await own('halcyon_engineer'))[0];
  await clickEntity(engineer);
  await page.keyboard.press(`Key${hotkey}`);
  await api((a, p) => a.focus(p.x, p.y), { x, y });
  await frames();
  const screen = await api((a, p) => a.screenOf(p.x, p.y), { x, y });
  await page.mouse.move(screen.x, screen.y);
  await frames(2);
  await page.mouse.click(screen.x, screen.y);
}

await page.goto(url);
await page.click('button:has-text("EASY")');
await page.click('button:has-text("Play vs AI")');
await page.waitForFunction(() => window.__conflict && window.__conflict.entities().some((e) => e.defId === 'halcyon_engineer'), null, { timeout: 30000 });
await page.waitForTimeout(1500);
const hq = (await own('halcyon_hq'))[0];
const toCentre = Math.atan2(160 - hq.y, 160 - hq.x);
const side = (angle, distance) => ({ x: hq.x + Math.cos(toCentre + angle) * distance, y: hq.y + Math.sin(toCentre + angle) * distance });
step(`HQ at ${hq.x.toFixed(0)},${hq.y.toFixed(0)}; credits ${await credits()}`);

const plant = side(Math.PI * 0.75, 22);
await placeStructure('P', plant.x, plant.y);
step(`Ordered Power Plant; credits ${await credits()}`);
await page.waitForTimeout(4000);
await page.screenshot({ path: `${out}/10-constructing.png` });
await page.waitForFunction(() => window.__conflict.entities().some((e) => e.defId === 'halcyon_power_plant' && (e.flags & 2)), null, { timeout: 40000 });
step(`Power Plant complete; credits ${await credits()}; power ${JSON.stringify((({ powerProduced, powerUsed }) => ({ powerProduced, powerUsed }))(await api((a) => a.privateState())))}`);

const depot = side(-Math.PI * 0.75, 24);
await placeStructure('D', depot.x, depot.y);
step('Ordered Supply Depot');
await page.waitForFunction(() => window.__conflict.entities().some((e) => e.defId === 'halcyon_supply_truck'), null, { timeout: 60000 });
step(`Depot complete, truck delivered; credits ${await credits()}`);

await clickEntity((await own('halcyon_hq'))[0]);
await page.keyboard.press('KeyE');
await page.waitForTimeout(500);
step(`Queued engineer at HQ; credits ${await credits()}`);
await page.screenshot({ path: `${out}/11-base.png` });

await page.waitForTimeout(12000);
const engineers = await own('halcyon_engineer');
step(`Engineers now: ${engineers.length}; credits ${await credits()}`);
await api((a, p) => a.focus(p.x, p.y), side(0, 30));
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/12-overview.png` });

console.log(errors.length ? `ERRORS:\n${errors.slice(0, 10).join('\n')}` : 'No browser errors.');
await browser.close();
