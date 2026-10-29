// Renders the PNG icons from brand/logo.svg with Playwright (deterministic: fixed sizes, no antialiasing seeds).
// Playwright is not a dependency of this package; if it is installed globally set NODE_PATH to the global node_modules.
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const master = readFileSync(join(root, 'packages/spec/brand/logo.svg'), 'utf8');
const LIGHT = '#fafafa';
const DARK = '#111113';
const pub = join(root, 'apps/demo/public');
const appicon = join(root, 'native/apple/Demo/KineticDemo/Assets.xcassets/AppIcon.appiconset');
mkdirSync(pub, { recursive: true });
mkdirSync(appicon, { recursive: true });

/** `fraction` is the share of the canvas the 24-unit grid occupies; background null = transparent. */
const jobs = [
  { out: join(pub, 'favicon-32.png'), size: 32, fraction: 1, fg: LIGHT, bg: null },
  { out: join(pub, 'apple-touch-icon.png'), size: 180, fraction: 0.6, fg: LIGHT, bg: DARK },
  { out: join(pub, 'icon-192.png'), size: 192, fraction: 0.6, fg: LIGHT, bg: DARK },
  { out: join(pub, 'icon-512.png'), size: 512, fraction: 0.6, fg: LIGHT, bg: DARK },
  { out: join(pub, 'icon-maskable-512.png'), size: 512, fraction: 0.5, fg: LIGHT, bg: DARK },
  { out: join(appicon, 'AppIcon.png'), size: 1024, fraction: 0.6, fg: DARK, bg: LIGHT },
  { out: join(appicon, 'AppIcon-dark.png'), size: 1024, fraction: 0.6, fg: LIGHT, bg: DARK },
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const j of jobs) {
  const inner = Math.round(j.size * j.fraction);
  const svg = master.replace('<svg ', `<svg style="color:${j.fg}" width="${inner}" height="${inner}" `).replace(/ width="24" height="24"/, '');
  await page.setViewportSize({ width: j.size, height: j.size });
  await page.setContent(
    `<style>html,body{margin:0;height:100%;background:${j.bg ?? 'transparent'};display:grid;place-items:center}svg{display:block}</style>${svg}`,
  );
  await page.screenshot({ path: j.out, omitBackground: j.bg === null });
  console.log('wrote', j.out);
}
await browser.close();
