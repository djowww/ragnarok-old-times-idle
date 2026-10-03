# Ragnarok Local no Browser — Plano de Implementação

> **Para agentes de implementação:** requisito interno: usar `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para executar este plano tarefa por tarefa. Marque cada etapa com checkbox (`- [ ]`).

**Objetivo:** Entregar uma stack Docker Compose local que sirva o roBrowserLegacy no navegador e conecte login, criação/seleção de personagem e gameplay ao Hercules.

**Arquitetura:** Cinco serviços Compose: MariaDB, Hercules, cliente web roBrowserLegacy, proxy WebSocket e servidor de assets GRF. Hercules, roBrowserLegacy e o servidor de assets serão obtidos em revisões fixas durante o build; os GRFs serão montados somente em tempo de execução a partir de `client-data/`.

**Stack:** Docker Compose, MariaDB 11.4, Hercules v2026.07 (`PACKETVER=20141022` por padrão), roBrowserLegacy, Node.js para proxy/servidor de assets e Nginx para servir o cliente estático.

**Spec:** `docs/superpowers/specs/2026-10-02-browser-ragnarok-local-design.md`

## Restrições globais

- “Run locally through Docker Compose; this design does not cover public hosting.”
- “Keep proprietary client files outside the repository and Docker image.”
- “The implementation must use one matching client/packet version across Hercules and roBrowserLegacy and disable packet obfuscation for this client setup.”
- “The browser-facing HTTP and WebSocket ports bind to localhost for this development stack.”
- “The directory is ignored by Git and is never copied into the image.”
- “Keep real passwords and user-provided client data out of Git.”
- “Until those files are present, the stack can provide the local web page and server infrastructure, but cannot satisfy the in-map visual gameplay milestone.”
- “Do not add idle/offline progression, a custom web-game interface, trading, or public multi-user hosting in this milestone.”

## Pontos de revisão

- GRFs ausentes, incompletos ou ilegíveis: o serviço de assets continua diagnosticável e as instruções apontam os arquivos esperados sem buscar conteúdo externo. Checagem manual no Task 3.
- Versão de pacote divergente entre Hercules e navegador: `PACKETVER` vem de uma única variável Compose, alimenta build e configuração do cliente, e as instruções identificam a obfuscation como desativada. Checagem de configuração no Task 2.
- Endereços anunciados por login/char/map diferentes das rotas do proxy: fixar o IP visível ao navegador em `127.0.0.1` e encaminhar cada porta para Hercules na rede Compose. Checagem de fluxo no Task 2 e Task 4.
- Banco vazio ou ainda inicializando: saúde do MariaDB bloqueia o arranque do Hercules; importar `main.sql` e `logs.sql` somente no primeiro arranque do volume. Checagem de arranque no Task 1.
- Serviço de banco ou portas internas expostos no host: só publicar web, assets e proxy em `127.0.0.1`; não publicar MariaDB nem portas TCP do Hercules. Checagem de configuração no Task 1.

---

### Task 1: Base Docker, MariaDB e Hercules

**Arquivos:**
- Criar: `.gitignore`
- Criar: `.env.example`
- Criar: `compose.yaml`
- Criar: `docker/hercules/Dockerfile`
- Criar: `docker/hercules/entrypoint.sh`
- Criar: `docker/hercules/config/sql_connection.conf.template`
- Criar: `docker/hercules/config/import/login-server.conf.template`
- Criar: `docker/hercules/config/import/char-server.conf.template`
- Criar: `docker/hercules/config/import/map-server.conf.template`
- Criar: `docker/hercules/config/import/inter-server.conf.template`

**Interfaces:**
- Consome: variáveis `PACKETVER`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` e `DB_ROOT_PASSWORD` do `.env` local.
- Produz: serviço Compose `database` saudável e serviço `hercules` pronto na rede privada, com MariaDB persistente, schemas oficiais inicializados e login/char/map em execução.

- [ ] **Passo 1: Criar defaults e exclusões locais**

  Ignore `.env`, `client-data/`, logs e saídas de build. No `.env.example`, defina `PACKETVER=20141022`, `DB_NAME=hercules`, usuário e senhas de desenvolvimento substituíveis. Não inclua credenciais reais.

- [ ] **Passo 2: Definir serviços, persistência e limites de rede em `compose.yaml`**

  Defina `database` com `mariadb:11.4`, volume nomeado e healthcheck; `hercules` depende de `database` saudável. Não publique `3306`, `6900`, `6121` ou `5121`.

- [ ] **Passo 3: Criar a imagem Hercules reproduzível**

  Em `docker/hercules/Dockerfile`, obtenha Hercules v2026.07 no commit `410b9738c049ab1825d67b36b072d837c1d0b33a`, instale CMake 3.25+, compilador, Python/Conan 2 e cliente MariaDB, e compile com `PACKETVER` vindo do build arg, `ENABLE_TESTING=OFF`, modo Renewal habilitado e sem chaves de packet obfuscation. Preserve `sql-files/main.sql` e `sql-files/logs.sql` na imagem.

