# Desenvolvimento idle no ambiente cloud

Fluxo mínimo: Node.js 24 (validado com 24.19.0), pnpm **11.25.0**, Docker local e MariaDB isolado. Use o checkout existente em `/workspace/ragnarok-old-times-idle`; cada tarefa cloud já é isolada e não precisa de worktree. Preserve código, testes, manifests e lockfile. As instruções abaixo não exigem credenciais externas.

## Instalar e compilar

Com Node 24 disponível, instale o pnpm fora do checkout e mantenha seus diretórios auxiliares em `/workspace`:

```bash
node --version # deve ser v24.x
npm install --prefix /workspace/cloud-onboarding/ragnarok-tools \
  --no-audit --no-fund --ignore-scripts --save-exact pnpm@11.25.0
export PATH="/workspace/cloud-onboarding/ragnarok-tools/node_modules/.bin:$PATH"
export XDG_CONFIG_HOME=/workspace/cloud-onboarding/ragnarok/xdg-config
export XDG_DATA_HOME=/workspace/cloud-onboarding/ragnarok/xdg-data
export XDG_CACHE_HOME=/workspace/cloud-onboarding/ragnarok/xdg-cache
cd /workspace/ragnarok-old-times-idle/idle
pnpm --version # 11.25.0
pnpm install --frozen-lockfile --store-dir /workspace/cloud-onboarding/ragnarok/pnpm-store
pnpm build
```

O build gera `idle/dist/` e `idle/public-build/`, ignorados pelo Git. Não regenere o catálogo nem altere o lockfile durante o setup. Preserve verificações de TLS, assinaturas e integridade dos pacotes.

## Banco isolado

Use somente o Docker local e reserve os nomes abaixo para este banco de desenvolvimento. Não reutilize um container ou volume de outra aplicação. O banco descartável aceita root sem senha **apenas neste fluxo isolado**, com a porta publicada em loopback; a configuração não serve para produção ou acesso compartilhado.

```bash
unset DOCKER_HOST DOCKER_CONTEXT DOCKER_TLS DOCKER_TLS_VERIFY DOCKER_CERT_PATH
docker --host=unix:///var/run/docker.sock info >/dev/null
docker --host=unix:///var/run/docker.sock run -d \
  --name codex-ragnarok-db --restart unless-stopped \
  -p 127.0.0.1:3307:3306 \
  -e MARIADB_DATABASE=hercules -e MARIADB_ALLOW_EMPTY_ROOT_PASSWORD=1 \
  --mount type=volume,src=codex-ragnarok-db-data,dst=/var/lib/mysql \
  --health-cmd 'healthcheck.sh --connect --innodb_initialized' \
  --health-interval=3s --health-timeout=3s --health-retries=20 \
  mariadb@sha256:1292844148b311e4ed4300022a996d39083f415a963e970cf47cad1b3b18e3a6
docker --host=unix:///var/run/docker.sock inspect \
  --format '{{.State.Health.Status}}' codex-ragnarok-db
```

Espere o resultado `healthy` antes de iniciar a API; consulte `docker --host=unix:///var/run/docker.sock logs codex-ragnarok-db` se não ficar saudável. Nas próximas inicializações, use `docker --host=unix:///var/run/docker.sock start codex-ragnarok-db` em vez de recriar o container e confira a saúde novamente. Não remova o volume para corrigir um problema de inicialização.

## Iniciar e conferir

Execute cada bloco em um terminal separado. O serviço de diagnóstico permite iniciar sem arquivos do cliente:

```bash
cd /workspace/ragnarok-old-times-idle
PORT=8081 node docker/asset-service/no-assets-server.js
```

```bash
cd /workspace/ragnarok-old-times-idle/idle
DB_HOST=127.0.0.1 DB_PORT=3307 DB_NAME=hercules DB_USER=root DB_PASSWORD= \
  ASSET_ORIGIN=http://127.0.0.1:8081 PORT=3339 node dist/server/index.js
```

```bash
cd /workspace/ragnarok-old-times-idle/idle
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort
```

A API migra as tabelas e inicializa o perfil automaticamente. Mantenha Vite em **5173**, pois as origens de POST permitidas são fixas. Faça verificações locais; os endereços abaixo não são links de preview cloud:

```bash
curl --noproxy '*' -fsS http://127.0.0.1:3339/api/health
curl --noproxy '*' -fsS http://127.0.0.1:3339/api/catalog
curl --noproxy '*' -fsS http://127.0.0.1:3339/ >/dev/null
curl --noproxy '*' -fsS http://127.0.0.1:5173/ >/dev/null
curl --noproxy '*' -fsS -X POST -H 'Origin: http://127.0.0.1:3339' \
  http://127.0.0.1:3339/api/session
curl --noproxy '*' -fsS -X POST -H 'Origin: http://127.0.0.1:5173' \
  http://127.0.0.1:5173/api/session
curl --noproxy '*' -sS -i http://127.0.0.1:5173/assets/data/missing.spr
```

Espere HTTP 200 e `status: "ok"` no health, catálogo e sessões em JSON, e páginas HTML nas duas portas. O último pedido deve retornar **404** com `ASSET_UNAVAILABLE`; o serviço sem assets responde 503 diretamente por definição.

Pare os três processos com Ctrl+C e, se necessário, pare somente este banco com `docker --host=unix:///var/run/docker.sock stop codex-ragnarok-db`. O volume é preservado localmente. Processos e estado do Docker precisam ser reiniciados em novas tarefas; a restauração do volume em outra instância não é garantida.

## Validação e falhas conhecidas

Na pasta `idle/`, com pnpm e os diretórios XDG configurados como acima:

```bash
pnpm typecheck
DB_HOST=127.0.0.1 DB_PORT=3307 DB_NAME=hercules DB_USER=root DB_PASSWORD= \
  IDLE_DB_TEST=1 pnpm test --maxWorkers=2
```

Baseline validado no commit `ef0ae6bf78bf7a3bc5ce10e494314ee8ea21be52`: instalação frozen, build e smoke funcional de API/Vite/MariaDB passaram. O Vitest terminou com **64 testes aprovados, 21 falhos e 1 ignorado** (86 no total, incluindo os sete testes de persistência MariaDB). **A suíte completa não passa.** As falhas existentes são:

- 13 testes de troca de classe ignoram o cooldown de recuperação de 10 segundos após retirada.
- 5 testes de imunidade elemental selecionam o primeiro evento contra o inimigo, agora um evento de habilidade sem `amount`, antes do evento de dano.
- 1 teste de animação de morte espera repetição, enquanto o renderer mantém o último frame.
- 2 testes de conteúdo pressupõem somente oito cartas e ausência do item 511; o catálogo também preserva 88 cartas inertes e o item 511 como loot inerte.

O `typecheck` falha porque `tests/engine-fixture.ts:15` omite `Challenge.category`, obrigatório em `shared/types.ts`. O teste ignorado requer GRFs locais ausentes. Esses resultados são defeitos ou divergências existentes no repositório, não uma suíte verde nem evidência de falha da instalação. Correções de código devem ocorrer em uma tarefa própria.

## Recursos opcionais

Assets originais exigem um cliente autorizado em `client-data/`, com `DATA.INI` e seus GRFs; não os baixe nem os versione durante o setup. Hercules, cliente clássico e stack Compose completa são opcionais para este fluxo e não foram validados aqui. Para executá-los, siga o [README](../README.md), configure `.env` localmente com valores seguros e mantenha senhas fora de commits, logs e instruções salvas.
