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

    def test_explicit_public_game_url_is_allowed_only_in_readmes_and_policy(self):
        import json
        url = json.loads(Path(__file__).with_name('publication-policy.json').read_text())['publicGameUrl']
        for path in ['README.md', 'README.en.md', 'tools/publication-policy.json']:
            self.assertEqual(list(guard.check_file(path, ('[Jogar](' + url + ')').encode())), [], path)
        for path in ['notes.md', 'idle/server/example.ts', '.env.example']:
            self.assertTrue(list(guard.check_file(path, url.encode())), path)

    def test_public_url_exception_does_not_allow_other_uses_of_its_ip(self):
        import json
        from urllib.parse import urlsplit
        url = json.loads(Path(__file__).with_name('publication-policy.json').read_text())['publicGameUrl']
        host = urlsplit(url).hostname
        for text in [host, 'ssh root@' + host, 'https://' + host + ':22/', url + 'admin', url + '?token=example', url + '@other.example.test/', 'https://proxy.example.test/?to=' + url, 'prefix' + url]:
            self.assertTrue(list(guard.check_file('README.md', text.encode())), text)
        self.assertTrue(list(guard.check_file('README.md', (url + ' ' + host).encode())))

    def test_internal_prompt_directories_are_blocked(self):
        for path in ['docs/superpowers/plans/example.md', '.superpowers/sdd/run.json']:
            self.assertTrue(list(guard.check_file(path, b'example')), path)

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

    def test_retired_preview_url_is_history_only(self):
        from unittest.mock import patch
        retired = 'https://' + '.'.join(['9'] * 4) + ':8443/'
        with patch.object(guard, 'PREVIOUS_PUBLIC_URLS', (retired,), create=True):
            self.assertTrue(list(guard.check_file('README.md', retired.encode())))
            self.assertEqual(list(guard.check_file('README.md', retired.encode(), historical=True)), [])
            self.assertTrue(list(guard.check_file('notes.md', retired.encode(), historical=True)))
            self.assertEqual(list(guard.check_file('tools/publication-policy.json', retired.encode())), [])

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
