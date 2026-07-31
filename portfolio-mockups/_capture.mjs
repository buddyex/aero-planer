/**
 * Capture live Aero-Planer screens for portfolio.
 * Sidebar is docked (not overlay) so content stays fully visible.
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(__dirname, '..', 'package.json'));
const { chromium } = require('playwright-core');

const OUT = path.join(__dirname, '_raw');
const BASE = 'http://127.0.0.1:5173';
const API = 'http://127.0.0.1:3001';
const EDGE =
  process.env.EDGE_PATH ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

fs.mkdirSync(OUT, { recursive: true });

/** Dock slide-over sidebar so portfolio shots show nav + full content. */
const DOCK_SIDEBAR_CSS = `
  .sidebar {
    position: relative !important;
    top: auto !important;
    left: auto !important;
    bottom: auto !important;
    transform: none !important;
    flex-shrink: 0 !important;
    height: 100% !important;
    z-index: 2 !important;
  }
  .app-layout__backdrop { display: none !important; }
  body { overflow: hidden !important; }
`;

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function apiLogin() {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'admin', pin: '1234' }),
  });
  const json = await res.json();
  if (!json.ok || !json.access_token) {
    throw new Error(`Login failed: ${JSON.stringify(json)}`);
  }
  return json;
}

async function seedAuth(context, auth) {
  await context.addInitScript(
    ({ user, token }) => {
      sessionStorage.setItem('aero-planer-access-token', token);
      sessionStorage.setItem(
        'aero-planer-session',
        JSON.stringify({ user, shiftStartTime: new Date().toISOString() }),
      );
      localStorage.setItem('aero-planer-theme', 'dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    },
    { user: auth.data, token: auth.access_token },
  );
}

async function preparePage(page, { dockSidebar = false } = {}) {
  if (dockSidebar) {
    await page.addStyleTag({ content: DOCK_SIDEBAR_CSS });
    // Force open class so active link styles apply
    await page.evaluate(() => {
      const side = document.querySelector('.sidebar');
      if (side) {
        side.classList.add('sidebar--open');
        side.classList.remove('sidebar--closed');
      }
    });
  }
}

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false, animations: 'disabled' });
  console.log('saved', file);
}

async function main() {
  const auth = await apiLogin();
  console.log('API login ok');

  const browser = await chromium.launch({
    executablePath: EDGE,
    headless: true,
    args: ['--disable-gpu', '--hide-scrollbars'],
  });

  // —— Login (no auth) ——
  {
    const ctx = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      deviceScaleFactor: 1,
      colorScheme: 'dark',
    });
    await ctx.addInitScript(() => {
      localStorage.setItem('aero-planer-theme', 'dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 60000 });
    await wait(1500);
    await shot(page, 'login');
    await ctx.close();
  }

  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
  });
  await seedAuth(context, auth);
  const page = await context.newPage();

  // —— Dashboard HUD (no sidebar — map needs full width) ——
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 });
  await wait(4500);
  await page.evaluate(() => {
    document.querySelectorAll('.leaflet-control-attribution').forEach((el) => {
      el.style.display = 'none';
    });
  });
  await shot(page, 'dashboard');

  // —— Pages with docked sidebar ——
  const withNav = [
    { name: 'schedule', url: `${BASE}/schedule`, waitMs: 2200 },
    { name: 'weather', url: `${BASE}/weather`, waitMs: 2200 },
    { name: 'fleet', url: `${BASE}/fleet`, waitMs: 2000 },
    { name: 'maintenance', url: `${BASE}/maintenance`, waitMs: 1800, battery: true },
  ];

  for (const item of withNav) {
    await page.goto(item.url, { waitUntil: 'networkidle', timeout: 60000 });
    await wait(item.waitMs);
    await preparePage(page, { dockSidebar: true });

    if (item.battery) {
      const tab = page.locator('.maintenance-journal__tab', { hasText: 'Учёт АКБ' });
      if (await tab.count()) {
        await tab.click();
        await wait(900);
        await preparePage(page, { dockSidebar: true });
      }
    }

    await wait(300);
    await shot(page, item.name);
  }

  // —— Comms drawer over dashboard ——
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 });
  await wait(3500);
  await page.evaluate(() => {
    document.querySelectorAll('.leaflet-control-attribution').forEach((el) => {
      el.style.display = 'none';
    });
  });
  try {
    await page.getByRole('button', { name: /терминал связи/i }).click({ timeout: 4000 });
  } catch {
    await page.locator('button[title="Терминал связи"]').click({ timeout: 4000 });
  }
  await wait(700);
  try {
    await page.getByText('Петров К.В.').first().click({ timeout: 2500 });
    await wait(600);
  } catch (_) {}
  await shot(page, 'comms');

  await browser.close();
  console.log('done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
