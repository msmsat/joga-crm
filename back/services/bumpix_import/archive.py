"""Validate immutable exporter packages before opening any database transaction."""
import hashlib
import re
import shutil
import stat
import tempfile
import warnings
import zipfile
from contextlib import contextmanager
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path, PurePosixPath

from PIL import Image
from .validation import digest, integer, json_bytes, sha, validate_snapshot

MAX_JSON = 64 * 1024 * 1024
MAX_FILE = 50 * 1024 * 1024
MAX_PACKAGE = 2 * 1024**3
MAX_BATCH = 100 * 1024**3
FIXED = {'client.json', 'profile.json', 'events.json', 'lookups.json', 'snapshot.json',
         'clients.csv', 'visits.csv', 'notes.csv', 'media.csv'}


def zip_entries(archive, maximum):
    infos = archive.infolist()
    if len(infos) > 100000 or sum(i.file_size for i in infos) > maximum:
        raise ValueError('Archive exceeds size/count limits')
    names = set()
    for info in infos:
        path = PurePosixPath(info.filename)
        if (info.filename in names or not info.filename or '\\' in info.filename or ':' in info.filename
                or path.is_absolute() or '..' in path.parts or info.filename != str(path)
                or info.is_dir() or stat.S_ISLNK(info.external_attr >> 16) or info.flag_bits & 1
                or info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)):
            raise ValueError('Unsafe or duplicate ZIP entry')
        names.add(info.filename)
    return names


def read(archive, name, limit=MAX_JSON):
    if archive.getinfo(name).file_size > limit:
        raise ValueError('Entry exceeds size limit')
    return archive.read(name)


def verify_image(body, extension):
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(BytesIO(body)) as image:
                if image.width * image.height > 40000000 or image.format not in {'JPEG', 'PNG', 'GIF', 'WEBP'}:
                    raise ValueError('Unsupported/oversized image')
                expected = {'JPEG': {'jpg', 'jpeg'}, 'PNG': {'png'}, 'GIF': {'gif'}, 'WEBP': {'webp'}}
                if extension not in expected[image.format]:
                    raise ValueError('Image extension mismatch')
                image.verify()
            # JPEG.verify() checks its header only. Decode pixels as well;
            # otherwise a truncated scan can pass the manifest and header.
            with Image.open(BytesIO(body)) as image:
                pixels = 0
                for frame in range(getattr(image, 'n_frames', 1)):
                    image.seek(frame)
                    pixels += image.width * image.height
                    if pixels > 100000000:
                        raise ValueError('Animated image exceeds decoded pixel limit')
                    image.load()
    except Exception as exc:
        raise ValueError('Invalid or truncated image') from exc


@dataclass
class Package:
    path: Path
    client_id: str
    snapshot_id: str
    snapshot: dict

    def media_bytes(self, photo):
        with zipfile.ZipFile(self.path) as archive:
            body = read(archive, photo['path'], MAX_FILE)
        if len(body) != photo['bytes'] or hashlib.sha256(body).hexdigest() != photo['sha256']:
            raise ValueError('Media changed after validation')
        return body


@dataclass
class ExportSet:
    account_key: str
    fingerprint: str
    packages: list[Package]


def validate_package(path):
    try:
        with zipfile.ZipFile(path) as archive:
            names = zip_entries(archive, MAX_PACKAGE)
            manifest = json_bytes(read(archive, 'manifest.json'))
            files = manifest['files']
            if names != set(files) | {'manifest.json'} or not FIXED <= files.keys():
                raise ValueError('Manifest file set mismatch')
            for name, record in files.items():
                if name not in FIXED and not name.startswith('media/'):
                    raise ValueError('Unexpected package file')
                limit = MAX_FILE if name.startswith('media/') else MAX_JSON
                body = read(archive, name, limit)
                if len(body) != record['bytes'] or hashlib.sha256(body).hexdigest() != sha(record['sha256']):
                    raise ValueError('Manifest checksum mismatch')
            snapshot = json_bytes(read(archive, 'snapshot.json'))
            cid = validate_snapshot(snapshot)
            sid = digest(snapshot)
            if manifest.get('verified') is not True or manifest['source_client_id'] != cid or manifest['snapshot_id'] != sid:
                raise ValueError('Snapshot checksum/identity mismatch')
            if manifest['coverage'] != snapshot['coverage'] or manifest['expected_photos'] != len(snapshot['media']) or manifest['saved_photos'] != len(snapshot['media']):
                raise ValueError('Incomplete manifest')
            if path.name != 'client-' + cid + '-' + sid[:16] + '.zip':
                raise ValueError('Package filename mismatch')
            for filename, key in (('client.json', 'client'), ('profile.json', 'profile'), ('events.json', 'events'), ('lookups.json', 'lookups')):
                if json_bytes(read(archive, filename)) != snapshot[key]:
                    raise ValueError('Package sections disagree with snapshot')
            if set(files) - FIXED != {p['path'] for p in snapshot['media']}:
                raise ValueError('Media file set mismatch')
            for photo in snapshot['media']:
                if files[photo['path']] != {'bytes': photo['bytes'], 'sha256': photo['sha256']}:
                    raise ValueError('Photo checksum metadata mismatch')
                verify_image(read(archive, photo['path'], MAX_FILE), photo['path'].rsplit('.', 1)[1])
        return Package(path, cid, sid, snapshot)
    except (zipfile.BadZipFile, KeyError, TypeError, RuntimeError, OSError) as exc:
        raise ValueError('Invalid client ZIP package') from exc


