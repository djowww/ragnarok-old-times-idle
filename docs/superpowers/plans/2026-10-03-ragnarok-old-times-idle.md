# Ragnarok Old Times Idle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Entregar o ciclo completo do Ragnarok Old Times Idle, persistente e jogável localmente no navegador.

**Architecture:** Um serviço Node autoritativo serve API e interface React; tabelas `idle_*` no MariaDB guardam o perfil. Um catálogo reproduzível extrai dados do Hercules fixado, e a cena lê SPR/ACT/BMP do serviço de GRF existente. O modo clássico permanece uma aplicação independente.

**Tech Stack:** Node 24, TypeScript, React, Vite, Fastify, mysql2, Vitest, pnpm, Canvas2D, Docker Compose/MariaDB.

**Spec:** `docs/superpowers/specs/2026-10-03-ragnarok-old-times-idle-design.md` — aprovada pelo usuário em 2026-10-03, com autorização explícita para escrever o plano e executar sem novas confirmações.

## Global Constraints

- Worktree existente `C:/Users/Usuário/.codex/worktrees/ragnarok-browser-local/RagIDLE`, branch `codex/ragnarok-browser-local`.
- Hercules commit `410b9738c049ab1825d67b36b072d837c1d0b33a`; EXP base/classe 4x, drops selecionados 1x, Pre-Renewal.
- Offline até 12 horas desde o último contato; relógio e recompensas autoritativos no servidor.
- Dez áreas e 25 monstros da tabela da spec; seis famílias, segundas classes e renascimento até 99/70.
- Perfil idle `djow` independente; não escrever nas tabelas `char`, `inventory` ou `login`.
- Porta nova somente `127.0.0.1:3339`; interface e API na mesma origem.
- GRFs e recursos oficiais permanecem fora de Git/imagens; preservar licenças/atribuição de código e dados derivados.
- Todas as ações mostradas têm efeito implementado; sem telas vazias, XP aceito do cliente ou conteúdo inventado apresentado como Hercules.

## Review Focus

- Requisição de comando repetida ou duas abas: conceder compra/recompensa uma vez, sem saldo negativo.
- Navegador desconectado e Docker reiniciado: reconciliar o mesmo tempo e respeitar 12 horas sem reiniciar o cursor antes de processar.
- Equipamentos com cartas/refinamento e mudança de classe: preservar propriedade, proteção de venda e requisitos.
- Nomes de arquivo coreanos e aliases de monstro: decodificar o sprite correto e recuperar falhas sem bloquear a tela.
- Builds de Mago/Arqueiro, progressão/transcendência e chefes: habilidades/custos válidos, sem ramo que fique sem arma ou sem evolução.

## Estrutura e contratos

`idle/shared/types.ts` contém apenas tipos públicos. `idle/content/catalog.json` é o catálogo gerado; `idle/tools/export-content.mjs` e `idle/content/rules.json` tornam a geração reproduzível. `idle/engine/` contém motor puro e comandos. `idle/server/` contém persistência, API e proxy de assets. `idle/web/` contém cliente, painéis e cena. `idle/tests/` contém testes de comportamento, sem recursos oficiais copiados.

Interfaces fixadas:

