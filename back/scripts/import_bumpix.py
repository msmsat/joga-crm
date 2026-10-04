"""Run from back/: python -m scripts.import_bumpix --help."""
import argparse
import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path

from services.bumpix_import.archive import ExportSet, open_export
from services.bumpix_import.media import atomic_write
from services.bumpix_import.validation import identity, json_bytes


def parser():
    p = argparse.ArgumentParser(description='Offline Bumpix importer. Default: preview only, no DB writes.')
    p.add_argument('--input', required=True, help='Verified client ZIP, packages directory or portable ZIP')
    p.add_argument('--verify-only', action='store_true', help='Validate archives without database access')
    p.add_argument('--studio-id', type=int)
    p.add_argument('--owner-email', help='Active target studio owner account')
    p.add_argument('--account-key', help='Expected Bumpix account SHA-256; required for --apply')
    p.add_argument('--apply', action='store_true', help='Apply after a successful full preview')
    selection = p.add_mutually_exclusive_group()
    selection.add_argument('--limit', type=int, help='First N packages in the verified index')
    selection.add_argument('--client-ids', nargs='+', help='Exact string IDs, e.g. 1.10 1.100')
    p.add_argument('--mapping', help='JSON with explicit clients and masters mappings')
    p.add_argument('--storage-root', default='uploads', help='Persistent private root, same as API BUMPIX_STORAGE_ROOT')
    p.add_argument('--report', help='Private JSON report path')
    return p


def select_export(export, args):
    packages = export.packages
    if args.limit is not None:
        if not 1 <= args.limit <= len(packages):
            raise ValueError('--limit exceeds available client count')
        packages = packages[:args.limit]
    if args.client_ids:
        ids = [identity(cid) for cid in args.client_ids]
        if len(ids) != len(set(ids)) or not set(ids) <= {p.client_id for p in packages}:
            raise ValueError('Duplicate/missing selected client ID')
        packages = [p for p in packages if p.client_id in ids]
    from services.bumpix_import.validation import digest
    return ExportSet(export.account_key, digest(sorted((p.client_id, p.snapshot_id) for p in packages)), packages)


async def database_run(export, args, mapping):
    # Deliberately lazy: --help and --verify-only do not load .env or create an engine.
    from database import async_session_maker, engine
    from services.bumpix_import.service import Importer
    importer = Importer(async_session_maker, Path(args.storage_root).resolve())
    try:
        if args.apply:
            return await importer.apply(export, args.studio_id, args.owner_email, args.account_key, mapping,
                progress=lambda item, n, total: print(f"[{n}/{total}] {item['source_client_id']}: {item['action']}", flush=True))
        report = await importer.preview(export, args.studio_id, args.owner_email, mapping)
        if args.account_key and args.account_key != export.account_key:
            raise ValueError('Expected source account does not match archive')
        return report
    finally:
        await engine.dispose()


def main(argv=None):
    p = parser()
    args = p.parse_args(argv)
    if args.verify_only and args.apply:
        p.error('--verify-only and --apply are mutually exclusive')
    if not args.verify_only and (not args.studio_id or not args.owner_email):
        p.error('--studio-id and --owner-email are required for preview/apply')
    if args.apply and not args.account_key:
        p.error('--account-key from the preview report is required for --apply')
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    report_path = Path(args.report) if args.report else Path(args.storage_root) / 'bumpix' / 'reports' / (stamp + '.json')
    try:
        mapping = json_bytes(Path(args.mapping).read_bytes()) if args.mapping else {}
        with open_export(args.input) as full:
            export = select_export(full, args)
            if args.verify_only:
                report = {'format': 1, 'mode': 'verify', 'complete': True, 'account_key': export.account_key,
                          'fingerprint': export.fingerprint, 'clients': len(export.packages),
                          'events': sum(len(p.snapshot['events']) for p in export.packages),
                          'photos': sum(len(p.snapshot['media']) for p in export.packages)}
            else:
                report = asyncio.run(database_run(export, args, mapping))
        atomic_write(report_path.resolve(), (json.dumps(report, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))
        print('Report:', report_path.resolve())
        print('Source account key:', report['account_key'])
        print('Result:', report.get('counts', {k: report[k] for k in ('clients', 'events', 'photos') if k in report}))
        if report.get('unmapped_masters'):
            print('Masters retained by source ID; not assigned to CRM staff:', ', '.join(report['unmapped_masters']))
        good = report['complete'] if args.apply or args.verify_only else report['ready']
        print('OK' if good else 'STOPPED. Read conflicts/errors in the report; completed clients can be safely resumed.')
        return 0 if good else 1
    except KeyboardInterrupt:
        print('Interrupted. Committed clients remain; rerun the same command to resume.')
        return 130
    except Exception as exc:
        # No traceback containing source contacts, database URL or local credentials.
        message = str(exc) if isinstance(exc, ValueError) else type(exc).__name__ + ': check input, migrations and database connectivity'
        print('ERROR:', message)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
