"""Create and preview explicit staff mapping for the supplied Melita archive.

This command never applies the import and never creates/changes CRM accounts.
Source category 2.4 is assigned to the unique active Anastasia in the owner's
studio; other categories keep the source account's owner, as explicitly agreed.
"""
import argparse
import asyncio
import json
from pathlib import Path
from collections import Counter
from types import SimpleNamespace
from sqlalchemy import select
from services.bumpix_import.archive import open_export
from services.bumpix_import.media import atomic_write
from services.bumpix_import.staff_mapping import staff_by_service_category
from services.bumpix_import.schedule_exceptions import acceptance_for
from scripts.import_bumpix import select_export

ACCOUNT = 'c5f239a251e13cc1712e0818648b5591fd810e5191777db329dc2990499da52e'
REVIEWED_FINGERPRINT = '1fda50747be940ba3c11977c15971313b62e7aa887b8b96e1bb735421cd8a3ae'
REVIEWED_CATEGORIES = {'1.1': 'Лазерна епіляція Меліта', '2.4': 'Лазерна епіляція Анастасія'}
APPROVED_OVERLAP = ('4.3995', '4.4003')  # Owner approved preserving both on 2026-10-06.


def validate_reviewed_source(export):
    # The portable packages contain service category IDs but empty category
    # lookups. Labels were verified in captured_server_init.json, key c.
    # Bind that evidence to the immutable snapshot fingerprint; never assume
    # those category IDs have the same meaning in a different export.
    if export.account_key != ACCOUNT or export.fingerprint != REVIEWED_FINGERPRINT:
        raise ValueError('Source account/fingerprint differs from the reviewed archive')
    for package in export.packages:
        for category in package.snapshot['lookups'].get('categories', []):
            expected = REVIEWED_CATEGORIES.get(category.get('0'))
            if expected and str(category.get('2') or '').strip() != expected:
                raise ValueError('Source category differs from the reviewed definition')


def select_staff_scope(export, overrides, limit=None):
    selected = select_export(export, SimpleNamespace(limit=limit, client_ids=None))
    event_ids = {e['view']['id'] for p in selected.packages for e in p.snapshot['events']}
    return selected, {eid: uid for eid, uid in overrides.items() if eid in event_ids}


def reviewed_plan(export, owner_id, trainer_id, limit=None):
    validate_reviewed_source(export)
    defaults = {'1.1': owner_id}
    if {e['view']['master_id'] for p in export.packages for e in p.snapshot['events']} != {'1.1'}:
        raise ValueError('Source has different account masters; explicit review is required')
    overrides = staff_by_service_category(export, defaults, {'2.4': trainer_id})
    if len(export.packages) != 1056 or sum(len(p.snapshot['events']) for p in export.packages) != 2949 or len(overrides) != 917:
        raise ValueError('Source counts differ from the reviewed archive')
    export, overrides = select_staff_scope(export, overrides, limit)
    counts, review = Counter(), []
    for package in export.packages:
        services = {s['0']: s for s in package.snapshot['lookups']['services']}
        for event in package.snapshot['events']:
            raw, view = event['raw'], event['view']
            ids = str(raw.get('e') or '').split(',') if raw.get('e') else [
                unit.split(':')[0] for unit in str(raw.get('6') or '').split(',') if unit]
            categories = {str(services[sid].get('a') or '') for sid in ids}
            basis = ('anastasia_category' if '2.4' in categories else
                     'melita_category' if '1.1' in categories else 'source_owner_default')
            counts[basis] += 1
            if basis == 'source_owner_default' or view['id'] in {'3.1597', '5.3634'}:
                review.append({'source_event_id': view['id'], 'source_client_id': view['client_id'],
                    'date_millis': view['date_millis'], 'status_at_export': view['status'],
                    'service_ids': ids, 'service_names': [services[sid].get('2', '') for sid in ids],
                    'category_ids': sorted(categories), 'basis': basis,
                    'teacher_user_id': overrides.get(view['id'], owner_id),
                    'reason': ('No named performer category; keeps source owner' if basis == 'source_owner_default'
                               else 'Comment mentions Melita but does not identify who performed the service')})
    return defaults, overrides, dict(counts), review


async def target_staff(db, owner_email):
    from models import Studio, StudioMember, User
    owners = (await db.execute(select(Studio, StudioMember)
        .join(StudioMember, StudioMember.studio_id == Studio.id)
        .join(User, User.id == StudioMember.user_id)
        .where(User.email == owner_email.strip().lower(),
               StudioMember.status == 'active', StudioMember.role == 'owner'))).all()
    if len(owners) != 1:
        raise ValueError('Expected exactly one active owned studio; target is ambiguous or missing')
    studio, owner = owners[0]
    if studio.tz_iana != 'Europe/Prague' or studio.currency != 'CZK':
        raise ValueError('Target studio must already have Europe/Prague and CZK settings')
    trainers = (await db.scalars(select(StudioMember).where(
        StudioMember.studio_id == studio.id, StudioMember.status == 'active',
        StudioMember.role == 'trainer'))).all()
    trainers = [m for m in trainers if m.name.strip().casefold().startswith(('анастас', 'anastas'))]
    if len(trainers) != 1:
        raise ValueError('Expected exactly one active trainer named Anastasia in the target studio')
    return studio, owner, trainers[0]


