FROM python:3.14-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# База «IP → страна» для языка сайта по стране посетителя (services/geo_locale.py).
# Качается на каждой сборке, поэтому обновляется вместе с деплоем. Не скачалась
# (сеть, сайт DB-IP) — образ всё равно собирается: сайт откроется по-английски.
RUN python -m scripts.fetch_geoip || echo "GeoIP: база не скачана, язык по IP не определяется"

# Миграции накатываются на старте: свежая БД поднимается сама, апдейт применяет
# новые ревизии. Воркер ОДИН намеренно — в lifespan висят фоновые циклы
# (scenario_runner, daily_notify), при --workers N они запустятся N раз.
CMD ["sh", "-c", "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 8000"]
