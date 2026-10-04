# Ragnarok Old Times Idle Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar um portal de Ragnarok com visual de 2005, contas individuais, painel do jogador, notícias e ranking ligado ao Idle existente.

**Architecture:** O Fastify existente serve API, portal React e jogo na mesma origem. Contas e sessões novas selecionam um repositório por perfil; consultas públicas devolvem projeções pequenas, enquanto o motor continua responsável pelo progresso. A interface do jogo é reutilizada dentro da rota privada `/jogar`.

**Tech Stack:** Node 24, pnpm 11.25.0, TypeScript, React 19, Vite, Fastify 5, mysql2, MariaDB 11.4, Vitest, Docker Compose; `@fastify/cookie` para cookies e jsdom apenas para testes de comportamento do frontend.

**Spec:** `docs/superpowers/specs/2026-10-04-idle-portal-design.md`, aprovada pelo usuário em 2026-10-04.

## Global Constraints

- Contas próprias do Idle, com progresso individual, independentes das contas do Hercules.
- A interface e API continuam na mesma origem, na porta 3339. Publicação em domínio externo não faz parte desta especificação.
- Cada conta possui um personagem nesta entrega.
- Usuário: 3 a 24 caracteres ASCII, letras, números e `_`; unicidade sem diferenciar maiúsculas/minúsculas.
- Nome do personagem: 2 a 24 caracteres, normalizado em NFC, letras Unicode, números, espaço, `_` e `-`; espaços externos removidos e unicidade sem diferenciar maiúsculas/minúsculas. A identidade legada `djow` fica reservada.
- Senha: 10 a 128 caracteres, até 512 bytes UTF-8; não remover espaços nem normalizar seu conteúdo. Confirmação precisa corresponder.
- Configuração: `N=32768`, `r=8`, `p=3`, `maxmem=64 MiB`. Salt aleatório de 16 bytes; chave derivada de 64 bytes; scrypt assíncrono e formato versionado.
- Token de sessão: 32 bytes aleatórios, codificados em base64url. O banco guarda somente SHA-256 do token.
- Cookie com `HttpOnly`, `SameSite=Lax`, `Path=/`; vence sete dias após a criação, sem renovação automática. `Secure` acompanha HTTPS configurado.
- Até 10 tentativas de login por IP em 15 minutos e cinco por usuário em 15 minutos; até cinco cadastros por IP por hora; até cinco trocas de senha por conta em 15 minutos.
- Dois trabalhos simultâneos de scrypt; fila de no máximo oito. Contadores com expiração/limpeza, limitados a 10.000 chaves.
- Somente `AUTH_REQUIRED` invalida o estado privado no navegador. Senha atual incorreta retorna 400 com `CURRENT_PASSWORD_INVALID`.
- Ranking usa somente perfis vinculados a contas do Idle. Nível: renascidos primeiro; depois Base, EXP Base no nível, Job e EXP Job, todos decrescentes. Desempate final por identificador ascendente.
- Paginação: 20 linhas por página; limite 50. Home mostra cinco primeiros por nível. Ranking e scheduler nunca registram contato.
- Ciclo do scheduler a cada cinco segundos, sem sobreposição, lotes de até 50 e concorrência máxima de dois perfis.
- Preservar `local-djow`, seu JSON e todos os recibos. Não associar o legado automaticamente por usuário ou nome coincidente.
- Antes de enviar um comando, guardar seu corpo e requestId em sessionStorage, vinculados ao par conta/perfil; remover após resposta conclusiva.
- Notícias versionadas com corpo em parágrafos de texto; sem HTML arbitrário, estatísticas fictícias ou eventos inventados.
- Portal com largura máxima próxima de 1060 px, Tahoma/Arial, azul/prata/branco, bordas e cantos de 0 a 3 px; abaixo de 768 px, uma coluna.
- Arquivos GRF e BGM continuam fora do Git. Preservar volume MariaDB, recursos locais, `.env`, licenças e atribuições existentes.
- Um personagem por conta; notícias versionadas; painel do jogador. Sem painel administrativo, email, guildas, pagamentos ou identidade compartilhada com Hercules.

## Review Focus

- Nome Unicode composto/decomposto e diferença de caixa: rejeitar duplicação sem truncar o nome aprovado ou alterar acentos; teste na Task 1.
- Login verificando senha antiga enquanto outra requisição conclui troca de senha: não emitir nova sessão válida com a versão anterior; teste na Task 2.
- Compra confirmada com resposta perdida, seguida de sessão expirada/reentrada: recuperar o recibo original uma vez, sem reproduzir recibos de outra conta; testes nas Tasks 3 e 5.
- Resposta atrasada de A após troca para B, desmontagem ou remount StrictMode: não aceitar snapshot/identidade antigos nem continuar polling privado; teste na Task 5.
- Banco indisponível, imagem ausente, ranking vazio e acesso direto no celular: mostrar estados recuperáveis, conservar navegação e evitar contadores falsos ou largura excedente; checks nas Tasks 4, 6 e 7.

## Estrutura de arquivos e fronteiras

