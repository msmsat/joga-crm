"""Execute the search predicates against sample contacts (no production database)."""
import re

import pytest
from sqlalchemy import create_engine, select

from models import Client
from services.client_search import client_search_condition


@pytest.fixture
def contacts():
    engine = create_engine('sqlite://')
    with engine.connect() as connection:
        sqlite = connection.connection.driver_connection
        sqlite.create_function('concat', -1, lambda *values: ''.join(str(v) for v in values if v is not None))
        sqlite.create_function('regexp_replace', 4, lambda value, pattern, replacement, flags:
                               re.sub(pattern, replacement, value) if value is not None else None)
        connection.exec_driver_sql('CREATE TABLE clients (id INTEGER, studio_id INTEGER, name TEXT, '
                                   'last_name TEXT, phone TEXT, email TEXT, instagram TEXT)')
        connection.exec_driver_sql('INSERT INTO clients VALUES (?, ?, ?, ?, ?, ?, ?)', [
            (1, 1, 'Anna', 'Smith', '+420 (777) 123-456', 'Anna@Example.com', '@anna.smith'),
            (2, 1, 'Eva', None, None, None, 'https://www.instagram.com/eva_beauty/'),
            (3, 1, 'Eve', None, None, None, 'evaxbeauty'),
            (4, 2, 'Anna', 'Smith', '+420777123456', 'Anna@Example.com', '@anna.smith'),
        ])
        yield connection
    engine.dispose()


@pytest.mark.parametrize('query,expected', [
    ('Anna Smith', [1]), ('Smith Anna', [1]),
    ('ANNA@EXAMPLE.COM', [1]), (' example.com ', [1]),
    ('@ANNA.SMITH', [1]), ('anna.smith', [1]),
    ('https://instagram.com/anna.smith/?igsh=123', [1]),
    ('@eva_beauty', [2]), ('eva_beauty', [2]),
    ('777123456', [1]), ('+420 777-123-456', [1]),
    ('not-found', []), ('%', []), ('@', [1]),
])
def test_search_contacts_preserves_studio_scope(contacts, query, expected):
    statement = select(Client.id).where(Client.studio_id == 1, client_search_condition(query)).order_by(Client.id)
    assert list(contacts.execute(statement).scalars()) == expected
