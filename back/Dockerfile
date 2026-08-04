FROM python:3.14-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Миграции накатываются на старте: свежая БД поднимается сама, апдейт применяет
# новые ревизии. Воркер ОДИН намеренно — в lifespan висят фоновые циклы
# (scenario_runner, daily_notify), при --workers N они запустятся N раз.
CMD ["sh", "-c", "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 8000"]
