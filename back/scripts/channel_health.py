"""Read-only per-channel agent pipeline report; run in the deployed api container.

python -m scripts.channel_health --studio-id 1 --channel whatsapp --hours 24

Answers one question: a client wrote and got no reply — WHICH link is broken.
The chain is walked in order, and each link is reported separately:

    connection  the channel is connected and its auto-reply toggle is on
    inbound     Meta/Telegram actually delivered the event to us
    jobs        the worker picked the event up and finished the turn
    outbound    the reply was queued, and the provider accepted it

An empty later link with a healthy earlier one localises the break. No inbound
at all means the provider never delivered: the webhook subscription, not us.

Never loads tokens, message bodies, sender IDs or usernames. Delivery errors are
reported as their (already truncated and provider-scrubbed) text, because
without them "failed" is undiagnosable.

Exit codes: 0 = no observed blocker, 1 = blockers, 2 = diagnostic unavailable.
Zero is not an end-to-end delivery guarantee: see the report's limitations.

Supersedes scripts/instagram_health.py, which covered Instagram only.
"""
import argparse
import asyncio
import json
import os
from datetime import datetime, timedelta, timezone

CHANNELS = ("instagram", "whatsapp", "telegram")

# Переменные окружения, без которых вебхук канала не примет ни одного события.
# Telegram проверяет токен в URL, своего app secret у него нет.
_ENV = {
    "instagram": ("IG_APP_ID", "IG_APP_SECRET", "IG_VERIFY_TOKEN"),
    "whatsapp": ("WA_APP_ID", "WA_APP_SECRET", "WA_VERIFY_TOKEN"),
    "telegram": (),
}

# Реквизиты канала: где лежит подключение и чем оно считается заполненным.
# Instagram — в studio_ai_settings (туда пишет OAuth), остальные — в своих
# таблицах интеграций, поэтому одним запросом это не берётся.
_CONNECTION = {
    "instagram": """
        SELECT coalesce(a.ig_enabled, false) AS enabled,
               coalesce(length(a.ig_token) > 0, false) AS token_present,
               coalesce(length(a.ig_user_id) > 0, false) AS account_id_present,
               a.ig_token_expires_at AS token_expires_at,
               coalesce(a.ig_off_hours_only, true) AS off_hours_only
        FROM studios s LEFT JOIN studio_ai_settings a ON a.studio_id = s.id
        WHERE s.id = :studio_id
    """,
    "whatsapp": """
        SELECT coalesce(a.wa_enabled, false) AS enabled,
               coalesce(i.is_connected AND length(i.config ->> 'token') > 0, false)
                   AS token_present,
               coalesce(i.is_connected AND length(i.config ->> 'phone_number_id') > 0, false)
                   AS account_id_present,
               NULL::timestamp AS token_expires_at,
               coalesce(a.wa_off_hours_only, false) AS off_hours_only
        FROM studios s
        LEFT JOIN studio_ai_settings a ON a.studio_id = s.id
        LEFT JOIN studio_integrations i
               ON i.studio_id = s.id AND i.integration_type = 'wa_notify'
        WHERE s.id = :studio_id
    """,
    "telegram": """
        SELECT coalesce(a.tg_enabled, false) AS enabled,
               coalesce(c.is_active AND length(c.config ->> 'token') > 0, false)
                   AS token_present,
               true AS account_id_present,
               NULL::timestamp AS token_expires_at,
               -- Режима «только в нерабочее время» у Telegram нет вовсе
               -- (models/ai.py: колонка заведена только для ig и wa).
               false AS off_hours_only
        FROM studios s
        LEFT JOIN studio_ai_settings a ON a.studio_id = s.id
        LEFT JOIN booking_channel_configs c
               ON c.studio_id = s.id AND c.channel_type = 'telegram'
        WHERE s.id = :studio_id
    """,
}


