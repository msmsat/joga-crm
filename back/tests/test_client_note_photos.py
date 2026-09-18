"""Фото в заметке о клиенте: сохраняются, отдаются и переживают правку текста.

Реальная БД (тестовая), за собой убирает — ручки заметок коммитят, откатом
не обойтись.

Запуск из back/:  python -m tests.test_client_note_photos
"""
import asyncio
import warnings

warnings.filterwarnings("ignore")

from pydantic import ValidationError
from sqlalchemy import delete

from database import async_session_maker
from dependencies import StudioContext
from models import Client, Studio, User
from routers.clients.profiles import add_note, get_client_notes, update_note
from schemas import NoteCreate, NoteUpdate


async def _run():
    async with async_session_maker() as db:
        studio = Studio(name="TEST-NOTE-PHOTOS")
        db.add(studio); await db.flush()
        user = User(email="note-photos@test.local", hashed_password="x", name="Owner", last_name="Test")
        db.add(user); await db.flush()
        client = Client(studio_id=studio.id, name="Alice", is_active=True, status="active")
        db.add(client); await db.commit()
        sid, uid, cid = studio.id, user.id, client.id

    ctx = lambda: StudioContext(user=User(email="x@y.z", hashed_password="x", name="O"), studio_id=sid, role="owner")

    try:
        # ─── Фото уходят вместе с текстом и возвращаются списком ──
        async with async_session_maker() as db:
            author = await db.get(User, uid)
            created = await add_note(
                cid, NoteCreate(text="Травма колена", photos=["/static/notes/0000000000000000000000000000000a.jpg", "/static/notes/0000000000000000000000000000000b.png"]),
                ctx(), author, db,
            )
            assert created.photos == ["/static/notes/0000000000000000000000000000000a.jpg", "/static/notes/0000000000000000000000000000000b.png"]
            note_id = created.id

        async with async_session_maker() as db:
            notes = await get_client_notes(cid, ctx(), await db.get(User, uid), db)
            assert [n.photos for n in notes] == [["/static/notes/0000000000000000000000000000000a.jpg", "/static/notes/0000000000000000000000000000000b.png"]]

        # ─── Правка одного текста снимки не стирает ──
        async with async_session_maker() as db:
            await update_note(cid, note_id, NoteUpdate(text="Травма колена, левое"), ctx(), await db.get(User, uid), db)

        async with async_session_maker() as db:
            notes = await get_client_notes(cid, ctx(), await db.get(User, uid), db)
            assert notes[0].text == "Травма колена, левое"
            assert notes[0].photos == ["/static/notes/0000000000000000000000000000000a.jpg", "/static/notes/0000000000000000000000000000000b.png"]

        # ─── Пустой список — осознанное «снять все» ──
        async with async_session_maker() as db:
            await update_note(cid, note_id, NoteUpdate(text="Без фото", photos=[]), ctx(), await db.get(User, uid), db)

        async with async_session_maker() as db:
            notes = await get_client_notes(cid, ctx(), await db.get(User, uid), db)
            assert notes[0].photos == []

        # ─── Ссылка не из загрузки не проходит вовсе (422, а не запись в базу) ──
        for bad in (
            "https://evil.example/pixel.png",     # чужой хост: сдаёт IP каждого открывшего карточку
            "javascript:alert(1)",                # схема вместо пути
            "/static/notes/../../etc/passwd.jpg",
            "/static/logos/deadbeef.jpg",         # каталог не тот
        ):
            for schema in (NoteCreate, NoteUpdate):
                try:
                    schema(text="t", photos=[bad])
                    raise AssertionError(f"ожидали отказ на {bad!r}")
                except ValidationError:
                    pass
    finally:
        async with async_session_maker() as db:
            await db.execute(delete(Client).where(Client.id == cid))
            await db.execute(delete(Studio).where(Studio.id == sid))
            await db.execute(delete(User).where(User.id == uid))
            await db.commit()


def test_client_note_photos():
    asyncio.run(_run())


if __name__ == "__main__":
    test_client_note_photos()
    print("ALL PASS — фото в заметках о клиенте")
