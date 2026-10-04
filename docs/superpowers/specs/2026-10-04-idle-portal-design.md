# Portal Ragnarok Old Times Idle

Data: 2026-10-04
Status: direção e especificação aprovadas pelo usuário em 2026-10-04; implementação depende da revisão do plano e escolha do método de execução.

## Objetivo e decisões aprovadas

Criar o site do Ragnarok Old Times Idle com aparência de portal de Ragnarok de aproximadamente 2005, registro/login, painel do jogador, notícias e ranking. O portal deve ser funcional e ligado ao jogo existente, com textos em português e navegação em computador e celular.

O usuário escolheu contas próprias do Idle, com progresso individual, independentes das contas do Hercules. Em seguida aprovou a direção visual e funcional: banner ilustrado, molduras azul/prata, botões em relevo, fonte Tahoma, portal em `/`, jogo em `/jogar`, painel com personagem e troca de senha, notícias completas e ranking por nível, zeny e abates. O progresso existente de `djow` deve ser preservado.

Esta entrega integra o portal ao projeto local existente. A interface e API continuam na mesma origem, na porta 3339. Publicação em domínio externo não faz parte desta especificação.

## Contexto confirmado

- O frontend é React/TypeScript com Vite; a API é Fastify/TypeScript e o banco é MariaDB.
- `idle/server/app.ts` oferece catálogo, health, sessão de jogo, comandos e proxy de assets. Não há autenticação de jogadores.
- `idle/server/index.ts` injeta um único `GameRepository` com o perfil `local-djow`; todos os navegadores recebem o mesmo personagem.
- `idle_profiles` guarda o estado JSON. `idle_commands` guarda recibos idempotentes por perfil e comando. Transações usam bloqueio da linha do perfil.
- O estado já contém nome, gênero, classe, níveis, EXP, zeny, status de caça e totais de abates suficientes para painel e ranking.
- O tick atual avança somente o perfil compartilhado a cada cinco segundos. O motor já controla progresso offline, repouso, desafios e o limite de 12 horas.
- A stack ativa usa o checkout `C:/Users/Usuário/.codex/worktrees/ragnarok-browser-local/RagIDLE`, que possui `.env` e `client-data`. O checkout da conversa possui o código, mas não esses recursos ignorados pelo Git. A implementação deve preservar os dados e segredos da instalação existente ao aplicar o novo build.
- O modo clássico usa a porta 3338 e tabelas próprias. Suas contas, personagens e privilégios permanecem independentes.

## Direção visual

O site será um portal compacto, inspirado na linguagem visual de servidores e comunidades de Ragnarok da época: cenário de fantasia no cabeçalho, molduras finas, superfícies claras azuladas, pequenos gradientes de relevo e informações densas organizadas em colunas.

No computador, o portal terá largura máxima próxima de 1060 px, centralizada, com cabeçalho ilustrado e navegação horizontal. A página inicial terá uma coluna esquerda de acesso e informações do servidor, notícias no centro e um resumo do ranking à direita. As proporções priorizam a leitura das notícias. As páginas internas usam a mesma moldura e podem ocupar a área central completa para formulários e tabelas.

Paleta: azul desaturado, prata e branco para interface; verde para disponibilidade e dourado discreto para destaques do ranking. Tahoma/Arial para textos, com tamanhos legíveis e títulos de fantasia restritos ao banner. Bordas e cantos de 0 a 3 px; efeitos de vidro e animações contínuas não integram esta direção.

O banner terá arte própria de fantasia compatível com a atmosfera do jogo e identificação legível de Ragnarok Old Times Idle. Sprites e ícones locais podem complementar a apresentação por meio do proxy de assets existente. Arquivos GRF e BGM continuam fora do Git. A composição conserva moldura, marca e textos quando uma imagem falhar.

Abaixo de 768 px, o conteúdo passa a uma coluna, com acesso antes das notícias e ranking após elas. O menu pode quebrar em linhas deliberadas ou usar um botão de expansão. Tabelas terão rolagem interna quando necessária, sem ampliar a largura do documento. Foco por teclado, rótulos de formulário, contraste e alvos de toque legíveis fazem parte do acabamento.

## Páginas e fluxos

| Rota | Acesso | Conteúdo |
| --- | --- | --- |
| `/` | Público | Banner, notícias recentes, acesso à conta, status real do servidor, taxas do catálogo e primeiros colocados |
| `/registro` | Público | Criação de conta e personagem |
| `/login` | Público | Entrada com usuário e senha |
| `/painel` | Autenticado | Conta, personagem, progresso, estado da caça, troca de senha, logout e Jogar |
| `/noticias` | Público | Lista de notícias em ordem decrescente de publicação |
| `/noticias/:slug` | Público | Comunicado completo e retorno à lista |
| `/ranking` | Público | Classificações, filtro de classe, paginação e horário da consulta |
| `/jogar` | Autenticado | Interface idle existente com navegação de retorno ao painel |