async def prepare(args, export):
    from database import async_session_maker, engine
    from models.bumpix import BumpixClient
    from services.bumpix_import.service import Importer
    try:
        async with async_session_maker() as db:
            studio, owner, trainer = await target_staff(db, args.owner_email)
            bound = dict((await db.execute(select(BumpixClient.source_client_id, BumpixClient.client_id).where(
                BumpixClient.studio_id == studio.id, BumpixClient.account_key == export.account_key))).all())
        full_fingerprint, source_clients = export.fingerprint, len(export.packages)
        defaults, overrides, evidence_counts, review = reviewed_plan(export, owner.user_id, trainer.user_id, args.limit)
        export, overrides = select_staff_scope(export, overrides, args.limit)
        mapping = {'masters': defaults, 'event_masters': overrides,
                   'clients': {p.client_id: bound.get(p.client_id, 'create') for p in export.packages}}
        ids = {e['view']['id'] for p in export.packages for e in p.snapshot['events']}
        if set(APPROVED_OVERLAP) <= ids:
            # reviewed_plan verified the immutable account/fingerprint above.
            # Only this confirmed pair, with exact source times and target staff.
            mapping['accepted_overlaps'] = [acceptance_for(
                export, APPROVED_OVERLAP, defaults, overrides, 'Europe/Prague')]
        path = Path(args.mapping)
        atomic_write(path.resolve(), (json.dumps(mapping, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))
        path.chmod(0o600)
        importer = Importer(async_session_maker, Path('uploads').resolve(), native=True,
                            native_options={'timezone': 'Europe/Prague', 'currency': 'CZK',
                                            'historical_cash': args.historical_cash})
        report = await importer.preview(export, studio.id, args.owner_email, mapping)
        report['staff_assignment_basis'] = {
            'source_account_master': '1.1', 'default_teacher_id': owner.user_id,
            'anastasia_service_category': '2.4', 'anastasia_teacher_id': trainer.user_id,
            'uncategorized_add_ons': 'inherit the single named category; do not add another performer'}
        report['staff_assignment_evidence_counts'] = evidence_counts
        report['staff_assignment_review'] = review
        report['selection'] = {'source_clients': source_clients, 'selected_clients': len(export.packages),
                               'limit': args.limit, 'source_fingerprint': full_fingerprint}
        native_counts = Counter()
        for item in report['items']:
            native_counts.update(item.get('native_events', {}))
        report['native_event_counts'] = dict(native_counts)
        report_path = Path(args.report)
        atomic_write(report_path.resolve(), (json.dumps(report, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))
        report_path.chmod(0o600)
        print('Studio:', studio.id, studio.name)
        print('Clients selected:', len(export.packages), 'of', source_clients)
        print('Melita -> owner:', owner.user_id, owner.name,
              '(' + str(report['event_staff_counts'].get(str(owner.user_id), 0)) + ' appointments)')
        print('Anastasia -> trainer:', trainer.user_id, trainer.name,
              '(' + str(report['event_staff_counts'].get(str(trainer.user_id), 0)) + ' appointments)')
        print('Assignment evidence:', evidence_counts)
        print('Assignments to review:', len(review), '(details in staff_assignment_review)')
        print('Mapping:', path.resolve())
        print('Preview:', report_path.resolve())
        print('Result:', report['counts'])
        print('Native appointments:', dict(native_counts))
        print('Preserved source schedule overlaps:', len(mapping.get('accepted_overlaps', [])))
        if report.get('historical_cash'):
            print('Historical cash:', report['historical_cash'])
        print('READY FOR REVIEW' if report['ready'] else 'STOPPED: read preview errors')
        return 0 if report['ready'] else 1
    finally:
        await engine.dispose()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', default='/app/uploads/bumpix/incoming/source.zip')
    parser.add_argument('--owner-email', required=True)
    parser.add_argument('--limit', type=int, help='First N clients in the reviewed archive, including already imported ones')
    parser.add_argument('--historical-cash', action='store_true',
                        help='Confirm past completed visits as attended and paid in cash')
    parser.add_argument('--mapping', default='/app/uploads/bumpix/mapping-real-staff.json')
    parser.add_argument('--report', default='/app/uploads/bumpix/reports/preview-real-staff.json')
    args = parser.parse_args()
    try:
        with open_export(args.input) as export:
            validate_reviewed_source(export)
            return asyncio.run(prepare(args, export))
    except Exception as exc:
        print('ERROR:', str(exc) if isinstance(exc, ValueError) else type(exc).__name__)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
