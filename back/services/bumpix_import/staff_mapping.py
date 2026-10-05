"""Explicit per-appointment staff assignments never rewrite source master IDs."""
from sqlalchemy import select
from models import StudioMember
from models.bumpix import BumpixClient
from .validation import identity


def staff_by_service_category(export, default_masters, category_staff):
    """Produce explicit event decisions from caller-confirmed category IDs.

    An uncategorized add-on does not introduce a second performer. Two named
    categories mapped to different staff require a human decision for the event.
    No service/client name, ID prefix, color or price is used for inference.
    """
    decisions, used_categories = {}, {}
    for package in export.packages:
        services = {s['0']: s for s in package.snapshot['lookups'].get('services', [])}
        for event in package.snapshot['events']:
            view, raw = event['view'], event['raw']
            default = default_masters.get(view['master_id'])
            if type(default) is not int or default < 1:
                raise ValueError('Every source account needs a confirmed default staff mapping')
            service_ids = str(raw.get('e') or '').split(',') if raw.get('e') else [
                unit.split(':')[0] for unit in str(raw.get('6') or '').split(',') if unit]
            performers = set()
            for sid in service_ids:
                if sid not in services:
                    raise ValueError('Missing source service for appointment ' + view['id'])
                category = str(services[sid].get('a') or '')
                if sid in used_categories and used_categories[sid] != category:
                    raise ValueError('Source service category changed between client snapshots: ' + sid)
                used_categories[sid] = category
                if category:
                    performers.add(category_staff.get(category, default))
            if len(performers) > 1:
                raise ValueError('Appointment has service categories assigned to different staff: ' + view['id'])
            teacher = next(iter(performers), default)
            if type(teacher) is not int or teacher < 1:
                raise ValueError('Service category staff ID must be a positive integer')
            if teacher != default:
                decisions[view['id']] = teacher
    return decisions


async def event_staff_mapping(db, export, studio_id, mapping, *, native):
    explicit = mapping.get('event_masters', {})
    if not isinstance(explicit, dict):
        raise ValueError('Event master mapping must be an object')
    selected = {e['view']['id'] for p in export.packages for e in p.snapshot['events']}
    for eid, user_id in explicit.items():
        identity(eid)
        if eid not in selected or type(user_id) is not int or user_id < 1:
            raise ValueError('Invalid source event/staff in event_masters mapping')
    # Keep explicit decisions on repeat, including when the caller supplies only
    # the account's default master mapping. Other studios/accounts are excluded.
    managed_values = (await db.scalars(select(BumpixClient.managed_values).where(
        BumpixClient.studio_id == studio_id, BumpixClient.account_key == export.account_key))).all()
    resolved = {}
    for values in managed_values:
        previous = (values or {}).get('_event_masters', {})
        if not isinstance(previous, dict):
            raise ValueError('Stored event staff mapping is invalid')
        resolved.update(previous)
    resolved.update(explicit)
    users = {resolved[eid] for eid in selected if eid in resolved}
    if any(type(uid) is not int or uid < 1 for uid in users):
        raise ValueError('Stored event staff ID is invalid')
    roles = ('owner', 'trainer') if native else ('owner', 'admin', 'trainer')
    active = set((await db.scalars(select(StudioMember.user_id).where(
        StudioMember.studio_id == studio_id, StudioMember.status == 'active',
        StudioMember.role.in_(roles), StudioMember.user_id.in_(users)))).all()) if users else set()
    if users - active:
        raise ValueError('Mapped event staff is not an active specialist of the target studio')
    return resolved