def from_index(root, index):
    try:
        if index.get('complete') is not True or not index['clients']:
            raise ValueError('Full export index is incomplete/empty')
        account = sha(index['account_key'])
        if integer(index['source_client_count'], 'source_client_count') != len(index['clients']):
            raise ValueError('Index client count mismatch')
        packages = []
        total = 0
        for entry in index['clients']:
            name = entry['zip'].replace('\\', '/').rsplit('/', 1)[-1]
            if not re.fullmatch(r'client-[0-9]{1,16}\.[0-9]{1,16}-[0-9a-f]{16}\.zip', name):
                raise ValueError('Invalid indexed package filename')
            path = (root / name).resolve()
            if not path.is_relative_to(root.resolve()) or not path.is_file():
                raise ValueError('Referenced package is missing/outside input directory')
            total += path.stat().st_size
            if total > MAX_BATCH:
                raise ValueError('Export exceeds size limit')
            package = validate_package(path)
            if entry.get('verified') is not True or package.client_id != entry['client_id'] or package.snapshot_id != entry['snapshot_id'] or package.snapshot['account_key'] != account:
                raise ValueError('Index/package identity mismatch')
            packages.append(package)
        if index.get('client_ids_sha256') and index['client_ids_sha256'] != digest(sorted(p.client_id for p in packages)):
            raise ValueError('Index ID checksum mismatch')
        return packages
    except (KeyError, TypeError, AttributeError, OSError) as exc:
        raise ValueError('Invalid full export index') from exc


@contextmanager
def open_export(source):
    source = Path(source).resolve()
    try:
        with tempfile.TemporaryDirectory(prefix='bumpix-verify-') as temp:
            if source.is_dir():
                root = source
                if not (root / 'all-clients.index.json').is_file():
                    root = root / 'export' / 'packages' if (root / 'export' / 'packages').is_dir() else root / 'packages'
                index_path = root / 'all-clients.index.json'
                if not index_path.is_file() or index_path.stat().st_size > MAX_JSON:
                    raise ValueError('Complete all-clients.index.json is required for a directory')
                packages = from_index(root, json_bytes(index_path.read_bytes()))
            elif source.is_file():
                with zipfile.ZipFile(source) as outer:
                    names = zip_entries(outer, MAX_BATCH)
                    if 'all-clients.index.json' in names:
                        index = json_bytes(read(outer, 'all-clients.index.json'))
                        root = Path(temp)
                        expected = {e['zip'].replace('\\', '/').rsplit('/', 1)[-1] for e in index['clients']}
                        if names != expected | {'all-clients.index.json'}:
                            raise ValueError('Portable archive file set mismatch')
                        for name in expected:
                            if outer.getinfo(name).file_size > MAX_PACKAGE:
                                raise ValueError('Nested package exceeds limit')
                            with outer.open(name) as src, (root / name).open('xb') as dst:
                                shutil.copyfileobj(src, dst, 1024 * 1024)
                        packages = from_index(root, index)
                    else:
                        packages = [validate_package(source)]
            else:
                raise ValueError('Input export does not exist')
            clients, events, accounts = set(), set(), set()
            for p in packages:
                if p.client_id in clients:
                    raise ValueError('Duplicate source client in export')
                clients.add(p.client_id)
                accounts.add(p.snapshot['account_key'])
                for event in p.snapshot['events']:
                    eid = event['view']['id']
                    if eid in events:
                        raise ValueError('An event is assigned to two clients')
                    events.add(eid)
            if len(accounts) != 1:
                raise ValueError('Mixed source accounts')
            fingerprint = digest(sorted((p.client_id, p.snapshot_id) for p in packages))
            yield ExportSet(accounts.pop(), fingerprint, packages)
    except (zipfile.BadZipFile, KeyError, TypeError, OSError) as exc:
        raise ValueError('Invalid export input') from exc
