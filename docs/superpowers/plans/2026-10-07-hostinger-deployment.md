# Hostinger VPS Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Publicar a versão atual do RagIDLE na VPS Hostinger, preservando o perfil existente e deixando o computador local livre para desligar a stack.

**Architecture:** Servir o jogo em `https://tibia74.tech:8443` através da Cloudflare, com autenticação Nginx. Containers com imagens preparadas localmente executarão em um projeto Compose separado, usando um MariaDB e um volume de produção próprios; Nginx encaminhará interface, mapa e WebSocket em uma única origem.

**Tech Stack:** Docker Engine e Compose, Nginx, UFW, MariaDB 11.4, Fastify, React/Vite, roBrowserLegacy, Hercules, Let's Encrypt e Cloudflare.

**Spec:** `docs/superpowers/specs/2026-10-07-hostinger-deployment-design.md`

## Global Constraints

- O endereço de acesso será `https://tibia74.tech:8443`, passando pela Cloudflare já configurada para esse domínio. O IP de origem continua sendo o da VPS. Não será criada nem alterada uma entrada DNS.
- O jogo ficará protegido por uma autenticação HTTP Basic com credencial aleatória, armazenada como hash na configuração privada do Nginx e entregue ao usuário após a implantação.
- A VPS tem Ubuntu 22.04, 4 GiB de RAM, aproximadamente 1,5 GiB disponíveis, 32 GB livres em disco, nenhuma swap e serviços existentes de Nginx, MariaDB, TFS e FifaGo.
- A stack RagIDLE medida localmente usa cerca de 949 MiB em repouso e depende de aproximadamente 3,51 GB em `client-data`.
- O usuário aprovou adicionar um arquivo de swap de 2 GiB.
- As regras atuais das portas 80 e 443 não serão alteradas.
- Todos os mapeamentos de portas dos containers RagIDLE permanecerão em loopback; o Nginx do host será o único ponto de entrada externo.
- O banco MariaDB já instalado no host não será reaproveitado nem alterado.
- Preservar o volume local `mariadb_data`, o perfil, os arquivos de cliente e todas as alterações preexistentes no worktree. Não usar `down -v`, wipe, reset ou commits de arquivos alheios a esta implantação.

## Review Focus

1. Um browser em HTTPS não deve tentar conectar por `ws://`; a configuração deve gerar `wss://tibia74.tech:8443/ws/` e o handshake autenticado deve chegar ao proxy de WebSocket.
2. O mapa iframe em `/ro/` deve carregar o MapViewer e entregar mensagens ao pai apenas para uma origem permitida, usando a mesma origem em produção e mantendo os hosts locais de desenvolvimento.
3. O backend deve aceitar `https://tibia74.tech:8443` para comandos e continuar rejeitando origens arbitrárias; verificar `/api/session` com origem permitida e bloqueada.
4. A autenticação deve proteger a raiz, API, assets, MapViewer e WebSocket; conferir desafio 401 sem credenciais e acesso autenticado em cada rota.
5. O banco importado deve mostrar o perfil atual após a inicialização e continuar íntegro depois de reiniciar somente o projeto `ragidle-prod`.

## Arquivos e responsabilidades

| Caminho | Ação | Responsabilidade |
|---|---|---|
| `idle/server/app.ts` | Modificar | Permitir lista de origens configurável sem remover a proteção por origem. |
| `idle/server/index.ts` | Modificar | Ler a origem de produção do ambiente e passar a configuração ao Fastify. |
| `idle/web/components/OriginalMap.tsx` | Modificar | Carregar o MapViewer na rota `/ro/` da origem atual e manter o bridge nessa origem. |
| `idle/web/App.tsx` | Modificar | Apontar o link do cliente clássico para o caminho publicado `/ro/`. |
| `docker/web-client/Config.local.js.template` | Modificar | Derivar assets e WebSocket do host atual, usando HTTPS/WSS em produção e endpoints locais durante desenvolvimento. |
| `docker/web-client/map-idle.html` | Modificar | Usar assets same-origin e restringir mensagens ao pai esperado. |
| `docker/web-client/mapviewer-idle.patch` | Modificar | Aceitar a origem same-origin em produção e conservar os hosts locais de desenvolvimento. |
| `compose.production.yaml` | Criar | Definir imagens já construídas, ambiente de produção, volume de banco independente e portas loopback. |
| `.env.production.example` | Criar | Documentar variáveis necessárias sem incluir valores secretos. |
| `deploy/hostinger/ragidle.conf` | Criar | Configurar TLS, Basic Auth, SPA, assets, `/ro/` e proxy WebSocket no Nginx. |

---

