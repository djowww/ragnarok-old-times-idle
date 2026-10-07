# Aceite local do portal Ragnarok Idle — 2026-10-07

Registro durável de implantação e verificação. Fonte de produto revisada:
`f34d5978fbe77a94521fd79eae30f4be7a5a80d3`, branch `codex/idle-portal`.
Aceite de navegador e limpeza final concluídos; branch e checkout preservados
para sustentar o override local retido. Sem merge ou publicação de PR.

## Aplicação e preservação

O portal foi aplicado em `http://localhost:3339` após a revisão específica da
Task 7, a única revisão ampla final e uma onda delimitada de correção com
revisão focada CLEAR. Não houve publicação externa, merge ou PR.

Imagem revisada/aplicada: manifest
`sha256:ae4233ff3f6c861666776c81a4c4be34a1719708716314af3f57904a8f1b152f`,
config `sha256:73dd915c0bf664b6f2b975b5b24790a3420032fe8b8b1a57880833866953e9c0`.
Novo container Idle:
`0670dffd118039d4649f7fd64c7f43337922d0cd25a18b0cae0bd0e02314cfc8`.
Health HTTP200 e Docker healthy verificados em 2026-10-07T05:30:12Z.
A imagem antiga permanece como `ragidle-idle-game:pre-portal-20261007`,
`sha256:e44d6fb835a133a454ae72da6d9e4a46cd1663cc531b9433903496ec7a50adb1`.

Somente Idle foi recriado com `up -d --no-deps --no-build --wait`.
IDs dos outros cinco containers permaneceram iguais:

| Serviço | ID preservado |
| --- | --- |
| MariaDB | `a34cf49783c876be8286e31b28c5e9f279d6288a15e2bed9e5df76c6ae74252d` |
| Hercules | `b77bddf6caa90dd10b00a386142fd438650daa187f62cc152c83166ab31a7c54` |
| Viewer clássico | `98371c3f901065e566517a1a4b3f733f13bd829c8afa8916377addb8fadf32ba` |
| Proxy | `71aa79f6ca1bf61be2de23d0fc4b6c9560c6a89e02fe13e95a9d5a5a0f2f40e4` |
| Assets | `76355532c26f674c8cf76eb58adf85edc7d0a7e0b151fad66c0dc13190417508` |

Volume real `ragidle_mariadb_data`, rede `ragidle_ragnarok_local`, `.env` e
mount de `client-data` somente leitura preservados. Os schemas clássicos
`login`/`loginlog` foram consultados silenciosamente antes/depois; não foram
alterados pelo portal. Migrações do Idle são aditivas/idempotentes.
Nenhum reset ou associação real do legado foi executado.

Evidência imediatamente anterior à aplicação: 2026-10-07T05:29:29.102Z,
cutoff de recibos `2026-10-07 05:29:29.091000`. Os **223 recibos anteriores**
foram preservados com a mesma SHA256 ordenada:
`fbcfb8102221a9269294be99b300e6822f8cef995214cea0a8ff4a9995326c3f`.
O perfil `local-djow` existe e continua com zero contas proprietárias.
Digest do JSON antes:
`0632b466c77274ab04fec9ec8a95655513eab8fa0bec08551f22ba0ac14b9c9d`;
depois `373740d07143b0216f516c2984c4db85d9f6dd358eb397b7f224dc2db6c3bb72`.
A igualdade do JSON não foi exigida: o scheduler pode avançar o estado
legitimamente. Identidade, ausência de vínculo e subconjunto de recibos
preexistentes foram verificados; JSON, credenciais e tokens não são exportados.

## Repetir, preservar o checkout e reverter

O override adjacente retido em
`C:/Users/Usuário/.codex/worktrees/ragnarok-browser-local/RagIDLE/compose.override.yaml`
tem SHA256 `998a0643ed49ddc8fe5e32dd48bcd15a5b1ff22406f3dc3f0edf7f03b0cb7cfc`.
A leitura da configuração mesclada comprovou delta exclusivamente nas três
propriedades Idle imagem/contexto/Dockerfile; o arquivo anterior não existia.
Conserve o checkout de implementação enquanto o override apontar para ele.
Fonte ativa do outro trabalho permanece preservada. Comandos completos:

```powershell
$activeRoot = 'C:/Users/Usuário/.codex/worktrees/ragnarok-browser-local/RagIDLE'
$composeArgs = @('--project-directory', $activeRoot, '--env-file', "$activeRoot/.env", '-p', 'ragidle', '-f', "$activeRoot/compose.yaml", '-f', "$activeRoot/compose.override.yaml")
docker compose @composeArgs build idle-game
docker compose @composeArgs up -d --no-deps --no-build --wait --wait-timeout 120 idle-game
```

