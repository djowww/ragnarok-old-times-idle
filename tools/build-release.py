#!/usr/bin/env python3
"""Build deterministic Windows kits exclusively from tracked public sources."""
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import zipfile

ROOT_FILES = {'.env.example', '.gitattributes', '.gitignore', 'README.md', 'README.en.md',
              'VERSION', 'LICENSE', 'CONTRIBUTING.md', 'SECURITY.md', 'CHANGELOG.md',
              'compose.yaml', 'Jogar-Preview.cmd', 'Iniciar-RagIDLE.cmd', 'Parar-RagIDLE.cmd'}
SOURCE_DIRS = {'idle', 'docker', 'docs', 'tools', 'windows'}
EXCLUDED_PARTS = {'node_modules', '.pnpm-store', '__pycache__', '.staging', 'coverage',
                  'dist', 'public-build', 'superpowers'}
PRIVATE_SUFFIXES = {'.grf', '.gpf', '.spr', '.act', '.gat', '.gnd', '.rsw', '.mp3',
                    '.wav', '.key', '.pem', '.dump', '.log', '.pyc'}

def allowed_path(name):
    p = PurePosixPath(name)
    if p.is_absolute() or '..' in p.parts or any(part in EXCLUDED_PARTS for part in p.parts):
        return False
    if p.name.startswith('.env') and name != '.env.example':
        return False
    if p.suffix.lower() in PRIVATE_SUFFIXES or p.name.endswith('.sql.gz'):
        return False
    return name in ROOT_FILES or (len(p.parts) > 1 and p.parts[0] in SOURCE_DIRS)

def committed_sources(root, source):
    """Read regular blobs from one commit, never the index or working tree."""
    raw = subprocess.check_output(['git', '-C', str(root), 'ls-tree', '-rz', source])
    blobs = []
    for entry in raw.split(b'\0'):
        if not entry:
            continue
        metadata, name = entry.split(b'\t', 1)
        mode, kind, oid = metadata.split()
        name = name.decode('utf-8')
        if not allowed_path(name):
            continue
        if mode not in (b'100644', b'100755') or kind != b'blob':
            raise ValueError('Release sources must be regular files (no symlinks): ' + name)
        blobs.append((name, oid))
    data = subprocess.check_output(['git', '-C', str(root), 'cat-file', '--batch'],
                                   input=b''.join(oid + b'\n' for _, oid in blobs))
    stream = io.BytesIO(data)
    files = {}
    for name, oid in blobs:
        actual_oid, kind, size = stream.readline().split()
        if actual_oid != oid or kind != b'blob':
            raise ValueError('Unexpected Git object for release source: ' + name)
        files[name] = stream.read(int(size))
        if len(files[name]) != int(size) or stream.read(1) != b'\n':
            raise ValueError('Incomplete Git blob for release source: ' + name)
    return files

def write_zip(path, entries):
    with zipfile.ZipFile(path, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name, data in sorted(entries.items()):
            if name.endswith('.cmd'):
                data = data.replace(b'\r\n', b'\n').replace(b'\n', b'\r\n')
            item = zipfile.ZipInfo(name, date_time=(2026, 10, 23, 0, 0, 0))
            item.compress_type = zipfile.ZIP_DEFLATED
            item.external_attr = 0o100644 << 16
            z.writestr(item, data)
    with zipfile.ZipFile(path) as z:
        if z.testzip():
            raise RuntimeError('ZIP integrity verification failed')

def build(root, output):
    root, output = Path(root).resolve(), Path(output).resolve()
    source = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()
    local = committed_sources(root, source)
    version = local['VERSION'].decode('utf-8').strip()
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError('Invalid release version')
    if json.loads(local['idle/package.json'])['version'] != version:
        raise ValueError('Package and release versions differ')
    readme = local['README.md'].decode('utf-8')
    match = re.search(r'^\[preview\]:\s*(https://\S+)\s*$', readme, flags=re.M)
    if not match:
        raise ValueError('Preview reference missing')
    url = match.group(1)
    for required in ['compose.yaml', '.env.example', 'windows/Start-Local.ps1', 'Iniciar-RagIDLE.cmd']:
        if required not in local:
            raise ValueError('Required public file missing: ' + required)
    local['client-data/LEIA-ME.txt'] = ('Coloque aqui os recursos do seu cliente. Consulte docs/WINDOWS.md.\n'
        'Arquivos de cliente nao acompanham o pacote.\n').encode()
    preview = {p: local[p] for p in ['VERSION', 'LICENSE', 'Jogar-Preview.cmd', 'windows/Open-Preview.ps1']}
    preview['README.md'] = (f'# RagIDLE {version} — Preview Windows\n\n'
        'Extraia o ZIP inteiro e abra **Jogar-Preview.cmd**. Requer internet e navegador.\n'
        'Nao instala servidor nem requer Docker.\n\n'
        '[Jogar no navegador][preview]\n\n'
        '[Projeto, codigo-fonte e guia de instalacao local](https://github.com/djowww/ragnarok-old-times-idle)\n\n'
        f'[preview]: {url}\n').encode()
    output.mkdir(parents=True, exist_ok=True)
    packages = []
    for kind, entries in [('Preview', preview), ('Local', local)]:
        entries['BUILD-INFO.json'] = json.dumps({'version': version, 'sourceCommit': source,
            'kind': kind, 'originalClientAssetsIncluded': False}, indent=2).encode()
        path = output / f'RagIDLE-{version}-Windows-{kind}.zip'
        write_zip(path, entries)
        packages.append(path)
    sums = ''.join(hashlib.sha256(p.read_bytes()).hexdigest() + '  ' + p.name + '\n' for p in packages)
    (output / 'SHA256SUMS.txt').write_text(sums)
    return packages

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default='.artifacts')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    for path in build(root, args.output):
        print(path.name, path.stat().st_size, 'bytes')
