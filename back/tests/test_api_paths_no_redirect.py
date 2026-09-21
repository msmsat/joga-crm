"""Пути фронта не должны упираться в 307-редирект FastAPI.

Зачем отдельный тест. `POST /clients` (без слэша) при роуте `/clients/` —
это не «лишний хоп», как кажется локально, а отказ на бою. Фронт и API там
на одном домене, Caddy срезает префикс `/api` и отдаёт бэкенду голый путь;
Starlette строит Location из того, что видит, и получается
`http://veloria.pro/clients/` — без `/api` и по http, потому что uvicorn не
доверяет X-Forwarded-Proto от соседнего контейнера. Браузер на HTTPS-странице
такой редирект не идёт, fetch падает TypeError-ом, и человек читает «Нет связи
с сервером» вместо созданного клиента. Локально (фронт ходит прямо на
localhost:8000) всё зелено — поймать это можно только здесь.

Разбираем только литеральные пути (без `${...}`): их достаточно, именно таким
был `/clients`, а шаблонные всё равно не собрать без выполнения кода.
"""
import re
from pathlib import Path

from main import app

API_DIR = Path(__file__).resolve().parents[2] / "front" / "src" / "api"
CALL_RE = re.compile(r"client\.(get|post|patch|put|delete)<[^>]*>\(\s*'([^'$\n]+)'")


def _flip(path: str) -> str:
    return path.rstrip("/") if path.endswith("/") else path + "/"


def _literal_calls():
    for ts in API_DIR.rglob("*.ts"):
        for m in CALL_RE.finditer(ts.read_text(encoding="utf-8")):
            yield ts.name, m.group(1).upper(), m.group(2).split("?")[0]


def test_frontend_literal_paths_resolve_without_redirect():
    known = {
        (path, method)
        for route in app.routes
        for path in [getattr(route, "path", None)]
        for method in getattr(route, "methods", None) or ()
        if path
    }
    assert known, "маршруты приложения не прочитались — тест бессмыслен"

    calls = list(_literal_calls())
    assert calls, f"в {API_DIR} не нашлось ни одного вызова — сломался разбор"

    # Ловим ровно свой класс: путь не совпал, а со слэшем наоборот — совпал.
    # Путь, которого нет вовсе ни в каком виде, — это честный 404, он виден
    # сразу и на локальной машине; сюда его не приплетаем.
    flipped = [
        f"{file}: {method} {path} → в роутере {_flip(path)}"
        for file, method, path in calls
        if (path, method) not in known and (_flip(path), method) in known
    ]
    assert not flipped, (
        "путь отличается от роута только слэшем — на бою это 307 на http и без "
        "префикса /api, то есть «Нет связи с сервером»: " + "; ".join(flipped)
    )
