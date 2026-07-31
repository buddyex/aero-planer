/**
 * Compose portfolio mockups from real screenshots + Russian captions.
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(__dirname, '..', 'package.json'));
const { chromium } = require('playwright-core');

const RAW = path.join(__dirname, '_raw');
const OUT = __dirname;
const EDGE =
  process.env.EDGE_PATH ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const slides = [
  {
    file: 'aero-planer-01-login.png',
    src: 'login.png',
    kicker: 'Авторизация',
    title: 'Вход диспетчера',
    caption:
      'Карточка смены: логин, PIN-код и вход в роль. Тёмная тема Ops Console с акцентом teal.',
    tags: ['RBAC', 'PIN', 'PWA'],
    url: 'aero-planer / вход',
  },
  {
    file: 'aero-planer-02-dashboard.png',
    src: 'dashboard.png',
    kicker: 'Оперативный центр',
    title: 'Дашборд над картой секторов',
    caption:
      'Полноэкранная карта: KPI-лента, статус флота, ближайшие вылеты, риск погоды и очередь утверждений.',
    tags: ['Карта', 'HUD-панели', 'KPI', 'Realtime'],
    url: 'aero-planer / дашборд',
  },
  {
    file: 'aero-planer-03-schedule.png',
    src: 'schedule.png',
    kicker: 'Планирование',
    title: 'Расписание и реестр миссий',
    caption:
      'Диаграмма Ганта с цветом по риску сектора и реестр статусов: к выполнению, утверждение, отмена.',
    tags: ['Гант', 'Риски', 'Реестр'],
    url: 'aero-planer / расписание',
  },
  {
    file: 'aero-planer-04-weather.png',
    src: 'weather.png',
    kicker: 'Метео',
    title: 'Метео-центр',
    caption:
      'Каскад API (CheckWX / NOAA / Open-Meteo), принудительное обновление и ручная корректировка по секторам.',
    tags: ['Погода', 'Матрица рисков', 'Секторы'],
    url: 'aero-planer / метео-центр',
  },
  {
    file: 'aero-planer-05-fleet.png',
    src: 'fleet.png',
    kicker: 'Парк',
    title: 'Управление парком БПЛА',
    caption:
      'Карточки бортов: модель, серийный номер, лимиты ветра, АКБ, полезный груз, налёт и готовность.',
    tags: ['Флот', 'Модели БПЛА'],
    url: 'aero-planer / флот',
  },
  {
    file: 'aero-planer-06-maintenance.png',
    src: 'maintenance.png',
    kicker: 'Обслуживание',
    title: 'Журнал ТО и учёт АКБ',
    caption:
      'Техническое обслуживание парка и склад аккумуляторов с циклами, инспекциями и статусами готовности.',
    tags: ['Журнал ТО', 'Склад АКБ'],
    url: 'aero-planer / журнал то',
  },
  {
    file: 'aero-planer-07-comms.png',
    src: 'comms.png',
    kicker: 'Связь',
    title: 'Терминал связи',
    caption:
      'Внутрисменный чат диспетчеров в выдвижной панели поверх консоли — обмен в реальном времени.',
    tags: ['Чат', 'Realtime'],
    url: 'aero-planer / терминал связи',
  },
];

function toDataUri(filePath) {
  return `data:image/png;base64,${fs.readFileSync(filePath).toString('base64')}`;
}

function slideHtml(slide, imgUri) {
  const tags = slide.tags.map((t) => `<span class="tag">${t}</span>`).join('');
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap" rel="stylesheet" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 1600px; height: 1000px; overflow: hidden; }
  body {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    background:
      radial-gradient(900px 500px at 12% 0%, rgba(46,196,182,0.14), transparent 60%),
      radial-gradient(700px 420px at 92% 100%, rgba(232,163,23,0.08), transparent 55%),
      #070a0d;
    color: #e8eef4;
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: 16px;
    padding: 32px 40px 28px;
  }
  .top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 24px;
  }
  .kicker {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 12px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #2ec4b6;
    margin-bottom: 8px;
  }
  h1 {
    font-size: 32px;
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 1.15;
  }
  .caption {
    max-width: 780px;
    margin-top: 8px;
    font-size: 15px;
    line-height: 1.45;
    color: #9aa8b5;
  }
  .brand { text-align: right; flex-shrink: 0; padding-top: 4px; }
  .brand-name { font-weight: 700; font-size: 17px; letter-spacing: 0.04em; }
  .brand-name span { color: #2ec4b6; }
  .brand-sub { margin-top: 4px; font-size: 12px; color: #5e6d7a; }
  .frame {
    min-height: 0;
    border-radius: 14px;
    border: 1px solid rgba(154,168,181,0.16);
    background: #0c1218;
    box-shadow: 0 24px 56px rgba(0,0,0,0.5);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .chrome {
    height: 36px;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 0 14px;
    background: #101820;
    border-bottom: 1px solid rgba(154,168,181,0.12);
    flex-shrink: 0;
  }
  .dot { width: 9px; height: 9px; border-radius: 50%; }
  .dot.r { background: #e24b4b; }
  .dot.y { background: #e8a317; }
  .dot.g { background: #3dba74; }
  .url {
    margin-left: 10px;
    flex: 1;
    height: 22px;
    border-radius: 6px;
    background: rgba(12,18,24,0.95);
    border: 1px solid rgba(154,168,181,0.12);
    color: #9aa8b5;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 12px;
    display: flex;
    align-items: center;
    padding: 0 12px;
  }
  .shot-wrap {
    flex: 1;
    min-height: 0;
    background: #0c1218;
    display: flex;
    align-items: stretch;
    justify-content: stretch;
  }
  .shot {
    width: 100%;
    height: 100%;
    object-fit: contain;
    object-position: top center;
    display: block;
  }
  .bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .tags { display: flex; flex-wrap: wrap; gap: 8px; }
  .tag {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 11px;
    letter-spacing: 0.03em;
    color: #2ec4b6;
    border: 1px solid rgba(46,196,182,0.28);
    background: rgba(46,196,182,0.10);
    border-radius: 999px;
    padding: 5px 11px;
  }
  .foot {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 11px;
    color: #5e6d7a;
    letter-spacing: 0.04em;
  }
</style>
</head>
<body>
  <div class="top">
    <div>
      <div class="kicker">${slide.kicker}</div>
      <h1>${slide.title}</h1>
      <p class="caption">${slide.caption}</p>
    </div>
    <div class="brand">
      <div class="brand-name">AERO-<span>PLANER</span></div>
      <div class="brand-sub">АРМ диспетчера БПЛА</div>
    </div>
  </div>
  <div class="frame">
    <div class="chrome">
      <span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>
      <div class="url">${slide.url}</div>
    </div>
    <div class="shot-wrap">
      <img class="shot" src="${imgUri}" alt="${slide.title}" />
    </div>
  </div>
  <div class="bottom">
    <div class="tags">${tags}</div>
    <div class="foot">Скриншот живого интерфейса</div>
  </div>
</body>
</html>`;
}

function heroHtml(uris) {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap" rel="stylesheet" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 1600px; height: 1000px; overflow: hidden; }
  body {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    color: #e8eef4;
    background:
      radial-gradient(1000px 560px at 50% -10%, rgba(46,196,182,0.16), transparent 55%),
      radial-gradient(700px 480px at 100% 100%, rgba(232,163,23,0.08), transparent 50%),
      #070a0d;
    padding: 40px 48px 32px;
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: 22px;
  }
  .head { text-align: center; }
  .mark {
    width: 20px; height: 20px; margin: 0 auto 12px;
    background: #2ec4b6;
    clip-path: polygon(50% 0%, 100% 100%, 0% 100%);
  }
  .name { font-size: 40px; font-weight: 700; letter-spacing: 0.02em; }
  .name span { color: #2ec4b6; }
  .sub { margin-top: 8px; font-size: 16px; color: #9aa8b5; }
  .grid {
    min-height: 0;
    display: grid;
    grid-template-columns: 1.4fr 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    gap: 14px;
  }
  .card {
    border-radius: 12px;
    border: 1px solid rgba(154,168,181,0.16);
    overflow: hidden;
    background: #0c1218;
    box-shadow: 0 16px 36px rgba(0,0,0,0.42);
    position: relative;
  }
  .card.hero { grid-row: 1 / span 2; }
  .card img {
    width: 100%; height: 100%;
    object-fit: cover; object-position: top center;
    display: block;
  }
  .card .label {
    position: absolute; left: 12px; right: 12px; bottom: 12px;
    width: max-content; max-width: calc(100% - 24px);
    font-family: 'IBM Plex Mono', monospace;
    font-size: 12px; font-weight: 600;
    letter-spacing: 0.1em; text-transform: uppercase;
    color: #e8eef4;
    background: rgba(7,10,13,0.82);
    border: 1px solid rgba(46,196,182,0.45);
    border-radius: 8px;
    padding: 8px 12px;
    box-shadow: 0 8px 20px rgba(0,0,0,0.35);
  }
  .foot {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 12px;
    color: #5e6d7a;
    letter-spacing: 0.04em;
  }
  .foot strong { color: #2ec4b6; font-weight: 600; }
</style>
</head>
<body>
  <div class="head">
    <div class="mark"></div>
    <div class="name">AERO-<span>PLANER</span></div>
    <p class="sub">АРМ диспетчера БПЛА · реальные экраны рабочей консоли</p>
  </div>
  <div class="grid">
    <div class="card hero"><img src="${uris.dashboard}" alt="" /><div class="label">Дашборд</div></div>
    <div class="card"><img src="${uris.login}" alt="" /><div class="label">Вход</div></div>
    <div class="card"><img src="${uris.schedule}" alt="" /><div class="label">Расписание</div></div>
    <div class="card"><img src="${uris.fleet}" alt="" /><div class="label">Флот</div></div>
    <div class="card"><img src="${uris.weather}" alt="" /><div class="label">Метео-центр</div></div>
  </div>
  <div class="foot">
    <span>Обложка портфолио · живые скриншоты</span>
    <span><strong>React · Express · MySQL · Socket.io</strong></span>
  </div>
</body>
</html>`;
}

async function renderHtml(browser, html, outPath) {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1,
  });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.screenshot({ path: outPath, type: 'png', animations: 'disabled' });
  await page.close();
  console.log('wrote', outPath);
}

async function main() {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });

  for (const slide of slides) {
    const srcPath = path.join(RAW, slide.src);
    if (!fs.existsSync(srcPath)) {
      console.warn('skip missing', slide.src);
      continue;
    }
    await renderHtml(browser, slideHtml(slide, toDataUri(srcPath)), path.join(OUT, slide.file));
  }

  await renderHtml(
    browser,
    heroHtml({
      dashboard: toDataUri(path.join(RAW, 'dashboard.png')),
      login: toDataUri(path.join(RAW, 'login.png')),
      schedule: toDataUri(path.join(RAW, 'schedule.png')),
      fleet: toDataUri(path.join(RAW, 'fleet.png')),
      weather: toDataUri(path.join(RAW, 'weather.png')),
    }),
    path.join(OUT, 'aero-planer-00-hero.png'),
  );

  await browser.close();
  console.log('all done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