- [ ] **Passo 4: Criar configuração por ambiente e inicialização ordenada**

  Em `entrypoint.sh`, renderize os templates com `envsubst`, espere o MariaDB aceitar conexões e examine as tabelas-base `login` e `loginlog`: importe `main.sql` e `logs.sql` somente se o banco estiver vazio; se apenas parte do schema estiver presente, pare com uma mensagem clara sem modificar as tabelas. Depois inicie `login-server`, `char-server` e `map-server`. Encerre os três processos se o container receber SIGTERM. Configure os templates para banco `database:3306`, portas padrão `6900/6121/5121`, pacote selecionado, registro local de contas e IPs anunciados `127.0.0.1` para char/map; deixe endereços de escuta internos em todas as interfaces do container.

- [ ] **Passo 5: Fazer uma checagem de configuração e persistência**

  Rode `docker compose config` e `docker compose up --build -d database hercules`. Esperado: configuração resolvida, database saudável e três servidores Hercules presentes nos logs; reiniciar o serviço não deve reaplicar os schemas sobre as tabelas existentes.

- [ ] **Passo 6: Commitar a base da stack**

  ```bash
  git add .gitignore .env.example compose.yaml docker/hercules
  git commit -m "feat: add local Hercules Docker stack"
  ```

### Task 2: Cliente browser e proxy WebSocket

**Arquivos:**
- Modificar: `compose.yaml`
- Criar: `docker/web-client/Dockerfile`
- Criar: `docker/web-client/Config.local.js.template`
- Criar: `docker/web-client/entrypoint.sh`
- Criar: `docker/websocket-proxy/Dockerfile`

**Interfaces:**
- Consome: `PACKETVER` do `.env`; Hercules alcançável como `hercules:6900`, `hercules:6121` e `hercules:5121` na rede Compose.
- Produz: página em `http://localhost:3338/applications/pwa/index.html` e WebSocket em `ws://localhost:5999/`; o cliente anuncia `127.0.0.1` e usa o mesmo `PACKETVER` compilado no Hercules.

- [ ] **Passo 1: Construir roBrowserLegacy em uma revisão fixa**

  Use `docker/web-client/Dockerfile` para obter roBrowserLegacy no commit `d88a3cd4acde0582530e3fc1908532a92e9accea`, instalar as dependências declaradas pelo projeto, gerar o PWA com `npm run build:pwa` e copiar os arquivos gerados para Nginx. Mantenha o cliente sem assets proprietários.

- [ ] **Passo 2: Gerar configuração do cliente a partir do ambiente**

  Em `Config.local.js.template` e `entrypoint.sh`, renderize `PACKETVER` em uma única configuração roBrowser: servidor em `127.0.0.1`, portas `6900/6121/5121`, `socketProxy` em `ws://127.0.0.1:5999/`, assets em `http://127.0.0.1:8080/` (Task 3), `renewal: true` e intro ignorada. Não deixe o `remoteClient` público padrão ativo.

- [ ] **Passo 3: Criar a imagem separada do proxy**

  Obtenha a mesma revisão do roBrowserLegacy no `docker/websocket-proxy/Dockerfile`; execute `wsproxy.js` com o mapeamento `127.0.0.1:6900=hercules:6900,127.0.0.1:6121=hercules:6121,127.0.0.1:5121=hercules:5121`. Publique `5999` apenas em `127.0.0.1`.

- [ ] **Passo 4: Conectar os serviços no Compose e abrir a página**

  Faça `web-client` servir a porta `3338` somente no loopback e `websocket-proxy` servir `5999` no loopback. Espere o navegador mostrar a página local roBrowser em `/applications/pwa/index.html`; o acesso ao mapa ainda depende dos assets da Task 3.

- [ ] **Passo 5: Commitar cliente e proxy**

  ```bash
  git add compose.yaml docker/web-client docker/websocket-proxy
  git commit -m "feat: serve browser client and Hercules websocket proxy"
  ```

### Task 3: Servidor de assets e caminho para GRFs locais

**Arquivos:**
- Modificar: `compose.yaml`
- Criar: `docker/asset-service/Dockerfile`
- Criar: `docker/asset-service/entrypoint.sh`
- Criar: `docker/asset-service/no-assets-server.js`
- Testar: `docker/asset-service/no-assets-server.test.js`
- Modificar: `.gitignore`

**Interfaces:**
- Consome: `client-data/` no host, montado como `/app/resources` somente leitura. Estrutura esperada: `DATA.INI`, GRFs listados nele (por exemplo `data.grf`, `rdata.grf`) e, opcionalmente, diretórios `data/`, `System/`, `BGM/` e `AI/`.
- Produz: serviço HTTP local na porta `8080`, usado por `remoteClient` no cliente. Sem dados, ele permanece iniciado e deixa instrução clara no log/README.

