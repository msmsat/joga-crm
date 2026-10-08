"""Do not open Stripe or consume credits at a price the customer never saw."""
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from starlette.requests import Request

from ratelimit import limiter
from routers.booking import miniapp_users as M


@pytest.mark.parametrize('expected,actual', [(80, 100), (100, 80), (0, 100), (100, 0)])
def test_changed_total_requires_confirmation_before_any_payment(expected, actual):
    body = M.CheckoutSessionRequest(package_id=7, in_telegram=False, expected_total=expected)
    request = Request({'type': 'http', 'method': 'POST', 'path': '/', 'headers': [],
                       'query_string': b'', 'client': ('127.0.0.1', 0)})
    with patch.object(limiter, 'enabled', False), patch.object(M, '_sellable_package', AsyncMock()), patch.object(
        M, '_quote', AsyncMock(return_value=SimpleNamespace(total_price=actual)),
    ), patch.object(M, '_grant_fully_covered', AsyncMock()) as grant, patch.object(
        M.stripe_connect, 'configured', return_value=False,
    ):
        with pytest.raises(HTTPException) as error:
            asyncio.run(M.create_checkout_session(request=request, body=body,
                client=SimpleNamespace(id=1, studio_id=3), db=AsyncMock()))
        assert error.value.status_code == 409
        assert error.value.detail['code'] == 'checkout.price_changed'
        assert grant.await_count == 0


def test_negative_expected_total_is_rejected_at_the_api_boundary():
    with pytest.raises(ValidationError):
        M.CheckoutSessionRequest(package_id=7, expected_total=-1)