Links internos permitem abrir e recarregar diretamente cada rota. A navegação atualiza título do documento e histórico do navegador. Um caminho desconhecido apresenta página de recurso não encontrado. Ao acessar painel ou jogo sem sessão, o visitante vai ao login com retorno restrito a uma rota interna conhecida. Cadastro e login de uma sessão já autenticada levam ao painel.

### Registro

Campos: usuário, nome do personagem, aparência masculina/feminina, senha e confirmação de senha. O usuário identifica a conta; o nome identifica o personagem mostrado no jogo e ranking. Cada conta possui um personagem nesta entrega.

- Usuário: 3 a 24 caracteres ASCII, letras, números e `_`; unicidade sem diferenciar maiúsculas/minúsculas.
- Nome do personagem: 2 a 24 caracteres, normalizado em NFC, letras Unicode, números, espaço, `_` e `-`; espaços externos removidos e unicidade sem diferenciar maiúsculas/minúsculas. A identidade legada `djow` fica reservada.
- Senha: 10 a 128 caracteres, até 512 bytes UTF-8; não remover espaços nem normalizar seu conteúdo. Confirmação precisa corresponder.
- Validação ocorre no navegador para orientação e novamente no servidor como autoridade.
- Conta e perfil são criados juntos em transação. Uma colisão concorrente retorna erro de campo e não deixa conta incompleta.
- O personagem inicia com as condições normais de `createInitialState`, nome/aparência selecionados e RNG próprio. Cadastro não concede vantagens de EXP, zeny ou inventário.
- O cadastro bem-sucedido abre uma sessão e leva ao painel.

### Login, sessão e senha

Login usa usuário e senha, com mensagem genérica para credenciais inválidas. A sessão permanece após recarregar o navegador e vence sete dias após a criação, sem renovação automática de prazo. Login bem-sucedido emite um novo token; logout revoga a sessão atual no banco e limpa o cookie.

Troca de senha exige a senha atual, nova senha e confirmação. Senha atual incorreta retorna 400 com `CURRENT_PASSWORD_INVALID` como erro do campo, conservando a sessão. Uma troca bem-sucedida atualiza o hash, revoga as sessões anteriores e cria uma nova sessão para o navegador atual em uma transação. O frontend recebe uma mensagem de confirmação e continua no painel. Uma sessão revogada ou expirada exige novo login e interrompe o polling do jogo. A caça continua no servidor dentro das regras offline existentes.

Não há email, recuperação por email ou edição livre do nome do personagem nesta entrega. A interface não oferece links para fluxos ausentes.

### Painel do jogador

Mostra usuário, nome do personagem, aparência, classe, nível Base/Job, EXP, zeny, total de abates, área e estado atual da caça. Classe e área usam nomes do catálogo. Inclui resumo do limite offline, acesso ao ranking e botão Jogar.

Uma consulta autenticada ao painel representa contato do jogador, assim como a sessão do jogo: primeiro reconcilia o intervalo anterior e só depois atualiza o contato. Abrir o painel não dispensa o resumo offline; ele permanece disponível ao entrar no jogo. A consulta não concede recompensas fora do motor.

### Notícias

Notícias ficam em arquivo de conteúdo versionado, com `slug`, título, categoria, data de publicação, resumo e corpo em parágrafos. O servidor expõe lista e detalhe. A interface renderiza texto, sem HTML arbitrário.

Conteúdo inicial: apresentação do Idle, guia de primeiros passos e comunicado sobre recursos já existentes, como combate offline e progressão de classes. As datas descrevem a publicação do comunicado. Não inventar eventos realizados, números de jogadores, torneios ou recompensas.

A página inicial exibe as três notícias mais recentes; a listagem mostra todas. Categoria e data acompanham título e resumo. Não há editor administrativo nesta entrega; novos comunicados são publicados por alteração do arquivo versionado.

### Ranking

Ranking usa somente perfis vinculados a contas do Idle. O perfil legado não vinculado e os perfis de testes ficam fora da consulta pública.