### Task 1: Endpoints same-origin para produção

**Arquivos:**
- Modificar: `idle/server/app.ts`
- Modificar: `idle/server/index.ts`
- Modificar: `idle/web/components/OriginalMap.tsx`
- Modificar: `idle/web/App.tsx`
- Modificar: `docker/web-client/Config.local.js.template`
- Modificar: `docker/web-client/map-idle.html`
- Modificar: `docker/web-client/mapviewer-idle.patch`

**Interfaces:**
- O Fastify recebe `RAGIDLE_ALLOWED_ORIGINS`, uma lista separada por vírgulas; sem variável, mantém as origens localhost já suportadas.
- O frontend acessa o visualizador pelo caminho `/ro/map-idle.html`; o cliente roBrowser deriva assets e socket da origem atual em produção.
- O proxy WebSocket recebe `WS_ALLOWED_ORIGINS=https://tibia74.tech:8443` pelo Compose de produção.

- [x] Adicionar opção `allowedOrigins?: readonly string[]` a `AppOptions`; usar uma `Set` derivada da opção e manter os valores locais como fallback.
- [x] Em `server/index.ts`, dividir `RAGIDLE_ALLOWED_ORIGINS` por vírgula, remover espaços e passar o resultado a `buildApp`.
- [x] Em `OriginalMap.tsx` e `App.tsx`, usar `/ro/` same-origin fora de localhost e preservar `:3338/applications/pwa/` para localhost/127.0.0.1.
- [x] No template roBrowser, selecionar `/assets/` e `wss://<host>/ws/` quando HTTPS; manter `127.0.0.1:8080` e `ws://127.0.0.1:5999/` em hosts locais.
- [x] Ajustar `map-idle.html` e o patch do MapViewer para validar a origem do pai antes de enviar ou aceitar `postMessage`.
- [x] Rodar `pnpm typecheck` e `pnpm build` no diretório `idle`; confirmar sucesso sem executar a suíte de testes.

### Task 2: Topologia Compose e Nginx de produção

**Arquivos:**
- Criar: `compose.production.yaml`
- Criar: `.env.production.example`
- Criar: `deploy/hostinger/ragidle.conf`

**Interfaces:**
- Projeto remoto: `ragidle-prod`.
- Tag de imagens: `ragidle-idle-game:vps-20261007`, `ragidle-hercules:vps-20261007`, `ragidle-web-client:vps-20261007`, `ragidle-websocket-proxy:vps-20261007`, `ragidle-asset-service:vps-20261007`.
- Origem pública: `https://tibia74.tech:8443`.
- Nginx: `/` para `127.0.0.1:3339`, `/ro/` para `127.0.0.1:3338/applications/pwa/`, `/ws/` para `127.0.0.1:5999` com Upgrade WebSocket.
- Dados: `./client-data:/app/resources:ro`; volume nomeado de MariaDB exclusivo para `ragidle-prod`.

- [x] Criar Compose de produção com os seis serviços atuais, imagens tagueadas, healthcheck do jogo, `restart: unless-stopped`, banco sem porta publicada e Hercules restrito à rede interna.
- [x] Publicar apenas `3339`, `3338` e `5999` em `127.0.0.1`; deixar asset-service e banco somente na rede Compose; configurar `RAGIDLE_ALLOWED_ORIGINS` e `WS_ALLOWED_ORIGINS` no serviço correspondente.
- [x] Criar `.env.production.example` com nomes das variáveis e valores ilustrativos não secretos; não criar nem commitar `.env.production` real.
- [x] Criar configuração Nginx para certificado `/etc/letsencrypt/live/tibia74.tech/{fullchain,privkey}.pem`, autenticação `/etc/nginx/.htpasswd-ragidle`, SPA, mapa, API/assets e WebSocket; `/ro/` encaminha para `/applications/pwa/` no `web-client`.
- [x] Adicionar `X-Frame-Options SAMEORIGIN` para permitir o iframe do mapa no jogo sem permitir embedding por outras origens.
- [x] Validar sintaxe e interpolação com `docker compose -f compose.production.yaml --env-file .env.production.example -p ragidle-prod config`; confirmar que a saída não contém segredos.

### Task 3: Construção local e preparação da cópia de dados

**Arquivos/artefatos:**
- Criar artefatos temporários locais: imagens Docker, dump SQL e pacote de `client-data`.
- Não alterar ou remover: volume local `ragidle_mariadb_data`, `.env` local e diretório `client-data`.

**Interfaces:**
- Imagens Linux/amd64 com as tags da Task 2.
- Dump SQL consistente do banco atual do projeto `ragidle`.
- Arquivo de dados de cliente com aproximadamente 3,51 GB.