def findings(report: dict) -> list[dict]:
    """Explain observed states without treating missing telemetry as success."""
    result = []
    channel = report["channel"]

    def add(level, code):
        result.append({"level": level, "code": code})

    connection = report["connection"]
    if not connection["token_present"] or not connection["account_id_present"]:
        add("error", f"{channel}_not_connected")
    if not connection["enabled"]:
        add("error", "auto_reply_disabled")
    expires_at = connection["token_expires_at"]
    if expires_at:
        remaining = expires_at - report["checked_at"]
        if remaining <= timedelta(0):
            add("error", "token_expired")
        elif remaining <= timedelta(days=7):
            add("warning", "token_expires_within_7_days")
    elif connection["token_present"] and channel == "instagram":
        add("warning", "token_expiry_unknown")
    if connection["off_hours_only"]:
        add("info", "working_hours_can_suppress_replies")
    for name, present in report["configuration"].items():
        if not present:
            add("error", f"configuration_missing_or_invalid:{name}")
    if not report["inbound"]["count"]:
        # Самый частый и самый неочевидный исход: у нас всё цело, а провайдер
        # ничего не присылал. Чинится не здесь, а в подписке на вебхук.
        add("warning", "no_accepted_inbound_in_window_check_webhook_subscription")
    if report["jobs"]["failed"]:
        add("error", "agent_jobs_failed")
    if report["jobs"]["overdue"]:
        add("error", "agent_backlog_check_worker_is_running")
    if report["outbound"]["failed"]:
        add("error", "outbound_failed_see_delivery_errors")
    if report["outbound"]["overdue"]:
        add("error", "outbound_backlog_check_worker_and_provider")
    if report["inbound"]["count"] and not report["jobs"]["done"] \
            and not report["jobs"]["pending"] and not report["jobs"]["running"]:
        add("error", "inbound_accepted_without_any_job")
    if report["jobs"]["done"] and not sum(
        report["outbound"][key] for key in ("queued", "sending", "accepted", "failed")
    ):
        add("warning", "jobs_done_without_recent_outbound_check_reply_policy")
    return result