Rollback local sem rebuild:

```powershell
docker tag ragidle-idle-game:pre-portal-20261007 ragidle-idle-game
docker compose @composeArgs up -d --no-deps --no-build --wait --wait-timeout 120 idle-game
```

As tabelas aditivas do portal ficam no banco após rollback. O novo healthcheck
Hercules pertence ao Compose versionado da implementação, validado em banco
vazio isolado; o Hercules real existente foi mantido sem recriação e sem
retroinstalar o probe. `.gitattributes` garante `*.sh text eol=lf`.

## Verificação de código, SQL, recursos e persistência

Task 7 Fase A commit `7dbe8faa4d93064144cbdc9d930094a8dc3953ad`: dez testes de
hospedagem, probe e ordem de saúde, documentação e override preparado.
Servidor já cumpria o contrato de SPA; primeiro teste9/9 passou sem mudança
artificial. RED real de schemas ausentes/parciais: probe silencioso exit1;
login/loginlog prontos: exit0. Dockerfile COPY/chmod do helper validado com
sobreposição na imagem Hercules existente e seu bootstrap real; rebuild
completo de Hercules foi cancelado após cache miss da nova base Debian,
sem alegação de compilação completa nova. Nenhum container real foi alterado.

Fase A: full Docker serial **255/255**, 25 arquivos, zero skips; local pnpm
**226 aprovados/29 skips opt-in**; typecheck/build exit0. Recursos originais
SPR/ACT, BMP/JPG e música passaram. Banco novo QA usa projeto
`ragidle-portal-phasea`, rede `ragidle-portal-phasea_ragnarok_local`, volume
`ragidle-portal-phasea_mariadb_data`, porta4340 apenas API. Eventos de início
em nanossegundos comprovaram DB healthy1791348295965113539,
Hercules start1791348296436518185, schemas healthy1791348301523710615,
Idle start1791348302265759620, Idle healthy1791348307460704236.

Após parar Idle/Hercules QA e reiniciar seu DB com volume retido, digests
quietos de perfis3, contas2, sessões2 e recibos1 coincidiram exatamente.
Cookies continuaram válidos, saldos150/200 permaneceram isolados e a repetição
do mesmo recibo não cobrou novamente. Esses dois personagens QA foram removidos.
Imagem antiga de assets em execução não existia no armazenamento de imagens;
QA usou imagem local disponívelc94f56e8 e client-data read-only. SPR/ACT head6
masculino e28 feminino, worldmap/basewin/titlebar e range BGM08 tiveram bytes
iguais ao serviço ativo; arquivos originais não foram exportados.

Onda final `f34d597`: guard de identidade exibida/capturada em senha/logout,
callbacks antigos protegidos, data real de criação de conta nullable/aditiva,
exemplo Docker com diretório corrigido. RED auth8 falhas/36 passes/1 skip;
RED SQL7 falhas/29 passes; GREEN local 89/1 skip e SQL 36/36. Typecheck/build0.
O primeiro full gate dessa onda teve **262 aprovados/1 falha/zero skips**,
25 arquivos; teste herdado do limite de 12h excedeu5000 ms (6774 ms). Código,
assertivas e timeout do motor não mudaram. Diagnóstico focado do teste exato
passou3632 ms; a única repetição completa autorizada passou **263/263**,
25 arquivos, zero skips,64.13 s; teste antes afetado4670 ms. Histórico da falha
é preservado aqui;255 refere-se à versão anterior,263 à imagem aplicada.

Comandos de teste SQL/assets serial na raiz do checkout de implementação
(pnpm/typecheck/build na pasta `idle`; DB descartável pronto, sem porta ou
volume real):

```powershell
docker build --target dependencies -t ragidle-portal-finalfix-tests -f docker/idle-game/Dockerfile idle
docker run --rm --network ragidle-portal-phasea_ragnarok_local -e DB_HOST=ragidle-portal-finalfix-test-db -e DB_NAME=idle_portal_test -e DB_USER=idle_test -e DB_PASSWORD=idle_test_local -e IDLE_DB_TEST=1 -e IDLE_ASSET_ORIGIN=http://asset-service:8080 ragidle-portal-finalfix-tests node node_modules/vitest/vitest.mjs run --no-file-parallelism
```

O comando acima registra a rodada feita antes da limpeza da rede QA. Para
repetir após a limpeza, recrie o ambiente descartável ou use o procedimento
completo do README na rede local existente, com DB de testes separado.
Credenciais acima são somente de fixture temporária; jamais direcionar fixtures
SQL ao banco real nem usar o DB de testes como navegador/scheduler.

