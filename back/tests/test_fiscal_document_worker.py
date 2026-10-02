"""Fiscal review and failed issuance must not hide later paid documents."""
from datetime import datetime, timedelta, timezone
import logging
from types import SimpleNamespace

import pytest

from models import BillingTaxDocument
from services import billing_tax_documents as documents


class _Result:
    def __init__(self, *, rows=(), row=None):
        self.rows, self.row = list(rows), row

    def scalars(self):
        return self

    def all(self):
        return self.rows

    def scalar_one_or_none(self):
        return self.row


class _Session:
    def __init__(self, store):
        self.store = store
        self.identifier = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_exc):
        return False

    async def execute(self, query):
        parameters = query.compile().params
        if query.column_descriptions[0]['expr'] is BillingTaxDocument:
            self.identifier = parameters['id_1']
            return _Result(row=self.store.rows.get(self.identifier))
        # Model a database page of still-pending rows. A worker that only
        # processes the first page will never reach a later valid document.
        after = parameters.get('id_1', 0)
        pending = sorted(row.id for row in self.store.rows.values()
                         if row.id > after and row.status == 'pending')
        limit = query._limit_clause.value if query._limit_clause is not None else None
        return _Result(rows=pending[:limit])

    async def commit(self):
        self.store.committed.append(self.identifier)

    async def rollback(self):
        self.store.rolled_back.append(self.identifier)


class _Store:
    def __init__(self, rows):
        self.rows = {row.id: row for row in rows}
        self.committed = []
        self.rolled_back = []

    def session(self):
        return _Session(self)


def _pending(identifier, *, age=timedelta(days=1)):
    created = datetime.now(timezone.utc).replace(tzinfo=None) - age
    return SimpleNamespace(id=identifier, status='pending', created_at=created,
                           correction_snapshot=None)


@pytest.mark.asyncio
async def test_full_page_of_review_documents_does_not_starve_next_paid_document(monkeypatch):
    store = _Store(_pending(identifier) for identifier in range(1, 102))
    attempted = []

    async def issue(db, document):
        attempted.append(document.id)
        if document.id <= 100:
            raise documents.TaxDocumentPending('Confirmed tax facts need review')
        document.status = 'issued'
        await db.commit()
        return document

    monkeypatch.setattr(documents, 'ensure_issued', issue)
    count = await documents.issue_pending(store.session)

    assert count == 1
    assert attempted == list(range(1, 102))
    assert store.rows[101].status == 'issued'
    assert store.committed == [101]
    assert store.rolled_back == list(range(1, 101))


@pytest.mark.asyncio
async def test_failed_issuance_rolls_back_without_blocking_next_document(monkeypatch):
    store = _Store([_pending(1), _pending(2)])

    async def issue(db, document):
        if document.id == 1:
            raise RuntimeError('Temporary rendering failure')
        document.status = 'issued'
        await db.commit()
        return document

    monkeypatch.setattr(documents, 'ensure_issued', issue)
    assert await documents.issue_pending(store.session) == 1
    assert store.rolled_back == [1]
    assert store.committed == [2]
    assert store.rows[1].status == 'pending'
    assert store.rows[2].status == 'issued'


@pytest.mark.asyncio
async def test_fourteen_day_pending_document_warns_before_issuance_deadline(monkeypatch, caplog):
    store = _Store([
        _pending(14, age=timedelta(days=14, hours=1)),
        _pending(13, age=timedelta(days=13, hours=1)),
    ])

    async def issue(_db, _document):
        raise documents.TaxDocumentPending('Official exchange rate needs review')

    monkeypatch.setattr(documents, 'ensure_issued', issue)
    with caplog.at_level(logging.WARNING, logger=documents.logger.name):
        assert await documents.issue_pending(store.session) == 0

    warnings = [record for record in caplog.records
                if record.name == documents.logger.name and record.levelno >= logging.WARNING]
    assert len(warnings) == 1
    assert '14' in warnings[0].getMessage()
    assert 'deadline' in warnings[0].getMessage()
    assert store.rolled_back == [13, 14]
    assert not store.committed
