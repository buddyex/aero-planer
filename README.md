# Aero-Planer

**АРМ диспетчера БПЛА** — веб-приложение (PWA) для планирования миссий, управления флотом дронов и контроля погодных рисков.

## Стек

| Компонент | Технология |
|-----------|------------|
| Клиент | React + TypeScript + Vite (PWA) |
| Сервер | Express + Socket.io |
| БД | MySQL 8 (триггеры, ограничения целостности) |

## Требования

- **Node.js 20+**
- **MySQL 8**

## Быстрый старт

```bash
# 1. Зависимости
npm install
cd backend && npm install && cd ..

# 2. База данных (PowerShell — через Node, не через `< schema.sql`)
cd backend
copy .env.example .env
# Укажите DB_PASSWORD в .env — пароль MySQL root
npm run setup-db
cd ..

# 3. Запуск (фронт + API)
npm run dev:full
```

- UI: http://localhost:5173  
- API: http://localhost:3001/api  

## Скрипты

| Команда | Описание |
|---------|----------|
| `npm run dev` | Только фронтенд (Vite) |
| `npm run dev:server` | Только backend |
| `npm run dev:full` | Фронт + backend одновременно |
| `npm run build` | Production-сборка |
| `npm test` | Unit-тесты |

## Деплой

См. [DEPLOY.md](DEPLOY.md) — nginx + PM2 + MySQL + SSL на Ubuntu VPS.
