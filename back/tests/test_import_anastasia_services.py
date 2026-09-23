import asyncio
from contextlib import asynccontextmanager
from types import SimpleNamespace

import pytest

from scripts.import_anastasia_services import ITEMS, choose_studio, plan_import, run


def service(item, **changes):
    return SimpleNamespace(**(item.payload() | changes))


def test_supplied_prices_and_durations():
    assert [(item.price, item.duration_min) for item in ITEMS] == [
        (850, 30), (1300, 40), (1800, 50), (1300, 30), (1300, 40),
        (1400, 40), (900, 30), (650, 20), (600, 20), (200, 10), (400, 30),
    ]
    assert len({item.category for item in ITEMS}) == 4


def test_idempotent_and_normalized_names():
    assert all(action == 'SKIP' for action, _, _ in plan_import([
        service(item, name='  ' + item.name.upper() + '  ') for item in ITEMS
    ]))


@pytest.mark.parametrize('changes', [{'price': 1}, {'duration_min': 1}, {'booking_mode': 'event'}])
def test_existing_values_are_never_overwritten(changes):
    plan = plan_import([service(ITEMS[0], **changes)])
    assert plan[0][0] == 'CONFLICT'
    assert sum(action == 'ADD' for action, _, _ in plan) == 10


def test_duplicate_names_block_import():
    assert plan_import([service(ITEMS[0]), service(ITEMS[0])])[0][0] == 'CONFLICT'


def test_studio_selection_cannot_guess_or_use_another_owner():
    studios = [SimpleNamespace(id=3), SimpleNamespace(id=7)]
    with pytest.raises(ValueError):
        choose_studio(studios, None)
    with pytest.raises(ValueError):
        choose_studio(studios, 99)
    assert choose_studio(studios, 7).id == 7


class Result:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value

    def scalars(self):
        return self

    def all(self):
        return self.value


@pytest.fixture
def fake_db(monkeypatch):
    import database
    import services.schedule_guard as guard
    import routers.settings.general as general

    studio = SimpleNamespace(id=3, name='Test studio', currency='CZK',
                             booking_mode='resource', strict_schedule_enabled=True)

    class DB:
        existing = []
        pending = []
        saved = []
        fail_flush = False

        def __init__(self):
            self.results = iter([SimpleNamespace(id=1, email='owner@example.com'), [studio], self.existing])
            self.pending = []
            self.saved = []

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        @asynccontextmanager
        async def begin(self):
            try:
                yield
                self.saved.extend(self.pending)
            finally:
                self.pending.clear()

        async def execute(self, statement):
            return Result(next(self.results))

        def add(self, value):
            self.pending.append(value)

        async def flush(self):
            if self.fail_flush:
                raise RuntimeError('simulated database failure')

    db = DB()

    async def lock(*args):
        return studio

    async def bump(*args):
        pass

    monkeypatch.setattr(database, 'async_session_maker', lambda: db)
    monkeypatch.setattr(guard, 'lock_studio', lock)
    monkeypatch.setattr(general, 'bump_booking_config_version', bump)
    return db, studio


def test_preview_writes_nothing(fake_db):
    db, _ = fake_db
    asyncio.run(run('owner@example.com'))
    assert db.saved == []


def test_apply_saves_all_11_to_selected_studio(fake_db):
    db, _ = fake_db
    asyncio.run(run('owner@example.com', 3, True))
    assert len(db.saved) == 11
    assert {row.studio_id for row in db.saved} == {3}


def test_failure_leaves_no_partial_batch(fake_db):
    db, _ = fake_db
    db.fail_flush = True
    with pytest.raises(RuntimeError):
        asyncio.run(run('owner@example.com', 3, True))
    assert db.saved == []


def test_wrong_currency_blocks_writes(fake_db):
    db, studio = fake_db
    studio.currency = 'EUR'
    with pytest.raises(ValueError):
        asyncio.run(run('owner@example.com', 3, True))
    assert db.saved == []
