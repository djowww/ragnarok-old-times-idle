import importlib.util
from pathlib import Path
import hashlib
import json
import subprocess
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('release', Path(__file__).with_name('build-release.py'))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)

class ReleaseTests(unittest.TestCase):
    def git(self, root, *args, input=None):
        return subprocess.check_output(['git', '-C', str(root), *args], input=input)

    def fixture(self, root):
        files = {
            'VERSION': b'1.2.3\n', 'idle/package.json': b'{"version":"1.2.3"}\n',
            'README.md': b'[preview]: https://example.test/\n', 'LICENSE': b'example license\n',
            'compose.yaml': b'services: {}\n', '.env.example': b'EXAMPLE=true\n',
            'windows/Start-Local.ps1': b'# local\n', 'windows/Open-Preview.ps1': b'# preview\n',
            'Iniciar-RagIDLE.cmd': b'@echo off\n', 'Jogar-Preview.cmd': b'@echo off\n',
            'docs/info.txt': b'committed public content\n',
            'docs/binary.bin': b'\x00binary\nblob header-like content\xff\n',
        }
        self.git(root, 'init', '-q')
        self.git(root, 'config', 'core.autocrlf', 'false')
        self.git(root, 'config', 'user.name', 'Example')
        self.git(root, 'config', 'user.email', 'example@example.test')
        for name, data in files.items():
            path = root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        self.git(root, 'add', '.')
        self.git(root, 'commit', '-qm', 'fixture')
        return self.git(root, 'rev-parse', 'HEAD').decode().strip()

    def test_build_uses_one_commit_despite_dirty_staged_and_untracked_files(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = self.fixture(root)
            (root / 'docs/info.txt').write_bytes(b'local replacement\n')
            (root / 'README.md').write_text('[preview]: https://changed.example.test/\n')
            (root / 'VERSION').write_text('9.9.9\n')
            (root / 'idle/package.json').write_text('{"version":"9.9.9"}\n')
            self.git(root, 'add', '.')
            (root / 'docs/untracked.txt').write_bytes(b'untracked\n')
            for package in release.build(root, root / 'out'):
                self.assertIn('1.2.3', package.name)
                with zipfile.ZipFile(package) as z:
                    self.assertEqual(z.read('VERSION'), b'1.2.3\n')
                    self.assertEqual(json.loads(z.read('BUILD-INFO.json'))['sourceCommit'], source)
                    if 'Local' in package.name:
                        self.assertEqual(z.read('docs/info.txt'), b'committed public content\n')
                        self.assertEqual(z.read('docs/binary.bin'), b'\x00binary\nblob header-like content\xff\n')
                        self.assertNotIn('docs/untracked.txt', z.namelist())
                    else:
                        self.assertIn(b'https://example.test/', z.read('README.md'))
                        self.assertNotIn(b'changed.example.test', z.read('README.md'))

    def test_committed_symlinks_are_rejected_before_output_is_created(self):
        # Git mode fixtures work even on Windows without symlink privileges.
        for name, target in [('docs/info.txt', '/etc/hosts'),
                             ('VERSION', '/missing/version'),
                             ('README.md', '/missing/readme'),
                             ('idle/package.json', '/missing/package')]:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as folder:
                root = Path(folder)
                self.fixture(root)
                blob = self.git(root, 'hash-object', '-w', '--stdin', input=target.encode()).decode().strip()
                self.git(root, 'update-index', '--add', '--cacheinfo', f'120000,{blob},{name}')
                self.git(root, 'commit', '-qm', 'tracked link')
                with self.assertRaisesRegex(ValueError, '[Ss]ymlink|[Rr]egular file'):
                    release.build(root, root / 'out')
                self.assertFalse((root / 'out').exists())

    def test_worktree_symlink_cannot_include_external_contents(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder) / 'repo'
            root.mkdir()
            self.fixture(root)
            external = Path(folder) / 'external.txt'
            external.write_bytes(b'external host content\n')
            path = root / 'docs/info.txt'
            path.unlink()
            try:
                path.symlink_to(external)
            except OSError as error:
                self.skipTest('OS does not permit creating test symlinks: ' + str(error))
            local = next(p for p in release.build(root, root / 'out') if 'Local' in p.name)
            with zipfile.ZipFile(local) as z:
                self.assertEqual(z.read('docs/info.txt'), b'committed public content\n')
                self.assertNotIn(b'external host content', b''.join(z.read(p) for p in z.namelist()))

    def test_gitlink_is_rejected_before_output_is_created(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = self.fixture(root)
            self.git(root, 'update-index', '--add', '--cacheinfo', f'160000,{source},docs/submodule')
            self.git(root, 'commit', '-qm', 'gitlink fixture')
            with self.assertRaisesRegex(ValueError, '[Rr]egular file'):
                release.build(root, root / 'out')
            self.assertFalse((root / 'out').exists())

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