- `createInitialState(catalog: Catalog, now: number, name?: string): GameState`.
- `advanceState(state: GameState, catalog: Catalog, now: number): GameState` — retorna estado novo; timestamps em milissegundos.
- `applyCommand(state: GameState, catalog: Catalog, command: GameCommand, now: number): GameState` — valida e aplica depois de reconciliar; erro `GameError` com código legível.
- `getSnapshot(state: GameState, catalog: Catalog, now: number): GameSnapshot` — inclui stats derivados e resumo; não altera o estado.
- `GameRepository.transact(requestId: string | null, action: (state: GameState) => GameState): Promise<GameState>` — trava perfil e persiste estado/cursor/recibo atomically. `requestId=null` é reconciliação sem comando.
- `buildApp({catalog, repository, now, assetOrigin, webRoot}): FastifyInstance`.
- HTTP `GET /api/catalog` → `Catalog`; `POST /api/session` → `GameSnapshot`; `POST /api/command` com `{requestId, command}` → `GameSnapshot`; erros `{error:{code,message}, snapshot?}`. `GET /api/health` retorna prontidão.
- `POST /api/session` processa tempo usando `lastSeenAt` anterior, cria resumo se ausente há >=30 segundos e só então atualiza contato. O agendador a cada cinco segundos avança sem registrar contato de navegador.
- Proxy `GET /assets/*` encaminha somente ao asset-service fixo, sem permitir URL de destino fornecida pelo usuário.

## Execução

O coordenador implementa contratos, servidor e infraestrutura. Três tarefas com posse de arquivos distinta podem avançar em paralelo após o contrato: conteúdo/decoders, motor e interface. Dependências cruzadas são somente os tipos fixados; alterações nesses tipos são comunicadas antes de modificar consumidores. Cada domínio registra seu RED/GREEN, testes e relatório; a integração recebe revisão independente de código e de cobertura da spec.

### Task 1: Contratos e toolchain

**Files:** `idle/package.json`, `idle/pnpm-lock.yaml`, `idle/tsconfig*.json`, `idle/vite.config.ts`, `idle/shared/types.ts`, `.gitignore`.

**Interfaces:** Produz `Catalog`, `GameState`, `GameCommand`, `GameSnapshot`, `DerivedStats`, `SpriteAsset`, `InventoryEntry`, e scripts `test`, `typecheck`, `build`, `dev`, `start`.

- [x] Definir tipos coerentes com todas as ações/estado da spec, mantendo o motor independente de DOM/SQL.
- [x] Configurar dependências fixadas por lockfile, build de API e UI separado, e ignore para módulos/build/reports.
- [x] Verificar resolução do toolchain com `pnpm install`, sem testes artificiais de texto/configuração.
- [x] Salvar a fundação no branch; comunicar tipos aos implementadores.

### Task 2: Catálogo, classes e economia reproduzíveis

**Files:** `idle/tools/export-content.mjs`, `idle/tools/libconfig.mjs`, `idle/content/rules.json`, `idle/content/catalog.json`, `idle/tests/content.test.ts`, `idle/THIRD_PARTY_NOTICES.md`, `idle/LICENSE`.

**Interfaces:** Consome `Catalog`; produz catálogo sem credenciais/GRFs com IDs de origem, 25 monstros, 10 áreas, três chefes, oito cartas, armas obtíveis para todos os ramos, habilidades/classes/curvas e missões.

- [x] RED: testar parsing com comentários/herança/scripts, Poring HP=50/EXP base=2/Job=1 e Jellopy com chance=7000; conferir que script não é executado.
- [x] RED: exigir todas as referências válidas (drops, classes/armas, pré-requisitos), curva capaz de atingir caps e nomes de sprite `skel_soldier`/`skel_archer` para os IDs corretos.
- [x] Exportar do mesmo commit Hercules, importar defaults/herança, selecionar os IDs da spec e registrar fontes/hashes/exclusões. Definir efeitos suportados, preços e habilidades de forma explícita.
- [x] GREEN: `pnpm test -- tests/content.test.ts`; reproduzir exportação e comparar hash.
- [x] Entregar catálogo e relatório de procedência; commit somente arquivos próprios.

### Task 3: Motor de combate, progressão e comandos

**Files:** `idle/engine/index.ts`, `idle/engine/stats.ts`, `idle/engine/combat.ts`, `idle/engine/commands.ts`, `idle/engine/progression.ts`, `idle/tests/engine.test.ts`, `idle/tests/commands.test.ts`.

**Interfaces:** Consome tipos/catalogue; produz as quatro funções puras fixadas e `GameError` exportado de `engine/index.ts`.

