"""Archive only the reviewed extra services in studio 15; retain all history.

Default is a preview. No services, prices, staff assignments or bookings are created
or deleted. The reviewed ID set and the 17 retained price cards must still match.
"""
import argparse
import asyncio
import json
import os
import tempfile
from pathlib import Path

STUDIO_ID = 15
OWNER_ID = 42
OWNER_EMAIL = "mhabor500@gmail.com"
EXTRA_IDS = frozenset(range(152, 357))
KEEP_FILE = Path(__file__).with_name("melita_catalog_keep.json")


def write_report(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".catalog-", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(data, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
        os.replace(temporary, path)
        path.chmod(0o600)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


async def archive_catalog(sessions, *, apply=False, report_path=None):
    from sqlalchemy import select, func
    from models import Service, StudioMember, User, Lesson
    from services.schedule_guard import lock_studio
    from routers.studio.services import _read_all
    from routers.settings.general import bump_booking_config_version

    reviewed = json.loads(KEEP_FILE.read_text(encoding="utf-8"))
    keep_ids = {card["id"] for card in reviewed}
    if keep_ids != set(range(36, 47)) | set(range(53, 59)):
        raise ValueError("Reviewed keep list is invalid")

    async with sessions.begin() as db:
        studio = await lock_studio(db, STUDIO_ID)
        owner = await db.scalar(select(User.id).join(
            StudioMember, StudioMember.user_id == User.id,
        ).where(
            StudioMember.studio_id == STUDIO_ID,
            StudioMember.role == "owner", StudioMember.status == "active",
            User.id == OWNER_ID, func.lower(User.email) == OWNER_EMAIL,
        ))
        if owner != OWNER_ID or studio.currency != "CZK":
            raise ValueError("Expected studio 15 with owner mhabor500@gmail.com and currency CZK")
        services = (await db.scalars(select(Service).where(
            Service.studio_id == STUDIO_ID,
        ).order_by(Service.id).with_for_update())).all()
        by_id = {service.id: service for service in services}
        expected = keep_ids | EXTRA_IDS
        if set(by_id) != expected:
            raise ValueError(
                f"Catalogue changed: unexpected IDs {sorted(set(by_id) - expected)}, "
                f"missing IDs {sorted(expected - set(by_id))}. Nothing changed."
            )
        cards = await _read_all(STUDIO_ID, db)
        for approved in reviewed:
            sid = approved["id"]
            card = cards[sid]
            actual = {
                "id": sid, "name": card.name, "category": card.category,
                "price": card.price, "duration_min": card.duration_min,
                "masters": sorted([master.model_dump() for master in card.masters],
                                  key=lambda master: master["user_id"]),
                "parts": [part.service_id for part in card.bundle_items],
            }
            expected_card = dict(approved)
            expected_card["masters"] = sorted(approved["masters"], key=lambda master: master["user_id"])
            if actual != expected_card or by_id[sid].is_archived or not by_id[sid].is_bookable:
                raise ValueError(f"Retained service {sid} differs from reviewed price card. Nothing changed.")
        extras = [by_id[sid] for sid in sorted(EXTRA_IDS)]
        changed = [service for service in extras if not service.is_archived or service.is_bookable]
        journal_entries = await db.scalar(select(func.count(Lesson.id)).where(
            Lesson.studio_id == STUDIO_ID, Lesson.service_id.in_(EXTRA_IDS),
        ))
        report = {
            "studio_id": STUDIO_ID, "owner_id": OWNER_ID,
            "mode": "apply" if apply else "preview", "ready": True, "complete": False,
            "kept_ids": sorted(keep_ids), "keep": len(keep_ids),
            "to_archive": len(changed), "already_archived": len(extras) - len(changed),
            "archived": 0, "journal_entries_preserved": journal_entries,
            "history_touched": False,
            "previous_flags": [{"id": s.id, "name": s.name,
                                "is_archived": s.is_archived, "is_bookable": s.is_bookable}
                               for s in extras],
        }
        # Persist the original flags before changing any rows. A failed write aborts.
        if report_path:
            write_report(report_path, report)
        if apply:
            for service in changed:
                service.is_archived = True
                service.is_bookable = False
            if changed:
                await bump_booking_config_version(db, studio)
    # The transaction has committed. Repeats leave all historical links intact.
    if apply:
        report.update(complete=True, archived=len(changed))
    if report_path:
        write_report(report_path, report)
    return report


async def run(args):
    from database import async_session_maker, engine
    try:
        report = await archive_catalog(async_session_maker, apply=args.apply, report_path=args.report)
        print(json.dumps({key: value for key, value in report.items() if key != "previous_flags"},
                         ensure_ascii=False, indent=2))
        print(f"Report: {args.report}")
    finally:
        await engine.dispose()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Archive the reviewed extra services")
    parser.add_argument("--report", type=Path, required=True, help="Private JSON report path")
    args = parser.parse_args()
    try:
        asyncio.run(run(args))
    except ValueError as error:
        parser.exit(1, f"STOP: {error}\n")


if __name__ == "__main__":
    main()
