"""Explicit source-pair exceptions, bound to unchanged account/staff/intervals."""
from datetime import datetime
from zoneinfo import ZoneInfo
from .validation import event_times, identity
from .journal import instant


def acceptance_for(export, event_ids, masters, event_masters, timezone_name):
    if len(event_ids) != 2 or len(set(event_ids)) != 2:
        raise ValueError('An accepted overlap must identify exactly two different appointments')
    ids = {identity(eid) for eid in event_ids}
    states = {}
    for package in export.packages:
        for event in package.snapshot['events']:
            view = event['view']
            if view['id'] not in ids:
                continue
            start, end = event_times(view)
            states[view['id']] = {
                'client_id': package.client_id, 'start': start.isoformat(), 'end': end.isoformat(),
                'teacher_user_id': event_masters.get(view['id'], masters.get(view['master_id'])),
                'timezone': timezone_name, 'status': view['status']}
    if set(states) != ids:
        raise ValueError('Accepted overlap contains an appointment outside the selected source')
    first, second = states.values()
    if (not first['teacher_user_id'] or first['teacher_user_id'] != second['teacher_user_id']
            or first['status'] == 'canceled' or second['status'] == 'canceled'
            or first['start'] >= second['end'] or first['end'] <= second['start']):
        raise ValueError('Accepted appointments must overlap for the same active source master')
    return {'account_key': export.account_key, 'events': states}


def validated_acceptances(export, records, masters, event_masters, timezone_name):
    if not isinstance(records, list):
        raise ValueError('Accepted overlaps must be a list of explicit source pairs')
    result = {}
    for record in records:
        if not isinstance(record, dict) or set(record) != {'account_key', 'events'} or not isinstance(record['events'], dict):
            raise ValueError('Invalid accepted source overlap')
        expected = acceptance_for(export, tuple(record['events']), masters, event_masters, timezone_name)
        if record != expected:
            raise ValueError('Accepted source overlap account, client, staff or interval changed; review again')
        key = frozenset(record['events'])
        if key in result:
            raise ValueError('Duplicate accepted source overlap')
        result[key] = {eid: (
            state['teacher_user_id'],
            instant(datetime.fromisoformat(state['start']), ZoneInfo(state['timezone'])),
            instant(datetime.fromisoformat(state['end']), ZoneInfo(state['timezone'])))
            for eid, state in record['events'].items()}
    return result


def permits_overlap(acceptances, first_id, first_interval, second_id, second_interval):
    pair = acceptances.get(frozenset((first_id, second_id)), {})
    return (len(pair) == 2 and pair.get(first_id) == first_interval
            and pair.get(second_id) == second_interval)
