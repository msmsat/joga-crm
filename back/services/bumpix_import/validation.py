import hashlib
import json
import re
from datetime import datetime, timedelta, timezone


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode('utf-8')


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def identity(value):
    if not isinstance(value, str) or not re.fullmatch(r'[0-9]{1,16}\.[0-9]{1,16}', value):
        raise ValueError('Invalid source ID: IDs must remain strings')
    return value


def sha(value):
    if not isinstance(value, str) or not re.fullmatch('[0-9a-f]{64}', value):
        raise ValueError('Invalid SHA-256')
    return value


def integer(value, label, maximum=1000000):
    if isinstance(value, bool) or not isinstance(value, (int, str)) or not re.fullmatch('[0-9]+', str(value)):
        raise ValueError('Invalid integer: ' + label)
    result = int(value)
    if result > maximum:
        raise ValueError('Integer limit exceeded: ' + label)
    return result


def event_times(view):
    millis = integer(view.get('date_millis'), 'date_millis', 32503680000000)
    day = datetime.fromtimestamp(millis / 1000, timezone.utc)
    if day.time().isoformat() != '00:00:00':
        raise ValueError('Event date must represent a UTC calendar day')
    start = integer(view.get('start_minutes'), 'start_minutes', 1440)
    stop = integer(view.get('stop_minutes'), 'stop_minutes', 1440)
    if stop <= start:
        raise ValueError('Invalid event time interval')
    day = day.replace(tzinfo=None)
    return day + timedelta(minutes=start), day + timedelta(minutes=stop)


def photo_key(photo):
    return tuple(photo.get(k) for k in ('kind', 'owner_id', 'image_id', 'revision'))


def validate_snapshot(data):
    try:
        cid = identity(data['client']['0'])
        sha(data['account_key'])
        if data.get('verified') is not True or data['profile'].get('id') != cid:
            raise ValueError('Unverified profile or wrong client ID')
        if not all(data.get('coverage', {}).get(k) is True for k in ('profile', 'events', 'history', 'photos')):
            raise ValueError('Incomplete source coverage')
        events, specs = {}, list(data['profile']['media'])
        if len(specs) > 1 or any(p['kind'] != 'avatar' or p['owner_id'] != cid for p in specs):
            raise ValueError('Invalid avatar ownership')
        for event in data['events']:
            raw, view = event['raw'], event['view']
            eid = identity(raw['0'])
            if eid in events or raw.get('5') != cid or view.get('client_id') != cid or view.get('id') != eid:
                raise ValueError('Duplicate event or cross-client event ownership')
            if view.get('status') not in ('new', 'completed', 'canceled'):
                raise ValueError('Unknown event status')
            identity(view['master_id'])
            event_times(view)
            photos = view['media']
            if integer(view['image_count'], 'image_count') != len(photos):
                raise ValueError('Missing event images')
            if any(p['kind'] != 'event' or p['owner_id'] != eid for p in photos):
                raise ValueError('Invalid event image ownership')
            specs.extend(photos)
            events[eid] = event
        groups = data['groups']
        for key in ('t1', 't2', 't3', 't4'):
            if key not in groups:
                raise ValueError('Missing source event category')
        for key, ids in groups.items():
            if not isinstance(ids, list) or len(ids) != len(set(ids)) or len(ids) != integer(data['counts'][key], key) or not set(ids) <= events.keys():
                raise ValueError('Invalid category count/ownership')
        normal = [eid for key in ('t2', 't3', 't4') for eid in groups[key]]
        if len(normal) != len(set(normal)) or set(normal) != set(groups['t1']):
            raise ValueError('Source statuses do not partition All events')
        for key, status in (('t2', 'new'), ('t3', 'completed'), ('t4', 'canceled')):
            if any(events[eid]['view']['status'] != status for eid in groups[key]):
                raise ValueError('Event status disagrees with source category')
        if any(not set(ids) <= set(groups['t1']) for key, ids in groups.items() if key not in ('t1', 't2', 't3', 't4')):
            raise ValueError('Additional category disagrees with All')
        history = data['history_ids']
        if len(history) != len(set(history)) or len(history) != integer(data['history_count'], 'history_count') or not set(history) <= events.keys():
            raise ValueError('Invalid history count/ownership')
        if set(events) != set(groups['t1']) | set(history):
            raise ValueError('Unaccounted event outside categories/history')
        expected = {photo_key(p) for p in specs}
        media = data['media']
        actual = {photo_key(p) for p in media}
        if len(expected) != len(specs) or len(actual) != len(media) or actual != expected:
            raise ValueError('Missing/duplicate/misassigned media')
        for photo in media:
            for field, maximum in (('image_id', 50), ('revision', 40)):
                if not isinstance(photo.get(field), str) or not photo[field] or len(photo[field]) > maximum:
                    raise ValueError('Invalid photo identity/revision')
            if photo['source_client_id'] != cid:
                raise ValueError('Cross-client media ownership')
            sha(photo['sha256'])
            integer(photo['bytes'], 'media bytes', 50 * 1024 * 1024)
            if not re.fullmatch(r'media/' + photo['sha256'] + r'\.(jpg|jpeg|png|gif|webp)', photo['path']):
                raise ValueError('Invalid media path')
        return cid
    except (KeyError, TypeError, AttributeError, OverflowError, OSError) as exc:
        raise ValueError('Malformed client snapshot') from exc


def json_bytes(body):
    def pairs(items):
        obj = {}
        for key, value in items:
            if key in obj:
                raise ValueError('Duplicate JSON key')
            obj[key] = value
        return obj
    def bad_constant(_):
        raise ValueError('Non-finite JSON number')
    try:
        return json.loads(body.decode('utf-8-sig'), object_pairs_hook=pairs, parse_constant=bad_constant)
    except (UnicodeError, json.JSONDecodeError, RecursionError) as exc:
        raise ValueError('Invalid JSON') from exc
