import hashlib
import os
import uuid
from pathlib import Path


def safe_path(root, relative):
    root = Path(root).resolve()
    target = (root / relative).resolve()
    if not target.is_relative_to(root):
        raise ValueError('Storage path escapes private media root')
    return target


def atomic_write(path, body):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name('.' + path.name + '.' + uuid.uuid4().hex + '.tmp')
    try:
        with temp.open('xb') as file:
            file.write(body)
            file.flush()
            os.fsync(file.fileno())
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)


def store_photos(package, root, studio_id, account):
    paths = {}
    for photo in package.snapshot['media']:
        relative = f"bumpix/{studio_id}/{account}/{photo['path']}"
        path = safe_path(root, relative)
        if not path.is_file() or path.stat().st_size != photo['bytes'] or hashlib.sha256(path.read_bytes()).hexdigest() != photo['sha256']:
            atomic_write(path, package.media_bytes(photo))
        paths[photo['path']] = relative
    return paths
