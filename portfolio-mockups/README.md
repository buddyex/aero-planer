# Aero-Planer — мокапы для портфолио

Кадры собраны из **реальных скриншотов** живого UI (`localhost:5173`) + русские подписи.

## Готовые файлы

| Файл | Подпись |
|------|---------|
| `aero-planer-00-hero.png` | Обложка: Дашборд · Вход · Расписание · Флот · Метео |
| `aero-planer-01-login.png` | Вход диспетчера |
| `aero-planer-02-dashboard.png` | Дашборд HUD над картой секторов |
| `aero-planer-03-schedule.png` | Расписание и реестр миссий |
| `aero-planer-04-weather.png` | Метео-центр |
| `aero-planer-05-fleet.png` | Управление парком БПЛА |
| `aero-planer-06-maintenance.png` | Журнал ТО и учёт АКБ |
| `aero-planer-07-comms.png` | Терминал связи |

Сырые скрины без рамок: `_raw/`.

## Переснять

Нужны запущенные `npm run dev` (Vite + API) и демо-логин `admin` / `1234`:

```bash
node portfolio-mockups/_capture.mjs
node portfolio-mockups/_compose.mjs
```

Файлы `aero-planer-design-*.png` — старые концепты, не live UI.
