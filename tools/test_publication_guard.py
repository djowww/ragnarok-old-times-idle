import importlib.util
from pathlib import Path
import unittest
import subprocess
import tempfile
import os

spec = importlib.util.spec_from_file_location('guard', Path(__file__).with_name('check-publication.py'))
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)


class PublicationGuardTests(unittest.TestCase):
    def test_loopback_and_reserved_examples_are_allowed(self):
        self.assertEqual(list(guard.check_file('README.md', b'http://127.0.0.1:3339 https://203.0.113.10')), [])

    def test_operational_files_are_blocked(self):
        for path in ['deploy/server.conf', 'ops/notes.md', '.env.production', 'backup.sql.gz', 'server.key']:
            self.assertTrue(list(guard.check_file(path, b'')), path)

    def test_public_host_address_is_blocked_without_echoing_the_value(self):
        host = '.'.join(['8'] * 4)
        reasons = list(guard.check_file('README.md', ('https://' + host).encode()))
        self.assertEqual(len(reasons), 1)
        self.assertNotIn(host, reasons[0][1])

    def test_private_keys_and_personal_paths_are_blocked(self):
        self.assertTrue(list(guard.check_file('notes.txt', ('-----BEGIN ' + 'PRIVATE KEY-----').encode())))
        self.assertTrue(list(guard.check_file('notes.txt', ('C:/' + 'Users/' + 'Example/private').encode())))

    def test_source_schema_and_public_example_remain_allowed(self):
        self.assertEqual(list(guard.check_file('idle/server/schema.sql', b'CREATE TABLE demo (id INT);')), [])
        self.assertEqual(list(guard.check_file('.env.example', b'PUBLIC_ORIGIN=http://localhost')), [])

    def test_history_checks_files_removed_before_head(self):
        original = Path.cwd()
        with tempfile.TemporaryDirectory() as directory:
            try:
                os.chdir(directory)
                def run(*args):
                    return subprocess.check_output(['git', *args], stderr=subprocess.DEVNULL)
                run('init', '-q')
                run('config', 'user.email', 'example@example.test')
                run('config', 'user.name', 'Example')
                Path('private.key').write_text('example')
                run('add', '.')
                run('commit', '-qm', 'initial')
                run('rm', '-q', 'private.key')
                run('commit', '-qm', 'remove')
                inputs = list(guard.history_inputs())
                self.assertTrue(any(path == 'private.key' for path, data in inputs))
                self.assertTrue(any(list(guard.check_file(path, data)) for path, data in inputs))
            finally:
                os.chdir(original)


if __name__ == '__main__':
    unittest.main()