- [x] Confirmar Docker `linux/amd64`, espaço local suficiente e que os nomes de imagem não sobrescrevem outras aplicações.
- [x] Construir localmente os cinco serviços de aplicação com `docker compose -p ragidle build`; não construir Hercules na VPS.
- [x] Adicionar a cada imagem construída a tag `vps-20261007` indicada na Task 2 e confirmar todas as cinco tags antes de `docker save`.
- [x] Criar dump consistente com `mariadb-dump --single-transaction`, incluindo schema, dados, triggers, routines e events existentes.
- [x] Salvar imagens requeridas por `compose.production.yaml` em um arquivo Docker loadable e empacotar `client-data`, Compose e configuração Nginx.
- [x] Revisar o pacote para garantir que não inclui `.env`, credenciais, `.git`, volume de banco bruto ou arquivos temporários pessoais.

### Task 4: Preparar a VPS e migrar o banco

**Sistemas remotos:**
- Criar/usar: `/opt/ragidle`.
- Instalar, se a inspeção confirmar ausência: Docker Engine e plugin Compose oficiais.
- Criar: swapfile persistente de 2 GiB e `/etc/sysctl.d/99-ragidle-swap.conf` com `vm.swappiness=10`.
- Criar: `.env.production` remoto com novos segredos.

- [x] Reconfirmar arquitetura, espaço livre, Docker existente, volumes, certificados, regras UFW e saúde dos sites antes de alterar o host; parar e revisar se `/opt/ragidle` ou Docker já contiver dados.
- [x] Fazer cópia de segurança das configurações Nginx/UFW que serão tocadas; não editar os virtual hosts atuais.
- [x] Instalar Docker Engine e Compose plugin a partir do repositório oficial para Ubuntu 22.04; preservar regras existentes e não publicar portas de container em endereços públicos.
- [x] Criar e ativar o arquivo swap de 2 GiB; adicionar entrada única a `/etc/fstab`, `vm.swappiness=10` e verificar `free -h`/`swapon --show`.
- [x] Transferir pacote, cliente e dump por SSH para `/opt/ragidle`, aplicar ownership root e permissões mínimas.
- [x] Importar imagens com `docker load`; criar `.env.production` com novo nome/usuário/senhas de banco e configurar hash Basic Auth fora do repositório.
- [x] Subir somente o serviço de banco com o projeto `ragidle-prod`, importar o dump e confirmar que a consulta de perfil retorna o personagem preservado.

### Task 5: Publicar, validar e fazer o corte local

**Arquivos/sistemas remotos:**
- Instalar: `/etc/nginx/sites-available/ragidle-8443` a partir de `deploy/hostinger/ragidle.conf`.
- Habilitar: Nginx HTTPS na porta 8443.
- Firewall: permitir TCP 8443 somente das mesmas faixas Cloudflare IPv4/IPv6 já autorizadas para o host.

- [x] Criar virtual host novo e arquivo htpasswd exclusivo; validar `nginx -t` antes de recarregar Nginx.
- [x] Adicionar regras UFW Cloudflare-only para TCP 8443, sem `ufw allow 8443/tcp` genérico e sem mudar as regras de 80/443.
- [x] Iniciar o projeto `ragidle-prod`; verificar `docker compose ps`, healthcheck `/api/health`, logs e `docker stats`.
- [x] Fazer smoke checks pelo domínio: raiz sem credencial retorna 401; com credencial carrega o jogo; API aceita a origem de produção e rejeita origem externa; `/ro/` carrega mapa; `/assets/` entrega recurso; WebSocket faz handshake 101 após autenticação.
- [x] Conferir que a ficha do personagem existe, que Cloudflare/Nginx aceita o certificado e que os sites `tibia74.tech`, `betfifa.com.br`, TFS e MariaDB do host seguem disponíveis.
- [x] Se tudo passar, informar URL, usuário e senha privada; parar somente `docker compose -p ragidle` local, sem remover containers/volumes/imagens/dados.
- [x] Conferir a stack remota após reinício do projeto e registrar RAM, swap e disco finais.

## Rollback

- Antes da confirmação remota: manter a stack local executável. Se houver falha no TLS, Cloudflare ou validação do perfil, parar apenas `ragidle-prod`, remover o novo site Nginx e regras novas de 8443, restaurar configuração a partir do backup e recarregar Nginx.
- Após uma validação bem-sucedida, não apagar o banco remoto nem o volume local; rollback de aplicação usa `docker compose -p ragidle-prod stop` ou uma imagem tagueada anterior, nunca `down -v`.
- Reativar a stack local com `docker compose -p ragidle start` se a VPS não puder atender.
