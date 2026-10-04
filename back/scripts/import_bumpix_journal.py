"""Project already imported future records; default is read-only preview."""
import argparse
import asyncio
import json
from pathlib import Path
from services.bumpix_import.validation import json_bytes
from services.bumpix_import.media import atomic_write


def parser():
    p = argparse.ArgumentParser(description='Bumpix future Journal projection. Default: preview only.')
    p.add_argument('--studio-id', type=int, required=True)
    p.add_argument('--owner-email', required=True)
    p.add_argument('--account-key', required=True)
    p.add_argument('--mapping', required=True, help='Separate journal mapping JSON (timezone/currency/services/events)')
    p.add_argument('--report', required=True, help='Private preview/apply JSON report path')
    p.add_argument('--apply', action='store_true')
    return p


async def run(args, mapping):
    from database import async_session_maker, engine
    from services.bumpix_import.journal import JournalProjector
    try:
        return await JournalProjector(async_session_maker).run(args.studio_id, args.owner_email, args.account_key, mapping, apply=args.apply)
    finally:
        await engine.dispose()


def main(argv=None):
    args = parser().parse_args(argv)
    try:
        report = asyncio.run(run(args, json_bytes(Path(args.mapping).read_bytes())))
        atomic_write(Path(args.report).resolve(), (json.dumps(report, ensure_ascii=False, indent=2) + '\n').encode())
        print('Report:', Path(args.report).resolve())
        print('Result:', report['counts'])
        return 0 if (report['complete'] if args.apply else report['ready']) else 1
    except Exception as exc:
        print('ERROR:', str(exc) if isinstance(exc, ValueError) else type(exc).__name__ + ': check migrations/database/mapping')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
