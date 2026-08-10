# Деплой Velora CRM

Три контейнера: `db` (Postgres) → `api` (uvicorn) → `web` (Caddy: отдаёт фронт, проксирует `/api` в бэкенд и сам держит HTTPS).

---

## Требования к серверу

Минимум **1 GB RAM + 2 GB swap**, 15 GB диска. Бесплатные машины (GCP `e2-micro`,
AWS `t2.micro`) — ровно 1 GB без swap, и на них `npm ci` + `vite build` падают с
OOM: сборка фронта одна съедает больше гигабайта. Swap добавляется один раз и
решает проблему целиком:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab   # переживёт ребут
free -h
```

Альтернатива, если swap добавить нельзя: собрать образы на своей машине и
залить в реестр, а на сервере делать только `docker compose up -d`.

---

## Первый запуск на сервере

```bash
# 1. Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker   # чтобы не писать sudo каждый раз

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
docker compose exec api python -m scripts.preflight   # валюта, ключи Stripe, вебхуки, SMTP
```

Первый билд 5–10 минут. Миграции накатываются сами при старте контейнера.

**Клиентское мини-приложение собирается на хосте, не в образе:** `cd miniapp && npm ci && npm run build`. Контейнер `api` монтирует готовый `miniapp/dist` и раздаёт его по `/s/{studio_id}` — нет папки, нет мини-апа (API при этом работает). Пересобирать образ после правок мини-апа не нужно, достаточно `npm run build`.

---

## Обновление кода

```bash
git pull && docker compose up -d --build && docker compose exec api python -m scripts.preflight
```

**`back/.env` в git нет — `git pull` его НЕ обновляет.** Пул принёс новые переменные
или сменил значение в `.env.example` — правь `back/.env` на сервере руками. Preflight
для того и стоит в команде: он ловит именно расхождение конфига с кодом (выход 1 = блокер).

**Поправил `back/.env` — нужен `up -d --force-recreate api`, а НЕ `restart`.**
`docker compose restart` перезапускает существующий контейнер с окружением, вшитым
в него при создании; `env_file` он не перечитывает. Симптом обманчивый: `grep` в
`.env` показывает новое значение, а приложение живёт со старым.

```bash
docker compose up -d --force-recreate api
```

База, загруженные файлы и сертификаты не трогаются — они в именованных томах Docker, отдельно от кода. Простой 2–5 секунд.

---

## Бэкап базы

### Автоматический (ставится один раз)

`backup.sh` в корне репозитория: дамп в `~/velora-backups`, ротация 14 дней. Сначала
прогнать руками — cron не место для первой попытки:

```bash
chmod +x backup.sh
./backup.sh                      # должно напечатать «бэкап ок: …»
```

Потом в cron, ежедневно в 03:00:

```bash
(crontab -l 2>/dev/null; echo "0 3 * * * $HOME/joga-crm/backup.sh >> $HOME/velora-backup.log 2>&1") | crontab -
crontab -l                       # проверить, что строка одна
```

Скрипт защищён от тихих провалов: пустой дамп не подменяет вчерашний, ротация
идёт только после успешной записи, падение `pg_dump` не маскируется кодом `gzip`.
Раз в месяц стоит заглядывать в `~/velora-backup.log` и проверять восстановление —
бэкап, который никто не разворачивал, бэкапом не является.

Настройки через переменные окружения: `VELORA_BACKUP_DIR`, `VELORA_BACKUP_KEEP_DAYS`.

**Копии лежат на том же диске, что и база.** Они переживают `down -v`, порчу тома и
неудачную миграцию, но не отказ диска. Off-site — добавить `gcloud storage cp` в конец
скрипта (в скрипте помечено комментарием).

### Разовый, перед крупным обновлением

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
- **Тарифы в чужой валюте (`Kč39` вместо `39 €`)** — в `back/.env` на сервере остался старый `BILLING_CURRENCY=czk`. Цены (39/99/239) приходят из кода, валюта — из env, поэтому расходятся молча. Это не косметика: Stripe заведёт Price на 39 Kč вместо 39 €, а оплата по IBAN отвалится (переводы в CZK Stripe не делает). Лечится `BILLING_CURRENCY=eur` + `up -d --force-recreate api`.
- **Preflight ругается на `static/terms.html` / `privacy.html`** — том `static_data` наполняется из образа только при первом монтировании, на уже живом сервере новые файлы туда сами не попадут. Долить руками:
  ```bash
  docker compose cp back/static/terms.html   api:/app/static/terms.html
  docker compose cp back/static/privacy.html api:/app/static/privacy.html
  ```

---

## Локальная проверка (Windows)

Требует WSL2 — без него движок Docker Desktop не стартует:

```powershell
wsl --install   # от администратора, затем перезагрузка
```

Потом `docker compose up -d --build` и `http://localhost` (`SITE_ADDRESS` оставить пустым — локально HTTPS не нужен).

Для повседневной разработки Docker не нужен, есть `.\dev.ps1` — там живой hot-reload.
