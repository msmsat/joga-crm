"""Read-only Instagram pipeline report; run in the deployed api container.

python -m scripts.instagram_health --studio-id 1 --hours 24

Never loads tokens, message bodies, sender IDs, usernames or exception text.
Exit codes: 0 = no observed blocker, 1 = blockers, 2 = diagnostic unavailable.
Zero is not an end-to-end delivery guarantee: see the report's limitations.
"""
import argparse
import asyncio
import json
import os
from datetime import datetime, timedelta, timezone


def findings(report: dict) -> list[dict]:
    """Explain observed states without treating missing telemetry as success."""
    result = []

    def add(level, code):
        result.append({"level": level, "code": code})

    connection = report["connection"]
    if not connection["token_present"] or not connection["account_id_present"]:
        add("error", "instagram_not_connected")
    if not connection["enabled"]:
        add("error", "auto_reply_disabled")
    expires_at = connection["token_expires_at"]
    if expires_at:
        remaining = expires_at - report["checked_at"]
        if remaining <= timedelta(0):
            add("error", "token_expired")
        elif remaining <= timedelta(days=7):
            add("warning", "token_expires_within_7_days")
    elif connection["token_present"]:
        add("warning", "token_expiry_unknown")
    if connection["off_hours_only"]:
        add("info", "working_hours_can_suppress_replies")
    for name, present in report["configuration"].items():
        if not present:
            add("error", f"configuration_missing_or_invalid:{name}")
    if not report["inbound"]["count"]:
        add("warning", "no_accepted_inbound_in_window")
    if report["jobs"]["failed"]:
        add("error", "agent_jobs_failed")
    if report["jobs"]["overdue"]:
        add("error", "agent_backlog_check_worker_logs")
    if report["outbound"]["failed"]:
        add("error", "outbound_failed_check_delivery_logs")
    if report["outbound"]["overdue"]:
        add("error", "outbound_backlog_check_worker_and_provider")
    if report["jobs"]["done"] and not sum(
        report["outbound"][key] for key in ("queued", "sending", "accepted", "failed")
    ):
        add("warning", "jobs_done_without_recent_outbound_check_reply_policy")
    return result


async def collect(studio_id: int, hours: int) -> dict:
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
        params = {"studio_id": studio_id, "since": now - timedelta(hours=hours),
                  "overdue": now - timedelta(minutes=15)}
        connection = (await db.execute(text("""
            SELECT coalesce(a.ig_enabled, false) AS enabled,
                   coalesce(length(a.ig_token) > 0, false) AS token_present,
                   coalesce(length(a.ig_user_id) > 0, false) AS account_id_present,
                   a.ig_token_expires_at AS token_expires_at,
                   coalesce(a.ig_off_hours_only, true) AS off_hours_only
            FROM studios s LEFT JOIN studio_ai_settings a ON a.studio_id = s.id
            WHERE s.id = :studio_id
        """), params)).mappings().one_or_none()
        if connection is None:
            raise LookupError("studio_not_found")
        inbound = (await db.execute(text("""
            SELECT count(*) AS count, max(received_at) AS last_received_at
            FROM inbound_events WHERE studio_id = :studio_id
              AND provider = 'instagram' AND received_at >= :since
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
            WHERE e.studio_id = :studio_id AND e.provider = 'instagram'
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
            WHERE o.studio_id = :studio_id AND t.channel = 'instagram'
              AND (o.created_at >= :since OR o.status IN ('queued', 'sending'))
        """), params)).mappings().one()

    from urllib.parse import urlsplit

    redirect = urlsplit(os.getenv("IG_REDIRECT_URI", ""))
    report = {
        "studio_id": studio_id, "checked_at": now, "window_hours": hours,
        "configuration": {
            name: bool(os.getenv(name, "").strip())
            for name in ("IG_APP_ID", "IG_APP_SECRET", "IG_VERIFY_TOKEN")
        },
        "connection": dict(connection), "inbound": dict(inbound),
        "jobs": dict(jobs), "outbound": dict(outbound),
        "limitations": [
            "This checks the database and environment of this process; run on the production server.",
            "Token presence does not prove Meta still accepts the token or its permissions.",
            "No accepted inbound may mean no traffic, ignored events, disabled agent or failed webhook delivery.",
            "Worker liveness, Meta app publication, account subscriptions and network access are not probed.",
            "Pending/running/queued/sending include all ages; completed/failed counts use the chosen window.",
            "Overdue means eligible or running for more than 15 minutes; a backlog is not proof the worker stopped.",
            "accepted means Meta accepted the send request, not delivery or read confirmation.",
        ],
    }
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
    parser.add_argument("--hours", type=int, default=24, choices=range(1, 721), metavar="1..720")
    args = parser.parse_args()
    if args.studio_id < 1:
        parser.error("--studio-id must be positive")
    try:
        report = asyncio.run(asyncio.wait_for(collect(args.studio_id, args.hours), timeout=30))
    except Exception as exc:
        # Connection errors often contain DSNs; provider errors can contain
        # credentials. Print only the class, never a traceback or raw message.
        print(json.dumps({"error": "diagnostic_unavailable", "type": type(exc).__name__}))
        return 2
    print(json.dumps(report, default=_json_default, indent=2))
    return int(any(item["level"] == "error" for item in report["findings"]))


if __name__ == "__main__":
    raise SystemExit(main())
