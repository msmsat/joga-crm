"""Use Stripe's payment/refund dates, never the webhook delivery/retry date."""
import asyncio
from datetime import datetime
import logging

import stripe
logger = logging.getLogger(__name__)


def _utc(value):
    return datetime.utcfromtimestamp(value) if isinstance(value, (int, float)) and value > 0 else None


async def received_at(session, *, event_created=None, test_now=None):
    event_at = _utc(event_created)
    if event_at is not None:
        return event_at
    if test_now is not None:
        return test_now
    intent = getattr(session, "payment_intent", None)
    intent_id = intent if isinstance(intent, str) else getattr(intent, "id", None)
    if not intent_id:
        return None
    # Charge.created may be authorization time, before a later capture. Only
    # an exact successful PaymentIntent event proves receipt of the payment.
    parameters = {"type": "payment_intent.succeeded", "limit": 100}
    created = getattr(session, "created", None)
    if _utc(created) is not None:
        parameters["created"] = {"gte": int(created)}
    try:
        for _page in range(3):
            response = await asyncio.to_thread(stripe.Event.list, **parameters)
            for event in response.data:
                obj = event.data["object"]
                if event.type == "payment_intent.succeeded" and obj.id == intent_id:
                    if getattr(obj, "status", None) == "succeeded":
                        return _utc(getattr(event, "created", None))
            if not getattr(response, "has_more", False) or not response.data:
                break
            parameters["starting_after"] = response.data[-1].id
    except Exception:
        logger.warning("A successful payment date is unavailable for %s; its document needs review", intent_id)
    return None


def reversal_at(charge, *, event_created=None):
    """The refund event date, or the latest successful refund's own timestamp."""
    event_at = _utc(event_created)
    if event_at is not None:
        return event_at
    refunds = getattr(getattr(charge, "refunds", None), "data", None) or []
    dates = [_utc(getattr(refund, "created", None)) for refund in refunds
             if getattr(refund, "status", None) == "succeeded"]
    return max((date for date in dates if date is not None), default=None)
