# Ragnarok no browser — ambiente local

Esta stack liga o emulador Hercules ao cliente roBrowserLegacy no navegador, usando Docker Compose. Ela roda localmente; o banco e as portas do jogo ficam na rede privada do Compose.

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

Depois, construa e inicie os cinco serviços:

```powershell
docker compose up --build -d
docker compose ps
```

O primeiro build compila o Hercules e o cliente browser, então pode levar alguns minutos. Abra:

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
| `3338` | Página do roBrowserLegacy | `http://localhost:3338/` |
| `5999` | Proxy WebSocket do jogo | Usada pelo cliente browser |
| `8080` | Remote Client para assets | `http://127.0.0.1:8080/` |
| `3306` | MariaDB | Apenas rede interna do Compose |
| `6900`, `6121`, `5121` | Login, personagens e mapa do Hercules | Apenas rede interna do Compose; o proxy encaminha as conexões |

O proxy aceita somente conexões vindas da página local (`localhost:3338` ou `127.0.0.1:3338`) e só encaminha as três rotas do Hercules.

Todos os serviços podem ser consultados com:

```powershell
docker compose ps
docker compose logs -f database hercules web-client websocket-proxy asset-service
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
- **Erro de conexão com o Docker:** confirme que o Docker Desktop está em execução. Os cinco serviços usam `restart: unless-stopped`; após uma parada manual da stack, execute `docker compose up -d`.
- **A página abre, mas faltam telas ou elementos do jogo:** sem os GRFs compatíveis, o cliente não consegue carregar os mapas, sprites, sons e outros recursos.

## Aceite local

Em 2026-10-02, com os recursos acima e `PACKETVER=20141022`, foram conferidos:

- Os cinco serviços ativos, com MariaDB saudável e Hercules online.
- `/api/health` do serviço de assets com HTTP 200, `status: ok` e zero erros.
- `cursors.spr`, `cursors.act` e `msgstringtable.txt` com HTTP 200 e conteúdo não vazio.
- Login, criação/seleção de personagem, entrada em `iz_int` e `int_land` e resposta do servidor ao movimento no browser.

O personagem `djow` ficou jogável na sessão local. Alguns nomes de missões do tutorial podem aparecer como `Unknown Quest`; isso não bloqueou entrada, movimento ou evolução. Esse aceite cobre o fluxo inicial, sem afirmar que todo o conteúdo do emulador foi percorrido.

Após aplicar o perfil Gold Times, o Hercules foi recompilado e reiniciado com Renewal desligado, EXP 4x e drop 1x. A conta que contém `djow` recebeu o grupo Admin 99. Na sessão web, `@commands` listou 285 comandos disponíveis para o personagem; o grupo fica associado à conta no banco local.
