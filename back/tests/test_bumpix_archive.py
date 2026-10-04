import copy
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bumpix_fixtures import ACCOUNT, add_photo, encoded, snapshot, write_index, write_package, rewrite_zip


class ArchiveTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def reader(self):
        from services.bumpix_import.archive import open_export
        return open_export

    def package(self, cid='1.100'):
        data = snapshot(cid)
        images = dict([add_photo(data), add_photo(data, 'avatar', color='blue')])
        path, sid = write_package(self.root, data, images)
        return data, images, path, sid

    def test_single_package_retains_statuses_unknown_fields_and_two_photo_owners(self):
        data, images, path, _ = self.package()
        with self.reader()(path) as export:
            self.assertEqual(export.account_key, ACCOUNT)
            self.assertEqual(len(export.packages), 1)
            package = export.packages[0]
            self.assertEqual(package.snapshot, data)
            self.assertEqual(package.client_id, '1.100')
            for photo in data['media']:
                self.assertEqual(package.media_bytes(photo), images[photo['path']])

    def test_windows_index_paths_are_portable_and_string_ids_are_distinct(self):
        entries = []
        for cid in ('1.10', '1.100'):
            _, _, path, sid = self.package(cid)
            entries.append((cid, path, sid))
        write_index(self.root, entries)
        with self.reader()(self.root) as export:
            self.assertEqual([p.client_id for p in export.packages], ['1.10', '1.100'])

    def test_portable_outer_zip_preserves_nested_packages(self):
        _, _, path, sid = self.package()
        index = write_index(self.root, [('1.100', path, sid)])
        outer = self.root / 'migration.zip'
        with zipfile.ZipFile(outer, 'w') as archive:
            archive.writestr('all-clients.index.json', encoded(index))
            archive.write(path, path.name)
        with self.reader()(outer) as export:
            self.assertEqual(export.packages[0].client_id, '1.100')

    def test_corrupt_photo_or_snapshot_fails_before_any_import(self):
        for entry in ('snapshot.json', 'photo'):
            with self.subTest(entry=entry):
                data, images, path, _ = self.package()
                name = next(iter(images)) if entry == 'photo' else entry
                rewrite_zip(path, {name: b'corrupt'})
                with self.assertRaises(ValueError):
                    with self.reader()(path):
                        pass

    def test_self_consistent_archive_with_foreign_event_or_wrong_status_is_rejected(self):
        for bad in ('client', 'status', 'photo'):
            with self.subTest(bad=bad):
                data = snapshot()
                images = dict([add_photo(data)])
                if bad == 'client':
                    data['events'][0]['raw']['5'] = '1.101'
                elif bad == 'status':
                    data['events'][0]['view']['status'] = 'completed'
                else:
                    data['media'][0]['owner_id'] = '3.9999'
                path, _ = write_package(self.root, data, images)
                with self.assertRaises(ValueError):
                    with self.reader()(path):
                        pass

    def test_extra_paths_duplicate_entries_and_incomplete_index_fail(self):
        _, _, path, sid = self.package()
        rewrite_zip(path, {'../escape.txt': b'x'})
        with self.assertRaises(ValueError):
            with self.reader()(path):
                pass
        _, _, path, sid = self.package()
        index = write_index(self.root, [('1.100', path, sid)])
        index['complete'] = False
        (self.root / 'all-clients.index.json').write_bytes(encoded(index))
        with self.assertRaises(ValueError):
            with self.reader()(self.root):
                pass

    def test_missing_index_package_and_unknown_image_bytes_are_not_silently_skipped(self):
        _, _, path, sid = self.package()
        write_index(self.root, [('1.100', path, sid)])
        path.unlink()
        with self.assertRaises(ValueError):
            with self.reader()(self.root):
                pass
        data = snapshot()
        name, body = add_photo(data)
        import hashlib
        fake = b'not an image'
        sha = hashlib.sha256(fake).hexdigest()
        data['media'][0].update(path='media/' + sha + '.png', sha256=sha, bytes=len(fake))
        path, _ = write_package(self.root, data, {data['media'][0]['path']: fake})
        with self.assertRaises(ValueError):
            with self.reader()(path):
                pass

    def test_truncated_jpeg_with_valid_header_is_rejected(self):
        import hashlib
        from io import BytesIO
        from PIL import Image
        stream = BytesIO()
        Image.new('RGB', (100, 100), 'blue').save(stream, format='JPEG')
        body = stream.getvalue()
        scan = body.index(b'\xff\xda')
        header_end = scan + 2 + int.from_bytes(body[scan+2:scan+4], 'big')
        truncated = body[:header_end] + body[header_end:header_end+3]
        data = snapshot()
        add_photo(data)
        sha = hashlib.sha256(truncated).hexdigest()
        photo = data['media'][0]
        photo.update(path='media/' + sha + '.jpg', sha256=sha, bytes=len(truncated))
        path, _ = write_package(self.root, data, {photo['path']: truncated})
        with self.assertRaises(ValueError):
            with self.reader()(path):
                pass

    def test_duplicate_zip_entry_is_rejected(self):
        import warnings
        _, _, path, _ = self.package()
        with warnings.catch_warnings():
            warnings.simplefilter('ignore', UserWarning)
            with zipfile.ZipFile(path, 'a') as archive:
                archive.writestr('snapshot.json', archive.read('snapshot.json'))
        with self.assertRaises(ValueError):
            with self.reader()(path):
                pass


if __name__ == '__main__':
    unittest.main()
