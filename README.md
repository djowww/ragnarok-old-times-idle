# Ragnarok Old Times Idle — ambiente local

Jogo idle solo no navegador, com conteúdo Pre-Renewal do Hercules, cenários originais e sprites do cliente local. Você prepara a build, escolhe a área e acompanha combate, EXP e loot automáticos. A API controla as recompensas e salva o progresso no MariaDB, inclusive durante até 12 horas sem contato do navegador.

**Jogar:** [Ragnarok Old Times Idle](http://localhost:3339/). **Modo clássico:** [roBrowserLegacy](http://localhost:3338/applications/pwa/index.html).

## Como jogar o idle

- Distribua os 20 pontos iniciais em **Atributos & habilidades**, escolha o **Sul de Prontera** e clique em **Iniciar caça**.
- A mochila começa com uma faca, camisa de algodão, 20 poções vermelhas e cinco azuis. Configure auto poção e, se desejar, retorno automático após recuperação.
- Volte à **Cidade** para vender loot, comprar armas/poções, inserir cartas ou refinar. Itens equipados, favoritos, refinados ou com cartas ficam protegidos da venda rápida.
- No Job 10, escolha uma das seis famílias. A segunda classe exige Job 40; renascimento exige Base 99, Job 50 e 50.000 zeny. Depois, avance pelo mesmo ramo até a classe transcendente, com limite 99/70.
- Dez áreas, missões, bestiário e três desafios acompanham sua evolução. Uma vitória em desafio inicia intervalo de uma hora; a tentativa dura até dez minutos.
- A cena de cada área mostra seu mapa original do cliente local, com terreno, modelos e texturas pelo visualizador do roBrowserLegacy; a cidade mostra Prontera. Os personagens e monstros animados aparecem sobre esse cenário.
- Fechar ou ocultar a página mantém o cálculo no servidor. Ao voltar após pelo menos 30 segundos, um resumo apresenta o que já foi salvo. Após 12 horas, use **Retomar caça**.
- O controle **Música** toca a BGM original do mapa atual, conforme `data/mp3nametable.txt`: Prontera usa `08.mp3` e cada área usa sua trilha correspondente. O som começa desligado; ao trocar de mapa, mantém sua escolha de ligado ou desligado. Os MP3 precisam estar em `client-data/BGM/`, servidos localmente por `/assets/BGM/`; músicas não são incluídas no Git nem nas imagens Docker. Se uma faixa falhar, use **Música** para tentar novamente.

O perfil idle `djow` tem progresso próprio nas tabelas `idle_profiles` e `idle_commands`. Combate e economia são adaptações para idle, usando dados exportados do Hercules; não reproduzem integralmente as fórmulas ou scripts do emulador. O perfil clássico de `djow` continua independente.

## Perfil Gold Times

O servidor usa as regras **Pre-Renewal** do Hercules e o cliente browser desliga o modo Renewal. Base EXP, Job EXP, EXP de missão e de MVP ficam em `4x`; as taxas de drop mantêm o padrão `1x`. As tabelas Pre-Renewal limitam classes de primeira mudança a base/job `99/50` e transcendentais a `99/70`. A conta do personagem `djow` usa o grupo Admin 99 do Hercules, que habilita todos os comandos e registra seu uso.

`PACKETVER=20141022` permanece igual no cliente e no Hercules. Esse número identifica o protocolo de pacotes, enquanto Pre-Renewal seleciona as regras de jogo e as tabelas; o GRF compatível continua montado em `client-data/`.

## Iniciar

Pré-requisitos: Docker Desktop **em execução**, com Docker Compose habilitado. No Windows, abra o Docker Desktop ou execute `docker desktop start` antes de iniciar a stack.

No PowerShell, copie o arquivo de exemplo e troque as senhas antes do primeiro início:

```powershell
Copy-Item .env.example .env
notepad .env
```

Depois, construa e inicie os seis serviços:

```powershell
docker compose up --build -d
docker compose ps
```

O primeiro build compila o Hercules, o cliente browser e o idle, então pode levar alguns minutos. Abra o [idle em localhost:3339](http://localhost:3339/). Para usar o modo clássico, abra:

**http://localhost:3338/applications/pwa/index.html**

Na tela de login, crie uma conta digitando um nome terminado em `_M` ou `_F` — por exemplo `jogador_M` — e uma senha. Depois de entrar, escolha o servidor local, crie um personagem e selecione-o para continuar.

Para entrar numa conta já criada, use o nome cadastrado sem `_M` ou `_F`; esses sufixos iniciam a criação de outra conta.

## Arquivos do cliente e GRFs

Os arquivos do cliente Ragnarok ficam fora do Git e das imagens Docker. A stack lê os arquivos compatíveis dentro de `client-data/`, na raiz deste projeto. O arquivo `client-data/DATA.INI` deve listar os GRFs pelo nome; por exemplo:

```ini
[Data]
0=data.grf
```

Coloque os GRFs listados ao lado do `DATA.INI` e mantenha os nomes iguais aos da lista. O serviço também pode ler as pastas opcionais `data/`, `System/`, `BGM/` e `AI/` dentro de `client-data/`. A pasta é ignorada pelo Git e montada somente para leitura no container.

### Dados preparados nesta instalação

Em 2026-10-02, os recursos foram extraídos do [cliente oficial bRO da Level Up](https://client.downloader.levelupgames.com.br/ragnarok.exe) e colocados em `client-data/`: `data.grf`, `System/`, `AI/` e `BGM/` (172 músicas). O instalador de 3.060.840.269 bytes foi aberto como arquivo com 7-Zip e [innoextract do MSYS2](https://packages.msys2.org/packages/mingw-w64-ucrt-x86_64-innoextract); o instalador do jogo não foi executado.

O `DATA.INI` local referencia apenas `data.grf`, de 3.419.644.539 bytes e formato GRF 2.0. O `event.grf` fornecido pelo instalador foi preservado, mas fica fora da lista porque usa o formato 1.02, que o Remote Client não suporta. O pacote não contém `rdata.grf` nem `DATA.INI` pronto.

Esses dados ficam no worktree usado por esta instalação. Ao usar outro checkout ou outro computador, copie os recursos para o `client-data/` correspondente; eles não acompanham o Git.

Depois de adicionar ou corrigir os arquivos, reinicie o serviço para que ele valide os dados e carregue o índice:

```powershell
docker compose restart asset-service
docker compose logs -f asset-service
```

Sem `DATA.INI`, com GRFs faltando ou sem permissão de leitura, o serviço continua ativo em modo de diagnóstico. A URL local de assets é `http://127.0.0.1:8080/`; enquanto faltarem arquivos, as requisições retornam `503` com instruções.

## Versão de pacote

`PACKETVER` precisa coincidir no Hercules e no cliente browser. Altere a variável uma única vez em `.env` e reconstrua:

```dotenv
PACKETVER=20141022
```

```powershell
docker compose up --build -d hercules web-client
```

A configuração do cliente usa o mesmo valor. O browser usa `packetKeys: false`, e `conf/import/battle.conf` recebe `packet_obfuscation: 0` no Hercules. Essa opção de execução desliga a ofuscação mesmo quando a compilação mantém as chaves padrão. Se uma mudança de versão causar falha, confira os logs do Hercules e do `web-client` antes de testar outra data.

## Portas e serviços

| Porta | Uso | Acesso |
| --- | --- | --- |
| `3339` | Jogo idle, API e proxy de recursos | `http://localhost:3339/` |
| `3338` | Página do roBrowserLegacy | `http://localhost:3338/` |
| `5999` | Proxy WebSocket do jogo | Usada pelo cliente browser |
| `8080` | Remote Client para assets | `http://127.0.0.1:8080/` |
| `3306` | MariaDB | Apenas rede interna do Compose |
| `6900`, `6121`, `5121` | Login, personagens e mapa do Hercules | Apenas rede interna do Compose; o proxy encaminha as conexões |

O proxy aceita somente conexões vindas da página local (`localhost:3338` ou `127.0.0.1:3338`) e só encaminha as três rotas do Hercules.

Todos os serviços podem ser consultados com:

```powershell
docker compose ps
docker compose logs -f idle-game database hercules web-client websocket-proxy asset-service
```

Para acompanhar só o Hercules:

```powershell
docker compose logs -f hercules
```

Para parar a stack:

```powershell
docker compose down
```

Esse comando mantém o volume do MariaDB para o próximo início.

## Diagnóstico

- **`asset-service` retorna `503`:** confira se `client-data/DATA.INI` e todos os GRFs que ele cita existem e podem ser lidos; depois reinicie o serviço.
- **Tela preta parada em `100%`:** o indicador mede a primeira etapa de carregamento. O cliente ainda precisa ler `data/sprite/cursors.spr` e `cursors.act` antes de mostrar o login. Se o serviço de assets devolver `503`, essa etapa não avança. Confira `http://127.0.0.1:8080/api/health`, os GRFs e os logs; depois reinicie `asset-service` e recarregue a página.
- **A conexão do jogo não avança:** confira se `PACKETVER` coincide e consulte os logs do proxy para rejeições de origem ou rota.
- **O banco ou Hercules não inicia:** use `docker compose ps` e `docker compose logs -f database hercules`; verifique também as credenciais no `.env`.
- **Erro de conexão com o Docker:** confirme que o Docker Desktop está em execução. Os seis serviços usam `restart: unless-stopped`; após uma parada manual da stack, execute `docker compose up -d`.
- **Idle sem conexão:** confira `http://localhost:3339/api/health` e `docker compose logs idle-game`. A página preserva a última apresentação e permite tentar novamente; uma compra sem resposta repete o mesmo identificador para recuperar o resultado.
- **Sprite ou ícone ausente no idle:** confira o serviço de assets e os GRFs. O jogo usa uma representação de reserva e continua aceitando ações; recarregar a página tenta carregar os recursos novamente.
- **Mapa original indisponível no idle:** use **Recarregar mapa** na cena e confira `web-client`, `asset-service` e o arquivo `.rsw` do mapa no GRF. O jogo continua processando a caça enquanto o cenário é recuperado.
- **A página abre, mas faltam telas ou elementos do jogo:** sem os GRFs compatíveis, o cliente não consegue carregar os mapas, sprites, sons e outros recursos.

## Aceite local

Em 2026-10-02, com os recursos acima e `PACKETVER=20141022`, foram conferidos:

- Os cinco serviços ativos, com MariaDB saudável e Hercules online.
- `/api/health` do serviço de assets com HTTP 200, `status: ok` e zero erros.
- `cursors.spr`, `cursors.act` e `msgstringtable.txt` com HTTP 200 e conteúdo não vazio.
- Login, criação/seleção de personagem, entrada em `iz_int` e `int_land` e resposta do servidor ao movimento no browser.

O personagem `djow` ficou jogável na sessão local. Alguns nomes de missões do tutorial podem aparecer como `Unknown Quest`; isso não bloqueou entrada, movimento ou evolução. Esse aceite cobre o fluxo inicial, sem afirmar que todo o conteúdo do emulador foi percorrido.

Após aplicar o perfil Gold Times, o Hercules foi recompilado e reiniciado com Renewal desligado, EXP 4x e drop 1x. A conta que contém `djow` recebeu o grupo Admin 99. Na sessão web, `@commands` listou 285 comandos disponíveis para o personagem; o grupo fica associado à conta no banco local.

## Desenvolvimento do idle

Use Node 24 e pnpm 11.25.0. Com a stack Docker ativa, na pasta `idle/`:

```powershell
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
pnpm dev
```

O Vite abre a interface em `http://localhost:5173/` e encaminha API/assets ao serviço em `3339`. Para aplicar alterações ao jogo servido pelo Docker, execute na raiz:

```powershell
docker compose up --build -d idle-game
```

Para rodar também os testes reais de MariaDB e recursos do cliente dentro da rede privada, na raiz:

```powershell
docker build --target dependencies -t ragidle-idle-tests -f docker/idle-game/Dockerfile idle
docker run --rm --network ragidle_ragnarok_local --env-file .env -e DB_HOST=database -e IDLE_DB_TEST=1 -e IDLE_ASSET_ORIGIN=http://asset-service:8080 ragidle-idle-tests node node_modules/vitest/vitest.mjs run
```

Esse nome de rede corresponde ao projeto Compose desta instalação (`ragidle`). Se usar outro nome de projeto, consulte `docker network ls` e ajuste `--network`. Os testes criam perfis `test-UUID` e removem apenas essas linhas.

O catálogo é exportado de [Hercules](https://github.com/HerculesWS/Hercules) no commit `410b9738c049ab1825d67b36b072d837c1d0b33a`. Seleção, efeitos adaptados e hashes estão em `idle/content/rules.json` e `source-manifest.json`. Com o asset-service ativo, reproduza na pasta `idle/`:

```powershell
pnpm export-content
```

Opcionalmente, use `node tools/export-content.mjs --source CAMINHO_DO_HERCULES --item-resources CAMINHO_DA_TABELA` para ler as fontes locais fixadas e a tabela `data/idnum2itemresnametable.txt`. O importador verifica hashes e não executa scripts de itens. A implementação e os dados derivados usam GPL-3.0-or-later; atribuições e limites dos recursos do cliente estão em `idle/THIRD_PARTY_NOTICES.md` e `idle/LICENSE`.

## Aceite do idle — 2026-10-03

- Seis serviços ativos; MariaDB e idle-game saudáveis. A imagem idle usa usuário `node` (UID 1000), dependências de produção e nenhum GRF.
- **86 testes passaram**, sem casos ignorados, dentro da rede Docker com MariaDB e assets reais. Typecheck e builds de servidor/interface passaram.
- Os testes cobrem combate contínuo/offline, frações do relógio/ataque, limite de 12 horas, atributos, poções, habilidades, classes/renascimento, equipamentos/cartas/refino, missões/desafios, comandos repetidos, concorrência e rollback.
- O catálogo contém dez áreas, 25 monstros de caça, três chefes, 139 itens, 40 classes e 45 habilidades. Os 184 caminhos únicos SPR/ACT e 126 ícones BMP responderam HTTP 200. A geração local e via fontes fixadas reproduziu SHA256 `a9e9c6cdf6e17fd5924645075d671db6d421ebe212e5dd13d371495c35690549`.
- No navegador foram conferidos caça com sprites reais, compras, venda protegida, equipar/desequipar, navegação e layout de computador/celular. O personagem evoluiu normalmente, sem concessão artificial de EXP.
- Uma ausência real de 82 segundos produziu resumo com quatro abates, 72 EXP base, 44 EXP classe e itens. Uma falha simulada ao dispensar esse resumo foi recuperada pelo botão dentro da janela, sem recarregar a página. Falhas de API e assets mantiveram estado/controles recuperáveis.
- Reinício preservou o perfil; testes com perfis isolados confirmaram a restauração exata e ausência de recompensas duplicadas. Percursos de todas as classes, renascimento e limites foram verificados pelo motor com relógio controlado.
