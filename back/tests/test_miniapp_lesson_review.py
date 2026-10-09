"""Отзыв о прошедшем занятии из мини-приложения: оценка, слова и снимки.

Настоящий роутер, JWT и PostgreSQL (обвязка test_miniapp_journey). Проверяется
то, на что опирается карточка «Мои занятия»: снимок грузится отдельно и только
к прошедшему своему занятию, сердечко без слов не стирает написанного раньше,
чужой путь в отзыв не положить, а тренер получает слова целиком и только когда
отзыв действительно изменился.
"""
import asyncio
import os
import re
from datetime import datetime, timedelta, timezone

from httpx import ASGITransport, AsyncClient

from database import async_session_maker
from models import Lesson
from routers.booking import miniapp_lessons as routes
from security import create_access_token
from services.notifier import _render
from test_miniapp_journey import fixture_app, seed

# 1×1 PNG — загрузчик проверяет расширение, а не содержимое.
PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
    "1f15c4890000000d49444154789c6360000002000100e221bc330000000049454e44ae426082"
)
REVIEW_PATH = re.compile(r"^/static/reviews/[0-9a-f]{32}\.png$")


def test_review_with_words_and_photos(monkeypatch):
    async def scenario():
        async with fixture_app(monkeypatch) as (app, _capture, state):
            ids = state["ids"] = await seed()
            sent = []

            async def record(db, studio_id, role, event, context, **_kwargs):
                # Запись на занятие шлёт свои a1/t1 — здесь интересен только отзыв.
                if event == "t7":
                    sent.append(dict(context))
                return True

            monkeypatch.setattr(routes, "notify", record)
            saved_files = []
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://fixture.local") as http:
                token = create_access_token({"sub": str(ids["client"]), "typ": "client", "studio_id": ids["studio"]})
                http.headers["Authorization"] = f"Bearer {token}"
                created = await http.post("/global/reservations", json={"lesson_id": ids["lesson"], "spot_number": 2})
                assert created.status_code == 201, created.text
                booking = created.json()["id"]

                def upload():
                    return http.post(f"/global/bookings/{booking}/review-photos",
                                     files={"file": ("mat.png", PNG, "image/png")})

                # Занятие ещё впереди — ни оценки, ни снимка к ней.
                assert (await upload()).status_code == 403

                async with async_session_maker() as db:
                    lesson = await db.get(Lesson, ids["lesson"])
                    lesson.start_time = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=2)
                    await db.commit()

                try:
                    uploaded = await upload()
                    assert uploaded.status_code == 200, uploaded.text
                    url = uploaded.json()["url"]
                    saved_files.append(url)
                    assert REVIEW_PATH.match(url), url
                    assert os.path.isfile(url.lstrip("/"))

                    # Сердечко без слов: только оценка.
                    first = await http.post(f"/global/bookings/{booking}/rate", json={"rating": 3})
                    assert first.status_code == 200, first.text
                    assert first.json()["review_text"] is None
                    assert len(sent) == 1 and sent[0]["comment"] == ""

                    full = await http.post(f"/global/bookings/{booking}/rate", json={
                        "rating": 5, "comment": "  Finally nailed the forearm stand  ", "photos": [url, url],
                    })
                    assert full.status_code == 200, full.text
                    body = full.json()
                    assert body["rating"] == 5
                    assert body["review_text"] == "Finally nailed the forearm stand"
                    assert body["review_photos"] == [url]  # повтор одного снимка — двойное нажатие
                    assert sent[-1]["comment"] == "Finally nailed the forearm stand"
                    assert sent[-1]["photo_count"] == 1

                    # Повторное нажатие на ту же оценку не стирает отзыв и не будит тренера.
                    again = await http.post(f"/global/bookings/{booking}/rate", json={"rating": 5})
                    assert again.json()["review_text"] == "Finally nailed the forearm stand"
                    assert again.json()["review_photos"] == [url]
                    assert len(sent) == 2

                    # Путь не из загрузки отзыва и пятый снимок — отказ схемы.
                    foreign = "/static/notes/" + "a" * 32 + ".jpg"
                    assert (await http.post(f"/global/bookings/{booking}/rate",
                                            json={"rating": 5, "photos": [foreign]})).status_code == 422
                    five = ["/static/reviews/" + f"{i:032x}" + ".png" for i in range(5)]
                    assert (await http.post(f"/global/bookings/{booking}/rate",
                                            json={"rating": 5, "photos": five})).status_code == 422

                    mine = (await http.get("/global/lessons/my")).json()
                    past = next(item for item in mine["past"] if item["reservation_id"] == booking)
                    assert past["review_text"] == "Finally nailed the forearm stand"
                    assert past["review_photos"] == [url]

                    # Пустые слова и пустой список — «убрать отзыв», оценка остаётся.
                    cleared = await http.post(f"/global/bookings/{booking}/rate",
                                              json={"rating": 5, "comment": "  ", "photos": []})
                    assert cleared.json()["review_text"] is None
                    assert cleared.json()["review_photos"] == []
                    assert cleared.json()["rating"] == 5
                    assert len(sent) == 3
                finally:
                    for path in saved_files:
                        if os.path.isfile(path.lstrip("/")):
                            os.remove(path.lstrip("/"))

    asyncio.run(scenario())


def test_trainer_message_carries_the_words():
    context = {"lesson_name": "Barre", "client_name": "Kate", "rating": 5,
               "comment": "Great music", "photo_count": 2}
    _subject, ru, _html = _render("t7", context, "ru", "CZK")
    assert ru.endswith("от клиента Kate.\n«Great music»\nФото к отзыву: 2")
    _subject, cs, _html = _render("t7", context, "cs", "CZK")
    assert "„Great music“" in cs and "Fotky k hodnocení: 2" in cs

    # Без слов и снимков сообщение кончается точкой, а не пустыми кавычками.
    _subject, bare, _html = _render("t7", {**context, "comment": "", "photo_count": 0}, "en", "CZK")
    assert bare.endswith("from Kate.")