- Nível: renascidos primeiro; depois Base, EXP Base no nível, Job e EXP Job, todos decrescentes.
- Zeny: saldo atual decrescente.
- Abates: `totals.kills` decrescente.
- Desempate final: identificador do perfil em ordem ascendente, garantindo estabilidade.
- Filtro de classe: classe atual exata do catálogo, com opção Todas.
- Paginação: 20 linhas por página. Limitar a 50 em contratos reutilizáveis de API. Posição exibida corresponde à classificação filtrada.
- Projeção pública: posição, nome do personagem, classe, renascimento, níveis e valor da categoria. Não expor usuário da conta, cookies, inventário completo ou estado interno.

A consulta lê o último estado salvo e informa horário da consulta. Não simula recompensas nem registra contato. Os ticks e acessos autenticados atualizam o estado que será usado no ranking. A home solicita os cinco primeiros por nível.

## Arquitetura e responsabilidades

Manter React, Fastify e MariaDB. O motor de combate não depende de autenticação, rotas ou SQL. Os novos módulos devem ter responsabilidades pequenas e contratos explícitos:

1. **Repositório de contas e sessões:** cadastro, busca de credenciais, vínculo de perfil, revogação e transações de troca de senha.
2. **Serviço de autenticação:** derivação/verificação de senha, geração/hash de token, cookie, limite de tentativas e resolução do principal autenticado.
3. **Repositórios de jogo por perfil:** reutilizar bloqueio de linha e recibos atuais. O servidor seleciona o perfil a partir da sessão; o cliente nunca escolhe um `profileId` para ler ou comandar.
4. **Consultas do portal:** notícias, projeção de ranking e informações reais do servidor.
5. **Scheduler de múltiplos perfis:** avançar personagens elegíveis com o mesmo motor, preservando limite offline.
6. **Interface do portal:** shell visual, páginas, formulários, estado de sessão e navegação. O jogo mantém suas telas e controles existentes.

O tratamento de erros de comando também deve usar o repositório do usuário autenticado. Um erro nunca pode devolver o snapshot de outro perfil. Recibos continuam identificados pelo par perfil/requestId, permitindo que contas diferentes usem o mesmo requestId sem compartilhar resultados.

### Persistência aditiva

Adicionar `idle_accounts` com UUID, usuário normalizado único, hash versionado da senha, versão de credenciais, `profile_id` único com chave estrangeira e data de criação. Adicionar `character_name_key` anulável e único em `idle_profiles`, sem substituir seu JSON ou chave atual. Preencher a chave para `local-djow` na migração e para todos os novos personagens no cadastro. Outros perfis legados não vinculados permanecem com chave nula; não são reutilizados por contas nem entram no ranking. Assim, nomes de antigos perfis de teste não impedem a migração e `djow` tem reserva durável no banco.

Adicionar `idle_sessions` com hash do token como chave, conta referenciada, data de criação e vencimento indexado. Dados de segredo só são retornados internamente ao módulo de autenticação. Queries usam parâmetros SQL. Migrações são idempotentes, permitem reinício e não recriam perfis ou recibos.

O cadastro grava perfil e conta na mesma transação. Não usar a inicialização implícita do repositório para criar personagens de contas durante requisições subsequentes: um vínculo inexistente é erro de integridade. Ao emitir uma sessão depois de verificar senha, conferir em transação se a versão das credenciais ainda corresponde à verificada. Troca de senha incrementa essa versão e revoga as sessões na mesma transação; um login concorrente com senha antiga não pode recriar uma sessão após a troca.

### Segurança da autenticação

Usar `scrypt` assíncrono do `node:crypto`, com salt aleatório de 16 bytes, chave derivada de 64 bytes e formato versionado que armazene algoritmo, parâmetros, salt e hash. Configuração: `N=32768`, `r=8`, `p=3`, `maxmem=64 MiB`. Verificação usa comparação constante; usuário inexistente executa verificação de hash de reserva para reduzir distinção de tempo.

Token de sessão: 32 bytes aleatórios, codificados em base64url. O banco guarda somente SHA-256 do token. Cookie com `HttpOnly`, `SameSite=Lax`, `Path=/` e prazo correspondente à sessão. `Secure` é habilitado quando a origem configurada usa HTTPS; o ambiente localhost atual usa HTTP. Não guardar senha ou token em localStorage ou nos logs.

Mutação de conta e jogo exige JSON e valida a origem autorizada. Para tráfego de navegador, rejeitar Origin estranho, Origin `null` e `Sec-Fetch-Site: cross-site`; requisições POST sem Origin só são aceitas se não indicarem navegação cross-site e trouxerem o Content-Type JSON esperado. Catálogo, notícias e ranking continuam GET públicos.

