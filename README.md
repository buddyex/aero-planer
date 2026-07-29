# Aero-Planer

### АРМ диспетчера БПЛА · Ops Console

Полноценное **автоматизированное рабочее место** для планирования полётов беспилотников: миссии, флот, погодные риски, ТО и оперативная связь команды — в одном PWA-интерфейсе с серверной бизнес-логикой в MySQL.

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![MySQL](https://img.shields.io/badge/MySQL-8-4479A1?logo=mysql&logoColor=white)](https://www.mysql.com/)
[![PWA](https://img.shields.io/badge/PWA-ready-5A0FC8)](./public/manifest.json)
[![Socket.io](https://img.shields.io/badge/Socket.io-realtime-010101?logo=socketdotio&logoColor=white)](https://socket.io/)

> Дипломный / портфолио-проект АСОИУ: от схемы БД с триггерами до HUD-дашборда диспетчера.  
> Локальный запуск — ниже; деплой на VPS — опционально, см. [DEPLOY.md](DEPLOY.md).

---

## Зачем этот проект

Диспетчеру БПЛА нужно одновременно видеть карту секторов, готовность флота, очередь согласований и погодный риск — без переключения между разрозненными таблицами и мессенджерами.

**Aero-Planer** решает это как единый ops-контур:

| Проблема | Решение в системе |
|----------|-------------------|
| Рассинхрон статусов миссии / дрона / оператора | Триггеры и CHECK в MySQL — источник истины на стороне БД |
| Слепые зоны по погоде | Каскад Weather API + матрица рисков по секторам |
| Перегрузка UI | HUD-дашборд поверх карты: KPI, очередь миссий, согласования |
| Права «на глаз» | RBAC: Администратор · Руководитель · Техник · Оператор |
| Работа без стабильной сети | PWA + кэш оболочки + офлайн-баннеры метео |

---

## Возможности

### Ops Console (HUD)
- Карта секторов (Leaflet) как фон рабочей смены
- Оперативные KPI: готовность флота, в воздухе, ТО, активные миссии
- Ближайшие вылеты и очередь согласований для руководителя
- Адаптив: desktop-панели + mobile bottom sheet

### Планирование миссий
- Диаграмма Ганта и реестр миссий
- Создание / редактирование маршрута на карте
- Согласование статусов с контролем допустимых переходов
- Формирование полётных листов (PDF)

### Флот и ТО
- Учёт дронов, моделей, привязки к секторам
- Журнал ТО и контроль износа / налёта
- Автоблокировка аппарата при превышении лимита (логика в БД)

### Погода и риски
- Каскад источников: **CheckWX → NOAA → Open-Meteo**
- Ручной ввод метеоданных (по роли)
- Матрица рисков и графики по секторам

### Comms
- Внутренний чат команды в реальном времени (Socket.io)
- Toast-уведомления о сообщениях и сменах статусов

---

## Стек

| Слой | Технологии |
|------|------------|
| **Frontend** | React 19, TypeScript, Vite 7, Tailwind CSS 4, Framer Motion, Leaflet, Chart.js / Recharts, PWA |
| **Backend** | Node.js 20+, Express 5, Socket.io, JWT |
| **БД** | MySQL 8 — CHECK, FOREIGN KEY, триггеры целостности |
| **Деплой** | Ubuntu VPS: PM2 + Nginx (+ SSL) — [DEPLOY.md](DEPLOY.md) |

### Архитектурные принципы

1. **Бизнес-правила — в MySQL.** Валидация миссий, переходы статусов, расчёт риска сектора, накопление налёта и автоблокировка дрона реализованы триггерами в [`schema.sql`](schema.sql), затем дублируются сервисным слоем backend.
2. **Клиент тонкий.** UI-настройки (тема) — в `localStorage`; данные — через REST + WebSocket, адаптер [`HttpDataApi`](src/adapters/HttpDataApi.ts).
3. **RBAC синхронизирован.** Права на фронте ([`permissions.ts`](src/renderer/utils/permissions.ts)) и бэке ([`rbac.js`](backend/src/lib/rbac.js)) совпадают по ролям.

```
┌─────────────┐     REST / WS      ┌──────────────┐     SQL      ┌──────────┐
│  React PWA  │ ◄────────────────► │  Express API │ ◄──────────► │  MySQL 8 │
│  Ops Console│     Socket.io      │  + JWT/RBAC  │   triggers   │  schema  │
└─────────────┘                    └──────────────┘              └──────────┘
```

---

## Демо-вход (после setup-db)

| Логин | PIN | Роль |
|-------|-----|------|
| `admin` | `1234` | Администратор |
| `head1` | `4444` | Руководитель |
| `tech1` | `3333` | Техник |
| `operator1` | `1111` | Оператор |

UI: http://localhost:5173 · API: http://localhost:3001/api

---

## Быстрый старт

### Требования

| Компонент | Версия |
|-----------|--------|
| [Node.js](https://nodejs.org/) | 20 LTS+ |
| [MySQL](https://dev.mysql.com/downloads/installer/) | 8.0+ |
| Git | актуальный |

```powershell
node -v
npm -v
mysql --version
```

Служба MySQL должна быть запущена (`MySQL80` на Windows), иначе backend не стартует (`ECONNREFUSED 127.0.0.1:3306`).

### Установка и запуск

```bash
git clone https://github.com/buddyex/aero-planer.git
cd aero-planer

npm install
cd backend && npm install && cd ..

cd backend
copy .env.example .env   # Linux/macOS: cp .env.example .env
# Задайте DB_PASSWORD в backend/.env
npm run setup-db
cd ..

npm run dev:full
```

Минимум в `backend/.env`:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=ваш_пароль_mysql
DB_NAME=aero_planer
```

> **Windows:** не используйте `mysql < schema.sql` в PowerShell — применяйте `npm run setup-db`.

Опционально для CheckWX:

```env
CHECKWX_API_KEY=ваш_ключ
```

Без ключа система переключается на NOAA / Open-Meteo.

---

## Структура репозитория

```
aero-planer/
├── src/renderer/          # React UI: dashboard HUD, schedule, fleet, weather, chat
├── src/adapters/          # HttpDataApi — слой доступа к API
├── backend/               # Express + Socket.io + RBAC
│   ├── .env.example
│   └── scripts/           # init-db, seed, миграции
├── public/                # PWA manifest, service worker, иконки
├── schema.sql             # таблицы + триггеры целостности
├── README.md
└── DEPLOY.md
```

### npm-скрипты

| Команда | Описание |
|---------|----------|
| `npm run dev` / `dev:full` | Фронт + API |
| `npm run build` | Production-сборка UI |
| `npm test` | Unit-тесты |
| `cd backend && npm run setup-db` | Схема + демо-данные |
| `cd backend && npm run migrate:wear` | Миграция износа на существующей БД |

---

## Целостность данных (highlight для ревью)

Критические инварианты не «доверяются» UI:

| Триггер / механизм | Назначение |
|--------------------|------------|
| `trg_check_mission_before_insert` | Допустимость создания миссии |
| `trg_validate_mission_status_transition` | Легальные переходы статусов |
| `trg_auto_calculate_sector_risk` | Риск сектора по погоде |
| `trg_accumulate_flight_hours_on_complete` | Налёт после завершения |
| `trg_auto_block_drone_on_flight_hours` | Автоблокировка по лимиту |

Полная схема — [`schema.sql`](schema.sql).

---

## Частые проблемы

| Симптом | Что проверить |
|---------|----------------|
| `ECONNREFUSED 127.0.0.1:3306` | Служба MySQL, `DB_HOST` / `DB_PORT` |
| `Access denied` | `DB_PASSWORD` в `backend/.env` |
| Backend сразу падает | Лог `[MySQL]` — без БД API намеренно не стартует |
| Метео «молчит» | Без CheckWX-ключа работают NOAA / Open-Meteo; смотрите офлайн-баннер |

---

## Лицензия и статус

Учебный / портфолио-проект. Код открыт для демонстрации архитектуры АРМ и стека full-stack.

**Репозиторий:** [github.com/buddyex/aero-planer](https://github.com/buddyex/aero-planer)
