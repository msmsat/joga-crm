# Деплой Velora CRM

Три контейнера: `db` (Postgres) → `api` (uvicorn) → `web` (Caddy: отдаёт фронт, проксирует `/api` в бэкенд и сам держит HTTPS).

---

## Первый запуск на сервере

```bash
# 1. Docker
curl -fsSL https://get.docker.com | sh

# 2. Код
git clone https://github.com/msmsat/joga-crm.git && cd joga-crm

# 3. Конфиг (в git его нет — копируется руками)
cp .env.example .env && nano .env
```

Заполнить `.env`:

| Переменная | Значение |
|---|---|
| `POSTGRES_PASSWORD` | `openssl rand -base64 24` |
| `SITE_ADDRESS` | `crm.твойдомен` — Caddy сам выпустит сертификат |
| `VITE_GOOGLE_CLIENT_ID` | тот же, что в `front/.env` |
| `TUNNEL_TOKEN` | пусто (нужен только для запуска с домашнего ПК) |

Затем скопировать со своей машины `back/.env` — там все ключи приложения, в git их нет:

```bash
scp back/.env user@сервер:~/joga-crm/back/.env
```

В нём заменить localhost на боевой домен: `WEB_APP_URL`, `BACKEND_URL`, `GOOGLE_CALENDAR_REDIRECT_URI`, `IG_REDIRECT_URI`, `WA_REDIRECT_URI` (все через `/api`, например `https://crm.твойдомен/api/ai/instagram/callback`). Те же адреса прописать в консолях Google / Meta / Stripe.

**`SECRET_KEY` сгенерировать новый, дев-овский не тащить:**
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

A-запись `crm` → IP сервера. Запуск:

```bash
docker compose up -d --build
```

Первый билд 5–10 минут. Миграции накатываются сами при старте контейнера.

---

## Обновление кода

```bash
git pull && docker compose up -d --build
```

База, загруженные файлы и сертификаты не трогаются — они в именованных томах Docker, отдельно от кода. Простой 2–5 секунд.

---

## Бэкап базы

Перед крупным обновлением:

```bash
docker compose exec -T db pg_dump -U velora velora | gzip > backup-$(date +%F).sql.gz
```

Восстановление:

```bash
gunzip -c backup-2026-08-05.sql.gz | docker compose exec -T db psql -U velora velora
```

Загруженные файлы (логотипы, фото):

```bash
docker compose cp api:/app/static ./static-backup
```

---

## Чего НЕ делать

| Команда | Что случится |
|---|---|
| `docker compose down -v` | **флаг `-v` удаляет тома — база и все загрузки в ноль.** Без `-v` безопасно |
| `git checkout .` / `git reset --hard` | сотрёт незакоммиченные правки конфигов на сервере |
| `docker system prune -a --volumes` | то же, что `down -v`, только по всей машине |

Остановить без потерь: `docker compose down`. Перезапустить: `docker compose up -d`.

---

## Если что-то не работает

```bash
docker compose ps              # кто упал
docker compose logs -f api     # логи бэкенда (миграции, ошибки старта)
docker compose logs -f web     # Caddy: выпуск сертификата
docker compose logs -f db
```

Частое:
- **502 на сайте** — не поднялся `api`, смотри его логи (обычно упавшая миграция или отсутствующий `SECRET_KEY`).
- **Нет HTTPS** — `SITE_ADDRESS` не домен, либо A-запись ещё не разошлась, либо 80/443 закрыты фаерволом.
- **Вход через Google не работает** — домен не добавлен в Authorized JavaScript origins в Google Cloud Console.

---

## Локальная проверка (Windows)

Требует WSL2 — без него движок Docker Desktop не стартует:

```powershell
wsl --install   # от администратора, затем перезагрузка
```

Потом `docker compose up -d --build` и `http://localhost` (`SITE_ADDRESS` оставить пустым — локально HTTPS не нужен).

Для повседневной разработки Docker не нужен, есть `.\dev.ps1` — там живой hot-reload.
