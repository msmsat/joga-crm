"""Конфиг pytest для back/.

Тесты лежат в back/tests, а модули приложения — в back/ (`from database import …`),
поэтому корень проекта добавляется в sys.path: без этого pytest кладёт в путь
только back/tests и сбор падает на ModuleNotFoundError.

Запускать ПОФАЙЛОВО: `pytest tests/test_analytics_team.py`.
Прогон всей папки бьёт по dev-БД и у тестов уведомлений отправляет реальные
письма и сообщения — до эпика N-10 (стабы отправки) это не безопасно.

pytest — dev-зависимость: `pip install -r requirements-dev.txt`.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