| Arquivos | Responsabilidade |
| --- | --- |
| `idle/shared/portal-types.ts` | DTOs públicos de conta, formulários, notícias, ranking e status |
| `idle/server/identity/{types,validation,repository}.ts` | Contratos internos, validação e persistência transacional de contas/sessões |
| `idle/server/identity/{password,limits,service,routes}.ts` | Criptografia, limites, resolução de identidade, cookie e endpoints auth |
| `idle/server/{profiles,scheduler,game-routes}.ts` | Repositórios por personagem, ticks e rotas privadas do jogo |
| `idle/server/portal/{types,repository,news,routes}.ts` | Contrato de consultas públicas, implementação e conteúdo versionado |
| `idle/server/{app,index,link-legacy}.ts`, `idle/server/schema.sql` | Composição, inicialização, migração e comando local |
| `idle/content/news.json` | Comunicados factuais iniciais |
| `idle/web/{http,pending-command,game-session,api}.ts` | Transporte tipado, recibos duráveis na aba, hook autenticado e ponto de exportação do jogo |
| `idle/web/portal/{AuthProvider,router,PortalApp,PortalShell}.tsx` | Sessão única, histórico, proteção de rotas e composição visual |
| `idle/web/portal/pages/*.tsx`, `idle/web/portal/portal.css` | Páginas e estilo de 2005, escopado para não contaminar o jogo |
| `idle/public/portal/banner.png` | Ilustração própria; Vite copia para o build |
| `idle/tests/{portal-fixture,db-fixture}.ts` e testes específicos | Fakes por contrato, banco temporário e provas de comportamento |
| `compose.yaml`, `docker/idle-game/Dockerfile`, `README.md` | Inicialização ordenada, conteúdo no runtime e instruções locais |

Não mudar os decoders, economia, catálogo ou renderização de combate por causa do portal. `ActorPreview`, já exportado por `web/components/Scene.tsx`, atende ao avatar do painel.

## Contratos compartilhados

Fixar na Task 1 os tipos abaixo; não inventar aliases diferentes nos consumidores:

```ts
type AccountView = { accountId: string; username: string; profileId: string; characterName: string };
type RegistrationInput = { username: string; characterName: string; gender: 'male' | 'female'; password: string; confirmation: string };
type LoginInput = { username: string; password: string };
type PasswordInput = { currentPassword: string; newPassword: string; confirmation: string };
type NewsSummary = { slug: string; title: string; category: string; publishedAt: string; summary: string };
type NewsEntry = NewsSummary & { body: string[] };
type RankingQuery = { category: 'level' | 'zeny' | 'kills'; classId: string | null; page: number; pageSize: number };
type RankingRow = { rank: number; characterName: string; classId: string; reborn: boolean; baseLevel: number; jobLevel: number; value: number };
type RankingPage = RankingQuery & { rows: RankingRow[]; total: number; updatedAt: number };
type PortalStatus = { status: 'ok'; accounts: number; hunting: number; rates: Catalog['rates']; checkedAt: number };
```

Tipos internos em `identity/types.ts`: `AccountRecord = AccountView & {passwordHash: string; credentialVersion: number}`, `SessionSeed = {tokenHash: string; createdAt: number; expiresAt: number}` e `AccountSeed = {username: string; passwordHash: string; nameKey: string; profile: GameState}`.

`AccountStore` expõe `register(seed: AccountSeed, session: SessionSeed): Promise<AccountView>`, `findCredentials(username: string): Promise<AccountRecord | null>`, `getSession(tokenHash: string, now: number): Promise<AccountView | null>`, `issueSession(accountId: string, expectedVersion: number, session: SessionSeed): Promise<AccountView>`, `changePassword(accountId: string, expectedVersion: number, passwordHash: string, session: SessionSeed): Promise<AccountView>`, `revokeSession(tokenHash: string): Promise<void>` e `health(): Promise<boolean>`.

`GameProfiles` expõe `forProfile(profileId: string): StateRepository`, `eligible(afterId: string | null, limit: number): Promise<string[]>` e `health(): Promise<boolean>`. Seu `forProfile` não cria personagens ausentes; novas contas são criadas exclusivamente na transação de registro. O contrato antigo `StateRepository` mantém read/transact/health. Definir `PortalQueries` desde a Task 1 em `server/portal/types.ts`: `{ranking(query: RankingQuery, now: number): Promise<RankingPage>; status(catalog: Catalog, now: number): Promise<PortalStatus>}`; a implementação SQL vem na Task 4.

## Preparação para execução

A implementação só começa depois da revisão deste plano e escolha do método. Aplicar `superpowers:using-git-worktrees` nesse momento: verificar isolamento já existente e os anexos desta conversa, preservar preferência do usuário e usar ferramenta nativa se um novo worktree for escolhido. Não resetar ou reutilizar silenciosamente o checkout que serve a stack ativa.

O checkout aprovado para implementação é denominado `IMPLEMENTATION_ROOT` neste plano. Ali executar `pnpm install --frozen-lockfile` dentro de `idle`, seguido de `pnpm test`, `pnpm typecheck` e `pnpm build` para registrar baseline. Falhas devem ser diagnosticadas antes de atribuí-las ao portal. Sem testes de banco opt-in, informar os skips de integração; isso não substitui a rodada real ao final.

