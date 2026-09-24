"""Клиента заводят по одному имени, а находят ещё и по его номеру в студии.

Без БД: проверяется контракт схемы и условие поиска.
Запуск из back/:  pytest tests/test_client_name_only.py
"""
import pytest
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql

from schemas.clients.clients import ClientCreate
from services.ai_tools import CreateClientArgs
from services.client_search import client_search_condition
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from routers.clients import profiles


def _sql(search: str) -> str:
    return str(client_search_condition(search).compile(
        dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True},
    ))


def test_only_name_is_required():
    body = ClientCreate(name="Аня")
    assert body.phone is None and body.email is None and body.city is None
    # Пустой телефон из формы — «не указан», а не ошибка формата.
    assert ClientCreate(name="Аня", phone="").phone is None
    with pytest.raises(ValidationError):
        ClientCreate(name="")
    with pytest.raises(ValidationError):
        ClientCreate(name=" \t ")
    assert ClientCreate(name="  Я  ").name == "Я"
    assert ClientCreate(name="Анна с утренней йоги").name == "Анна с утренней йоги"
    assert ClientCreate(name="Аня", email="  ").email is None
    assert ClientCreate(name="Аня", email=" Anna@Example.com ").email == "anna@example.com"
    for extras in ({"phone": "+420123"}, {"email": "invalid"}, {"name": "Я" * 101}):
        with pytest.raises(ValidationError):
            ClientCreate(**{"name": "Аня", **extras})
    # Ассистент заводит клиента по тем же правилам, что и форма.
    assert CreateClientArgs(name="Аня").phone is None


def test_search_finds_client_by_number():
    assert "clients.id = 42" in _sql("#42")
    assert "clients.id = 42" in _sql("42")
    assert "clients.id =" not in _sql("Анна")
    # Город — тоже то, что администратор мог указать и по чему будет искать.
    assert "clients.city" in _sql("Прага")


async def test_create_without_contacts_uses_generated_id_and_guards(monkeypatch):
    db = SimpleNamespace(add=Mock(), flush=AsyncMock(), commit=AsyncMock(), refresh=AsyncMock())
    created = []
    def add(client):
        client.id = 101 + len(created)
        created.append(client)
    db.add.side_effect = add
    guard = AsyncMock()
    contacts = AsyncMock()
    monkeypatch.setattr(profiles, 'check_plan_limit', guard)
    monkeypatch.setattr(profiles, 'ensure_client_contacts_free', contacts)
    monkeypatch.setattr(profiles, 'log_activity', Mock())
    monkeypatch.setattr(profiles, 'notify', AsyncMock())
    for expected_id in (101, 102):
        result = await profiles.create_client(
            ClientCreate(name='Анна с утренней йоги'),
            ctx=SimpleNamespace(studio_id=7),
            current_user=SimpleNamespace(id=1, name='Admin', last_name=None), db=db,
        )
        assert result.id == expected_id
    assert all(c.studio_id == 7 and c.phone is None and c.email is None for c in created)
    assert all(c.name == 'Анна с утренней йоги' for c in created)
    assert db.commit.await_count == 2
    guard.assert_awaited_with(db, 7, 'clients')
    contacts.assert_awaited_with(db, 7, email=None, phone=None)


@pytest.mark.parametrize('ip_city,studio,expected', [
    ('Prague', None, ('Prague', 'ip')),
    (None, SimpleNamespace(city='Brno', country='CZ'), ('Brno', 'studio')),
    (None, None, (None, 'none')),
])
async def test_default_city_has_truthful_source(monkeypatch, ip_city, studio, expected):
    monkeypatch.setattr(profiles.geo_locale, 'visitor_ip', lambda *_: '203.0.113.1')
    monkeypatch.setattr(profiles.geo_locale, 'locate_ip', lambda _: SimpleNamespace(city=ip_city))
    monkeypatch.setattr(profiles.geo_locale, 'visitor_country', lambda *_: 'CZ')
    db = SimpleNamespace(get=AsyncMock(return_value=studio))
    result = await profiles.get_default_city(
        SimpleNamespace(headers={}, client=SimpleNamespace(host='127.0.0.1')),
        ctx=SimpleNamespace(studio_id=7), db=db,
    )
    assert (result.city, result.source) == expected
    if ip_city:
        db.get.assert_not_awaited()
    else:
        db.get.assert_awaited_once_with(profiles.Studio, 7)
