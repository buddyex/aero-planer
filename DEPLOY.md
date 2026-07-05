# Aero-Planer — деплой на Ubuntu VPS

## Требования

- Ubuntu 22.04+ / 24.04 LTS
- Node.js 20 LTS
- MySQL 8.0+
- nginx
- PM2 (`npm i -g pm2`)
- certbot (опционально, SSL)

## 1. MySQL

```bash
sudo apt update && sudo apt install -y mysql-server
sudo mysql -e "CREATE DATABASE aero_planer CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
sudo mysql -e "CREATE USER 'aero_planer'@'localhost' IDENTIFIED BY 'STRONG_PASSWORD';"
sudo mysql -e "GRANT ALL ON aero_planer.* TO 'aero_planer'@'localhost';"
mysql -u aero_planer -p aero_planer < schema.sql
cd backend && cp .env.example .env
# отредактируйте backend/.env
npm ci && node scripts/seed.js
```

## 2. Backend (Express + Socket.io)

Конфиг PM2 лежит в репозитории: [`backend/ecosystem.config.js`](backend/ecosystem.config.js).

```bash
cd backend
npm ci
cp .env.example .env
# DB_*, JWT_SECRET, CORS_ORIGIN=https://your-domain.ru
mkdir -p logs
pm2 start ecosystem.config.js --env production
pm2 save
```

## 3. Frontend (PWA)

```bash
cd /path/to/project
cp .env.example .env
# VITE_API_URL=https://your-domain.ru/api
# VITE_WS_URL=https://your-domain.ru
npm ci && npm run build
sudo mkdir -p /var/www/aero-planer/dist
sudo cp -r dist/renderer/* /var/www/aero-planer/dist/
```

## 4. nginx

Конфиг Nginx лежит в репозитории: [`deploy/nginx.conf`](deploy/nginx.conf).

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/aero-planer
sudo ln -sf /etc/nginx/sites-available/aero-planer /etc/nginx/sites-enabled/
# отредактируйте server_name в /etc/nginx/sites-available/aero-planer
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d your-domain.ru
```

## 5. Локальная разработка

```bash
# Терминал 1 — API
cd backend && cp .env.example .env && npm run dev

# Терминал 2 — фронтенд
npm run dev

# или одной командой
npm run dev:full
```

Демо-учётные записи (после seed): `admin/1234`, `operator1/1111`, `tech1/3333`, `head1/4444`.

## 6. Миграция из SQLite (опционально)

```bash
cd backend
node scripts/migrate-sqlite-to-mysql.js --sqlite=../database/database.db
```