## Aceite real por HTTP/API e navegador

HTTP200 para home/registro/notícias/ranking/painel/jogar; banner200 image/png.
No proxy real, worldmap200 image/jpeg1352078 bytes, basewin200 image/bmp34552,
titlebar200 image/bmp1152 e BGM200 audio/mpeg2740224. Os três avisos Vite
herdados são resolução externa em execução, com disponibilidade comprovada.

Duas contas UUID rastreadas foram criadas somente para QA real:

| accountId | profileId | created_at_ms real |
| --- | --- | --- |
| `931f2a83-d5f5-42de-960a-55c713530309` | `4efbe1dc-3a53-4fe1-800f-5eaaedb82f43` | `1791351069410` |
| `486e951c-30c8-4f82-b703-ae46c0ca68f2` | `21b41674-8455-4ac7-9254-a08e00bb7837` | `1791351069671` |

API confirmou cadastro, saldos isolados150/200, currentPassword inválida400
sem invalidar sessão, troca correta revogando cookie/senha antigos, login novo,
logout, recibo `389d09ba-4e7d-4d1d-875c-55fde9d2f331` recuperado uma vez após
reauth, notícias versionadas e ranking real com duas contas. CookieB com
expectativaA em senha/logout recebe401 sem Set-Cookie e conserva B; timestamp
da conta continua o real de cadastro após troca de senha. Nenhuma senha real
foi manipulada. Credenciais/cookies QA são temporários e não constam deste documento.

Aceite real do controlador no navegador: home anônima e banner original,
Jogar → login com retorno `/jogar` → seleção apenas do personagem da conta →
Prontera nativa, avatar/minimapa/HUD. Desktop 1366×768: Sul de Prontera,
Iniciar caça, combate real e Lunatic derrotado; Base 1→2, Job 1, uma morte de
monstro contabilizada. Mobile 390×844: mapa/caça/avatar/HUD e exploração
operáveis, viewport/adventure/body/document 390 px sem overflow horizontal.
Voltar à cidade carregou Prontera; Livro → Painel mostrou a mesma conta e
avatar, Base 2/Job 1, EXP 15/8, 150 zeny/uma kill. Reload direto conservou
autenticação/progresso. Ranking Zeny/Aprendiz mudou URL para
`category=zeny&class=novice&page=1`, ordenou saldos reais 200/150 e preservou
Base 2 de A; tabela móvel 305 px, conteúdo 580 px, scroll interno e página
375≤390. Notícias → Guia de primeiros passos → reload direto manteve conteúdo
real. Sair retornou à home anônima. Nenhuma troca de senha foi feita pelo
navegador; verificações de credenciais usaram apenas API e contas descartáveis.
Banner carregado com largura nativa 2098 px; página desktop 1351≤1366 e móvel
375≤390. Screenshots inline foram inspecionados; nenhum arquivo exportado é
alegado. Observações de viewport/locator da ferramenta não exigiram correção
do produto. Viewport temporário foi restaurado no fim.

Após limpeza, novo reload confirmado pelo controlador exibiu **Contas 0**,
**Em caça 0**, ranking/heróis vazios, banner normal e três colunas preservadas.
Tab real marcada como entrega. `open_in_codex` de localhost:3339 retornou
`queued` para o chat; não se afirma que o painel já estava visível.

## Limpeza e limites

Em 2026-10-07T05:37:31.7955895Z: as duas contas QA e seus perfis foram removidos
em transação, conferindo antes cada par exato conta/perfil e proibindo
`local-djow`. Contas/perfis/sessões/recibos/chat desses IDs ficaram em zero;
nenhuma exclusão por nome genérico nem de conta do usuário. Ranking total 0 e
health 200. Rechecagem às 05:36:28Z: `local-djow` presente, zero proprietários,
os mesmos 223 recibos e mesmo digest anterior. A progressão do legado continua
armazenada; seu JSON não é resetado.