Para testes SQL, usar um MariaDB temporário na rede já existente, sem publicar porta nem montar o volume do jogador. Credenciais abaixo são somente do banco descartável de testes:

```powershell
docker run --rm -d --name ragidle-portal-test-db --network ragidle_ragnarok_local -e MARIADB_DATABASE=idle_portal_test -e MARIADB_USER=idle_test -e MARIADB_PASSWORD=idle_test_local -e MARIADB_ROOT_PASSWORD=idle_test_root_local mariadb:11.4
docker build --target dependencies -t ragidle-portal-tests -f docker/idle-game/Dockerfile idle
docker run --rm --network ragidle_ragnarok_local -e DB_HOST=ragidle-portal-test-db -e DB_NAME=idle_portal_test -e DB_USER=idle_test -e DB_PASSWORD=idle_test_local -e IDLE_DB_TEST=1 -e IDLE_ASSET_ORIGIN=http://asset-service:8080 ragidle-portal-tests node node_modules/vitest/vitest.mjs run --no-file-parallelism
```

Esperar prontidão do banco antes de iniciar testes. Reconstruir a imagem de testes quando seu código mudar. A rodada SQL usa [--no-file-parallelism do Vitest](https://vitest.dev/guide/cli.html#fileparallelism) para que fixtures de arquivos diferentes não disputem o identificador fixo local-djow; concorrência dentro dos testes continua explícita com Promise.all/barreiras. `docker stop ragidle-portal-test-db` encerra e remove somente o container temporário criado com `--rm`. Não executar testes de schema/volume novo no banco real.

### Task 1: Contratos, validação e persistência de identidades

**Files:** criar `idle/shared/portal-types.ts`, `idle/server/identity/{types,validation,repository}.ts`, `idle/server/portal/types.ts`, `idle/tests/{portal-fixture,db-fixture}.ts`, `idle/tests/account-validation.test.ts`, `idle/tests/accounts.integration.test.ts`; modificar `idle/server/schema.sql` e `idle/server/repository.ts` na função migrate, sem alterar recibos existentes.

**Interfaces:** consome GameState/StateRepository; produz os DTOs e AccountStore/GameProfiles descritos acima, `validateRegistration(input: unknown): RegistrationInput`, `validateLogin(input: unknown): LoginInput`, `validatePassword(input: unknown): PasswordInput`, `characterKey(name: string): string`, `SqlAccountStore(pool: Pool)` e `PortalError(code: string, statusCode: number, message: string, fields?: Record<string,string>)`. Fixtures exportam `MemoryAccountStore`, `MemoryGameProfiles` e `createDbFixture(): Promise<{pool: Pool; cleanup(): Promise<void>}>`, com IDs de teste rastreados.

- [ ] **Step 1 — RED:** escrever `normalizes names without changing password`, `rejects character length and reserved djow`, `registers account profile session atomically`, `rolls back duplicate canonical username and NFC character name`, `migration preserves legacy JSON and receipts` e `expired session is unreadable`. Asserções: `characterKey('  Éowyn  ') === characterKey('E\u0301OWYN')`; senha `' 1234567890 '` permanece exata; perfil começa Base/Job 1/1, zeny 200; falha não aumenta contagem de contas/perfis; expiry com `now === expiresAt` retorna null. Migração repetida preserva JSON/recibos byte por byte, com legado criado somente como fixture no banco temporário.

```ts
it('normalizes names without changing password', () => {
  expect(characterKey('  Éowyn  ')).toBe(characterKey('E\u0301OWYN'));
  const input = validateRegistration({ username: 'Hero_A', characterName: 'Éowyn', gender: 'female', password: ' 1234567890 ', confirmation: ' 1234567890 ' });
  expect(input.password).toBe(' 1234567890 ');
});
// Nas fixtures SQL: comparar JSON/recibos anteriores e posteriores com toEqual,
// e store.getSession(tokenHash, expiresAt) com toBeNull.
```

- [ ] **Step 2 — verificar RED:** `pnpm test -- tests/account-validation.test.ts`; rodada SQL filtrada para `accounts.integration.test.ts` pelo comando Docker acima. Confirmar falhas por funcionalidades ausentes, não por banco indisponível.
- [ ] **Step 3 — implementar:** DTOs, validação por codepoints/NFC e chaves em lowercase. Coluna `character_name_key VARCHAR(96) NULL UNIQUE` com comparação binária de chave normalizada em `idle_profiles`, backfill somente de local-djow existente. Criar contas/sessões, FKs, versão de credenciais, índice de expiração e transações AccountStore. Store gera UUID de conta e persiste o perfil fornecido no AccountSeed; o serviço da Task 2 construirá esse perfil a partir de createInitialState. Emissão de sessão trava a conta e confere expectedVersion; troca de senha incrementa versão, revoga e emite atomicamente. Fixtures em memória implementam os mesmos contratos; fixtures SQL limpam apenas IDs criados e na ordem das FKs.
- [ ] **Step 4 — GREEN:** repetir ambos os comandos e `pnpm typecheck`; verificar colisões concorrentes com Promise.all e migração idempotente em banco temporário.
- [ ] **Step 5 — commit:** somente arquivos desta tarefa, mensagem `feat: add idle accounts and session persistence`.

### Task 2: Serviço de autenticação, cookies e proteção das mutações

**Files:** criar `idle/server/identity/{password,limits,service,routes}.ts`, `idle/tests/password.test.ts`, `idle/tests/auth.test.ts`; modificar `idle/package.json` e lockfile. Exercitar rotas em Fastify de teste montado com AccountStore da Task 1. A composição da aplicação existente só muda na Task 3; não adicionar bypass de auth de produção para facilitar testes.

**Interfaces:** consome AccountStore e validação da Task 1; produz `hashPassword(password: string): Promise<string>`, `verifyPassword(password: string, encoded: string): Promise<boolean>`, `AuthResult = {account: AccountView; token: string; expiresAt: number}`, `PasswordHasher = {hash(password: string): Promise<string>; verify(password: string, encoded: string): Promise<boolean>}` e `createAuthService(options: {accounts: AccountStore; catalog: Catalog; now: () => number; secureCookie: boolean; passwords?: PasswordHasher}): AuthService`. AuthService expõe `resolve(token: string | undefined): Promise<AccountView | null>`, `register(input: RegistrationInput): Promise<AuthResult>`, `login(input: LoginInput): Promise<AuthResult>`, `logout(token: string | undefined): Promise<void>` e `changePassword(account: AccountView, input: PasswordInput): Promise<AuthResult>`. Rotas usam `registerAuthRoutes(app: FastifyInstance, auth: AuthService): Promise<void>`; policy exporta `assertAllowedMutation(headers: {origin?: string; secFetchSite?: string; contentType?: string}, allowedOrigins: string[]): void`, reutilizada pela composição na Task 3. Cookie chama-se `idle_session`; token não aparece no JSON.

- [ ] **Step 1 — dependência:** conferir package/compatibilidade e executar `pnpm add --save-exact @fastify/cookie@^11`; fixar versão resolvida no lock. A [documentação oficial](https://github.com/fastify/fastify-cookie) indica versões >=10 para Fastify 5.
- [ ] **Step 2 — RED:** testes de senha correta/incorreta e salt distinto; hash versionado com N=32768/r=8/p=3; cookie HttpOnly/Lax/Path e Max-Age de 604800; banco não contém token puro. Fluxos register 201/login 200/me 200/logout 200/expired me 401 AUTH_REQUIRED. Senha atual incorreta é 400 e conserva cookie válido; troca concluída revoga outros cookies. Teste de corrida segura usando barreira após verifyPassword: trocar senha antes de issueSession esperado com versão antiga, que deve falhar. Testar thresholds 10/5/5, Retry-After, fila 2+8, limpeza 10.000 e rejeição de Origin estranho/null, Sec-Fetch-Site cross-site e POST sem JSON.

```ts
it('verifies exact passwords with independent salts', async () => {
  const a = await hashPassword(' 1234567890 ');
  const b = await hashPassword(' 1234567890 ');
  expect(a).not.toBe(b);
  expect(await verifyPassword(' 1234567890 ', a)).toBe(true);
  expect(await verifyPassword('1234567890', a)).toBe(false);
});
// Após trocar senha na barreira concorrente:
// await expect(store.issueSession(accountId, oldVersion, seed)).rejects.toMatchObject({code:'INVALID_CREDENTIALS'}).
```

- [ ] **Step 3 — verificar RED:** `pnpm test -- tests/password.test.ts tests/auth.test.ts`.
- [ ] **Step 4 — implementar:** scrypt assíncrono via crypto/promisify, hash de reserva, comparação constante, fila limitada e relógio injetado para limites. Serviço de registro cria GameState com createInitialState e substitui id por UUID, nome pelo texto validado sem truncamento, gênero pelo selecionado e rngState por uint32 aleatório próprio; não aceita GameState enviado pelo visitante. Criar token aleatório e SHA-256, prazo absoluto, cookies pelo plugin, erros tipados e rotas da spec. Policy JSON/origem usa default local e allowlist de dev localhost/127.0.0.1 nas portas 3339/5173; será aplicada a todo POST de API na Task 3. Auth routes não transformam erros de formulário em INVALID_COMMAND. Nenhum modo sem autenticação é habilitado por env de produção.
- [ ] **Step 5 — GREEN:** repetir testes, teste SQL de concorrência em `accounts.integration.test.ts`, typecheck. Confirmar que logs não registram senha/token.
- [ ] **Step 6 — commit:** `feat: add authenticated idle account flows`.

### Task 3: Jogo por conta, scheduler e associação do legado

**Files:** criar `idle/server/{profiles,scheduler,game-routes,link-legacy}.ts`, `idle/tests/scheduler.test.ts`, `idle/tests/legacy-link.integration.test.ts`; modificar `idle/server/{app,index,repository}.ts`, `idle/tests/api.test.ts`, `idle/tests/repository.integration.test.ts`. Manter a semântica de engine/index.ts.

**Interfaces:** consome AuthService/GameProfiles e PortalQueries declarados anteriormente; produz `SqlGameProfiles(pool: Pool): GameProfiles`, `registerGameRoutes(app: FastifyInstance, options: {auth: AuthService; profiles: GameProfiles; catalog: Catalog; now: () => number}): Promise<void>`, `createScheduler(options: {profiles: GameProfiles; catalog: Catalog; now: () => number; reportError: (profileId: string, error: unknown) => void}): {runCycle(): Promise<void>; start(): void; stop(): void}`, `linkLegacyAccount(pool: Pool, username: string): Promise<{account: AccountView; previousProfileId: string}>`. AppOptions definitivo: `{catalog: Catalog; accounts: AccountStore; profiles: GameProfiles; now: () => number; portal?: PortalQueries; assetOrigin?: string; webRoot?: string; publicOrigin?: string}`. Não aceitar repository único como fallback privado.

- [ ] **Step 1 — RED:** adaptar testes atuais de API para cadastrar/logar fixture real, sem remover suas asserções. Acrescentar `rejects anonymous gameplay`, `ignores foreign profile id`, `conflict snapshot belongs to caller`, `same requestId is independent across profiles`, `purchase retry survives reauthentication`. Duas contas começam com 200 zeny; compra de A não altera B; repetição de compra em A após logout/login conserva saldo já debitado. Scheduler deve avançar dois perfis, preservar lastSeenAt/contactTotals, cobrir desafio/repouso e pausar após 12h; no máximo dois transact simultâneos e 50 por lote, cursor reinicia e ciclo concorrente não duplica trabalho.

```ts
// Após duas compras iguais de 2 Red Potions (uma tentativa, uma recuperação),
// usando o mesmo requestId e conta A novamente autenticada:
expect((await profiles.forProfile(a.profileId).read()).zeny).toBe(100);
expect((await profiles.forProfile(b.profileId).read()).zeny).toBe(200);
expect((await profiles.forProfile(a.profileId).read()).inventory.find(i => i.itemId === 501)?.quantity).toBe(22);
// Uma requisição sem cookie: statusCode 401, body.error.code === 'AUTH_REQUIRED'.
```

- [ ] **Step 2 — verificar RED:** `pnpm test -- tests/api.test.ts tests/scheduler.test.ts`; testes SQL filtrados de legado/repositório no banco temporário.
- [ ] **Step 3 — implementar:** extrair contact/rotas privadas de app.ts para game-routes, registrar AuthService/rotas/cookies, resolver cookie no servidor e repositório por identity.profileId. Hook de toda API POST usa assertAllowedMutation; PUBLIC_ORIGIN opcional configura HTTPS/cookie e origem permitida, com defaults locais. Anexar o repositório do solicitante ao contexto de erro do comando. Factory usa GameRepository com callback que lança se o perfil não existir, impedindo criação implícita para contas. Scheduler usa paginação por id, transação atual e advanceState; continua após falha de um perfil sem registrar contato. index.ts compõe stores/serviços e encerra timer/pool no onClose.
- [ ] **Step 4 — legado:** implementar CLI em server/link-legacy.ts para entrar no build existente. Receber `--username` explícito e confirmação interativa mostrando somente IDs/nomes; ligar local-djow em transação, manter perfil anterior/recibos, impedir duplo proprietário e revogar sessões. Importar a função em testes não executa o CLI. A conta real não é vinculada durante desenvolvimento sem indicação do usuário.
- [ ] **Step 5 — GREEN:** repetir os comandos; confirmar fixture de link preserva JSON/recibos do legado e perfil anterior. Regressões engine/commands continuam passando.
- [ ] **Step 6 — commit:** `feat: isolate idle gameplay per account`.

### Task 4: Notícias, ranking e status públicos

**Files:** criar `idle/content/news.json`, `idle/server/portal/{repository,news,routes}.ts`, `idle/tests/portal.test.ts`, `idle/tests/ranking.integration.test.ts`; modificar apenas composição de `idle/server/app.ts` e `idle/server/index.ts`. Acrescentar cópia de news.json em `docker/idle-game/Dockerfile` no commit desta tarefa.

**Interfaces:** consome DTOs e PortalQueries da Task 1; produz `SqlPortalQueries(pool: Pool): PortalQueries`, `loadNews(): Promise<NewsEntry[]>`, `registerPortalRoutes(app: FastifyInstance, options: {queries: PortalQueries; catalog: Catalog; now: () => number; news: NewsEntry[]}): Promise<void>`. AppOptions passa a receber a implementação SQL do contrato já definido.

- [ ] **Step 1 — RED:** notícias ordenadas e slug inexistente 404; payloads contêm texto, sem HTML renderizado. Ranking: renascido 1 precede não renascido 99; empates estáveis pelo id; zeny/kills corretos; classe exata; página 2 começa posição 21; limites 1..50 e categoria/classe inválida 400; sem contas retorna rows=[],total=0. Perfis sem vínculo e fixtures isoladas de repositório não aparecem. Antes/depois de consultas, lastSeenAt, totais e JSON de perfis permanecem iguais. Banco indisponível retorna 503, sem anunciar status ok nem inventar contagens.

```ts
// Fixture possui Reborn (renascido Base 1) e Veteran (não renascido Base 99).
const page = await queries.ranking({category:'level', classId:null, page:1, pageSize:20}, 1000);
expect(page.rows.map(row => row.characterName)).toEqual(['Reborn', 'Veteran']);
expect(page.rows[0].rank).toBe(1);
expect(page.updatedAt).toBe(1000);
expect(await profiles.forProfile(veteranId).read()).toEqual(beforeRanking);
```

- [ ] **Step 2 — verificar RED:** `pnpm test -- tests/portal.test.ts`; ranking.integration no banco temporário.
- [ ] **Step 3 — implementar:** SQL parametrizado com JOIN contas/perfis, projeção JSON pequena, CAST numérico e allowlist para ORDER BY. Aplicar filtro antes de classificação/paginação. Status usa counts reais de contas vinculadas/personagens caçando e taxas do catálogo. Notícias carregadas tanto no fonte quanto dist; três comunicados factuais da spec, datados de sua publicação. Não consultar GameRepository.transact nem oferecer HTML livre.
- [ ] **Step 4 — GREEN:** repetir testes e typecheck/build; conferir news.json no runtime e respostas públicas sem credenciais/estado integral.
- [ ] **Step 5 — commit:** `feat: expose portal news and live rankings`.

### Task 5: Sessão do navegador, rotas e recuperação de recibos

**Files:** criar `idle/web/http.ts`, `idle/web/pending-command.ts`, `idle/web/game-session.ts`, `idle/web/portal/{AuthProvider,router}.tsx`, `idle/tests/http.test.ts`, `idle/tests/pending-command.test.ts`, `idle/tests/game-session.test.tsx`, `idle/tests/auth-provider.test.tsx`, `idle/tests/router.test.tsx`; modificar package.json e lockfile. O novo hook vive em game-session.ts e é testado diretamente; api.ts/App atuais só serão ligados a ele na Task 6, mantendo esta etapa compilável. Não montar o novo portal até a Task 6.

**Interfaces:** `ApiFailure(message: string, details: {status?: number; code?: string; fields?: Record<string,string>; snapshot?: GameSnapshot; uncertain: boolean})` conserva esses campos. `request<T>(path: string, options?: {method?: 'GET'|'POST'; body?: unknown; signal?: AbortSignal}): Promise<T>` usa same-origin, JSON e timeout de 15s. Classe `PendingCommands`, construtor `(storage: Storage)`, expõe `read(identity: AccountView): CommandRequest | null`, `write(identity: AccountView, receipt: CommandRequest): void`, `clear(identity: AccountView, requestId: string): void`. `useAuth()` retorna `{status: 'loading'|'authenticated'|'anonymous'; account: AccountView|null; refresh(): Promise<void>; accept(account: AccountView): void; invalidate(): void; logout(): Promise<void>}`. `useGame(identity: AccountView, onAuthRequired: () => void)` conserva retorno atual e acrescenta isolamento. Router exporta `navigate(path: string, replace?: boolean): void`, `Link(props: React.AnchorHTMLAttributes<HTMLAnchorElement> & {href: string}): React.ReactElement`, `useRoute(): {pathname: string; search: string}` e `safeReturn(path: string | null): '/painel'|'/jogar'`.

- [ ] **Step 1 — dependência:** adicionar jsdom como devDependency com versão resolvida fixa e compatível com Node 24. Usar React act/createRoot e comentário `@vitest-environment jsdom` somente nos testes DOM; não adicionar biblioteca de UI. [jsdom](https://github.com/jsdom/jsdom) é o ambiente de teste, não o navegador de verificação visual.
- [ ] **Step 2 — RED:** transporte distingue AUTH_REQUIRED de credencial inválida; cancelamento não vira falha incerta de outra identidade. PendingCommands grava antes do POST, resiste a nova instância/reload, permite chaves de A/B independentes, clear antigo não remove recibo novo, JSON adulterado não é executado, falha de armazenamento impede envio. Hook em StrictMode: promessa atrasada de A não aparece em B, timers/requests encerram no unmount/401, reentrada recupera mesmo requestId antes de aceitar nova compra. AuthProvider mantém sessão em senha incorreta e invalida em AUTH_REQUIRED. Router cobre popstate, URLs de notícias, links de teclado/modificadores e retorno externo rejeitado.

```ts
const pending = new PendingCommands(storage);
const receipt: CommandRequest = {requestId:'purchase-0001', command:{type:'buy', itemId:501, quantity:2}};
pending.write(a, receipt);
expect(new PendingCommands(storage).read(a)).toEqual(receipt);
expect(new PendingCommands(storage).read(b)).toBeNull();
expect(safeReturn('https://example.invalid')).toBe('/painel');
```

- [ ] **Step 3 — verificar RED:** `pnpm test -- tests/http.test.ts tests/pending-command.test.ts tests/game-session.test.tsx tests/auth-provider.test.tsx tests/router.test.tsx`.
- [ ] **Step 4 — implementar:** criar transporte e hook autenticado em game-session.ts a partir do fluxo atual, com signal e geração de identidade/operação além de alive ref; impedir aplicação de respostas antigas. Recibo versionado usa parseCommandRequest existente de server/validation.ts, que é puro e não importa runtime Node. Um AUTH_REQUIRED conserva pending e encerra polling; falha conclusiva limpa somente o requestId correspondente; falha de rede/503 conserva. JSON de sessão inicial não contém tokens. Roteador pequeno com tabela explícita, pushState/popstate e redirecionamento interno restrito.
- [ ] **Step 5 — GREEN:** repetir testes com relógios/promessas controlados; typecheck; nenhuma asserção apenas de classes CSS ou espelho da implementação.
- [ ] **Step 6 — commit:** `feat: add portal session and durable command recovery`.

### Task 6: Interface de 2005 e integração visual com o jogo

**Files:** criar `idle/web/portal/{PortalApp,PortalShell}.tsx`, `idle/web/portal/portal.css`, `idle/web/portal/pages/{Home,Register,Login,Dashboard,News,NewsDetail,Ranking,NotFound}.tsx`, `idle/public/portal/banner.png`, `idle/tests/portal-ui.test.tsx`; modificar `idle/web/main.tsx`, `idle/web/App.tsx`, `idle/web/api.ts`, `idle/index.html`. Alterar styles.css/hud.css somente se necessário para conter vazamento observado.

**Interfaces:** PortalApp monta AuthProvider e router; PortalShell recebe children. Páginas usam request/useAuth/Link/navigate da Task 5 e DTOs da Task 1. Jogo existente passa a `App({identity, onAuthRequired}: {identity: AccountView; onAuthRequired: () => void})`, usa useGame(identity,onAuthRequired) e é montado com key de accountId/profileId. Painel reutiliza ActorPreview e realiza um único POST /api/session por acesso, sem polling contínuo e sem dismissOffline.

- [ ] **Step 1 — RED funcional:** formulário de registro confirma senha e mostra erro de campo; envio duplo não faz dois POSTs; login retorna a rota interna correta; senha atual incorreta mantém painel; AUTH_REQUIRED exige entrada; erro de rede conserva campos. Testar leitura de notícia com texto contendo `<script>` sem elemento script, mudança de categoria/classe/página do ranking e link Jogar protegido. Usar mocks de transporte com respostas verificáveis, sem testes de detalhes CSS.

```ts
// Após renderizar notícia cujo body contém '<script>alert(1)</script>':
expect(document.querySelector('script')).toBeNull();
expect(document.body.textContent).toContain('<script>alert(1)</script>');
// Após senha atual errada, permanece a rota privada e seu formulário de correção:
expect(window.location.pathname).toBe('/painel');
expect(document.querySelector('[role="alert"]')?.textContent).toContain('senha atual');
```

- [ ] **Step 2 — verificar RED:** `pnpm test -- tests/portal-ui.test.tsx`.
- [ ] **Step 3 — arte e shell:** aplicar design-taste-frontend somente às escolhas pertinentes ao portal retro e imagegen para banner original. Brief: panorama largo de cidade de fantasia medieval, aventureiros em traço anime da metade dos anos 2000, céu azul suave, moldura compatível azul/prata; espaço calmo à esquerda para marca em HTML; sem textos dentro da imagem. Integrar o PNG retornado e fallback que preserve marca. Arte pode ser delegada em paralelo como tarefa de asset, sem editar shell/páginas.
- [ ] **Step 4 — páginas:** implementar home 3 colunas, navegação, campos reais, estados loading/error/empty, painel, notícias e ranking; cabeçalhos claros, Tahoma legível, molduras/relevo e responsive abaixo de 768 px. Escopar portal.css sob .portal-shell e conservar estilo do jogo. Títulos do documento mudam por página. PortalApp resolve todas as rotas da spec, inclusive notícia direta e NotFound.
- [ ] **Step 5 — jogo:** substituir api.ts por exportação do useGame de game-session.ts, removendo o hook antigo; passar identidade ao App/useGame. Manter controles/painéis existentes, acrescentar retorno ao painel e logout pela sessão compartilhada. Montar jogo apenas autenticado; não chamar API privada na home. Capturar erro AUTH_REQUIRED e desmontar apresentação antiga.
- [ ] **Step 6 — GREEN e inspeção:** repetir teste funcional, typecheck/build. Servir preview local com API disponível e conferir visual por browser em 1366×768 e 390×844: banner/marca, colunas, formulários, avatar, tabelas com scroll interno, foco e contraste. Confirmar largura do documento <= viewport e fallback com imagem bloqueada. Corrigir somente falhas observadas/requisitos ausentes.
- [ ] **Step 7 — commit:** `feat: build classic Ragnarok idle web portal`.

### Task 7: Inicialização, aplicação local e aceite final

**Files:** modificar `compose.yaml`, `README.md`; criar `docker/hercules/healthcheck.sh` e modificar Dockerfile clássico somente para copiar esse helper se o healthcheck não couber com segurança no Compose. Criar `idle/tests/hosting.test.ts` para fallback do SPA e headers; manter novos assets/news no Dockerfile idle definidos pelas Tasks 4/6.

**Interfaces:** healthcheck do Hercules verifica schemas login/loginlog por credenciais do ambiente sem imprimir segredos; idle-game.depends_on.hercules exige service_healthy. Aplicação permanece localhost:3339. CLI compilado roda `node dist/server/link-legacy.js --username <conta>` dentro do runtime.

- [ ] **Step 1 — RED:** `hosting.test.ts` verifica GET /, /registro, /noticias/:slug, /ranking, /painel e /jogar devolvem o SPA, enquanto /api/recurso-inexistente e /assets/path-invalido não devolvem HTML; resposta privada no-store. Registrar a corrida atual de schema em inspeção da configuração, sem iniciar volume do jogador do zero.

```ts
const direct = await app.inject({method:'GET', url:'/noticias/primeiros-passos'});
expect(direct.statusCode).toBe(200);
expect(direct.headers['content-type']).toContain('text/html');
const missingApi = await app.inject({method:'GET', url:'/api/recurso-inexistente'});
expect(missingApi.statusCode).toBe(404);
expect(missingApi.json().error.code).toBe('NOT_FOUND');
```

- [ ] **Step 2 — implementar ordem:** healthcheck de schema clássico, dependência de saúde do Idle, documentação de URLs, contas, notícias versionadas, CLI e comandos de teste. Não alterar contas/tabelas clássicas. Verificação em stack descartável pode usar override com portas diferentes e recursos locais read-only, sem apontar para ragidle_mariadb_data.
- [ ] **Step 3 — GREEN:** `pnpm test`, `pnpm typecheck`, `pnpm build`; rodada completa Docker contra o MariaDB temporário com IDLE_DB_TEST=1 e recursos reais. Informar total de testes e skips, se existirem. Validar início de volume novo isolado e reinício preservando contas/sessões/perfis de teste. Nenhum reset em produção.
- [ ] **Step 4 — revisão independente:** obter revisão de código do diff completo, incluindo isolamento, segurança de sessão, corrida de senha, recibos, scheduler e cobertura da spec. Corrigir achados materiais e executar apenas os testes afetados antes de uma rodada final necessária.
- [ ] **Step 5 — aplicar à stack local:** identificar working_dir/config_files com docker inspect filtrado, verificar estado Git do checkout ativo e construir imagem idle com IMPLEMENTATION_ROOT. Usar o mesmo nome de imagem da stack e configuração local existente, recriando apenas idle-game após os checks. Mudanças de Compose/healthcheck são aplicadas preservando o checkout ativo e seus arquivos; não fazer reset, limpeza de volume ou checkout forçado. Não exibir env/config completos. Se a configuração ativa divergir, resolver o diff concreto antes de prosseguir.
- [ ] **Step 6 — aceite real:** health 200, portal visível, links diretos/reload, cadastro de duas contas QA com UUID, isolamento, login/logout/troca de senha, notícias, ranking, abrir caça de um personagem e retorno ao painel em desktop/celular. Confirmar local-djow/recibos preservados e ausência de vínculo automático; remover somente contas/perfis QA rastreados. A conta do usuário e sua eventual associação são escolhas posteriores explícitas, sem senha padrão.
- [ ] **Step 7 — registrar e entregar:** commit `docs: document portal setup and verified local acceptance`, abrir http://localhost:3339 no painel do Codex e entregar URL, validação e limites reais. Usar finishing-a-development-branch conforme o método escolhido; não publicar PR nem merge sem autorização aplicável.

## Dependências e método recomendado

Ordem: 1 → 2 → 3 → 4 → 5 → 6 → 7. As interfaces da Task 1 permitem investigar/testar os contratos públicos em paralelo, mas a composição app.ts e lockfile têm dono único por etapa. Arte da Task 6 é independente do código e pode avançar enquanto as páginas são implementadas.

Recomendo execução com subagentes por tarefa e revisão independente: a camada de autenticação muda a seleção do progresso e há invariantes de transação/recibos que afetam diretamente os personagens. Isso custa mais revisões do que execução direta, mas permite validar cada fronteira antes de integrar seus consumidores. Execução direta pelo agente principal também é viável, seguindo as mesmas tarefas e uma revisão final do branch.

## Self-review do plano

- Cobertura: visual/rotas/painel nas Tasks 5/6; registro/sessão/senha nas Tasks 1/2; isolamento/offline/legado nas Tasks 3/5; notícias/ranking/status na Task 4; migração/stack/aceite na Task 7.
- Tipos: AccountView é a identidade tanto no servidor quanto no frontend; GameProfiles seleciona StateRepository por perfil; ranking usa classId internamente e query `class` externamente; API não emite token JSON.
- Review Focus: cinco classes de falha nomeadas acima possuem testes/checagens concretos nas tarefas indicadas.
- Proporção: passos fixam interfaces, comportamento, comandos e ownership; implementadores escrevem os corpos. Não há dependências instaladas nem código de produto alterado durante esta etapa.
- Aprovação pendente: usuário revisa este arquivo e escolhe execução direta ou por subagentes antes da implementação.
