"""Fictional fixtures implementing the real exporter archive contract."""
import copy
import hashlib
import json
import zipfile
from pathlib import Path
from io import BytesIO
from PIL import Image


def encoded(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def checksum(value):
    return hashlib.sha256(encoded(value)).hexdigest()


ACCOUNT = 'a' * 64


def image_bytes(color='red'):
    out = BytesIO()
    Image.new('RGB', (2, 2), color).save(out, format='PNG')
    return out.getvalue()


def snapshot(cid='1.100', name='Fictional client', phone='', with_events=True):
    result = {'account_key': ACCOUNT, 'verified': True,
              'client': {'0': cid, '2': name, '3': phone, 'unknown': 'preserve me'},
              'profile': {'id': cid, 'name': name, 'phone': phone, 'phone2': '',
                          'email': '', 'birthday': '', 'address': 'Source address',
                          'balance': '17.50', 'discount': '0', 'comment': 'Profile note',
                          'categories': [], 'media': []},
              'events': [], 'groups': {k: [] for k in ('t1', 't2', 't3', 't4')},
              'counts': {k: 0 for k in ('t1', 't2', 't3', 't4')},
              'history_ids': [], 'history_count': 0,
              'lookups': {'masters': [{'0': '1.1', '2': 'Fictional specialist'}], 'services': [], 'categories': []},
              'coverage': {k: True for k in ('profile', 'events', 'history', 'photos')}, 'media': []}
    if with_events:
        for index, status in enumerate(('new', 'completed', 'canceled')):
            eid = '3.' + str(int(cid.split('.')[1]) * 10 + index)
            raw = {'0': eid, '5': cid, 'a': 'Event note', 'b': '1.1', 'extra': 'raw event field'}
            view = {'id': eid, 'client_id': cid, 'status': status, 'master_id': '1.1',
                    'date_millis': 1754006400000, 'start_minutes': 600, 'stop_minutes': 660,
                    'services': 'Source service', 'income': '12.50', 'outlay': '0.00',
                    'comment': 'Event note', 'image_count': 0, 'media': []}
            result['events'].append({'raw': raw, 'view': view})
            result['groups']['t1'].append(eid)
            result['groups'][('t2', 't3', 't4')[index]].append(eid)
            result['history_ids'].append(eid)
        result['counts'] = {k: len(v) for k, v in result['groups'].items()}
        result['history_count'] = 3
    return result


def add_photo(data, kind='event', index=0, color='red'):
    body = image_bytes(color)
    sha = hashlib.sha256(body).hexdigest()
    owner = data['client']['0'] if kind == 'avatar' else data['events'][index]['raw']['0']
    spec = {'kind': kind, 'owner_id': owner, 'image_id': owner if kind == 'avatar' else owner + '-0',
            'revision': '7', 'url': 'https://bumpix.net/example.jpg?7'}
    record = dict(spec, source_client_id=data['client']['0'], bytes=len(body),
                  sha256=sha, path='media/' + sha + '.png', cache_key=checksum(spec))
    data['media'].append(record)
    if kind == 'avatar':
        data['profile']['media'].append(spec)
    else:
        data['events'][index]['view']['media'].append(spec)
        data['events'][index]['view']['image_count'] += 1
    return record['path'], body


def write_package(root, data, images=None):
    root = Path(root)
    root.mkdir(parents=True, exist_ok=True)
    files = {name: encoded(data[key]) for name, key in (
        ('client.json', 'client'), ('profile.json', 'profile'), ('events.json', 'events'), ('lookups.json', 'lookups'))}
    files['snapshot.json'] = encoded(data)
    for name in ('clients.csv', 'visits.csv', 'notes.csv', 'media.csv'):
        files[name] = b'\xef\xbb\xbfsource_client_id\r\n'
    files.update(images or {})
    sid = checksum(data)
    manifest = {'source_client_id': data['client']['0'], 'snapshot_id': sid, 'verified': True,
                'coverage': data['coverage'], 'expected_photos': len(data['media']), 'saved_photos': len(data['media']),
                'files': {name: {'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest()} for name, body in files.items()}}
    path = root / ('client-' + data['client']['0'] + '-' + sid[:16] + '.zip')
    with zipfile.ZipFile(path, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for name, body in files.items():
            archive.writestr(name, body)
        archive.writestr('manifest.json', encoded(manifest))
    return path, sid


def write_index(root, entries):
    index = {'complete': True, 'account_key': ACCOUNT, 'source_client_count': len(entries),
             'clients': [{'client_id': cid, 'snapshot_id': sid, 'verified': True,
                          'zip': 'C:\\old-laptop\\packages\\' + path.name} for cid, path, sid in entries]}
    Path(root, 'all-clients.index.json').write_bytes(encoded(index))
    return index


def rewrite_zip(path, changes):
    with zipfile.ZipFile(path) as original:
        content = {name: original.read(name) for name in original.namelist()}
    content.update(changes)
    with zipfile.ZipFile(path, 'w', compression=zipfile.ZIP_DEFLATED) as changed:
        for name, body in content.items():
            changed.writestr(name, body)