Containers próprios `ragidle-portal-ui-preview`/`ragidle-portal-ui-preview-db`
foram parados/removidos automaticamente, incluindo volume anônimo próprio
`8fdffa5f37074112d7cf569b6936170ef98febb91e96b6a2633129443189a348`.
Projeto próprio `ragidle-portal-phasea` encerrado com seu `fresh.compose.json`:
quatro containers, rede e volume `ragidle-portal-phasea_mariadb_data` removidos.
DBs temporários de SQL já removidos. Verificação enumerada: zero desses
containers/volumes/redes; credenciais QA removidas do host e container real.
Tags/imagens temporárias não usadas de preview/testes/PhaseA foram removidas.
A tag auxiliar `ragidle-portal-phasea-hercules-base` foi mantida: Docker
recusou sua remoção porque a imagem é usada pelo Hercules real; não houve
remoção forçada. Isso não conserva DB, container ou volume QA.
Imagem aplicada/finalfix, rollback, volume real, override ativo e checkout
da implementação permanecem. Todos os seis IDs reais pós-aplicação ficaram
iguais durante a limpeza. Scratch SDD só pode ser removido após este registro
e seu commit; nenhum segredo/estado bruto foi incorporado à documentação.

Sem hospedagem pública/HTTPS real/distribuição multi-instância, associação
interativa real do legado ou auditoria ampla de balanceamento/serviços Prontera.
São limites explícitos; o CLI compilado e transações isoladas foram verificados,
mas sua aplicação ao usuário depende de escolha explícita posterior.
Risco herdado de lock-order em manutenção repetida, POST futuro sem corpo
JSON_REQUIRED, JSX denso, avisos GRF e sensibilidade do teste de 12h permanecem
adjudicados; não foram silenciosamente declarados corrigidos.

A checagem imediata de fonte ativa em2026-10-07T05:26:02Z encontrou132 caminhos,
zero novos/removidos e oito hashes alterados desde round4, em Config.local,
map-idle, mapviewer patch, app/index/teste API, App e OriginalMap. Inspeção
única delimitada mostrou portabilidade para hosting externo; escolhas locais
iguais, exceto grafia127 do link clássico. Fonte peer HEADff0db0e1 preservada;
nenhuma cópia nova após review. Root decidiu conservar imagem/fonte local
revisadas e adiar delta externo. Renderer aprovado permanece SHA256
`962b71224a81a1630eb5072a464acf36df95cd35b5ac769f1cbd1b137d839609`.

## Rulings formais, em ordem

As 18 decisões seguintes são preservadas literalmente, com seus custos se
estiverem erradas, antes de qualquer remoção do scratch de execução.