- [ ] **Passo 1: Criar a imagem do Remote Client sem embutir dados**

  No `Dockerfile`, obtenha `roBrowserLegacy-RemoteClient-JS` no commit `0dd3a3fa71733c0c88ac1beb117039174eb2a7b0`, use Node.js 22.12+ e instale as dependências pelo `package-lock.json`. Configure o modo separado com `ENABLE_WSPROXY=false`, `ENABLE_STATIC_SERVE=false`, `CLIENT_RESPATH=/app/resources`, `CLIENT_PUBLIC_URL=http://localhost:3338` e porta interna `8080`.

- [ ] **Passo 2: Escrever o teste do servidor sem GRFs e confirmar RED**

  Em `docker/asset-service/no-assets-server.test.js`, use `node:test` para iniciar `createNoAssetsServer(): http.Server` em porta efêmera, fazer `GET /api/health` e exigir status `503` com uma mensagem que cite `DATA.INI` e `client-data/`. Rode `node --test docker/asset-service/no-assets-server.test.js`; esperado: falha porque o módulo exportado ainda não existe.

- [ ] **Passo 3: Implementar diagnóstico HTTP para GRFs ausentes**

  Em `no-assets-server.js`, exporte `createNoAssetsServer(): http.Server` e, quando executado diretamente, escute em `PORT` (padrão `8080`). Responda qualquer rota com status `503`, `text/plain` e instrução para colocar `DATA.INI` e seus GRFs em `client-data/`.

- [ ] **Passo 4: Montar dados em modo somente leitura e tratar ausência**

  Adicione ao Compose o bind `./client-data:/app/resources:ro` e publique `8080` em `127.0.0.1`. Configure `CLIENT_PUBLIC_URL=http://localhost:3338` para CORS. O `entrypoint.sh` deve apontar a ausência de `DATA.INI`, GRFs citados ou falta de leitura, sem baixar, copiar ou gerar assets; sem arquivos, execute `no-assets-server.js` em `8080` para mostrar um diagnóstico HTTP claro e manter a stack utilizável. Com os arquivos presentes, inicie o Remote Client.

- [ ] **Passo 5: Checar o modo sem GRFs**

  Suba `asset-service` sem `client-data/`. Esperado: log e resposta HTTP identificam o pré-requisito ausente, o container não entra em ciclo de falha e o README explica como preencher a pasta depois.

- [ ] **Passo 6: Commitar suporte a assets externos**

  ```bash
  git add compose.yaml .gitignore docker/asset-service
  git commit -m "feat: mount local Ragnarok assets without bundling them"
  ```

### Task 4: Operação local e guia em português

**Arquivos:**
- Criar: `README.md`
- Modificar: `.env.example` se os nomes finais das variáveis mudarem durante integração.

**Interfaces:**
- Consome: os serviços `database`, `hercules`, `web-client`, `websocket-proxy` e `asset-service` das Tasks 1–3.
- Produz: guia único para preparar `.env`, iniciar/parar stack, abrir o cliente, criar conta, localizar logs, fornecer dados do cliente e diagnosticar incompatibilidade de pacote.

- [ ] **Passo 1: Documentar o uso diário em português**

  Inclua pré-requisitos (Docker com Compose), cópia e edição de `.env.example`, comandos `docker compose up --build -d`, `docker compose logs -f hercules`, `docker compose down` e URL `http://localhost:3338/applications/pwa/index.html`. Explique cadastro local pela convenção `_M`/`_F` no nome da conta e criação/seleção de personagem.

- [ ] **Passo 2: Documentar GRFs e compatibilidade**

  Explique que os arquivos não são fornecidos nem baixados; indique `client-data/DATA.INI` e os arquivos GRF por ele referenciados. Informe que a pasta é ignorada pelo Git e montada read-only. Mostre como alterar `PACKETVER` uma única vez em `.env` e reconstruir as imagens, confirme packet obfuscation desligada e a URL de assets local.

- [ ] **Passo 3: Documentar limites e diagnóstico de ponta a ponta**

  Registre portas locais `3338`, `5999`, `8080`, que banco/portas de jogo ficam internos, como consultar logs dos cinco serviços e como interpretar erros de GRF, versão de pacote, proxy ou banco. Deixe explícito que login, personagens, mapa e movimento só podem ser aceitos visualmente depois que GRFs compatíveis forem fornecidos.

- [ ] **Passo 4: Fazer a checagem de aceitação disponível sem assets**

  Com Docker Compose, conferir que a stack inicia, `database` fica saudável, web-client abre localmente e os logs do asset-service identificam claramente a falta de GRFs. Não declarar a etapa jogável concluída enquanto não houver dados compatíveis; quando fornecidos, o aceite final é login, criação/seleção de personagem, entrada no mapa e movimento pelo browser.

- [ ] **Passo 5: Commitar o guia e o milestone integrado**

  ```bash
  git add README.md .env.example
  git commit -m "docs: explain local browser Ragnarok setup"
  ```
