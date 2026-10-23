import importlib.util
from pathlib import Path
import hashlib
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('release', Path(__file__).with_name('build-release.py'))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)

class ReleaseTests(unittest.TestCase):
    def test_public_source_paths(self):
        for p in ['README.md', '.env.example', 'compose.yaml', 'idle/server/index.ts', 'windows/Start-Local.ps1']:
            self.assertTrue(release.allowed_path(p), p)

    def test_private_and_generated_paths(self):
        for p in ['.env', '.env.production', 'client-data/data.grf', 'merge/notes.md',
                  'ops/site.conf', 'backups/database.sql.gz', 'idle/node_modules/index.js',
                  'idle/public-build/index.html', 'docs/superpowers/specs/notes.md',
                  'idle/content/private.key', '../secret.txt', '/secret.txt', '.git/config']:
            self.assertFalse(release.allowed_path(p), p)

    def test_zip_is_deterministic_and_windows_commands_use_crlf(self):
        with tempfile.TemporaryDirectory() as folder:
            a, b = Path(folder)/'a.zip', Path(folder)/'b.zip'
            entries = {'Jogar.cmd': b'@echo off\necho test\n', 'README.md': b'hello\n'}
            release.write_zip(a, entries)
            release.write_zip(b, entries)
            self.assertEqual(hashlib.sha256(a.read_bytes()).digest(), hashlib.sha256(b.read_bytes()).digest())
            with zipfile.ZipFile(a) as z:
                self.assertIsNone(z.testzip())
                self.assertEqual(z.read('Jogar.cmd'), b'@echo off\r\necho test\r\n')

if __name__ == '__main__':
    unittest.main()