Aplicar limites antes da derivação de senha: até 10 tentativas de login por IP em 15 minutos e cinco por usuário em 15 minutos; até cinco cadastros por IP por hora; até cinco trocas de senha por conta em 15 minutos. Limites retornam 429 com tempo para nova tentativa. Limitar a dois trabalhos simultâneos de scrypt e uma fila de no máximo oito; excesso recebe erro recuperável, sem iniciar trabalho ilimitado. Os contadores são memória local com expiração e limpeza periódica, limitados a 10.000 chaves; ao atingir o limite, rejeitar novas chaves até a limpeza em vez de descartar contadores ativos. Essa estratégia atende ao processo único desta instalação.

Referências primárias consultadas: [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) e [Node.js crypto](https://nodejs.org/api/crypto.html). A configuração de scrypt corresponde a uma das combinações mínimas indicadas pela OWASP; a implementação deve conferir custo no runtime Node 24 usado no Docker.

### Contratos HTTP

| Método/rota | Comportamento |
| --- | --- |
| `POST /api/auth/register` | Valida, cria conta/perfil/sessão e retorna projeção da conta; 201 |
| `POST /api/auth/login` | Valida credenciais, emite cookie e retorna projeção da conta; 200 |
| `GET /api/auth/me` | Retorna usuário e perfil vinculados, sem credenciais; 200 ou 401 |
| `POST /api/auth/logout` | Revoga cookie atual e limpa navegador; 200, inclusive quando já ausente |
| `POST /api/auth/password` | Troca senha, revoga sessões e emite nova sessão; 200 |
| `GET /api/portal/news` | Lista ordenada de resumos de notícias |
| `GET /api/portal/news/:slug` | Notícia completa; 404 para slug desconhecido |
| `GET /api/portal/ranking?category=level&class=all&page=1` | Projeção pública paginada; categorias level, zeny e kills |
| `GET /api/portal/status` | Disponibilidade, número real de contas/personagens caçando e taxas do catálogo |
| `POST /api/session` | Sessão de jogo atual, exigindo autenticação |
| `POST /api/command` | Comando existente, exigindo autenticação |

Erros seguem `{error: {code, message}}`, com erros de campo opcionais para formulários. Códigos HTTP: 400 para entrada inválida ou senha atual incorreta, 401 para sessão/credenciais inválidas, 403 para origem proibida, 404 para recurso inexistente, 409 para usuário/nome duplicado ou conflito de jogo, 429 para limite e 503 para falha de serviço. Distinguir `AUTH_REQUIRED` (sessão ausente, expirada ou revogada), `INVALID_CREDENTIALS` (login incorreto) e `CURRENT_PASSWORD_INVALID` (campo da troca de senha). Somente `AUTH_REQUIRED` invalida o estado privado no navegador. Respostas privadas e de auth usam `Cache-Control: no-store`. API pública não devolve detalhes SQL ou segredos.

### Scheduler

Executar um ciclo a cada cinco segundos, sem sobrepor ciclos. Selecionar perfis com status hunting, challenge ou resting, em lotes de até 50, com paginação por chave e cursor que retorna ao início após completar uma passagem. Concorrência máxima de dois perfis, usando o pool existente e transação por personagem.

`advanceState` permanece a autoridade para tempo, recursos, recompensas, recuperação e pausa de 12 horas. Uma falha de um perfil não impede os demais de avançar. O ciclo nunca altera `lastSeenAt`, `contactTotals` ou dispensa resumo offline. Perfis pausados/cidade não exigem ticks; requisições autenticadas reconciliam o tempo conforme o fluxo atual. O legado permanece persistido e sujeito às suas regras atuais até uma associação explícita.

### Preservação e associação do legado

Preservar `local-djow`, seu JSON e todos os recibos. Reservar o nome `djow`; não associar o legado automaticamente por usuário ou nome coincidente. Contas novas começam com personagens novos.

Fornecer comando local de manutenção para vincular `local-djow` a uma conta cadastrada. O comando exige usuário de destino explícito, confirma no terminal o perfil anterior e o perfil legado e opera em transação. O perfil anterior da conta permanece armazenado, sem vínculo e fora do ranking, para não descartar progresso. Rejeitar associação se o legado já pertencer a outra conta. Revogar as sessões da conta após o vínculo. O comando não recebe senha nem é exposto pela API; sua execução para a conta real depende da indicação explícita do usuário.

### Inicialização e aplicação local

No volume existente, as migrações só adicionam as estruturas Idle. Para volume novo, ordenar a inicialização para que o schema Hercules esteja pronto antes de criar tabelas Idle: o entrypoint clássico recusa banco parcialmente inicializado. Adicionar healthcheck de schema ao serviço Hercules e dependência de saúde do idle-game resolve a ordem sem alterar personagens clássicos.

Compilar e aplicar somente os serviços afetados, preservando volume MariaDB, GRFs, BGM e `.env`. O build deve usar o novo código e a configuração local existente, sem resetar o checkout ativo ou incluir segredos nos commits. Documentar registro, login, rotas, notícias e comando de associação no README.

## Estados de interface e erros

Formulários mostram rótulos persistentes, regras, erros próximos do campo, estado de envio e confirmação. Evitar submissões duplicadas. Falha de rede conserva os campos, exceto quando limpar a senha após sucesso. Usuário/nome duplicados permitem correção imediata.

Painel, status, notícias e ranking apresentam carregamento, erro com nova tentativa e vazio pertinente. Ranking sem contas informa que ainda não há aventureiros classificados. Status indisponível não anuncia servidor online. Não usar contadores ou jogadores fictícios para preencher layout.

O frontend mantém um único estado de sessão. Uma resposta `AUTH_REQUIRED` limpa a apresentação privada e interrompe solicitações de jogo; `INVALID_CREDENTIALS` e `CURRENT_PASSWORD_INVALID` são erros do formulário e não encerram uma sessão válida. Reentrada não reutiliza snapshots ou dados visuais de outra conta.

Recibos pertencem ao perfil, não à sessão. Antes de enviar um comando, guardar seu corpo e requestId em sessionStorage, vinculados ao par conta/perfil; remover após resposta conclusiva. Resultado incerto permanece guardado através de logout, expiração e recarregamento na mesma aba. Ao reentrar no mesmo par conta/perfil, recuperar pelo requestId original antes de emitir outro comando. Ao entrar em outra identidade, não exibir nem reproduzir o recibo da anterior; seu registro permanece separado para eventual retorno. Não armazenar senha, cookie ou snapshot nesse registro. O comportamento conserva a proteção atual contra compra duplicada mesmo quando a sessão termina durante uma falha de rede.

## Verificação e aceite

1. Cadastro cria duas contas reais com personagens independentes. Login, recarregamento, logout, expiração e troca de senha têm respostas e navegação corretas.
2. Conta A não pode consultar nem alterar B, inclusive por corpo/header com profileId, tratamento de conflitos, requestId repetido e troca de sessão no mesmo navegador. Uma compra com resposta perdida é recuperada uma única vez após expiração/reentrada na mesma identidade. Trocar para outra conta não reproduz esse recibo.
3. Senhas persistidas são hashes; tokens persistidos são hashes; cookie apresenta os atributos definidos. Credencial incorreta, senha atual incorreta, duplicidade, limites e origem inválida retornam os erros previstos. Teste concorrente confirma que login verificando senha antiga não emite sessão após uma troca concluída.
4. Ticks e visitas preservam isolamento, recibos, recompensas offline e limite de 12 horas. Ranking público não atualiza contato ou concede recompensas.
5. Ranking é calculado com dados reais, ordenação determinística, renascimento, filtro de classe e paginação corretos. Não vaza projeção privada nem inclui perfis sem conta.
6. Notícias listam e abrem por URL direta. Conteúdo é texto seguro, factual e completo; slug desconhecido apresenta 404.
7. O portal tem a direção visual aprovada. Registro, painel, notícia, ranking e acesso ao jogo são conferidos em desktop e celular; não há rolagem horizontal do documento ou controles inacessíveis.
8. O estado e recibos de `local-djow` permanecem íntegros após migração/reinício. Teste do comando de associação usa perfis isolados e comprova preservação do anterior e revogação de sessões.
9. Typecheck, testes pertinentes, regressões de jogo e build passam. Testes MariaDB usam perfis/contas isolados e removem apenas dados de teste. A stack afetada sobe saudável e as rotas funcionam na porta 3339.
10. Reiniciar instalação existente preserva contas, sessões válidas e progresso; inicialização de volume novo respeita a ordem Hercules/Idle.

## Limites da entrega

Um personagem por conta; contas próprias do Idle; notícias versionadas; painel do jogador. Não inclui compartilhamento de identidade com Hercules, painel administrativo, email, recuperação automática de senha, guildas, PvP, pagamentos ou hospedagem pública. O motor e a economia existentes continuam responsáveis pelo comportamento do jogo.

## Próxima etapa

Após revisão e aprovação deste arquivo pelo usuário, criar o plano de implementação com o skill `superpowers:writing-plans`, incluindo fronteiras dos módulos, testes, isolamento do trabalho e aplicação à stack local. A escolha do método de execução ocorre com o plano concreto.
