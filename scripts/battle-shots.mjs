/**
 * Captures screenshots of a scripted battle (development servers started with DEV_TOOLS=1 only).
 * Usage: node scripts/battle-shots.mjs [url] [outDir] [units]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:8080';
const out = process.argv[3] ?? 'screenshots';
const units = Number(process.argv[4] ?? 100);
mkdirSync(out, { recursive: true });
const executablePath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
const browser = await chromium.launch({
    executablePath,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}/?debug&battle=${units}`);
await page.waitForFunction(
    () => window.__conflict && window.__conflict.entities().filter((e) => e.defId === 'halcyon_mbt').length > 0,
    null,
    { timeout: 60000 },
);
const shoot = async (name, x, y) => {
    await page.evaluate(([fx, fy]) => window.__conflict.focus(fx, fy), [x, y]);
    const start = await page.evaluate(() => window.__conflict.frame());
    await page.waitForFunction((t) => window.__conflict.frame() >= t, start + 3);
    await page.screenshot({ path: `${out}/${name}.png` });
};
await shoot('20-army', 118, 118);
for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(2500);
    const units = await page.evaluate(() =>
        window.__conflict
            .entities()
            .filter((e) => e.defId.startsWith('halcyon_') && e.owner === window.__conflict.slot && !e.defId.endsWith('hq')),
    );
    if (units.length) {
        const cx = units.reduce((s, u) => s + u.x, 0) / units.length;
        const cy = units.reduce((s, u) => s + u.y, 0) / units.length;
        if (i === 4 || i === 7 || i === 10) await shoot(`2${i}-battle`, cx + 12, cy + 12);
    }
}
console.log(errors.length ? errors.join('\n') : 'No browser errors.');
await browser.close();
