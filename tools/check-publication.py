#!/usr/bin/env python3
"""Check publication inputs without printing matched values."""
import argparse
import ipaddress
import json
from pathlib import Path
import re
import subprocess
import sys

PRIVATE_DIRS = {'deploy', 'merge', 'ops', 'releases', 'backups'}
PRIVATE_FILES = {'compose.production.yaml', 'database.sql', 'docs/cloud-environment.md'}
IPV4 = re.compile(r'(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w.])')
DOCUMENTATION = tuple(ipaddress.ip_network(x) for x in ('192.0.2.0/24', '198.51.100.0/24', '203.0.113.0/24'))
CREDENTIALS = re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[A-Z0-9]{16}')
PERSONAL_PATH = re.compile(r'(?:[A-Z]:[\\/](?:Users|Documents and Settings)[\\/]|/root/\.ssh/|/opt/[^\s]+/(?:releases|backups)/)', re.I)


def path_reason(path):
    p = Path(path)
    if p.parts and p.parts[0] in PRIVATE_DIRS or path in PRIVATE_FILES:
        return 'arquivo operacional privado'
    if p.name.startswith('.env') and p.name != '.env.example':
        return 'arquivo de ambiente privado'
    if p.suffix in {'.pem', '.key', '.private', '.dump'} or p.name.endswith('.sql.gz') or p.name.startswith(('id_rsa', 'id_ed25519')):
        return 'credencial ou cópia de dados'
    return None


def text_reasons(text):
    for number, line in enumerate(text.splitlines(), 1):
        if CREDENTIALS.search(line):
            yield number, 'possível credencial'
        if PERSONAL_PATH.search(line):
            yield number, 'caminho operacional pessoal'
        for match in IPV4.finditer(line):
            try:
                address = ipaddress.ip_address(match.group())
            except ValueError:
                continue
            if address.is_loopback or address.is_unspecified or any(address in net for net in DOCUMENTATION):
                continue
            yield number, 'endereço IP que exige remoção ou exemplo reservado'
            break


def check_file(path, data):
    reason = path_reason(path)
    if reason:
        yield 0, reason
    if b'\0' in data:
        return
    try:
        text = data.decode('utf-8')
    except UnicodeDecodeError:
        return
    yield from text_reasons(text)


def git(*args):
    return subprocess.check_output(['git', *args])


def history_inputs():
    seen = set()
    for commit in git('rev-list', '--all').decode().splitlines():
        message = git('show', '-s', '--format=%B', commit)
        yield 'commit ' + commit[:12], message
        for entry in git('ls-tree', '-r', '-z', commit).split(b'\0'):
            if not entry:
                continue
            meta, raw_path = entry.split(b'\t', 1)
            mode, kind, sha = meta.decode().split()
            if kind != 'blob':
                continue
            path = raw_path.decode('utf-8')
            key = (path, sha)
            if key in seen:
                continue
            seen.add(key)
            yield path, git('cat-file', 'blob', sha)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--staged', action='store_true')
    group.add_argument('--history', action='store_true')
    args = parser.parse_args()
    if args.history:
        inputs = history_inputs()
    else:
        paths = (git('diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z')
                 if args.staged else git('ls-files', '-z')).decode().split('\0')
        inputs = ((path, git('show', ':' + path) if args.staged else Path(path).read_bytes())
                  for path in filter(None, paths))
    findings = []
    for path, data in inputs:
        findings.extend((path, line, reason) for line, reason in check_file(path, data))
    for path, line, reason in findings:
        print('BLOQUEADO ' + json.dumps(path, ensure_ascii=True) + ':' + str(line) + ' - ' + reason)
    if findings:
        print('Publicação bloqueada. Valores encontrados foram omitidos.')
        return 1
    print('Verificação de publicação: nenhum impedimento encontrado.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