async def collect(studio_id: int, channel: str, hours: int) -> dict:
    # Import only during collection: --help and report interpretation do not
    # need an application database or production credentials.
    from sqlalchemy import text

    from database import async_session_maker

    async with async_session_maker() as db:
        # Enforced by PostgreSQL, including accidental writes added later.
        await db.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY"))
        await db.execute(text("SET LOCAL statement_timeout = '5s'"))
        await db.execute(text("SET LOCAL lock_timeout = '1s'"))
        now = (await db.execute(text("SELECT now() AT TIME ZONE 'UTC'"))).scalar_one()
        params = {"studio_id": studio_id, "channel": channel,
                  "since": now - timedelta(hours=hours),
                  "overdue": now - timedelta(minutes=15)}
        connection = (await db.execute(
            text(_CONNECTION[channel]), params)).mappings().one_or_none()
        if connection is None:
            raise LookupError("studio_not_found")
        inbound = (await db.execute(text("""
            SELECT count(*) AS count, max(received_at) AS last_received_at
            FROM inbound_events WHERE studio_id = :studio_id
              AND provider = :channel AND received_at >= :since
        """), params)).mappings().one()
        jobs = (await db.execute(text("""
            SELECT count(*) FILTER (WHERE j.status = 'pending') AS pending,
                   count(*) FILTER (WHERE j.status = 'running') AS running,
                   count(*) FILTER (WHERE j.status = 'done' AND e.received_at >= :since) AS done,
                   count(*) FILTER (WHERE j.status = 'failed' AND e.received_at >= :since) AS failed,
                   count(*) FILTER (WHERE
                     (j.status = 'pending' AND j.run_after < :overdue) OR
                     (j.status = 'running' AND j.claimed_at < :overdue)) AS overdue,
                   max(j.finished_at) AS last_finished_at
            FROM agent_jobs j JOIN inbound_events e ON e.id = j.inbound_event_id
            WHERE e.studio_id = :studio_id AND e.provider = :channel
              AND (e.received_at >= :since OR j.status IN ('pending', 'running'))
        """), params)).mappings().one()
        outbound = (await db.execute(text("""
            SELECT count(*) FILTER (WHERE o.status = 'queued') AS queued,
                   count(*) FILTER (WHERE o.status = 'sending') AS sending,
                   count(*) FILTER (WHERE o.status = 'accepted' AND o.created_at >= :since) AS accepted,
                   count(*) FILTER (WHERE o.status = 'failed' AND o.created_at >= :since) AS failed,
                   count(*) FILTER (WHERE
                     (o.status = 'queued' AND o.run_after < :overdue) OR
                     (o.status = 'sending' AND o.locked_at < :overdue)) AS overdue,
                   max(o.accepted_at) AS last_accepted_at
            FROM outbound_messages o JOIN channel_threads t ON t.id = o.thread_id
            WHERE o.studio_id = :studio_id AND t.channel = :channel
              AND (o.created_at >= :since OR o.status IN ('queued', 'sending'))
        """), params)).mappings().one()
        # Причина отказа доставки. Без неё «failed» неразличим: истёкший токен,
        # закрытое 24-часовое окно и неподключённый канал выглядят одинаково.
        errors = [dict(row) for row in (await db.execute(text("""
            SELECT o.last_error AS error, count(*) AS count
            FROM outbound_messages o JOIN channel_threads t ON t.id = o.thread_id
            WHERE o.studio_id = :studio_id AND t.channel = :channel
              AND o.status = 'failed' AND o.created_at >= :since
              AND o.last_error IS NOT NULL
            GROUP BY o.last_error ORDER BY count(*) DESC LIMIT 5
        """), params)).mappings().all()]

    from urllib.parse import urlsplit

    report = {
        "studio_id": studio_id, "channel": channel, "checked_at": now, "window_hours": hours,
        "configuration": {
            name: bool(os.getenv(name, "").strip()) for name in _ENV[channel]
        },
        "connection": dict(connection), "inbound": dict(inbound),
        "jobs": dict(jobs), "outbound": dict(outbound), "delivery_errors": errors,
        "limitations": [
            "This checks the database and environment of this process; run on the production server.",
            "Token presence does not prove the provider still accepts the token or its permissions.",
            "No accepted inbound may mean no traffic, ignored events, disabled agent or failed webhook delivery.",
            "Worker liveness, Meta app publication, account subscriptions and network access are not probed.",
            "Pending/running/queued/sending include all ages; completed/failed counts use the chosen window.",
            "Overdue means eligible or running for more than 15 minutes; a backlog is not proof the worker stopped.",
            "accepted means the provider accepted the send request, not delivery or read confirmation.",
        ],
    }
    if channel == "instagram":
        redirect = urlsplit(os.getenv("IG_REDIRECT_URI", ""))
        report["configuration"]["IG_REDIRECT_URI_https"] = bool(
            redirect.scheme == "https" and redirect.hostname and not redirect.username
            and not redirect.password and not redirect.fragment and not redirect.query
        )
    report["findings"] = findings(report)
    return report


def _json_default(value):
    if isinstance(value, datetime):
        return value.replace(tzinfo=timezone.utc).isoformat()
    raise TypeError(type(value).__name__)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--studio-id", type=int, required=True)
    parser.add_argument("--channel", default="instagram", choices=CHANNELS)
    parser.add_argument("--hours", type=int, default=24, choices=range(1, 721), metavar="1..720")
    args = parser.parse_args()
    if args.studio_id < 1:
        parser.error("--studio-id must be positive")
    try:
        report = asyncio.run(asyncio.wait_for(
            collect(args.studio_id, args.channel, args.hours), timeout=30))
    except Exception as exc:
        # Connection errors often contain DSNs; provider errors can contain
        # credentials. Print only the class, never a traceback or raw message.
        print(json.dumps({"error": "diagnostic_unavailable", "type": type(exc).__name__}))
        return 2
    print(json.dumps(report, default=_json_default, indent=2))
    return int(any(item["level"] == "error" for item in report["findings"]))


if __name__ == "__main__":
    raise SystemExit(main())