- [x] RED: com fixture real e relógio injetado, comparar 600 avanços de um segundo com um avanço de 600 segundos; repetir avanço no mesmo horário não muda XP/loot. Limite de 12 horas deve pausar e descartar tempo além do cap.
- [x] RED: provar morte sem recompensa duplicada, auto poção consumindo item, rotação sem SP caindo para ataque básico, e dano de arco melhorando com DEX / magia com INT.
- [x] Implementar PRNG determinístico, ticks de um segundo, encontros, combate, recuperação, consumíveis e resumo acumulado. Limitar histórico a 60 eventos e evitar trabalho proporcional a eventos de UI.
- [x] RED: testar compra/saldo negativo, propriedade/slot de equipamento, venda protegida, carta consumida uma vez, refinamento falho preservando +5 e requisitos de classe.
- [x] Implementar todos os comandos do contrato, atributos/pontos, evolução de classes/skills, missões/bestiário, renascimento e desafios com tentativa/cooldown persistidos.
- [x] GREEN: `pnpm test -- tests/engine.test.ts tests/commands.test.ts`; verificar percurso acelerado de Base/Job/caps através do relógio de teste, sem endpoint de concessão livre no produto.
- [x] Registrar relatório e commit dos arquivos do motor.

### Task 4: API e MariaDB transacional

**Files:** `idle/server/index.ts`, `idle/server/app.ts`, `idle/server/repository.ts`, `idle/server/catalog.ts`, `idle/server/schema.sql`, `idle/tests/api.test.ts`, `idle/tests/repository.integration.test.ts`.

**Interfaces:** Consome funções do motor e catálogo; produz `buildApp` e `GameRepository` com os endpoints fixados.

- [x] RED: HTTP válido executa intenção; payload inválido, quantidade negativa, comando desconhecido e origem externa são rejeitados antes de alterar estado.
- [x] Implementar validação, erros com snapshot recuperável, perfil local e entrega de frontend/static assets na mesma origem.
- [x] RED: integração MariaDB com duas transações concorrentes e um `requestId` repetido compra somente uma vez; falha de comando reverte estado/recibo; restart recupera JSON persistido. Usar perfil de teste próprio e remover somente essas linhas.
- [x] Implementar migração prefixada, `SELECT ... FOR UPDATE`, recibos e persistência; não abrir portas adicionais do banco.
- [x] Implementar reconciliação anterior ao contato, resumo após 30s e agendador sem contato; proxy de assets com paths codificados e limites/erros claros.
- [x] GREEN: `pnpm test -- tests/api.test.ts`; integração com banco via comando documentado, sem mostrar senhas.
- [x] Commit dos módulos do servidor e evidência das verificações.

### Task 5: SPR/ACT/BMP e composição de sprites

**Files:** `idle/web/assets/sprite.ts`, `idle/web/assets/action.ts`, `idle/web/assets/renderer.ts`, `idle/web/assets/items.ts`, `idle/tests/assets.test.ts`.

**Interfaces:** Consome `SpriteAsset`/catalogue; produz `loadActor(asset: SpriteAsset): Promise<DecodedActor>`, `drawActor(ctx, actor, action, elapsed, x, y, scale)`, e `getItemIcon(item): Promise<string>` com cache e fallback explícito.

- [x] RED: fixtures binárias pequenas testam transparência de palette index 0, ACT transforms/offsets e BMP magenta transparente; binário truncado falha com erro recuperável.
- [x] Adaptar decoders SPR/ACT e composição Canvas2D com atribuição upstream; resolver itens pelo ID/recurso do cliente. Não copiar sprites para o repositório.
- [x] GREEN: `pnpm test -- tests/assets.test.ts`; verificar leitura real de Poring, um skeleton com alias, corpo/cabeça de Aprendiz e Red Potion pelo proxy.
- [x] Commit dos decoders e relatório.

