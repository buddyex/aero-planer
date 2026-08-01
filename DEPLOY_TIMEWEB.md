# Aero-Planer — деплой на Timeweb Cloud (Ubuntu)

Краткая инструкция для чистого VPS Ubuntu (Timeweb Cloud).  
Локальная разработка — в [README.md](README.md). Дополнительные детали — в [DEPLOY.md](DEPLOY.md).

## 1. Обновление системы

```bash
sudo apt update && sudo apt upgrade -y
```

## 2. Установка ПО

```bash
# Nginx + MySQL
sudo apt install -y nginx mysql-server

# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# PM2
sudo npm i -g pm2
```

Проверка: `node -v`, `nginx -v`, `mysql --version`, `pm2 -v`.

## 3. MySQL

```bash
sudo mysql -e "CREATE DATABASE aero_planer CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
sudo mysql -e "CREATE USER 'aero_planer'@'localhost' IDENTIFIED BY 'STRONG_PASSWORD';"
sudo mysql -e "GRANT ALL ON aero_planer.* TO 'aero_planer'@'localhost';"
sudo mysql -e "FLUSH PRIVILEGES;"
```

Загрузите проект на сервер (git clone или scp), затем:

```bash
cd /path/to/aero-planer
mysql -u aero_planer -p aero_planer < schema.sql
cd backend
cp .env.example .env
# Отредактируйте .env: DB_*, JWT_SECRET (≥32 символов), CORS_ORIGIN=https://your-domain.ru
npm ci
node scripts/seed.js
```

## 4. Backend (PM2)

```bash
cd /path/to/aero-planer/backend
mkdir -p logs
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
# выполните команду, которую выведет pm2 startup
```

API слушает порт **5000** (см. `env_production` в `ecosystem.config.js`).

Полезные команды: `pm2 status`, `pm2 logs aero-planer-api`, `pm2 restart aero-planer-api`.

## 5. Frontend (сборка)

```bash
cd /path/to/aero-planer
cp .env.example .env
# VITE_API_URL=/api  (относительный путь — Nginx проксирует /api)
npm ci
npm run build
```

Сборка попадает в `dist/renderer/`. Скопируйте статику в каталог Nginx:

```bash
sudo mkdir -p /var/www/aero-planer/frontend/dist
sudo cp -r dist/renderer/* /var/www/aero-planer/frontend/dist/
sudo chown -R www-data:www-data /var/www/aero-planer
```

## 6. Nginx

```bash
sudo cp /path/to/aero-planer/deploy/nginx.conf /etc/nginx/sites-available/aero-planer
sudo ln -sf /etc/nginx/sites-available/aero-planer /etc/nginx/sites-enabled/
# Уберите default-сайт при конфликте:
# sudo rm -f /etc/nginx/sites-enabled/default
# Отредактируйте server_name в /etc/nginx/sites-available/aero-planer
sudo nginx -t && sudo systemctl reload nginx
```

Опционально SSL:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.ru
```

## 7. Проверка

| Что | Как |
|-----|-----|
| UI | Откройте `http://your-domain.ru` (или IP VPS) |
| API | `curl -s http://127.0.0.1:5000/api/...` или через Nginx `/api/` |
| WebSocket | После логина в UI статус сокета должен быть connected |
| PM2 | `pm2 status` — процесс `aero-planer-api` online |

Перед продакшеном смените PIN демо-пользователей и задайте сильный `JWT_SECRET`.