Ruling: Investigate and repair preexisting test failures before portal implementation, preferring evidence-backed fixture/expectation corrections when current behavior matches existing approved game changes — clean regression baseline is required; changing gameplay to satisfy stale expectations would violate portal scope — cost if wrong: test changes must be reverted and the underlying game defect corrected.
Ruling: Incorporate the active game source as an exact snapshot in this isolated branch before the portal tasks — the deployed game has newer user work that the old base would regress; preserve source, tests and infrastructure without copying env/data/dependencies or changing the active checkout — cost if wrong: snapshot must be reconciled/rebased against the other chat before deployment. Deployment is deferred until concurrent work is coordinated.
Ruling: Extend portal integration boundaries to retain cooperative simulation/session throttle and chat from the current game; protect chat GET/POST with the same account session and derive author from caller profile — otherwise the portal would remove features or keep shared author identity — cost if wrong: adjust chat access and hook compatibility, without changing combat rules. Exact compatibility constraints live in snapshot-integration-constraints.md.
Ruling: Use pnpm exec vitest run <files> for focused checks instead of pnpm test -- <files> — this pnpm invocation was observed to run the whole suite despite requested paths, so focused iteration should use Vitest directly; full suite remains required before task commit — cost if wrong: incorrect focused invocation could omit affected checks, covered by the full suite gate.
Ruling: Scheduler eligibility is linked account profiles plus local-djow, with the specified active statuses; other unlinked stored profiles stay untouched — this preserves the currently running legacy while avoiding farming abandoned profiles after a maintenance link — cost if wrong: broaden eligibility later and reconcile offline progress for an unlinked profile. Task1 reviewer future ownership-selection check will be verified in Task3.
Ruling: Amend scheduler.stop() from void to Promise<void>, stop scheduling immediately and drain the current cycle before index closes the SQL pool — graceful shutdown otherwise races pending cooperative transactions; declare async behavior explicitly instead of hiding a promise behind void — cost if wrong: consumers may need adaptation or shutdown can wait on a failed/stuck transaction; focused shutdown coverage and transaction error handling required.
Ruling: Add observable useAuth().error: ApiFailure|null while keeping initial unavailable authentication status loading and existing authenticated identity on non-AUTH_REQUIRED failures — otherwise initial503 leaves an indefinite spinner with no retry affordance, while treating unknown session as anonymous blurs outage and logout — cost if wrong: consumers need adaptation to extra error state; successful recovery and stale-failure guards must be tested.
Ruling: Add optional X-Idle-Expected-Identity guard to private API and make browser session/commands send their account/profile pair; resolve actual caller only from cookie and reject malformed/mismatched expectation before any contact or transaction — another tab can change HttpOnly cookie between a client preflight and durable receipt recovery, otherwise an A receipt could execute under cookieB — cost if wrong: API consumers must preserve header serialization and stale tabs will require reauthentication; absent header remains compatible and never selects a profile.
Ruling: Registration canonical route is /registro as approved spec and direct-hosting acceptance require; retain staged /cadastro as redirect alias — spec is binding over the interim router whitelist, and alias preserves existing generated links — cost if wrong: URL consumers/tests need adaptation or one additional redirect; login remains /login.
Ruling: Retain a narrow local compose.override.yaml alongside the active project, merging any existing override and setting only Idle image/build context/Dockerfile to this reviewed implementation worktree; use explicit base+override repeat commands and keep this checkout available — image-only deployment would let future up --build regress the portal, while wholesale reconciliation would risk concurrent user game source — cost if wrong: local override paths/repeat commands need updating when the checkout moves, and removing it would revert future builds to the active source. Other service/environment/volume/mount configuration remains active base configuration.
Ruling: Bring the already captured round4 head-ACT pairing correction forward from Task7 into Task6 fix round1 — independent review found non-default hairstyles pair their new SPR with the old ACT, so the reviewed portal should not advance with that Important defect open; this is the same bounded latest-game hunk plus focused coverage — cost if wrong: restore or adjust hairstyle metadata/fallback for original client resources whose ACT is unavailable. No new appearance feature or gameplay redesign.
Ruling: Extend the optional expected-account/profile guard to authenticated password change and logout, sending the displayed/captured identity before local invalidation and rejecting mismatches before hashing, mutations or Set-Cookie; login, registration and public reads remain unchanged — focused review reproduced a stale A panel changing/revoking B under the shared cookie, so the prior auth-wide exemption conflicts with reasonable account ownership expectations — cost if wrong: authenticated consumers need header adaptation or stale tabs need reauthentication; absent header stays compatible and the current B session/cookie must remain intact on mismatch.
Ruling: Add an additive nullable account creation timestamp, populate the actual registration time only for new accounts and leave preexisting account dates unknown, without changing public identity DTOs or inventing history — the approved spec requires durable creation metadata and sessions cannot supply it — cost if wrong: migration/registration SQL needs adjustment and old accounts retain unknown dates until an independently evidenced historical source is supplied; preserve all credentials/profiles/sessions/receipts.
Ruling: Defer the non-blocking repeated-maintenance lock-order risk, omitted-body transport contract and broad JSX formatting; retain runtime-resolved GRF notices as known hygiene and the unchanged 12-hour test's historical CPU sensitivity — current flows send JSON, original resources and latest serial full gate are verified, and broader cleanup would widen this correction — cost if wrong: explicit legacy maintenance/login may transiently fail under contention, a future bodyless POST caller gets JSON_REQUIRED, compressed JSX costs maintenance time, an untested resource may need correction, or a loaded test run can hit its narrow timeout; none is silently claimed fixed.
Ruling: Keep external public hosting, real HTTPS operation and distributed multi-instance rate limiting outside this local single-process delivery — reviewer declined those deployment scenarios and the authorized target remains localhost:3339 — cost if wrong: a later public launch needs configuration, security and distributed deployment acceptance before use.
Ruling: Keep the real user's legacy association and interactive CLI acceptance pending an explicit account choice; do not execute it for this delivery — reviewer assessed code and isolated transactions, while the requested portal uses independent Idle accounts and no user account was nominated — cost if wrong: the existing legacy progress remains separate until the user explicitly chooses a link and its real interactive workflow is verified.
Ruling: Preserve the existing game's approved source/captures and verify portal integration without reopening a full balance/class/refinement/resource audit or claiming every Prontera service manually exercised — reviewer declined that separate game-wide scope and existing functional changes must be retained — cost if wrong: an unrelated inherited game/service/resource defect needs a separate focused repair; complete service click-through remains unverified.
Ruling: Retain the final reviewed portal image/source for local localhost:3339 application while deferring the eight newly captured external-hosting portability paths; preserve all active peer source and unchanged non-Idle containers — bounded preapply audit confirms local configured origins/assets/websocket/viewer paths and localhost classic link retain their behavior, with only a 127 alias URL spelling difference and no gameplay/schema/actor delta; external hosting was explicitly excluded — cost if wrong: a later Hostinger/public deployment needs explicit reconciliation of these captured portability changes, and a local alias consumer may prefer hostname-matching links; no peer files are overwritten and no external deployment is claimed.