### Task 6: Interface de jogo completa e responsiva

**Files:** `idle/index.html`, `idle/web/main.tsx`, `idle/web/App.tsx`, `idle/web/styles.css`, `idle/web/api.ts`, `idle/web/components/Scene.tsx`, `idle/web/panels/*.tsx`.

**Interfaces:** Consome `GameSnapshot`, `Catalog`, endpoints e funções do decoder; envia somente comandos tipados com UUID por intenção.

- [x] Implementar layout de jogo conforme spec: header, personagem/loadout, cena, controles e diário; painéis mochila/loja, atributos/skills, mapa, missões/bestiário, classes/desafios.
- [x] Poll de sessão sem permitir requisições sobrepostas; preservar erro/estado anterior, desabilitar ação durante envio, e apresentar falha recuperável.
- [x] Conectar todos os comandos: iniciar/parar, cidade/descanso, comprar/vender/equipar/refinar/carta/favorito, pontos, classe/renascimento, poções/rotação, missões/desafios e resumo offline.
- [x] Compor cenário leve e sprites reais, barras/feedback de batalha, áudio opcional, foco/contraste e `prefers-reduced-motion`.
- [x] Verificar build/typecheck e no browser os controles, largura de computador e celular, erro de API/recurso e retorno offline. UI não precisa de testes que só repetem seu markup.
- [x] Commit dos arquivos da interface e relatório de verificação.

### Task 7: Docker, documentação e operação

**Files:** `docker/idle-game/Dockerfile`, `idle/.dockerignore`, `compose.yaml`, `README.md`, `.env.example`.

**Interfaces:** Consome build da aplicação; novo serviço `idle-game`, porta `127.0.0.1:3339:3339`, DB interno e asset-service fixo.

- [x] Build multi-stage com pnpm lockfile, Node 24, frontend compilado e servidor executável; não incluir GRFs ou segredos.
- [x] Adicionar serviço ao Compose com espera do banco saudável e restart. Preservar serviços clássicos.
- [x] `docker compose up --build -d idle-game`; aguardar `/api/health` saudável e verificar os seis serviços.
- [x] Documentar URLs, persistência, diferença entre perfis, comandos de desenvolvimento/teste/exportação, fontes/licenças e aceites observados.
- [x] Commit da integração.

### Task 8: Verificação e revisão independente da entrega

**Files:** relatórios/evidências fora do produto e atualização deste plano/README.

- [x] Executar `pnpm test`, `pnpm typecheck`, `pnpm build`, integração MariaDB e aceites de browser da spec.
- [x] Testar offline/restart com perfil de teste isolado; não avançar artificialmente o relógio do perfil do jogador.
- [x] Revisão independente do diff, spec e relatórios; corrigir achados que bloqueiam o uso com teste de reprodução.
- [x] Capturar tela de computador e celular, verificar ausência de recursos vazios ou botões sem ação.
- [x] Commit final, conferir worktree limpo e deixar jogo acessível. Não publicar/mesclar/push sem pedido.

## Preflight de interfaces

| Produz / consome | Checagem |
| --- | --- |
| T1 → T2/T3/T4/T5/T6 | Tipos são fonte única; sem redefinir campos em módulos consumidores. |
| T2 → T3/T4/T5/T6 | Catálogo é entrada pura do motor, resposta `/api/catalog` e mapeamento de assets. |
| T3 → T4 | Quatro assinaturas puras usam timestamps em ms; HTTP não injeta recompensas. |
| T4 → T6 | Sessão e comando devolvem o mesmo `GameSnapshot`; erros incluem mensagem e recuperação. |
| T5 → T6 | Canvas não acessa SQL/engine; falha de recurso não interrompe ações. |
| T4/T6 → T7 | Artefatos frontend e servidor separados; servidor entrega ambos na mesma porta. |
| T1–T8 | Arquivos por responsabilidade, contratos compatíveis e critérios de teste ligados à spec. |
