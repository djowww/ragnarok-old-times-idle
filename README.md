# Ragnarok Old Times Idle

[![Licença: GPL-3.0-or-later](https://img.shields.io/badge/licen%C3%A7a-GPL--3.0--or--later-blue.svg)](LICENSE) [![Docker](https://img.shields.io/badge/execu%C3%A7%C3%A3o-Docker-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)

**Uma aventura idle de Ragnarok Online no navegador, com progressão clássica Pre-Renewal e combate que continua enquanto você está longe.**

Ragnarok Old Times Idle é um projeto de fã, local-first e em desenvolvimento. Ele combina uma experiência idle independente com o emulador Hercules e o cliente browser roBrowserLegacy. O catálogo do idle é preparado a partir de fontes versionadas do Hercules; mapas, sprites, efeitos, ícones e música vêm do cliente Ragnarok instalado localmente pelo jogador.

[English summary](README.en.md) · [Instalação](#começar) · [Assets do cliente](#assets-do-cliente-ragnarok) · [Licença](#licença-e-créditos)

> Projeto independente, sem afiliação ou endosso da Gravity Co., Ltd. Nenhum GRF, sprite, ícone, mapa, efeito ou faixa original de Ragnarok Online é distribuído aqui.

## O jogo

- Combate idle autoritativo no servidor, com progresso persistido e resumo de até 12 horas offline.
- Dez áreas exploráveis, monstros, MVPs e mini-bosses, missões, bestiário e desafios.
- Evolução de classes clássicas, renascimento, atributos, habilidades, equipamentos, cartas, refino, consumíveis e loot.
- Cena browser com mapas e personagens animados usando os recursos disponíveis no cliente local; a BGM segue a área quando o jogador a ativa.
- Cliente clássico roBrowserLegacy conectado a uma instância local do Hercules.
- Farm AFK sobre uma população persistida de três a quatro monstros por cena: o personagem caminha até um alvo existente, combate e busca o próximo. Cada monstro reaparece individualmente após seis segundos; conjuração, alcance e áreas de efeito são resolvidos no servidor.
- Árvores de 40 classes: 348 habilidades importadas, com habilidades de família removidas e Increase Weight Limit restrita à família Mercador. Mecânicas indisponíveis têm seus motivos identificados.
- Prioridade circular de nove habilidades, loja compacta e diário com chat persistente entre as sessões locais.
- HUD e janelas reposicionáveis, equipamento e atributos com interface clássica, cooldowns discretos e descanso sentado no campo.
- Combate com prazos ordenados, relógios separados para ataque, movimento, conjuração e recarga, além de ações e reações animadas por ator. A cura automática intercala ações ofensivas.
- Equipamentos encontrados exigem Lupa para identificação. Raridades especiais do idle revelam cor e um bônus de atributo de +1 a +5 após identificar.

O modo idle adapta regras e recompensas para sessões curtas. Ele não executa scripts de itens nem pretende reproduzir integralmente todos os sistemas do emulador oficial.

Custos, pré-requisitos, tempos e fórmulas têm suas fontes registradas em [`idle/content/source-manifest.json`](idle/content/source-manifest.json). Produção, homúnculos, efeitos sobre grupos e mecânicas que exigem conjuração inimiga ou quebra/reparo de equipamentos ainda têm limitações explícitas. Os sprites acompanham a câmera e as alturas do mapa, mas ainda não recebem ocultação por árvores e paredes; os efeitos visuais são composições 2D dos recursos locais, sem execução integral dos efeitos STR do cliente.

## Começar

### Requisitos

- Docker Desktop atualizado com Docker Compose v2.
- Um cliente Ragnarok compatível, obtido e instalado por você. Os arquivos do cliente não fazem parte deste repositório.
- Windows com PowerShell, ou um terminal compatível com Docker Compose.

### Preparar e iniciar

Na raiz do repositório:

```powershell
Copy-Item .env.example .env
```

No macOS ou Linux, use `cp .env.example .env`.

Edite `.env` e substitua as senhas locais de exemplo. Depois, inicie a stack:

```powershell
docker compose up --build -d
docker compose ps
```

Abra o idle em **http://localhost:3339/**. O cliente clássico fica em **http://localhost:3338/applications/pwa/index.html**. O primeiro build compila os serviços e pode levar alguns minutos.

Em um banco novo, o Compose aguarda MariaDB saudável e os schemas clássicos
`login`/`loginlog` importados pelo Hercules antes de iniciar o Idle. O probe é
somente leitura e não imprime credenciais. As migrações do portal são aditivas;
reiniciar ou reconstruir o Idle conserva o volume e o progresso existente.
`PUBLIC_ORIGIN` pode ser definido em `.env`; o padrão é `http://localhost:3339`.
Uma origem HTTPS configurada habilita cookies seguros.

### Contas e portal

As contas do Idle são independentes do Hercules. Crie uma conta em
`http://localhost:3339/registro`, entre em `/login` e acompanhe o personagem em
`/painel` ou `/jogar`. Cada conta possui um personagem e progresso próprio;
`/ranking` publica somente os personagens vinculados a contas do Idle.
Os links diretos e o reload dessas páginas são servidos pelo mesmo servidor.
Os comunicados em `/noticias` vêm de `idle/content/news.json`, versionado com
parágrafos de texto e incluído na imagem; editar o conteúdo exige novo build.

As contas e personagens do Idle são independentes das contas do Hercules.
Perfis legados existentes não são associados automaticamente: qualquer
associação exige uma ação explícita. As migrações do portal são aditivas e
preservam o progresso salvo no volume do banco.

### Hospedar atrás de HTTPS

Ao publicar o site, configure `PUBLIC_ORIGIN` e `RAGIDLE_ALLOWED_ORIGINS` com
a origem HTTPS exata do portal. Defina `WS_ALLOWED_ORIGINS` com a origem exata
do cliente clássico, por exemplo `https://jogo.example.com`. Não use curingas.
O proxy reverso também precisa encaminhar `/ro/` ao cliente clássico, `/assets/`
ao serviço de assets e `/ws/` ao serviço WebSocket. Para `/ws/`, use HTTP/1.1
e os cabeçalhos `Upgrade` e `Connection: upgrade`; remova somente o prefixo
`/ws/` ao encaminhar o caminho do servidor Hercules. Em um Nginx no mesmo host
dos containers, os blocos essenciais são:

```nginx
location ^~ /ro/ {
    proxy_pass http://127.0.0.1:3338/applications/pwa/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
}

location /assets/ {
    proxy_pass http://127.0.0.1:3339;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
}

location ^~ /ws/ {
    proxy_pass http://127.0.0.1:5999/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;
}
```

### Assets do cliente Ragnarok

Os recursos do cliente são lidos de `client-data/`, diretório ignorado pelo Git e montado somente para leitura nos containers. Copie para lá os arquivos de uma instalação que você tenha direito de usar. No mínimo, configure `client-data/DATA.INI` para listar GRFs compatíveis e coloque cada arquivo referenciado no mesmo diretório:

```ini
[Data]
0=data.grf
```

As pastas `data/`, `System/`, `BGM/` e `AI/` podem complementar os GRFs. A compatibilidade depende da versão e da estrutura do cliente. Depois de ajustar os arquivos, reinicie e confira o serviço de assets:

```powershell
docker compose restart asset-service
docker compose logs -f asset-service
```

Sem os recursos locais, a aplicação ainda pode iniciar, mas mapas, sprites, ícones e música originais não estarão disponíveis. As faixas começam desligadas e são servidas localmente; não são copiadas para a imagem Docker nem para o Git.

A associação entre mapas e músicas é gerada de `data/mp3nametable.txt` do cliente, incluindo fields, dungeons e interiores. Para atualizar os metadados ao trocar de cliente, execute `node idle/tools/export-map-bgm.mjs --asset-origin http://localhost:8080`. A tabela gerada registra o hash da fonte e não contém áudio.

## Serviços locais

| Endereço | Serviço |
| --- | --- |
| `http://localhost:3339/` | Jogo idle, API e proxy de recursos |
| `http://localhost:3338/` | Cliente clássico roBrowserLegacy |
| `http://127.0.0.1:8080/` | Serviço local de assets |

MariaDB, Hercules e o proxy WebSocket se comunicam pela rede privada do Compose. Para ver logs ou parar a stack:

```powershell
docker compose logs -f idle-game database hercules web-client websocket-proxy asset-service
docker compose down
```

`docker compose down` preserva o volume do banco. Para encerrar e remover também os dados locais salvos, remova o volume explicitamente após conferir `docker compose config --volumes`.

## Desenvolvimento

O pacote do idle usa Node.js 24 e pnpm 11.25.0. Com Docker ativo, instale as dependências e execute os comandos na pasta `idle/`:

```powershell
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
pnpm dev
```

Para uma verificação focada, use `pnpm exec vitest run tests/hosting.test.ts`.
A suíte local informa os testes SQL/assets opcionais ignorados. A verificação
completa requer banco **descartável**, recursos reais e execução serial:

Antes deste bloco Docker, volte à raiz do repositório (se estiver em `idle/`,
execute `cd ..`). Os caminhos de build abaixo são relativos à raiz.

```powershell
docker run --rm -d --name ragidle-portal-test-db --network ragidle_ragnarok_local -e MARIADB_DATABASE=idle_portal_test -e MARIADB_USER=idle_test -e MARIADB_PASSWORD=idle_test_local -e MARIADB_ROOT_PASSWORD=idle_test_root_local mariadb:11.4
# Aguarde a prontidão do banco temporário antes dos testes.
docker build --target dependencies -t ragidle-portal-tests -f docker/idle-game/Dockerfile idle
docker run --rm --network ragidle_ragnarok_local -e DB_HOST=ragidle-portal-test-db -e DB_NAME=idle_portal_test -e DB_USER=idle_test -e DB_PASSWORD=idle_test_local -e IDLE_DB_TEST=1 -e IDLE_ASSET_ORIGIN=http://asset-service:8080 ragidle-portal-tests node node_modules/vitest/vitest.mjs run --no-file-parallelism
docker stop ragidle-portal-test-db
```

Essas credenciais são exclusivas do banco de testes, que não monta o volume
do jogador nem publica porta. Não use esse banco para navegador ou scheduler.
Não execute fixtures SQL na instalação real. Para comprovar início de volume
novo e persistência, use outro projeto Compose com sua própria rede, volume,
contas QA e porta local; preserve seus dados durante o reinício de teste.

O Vite abre em `http://localhost:5173/` e encaminha API e assets para a stack local. Para reconstruir o serviço idle servido pelo Docker, volte à raiz e execute:

```powershell
docker compose up --build -d idle-game
```

O catálogo, as regras de seleção e as adaptações do idle estão documentados em [`idle/content/`](idle/content/). O exportador compara hashes com as fontes fixadas do Hercules e trata scripts de itens como dados, sem executá-los. Para regenerar o catálogo, inicie a stack e use:

```powershell
Set-Location idle
pnpm export-content
```

## Diagnóstico rápido

- **Tela preta ou loading em 100%:** verifique `http://127.0.0.1:8080/api/health`, os GRFs em `client-data/` e `docker compose logs -f asset-service web-client`.
- **O cliente clássico não conecta:** confirme que o Hercules e o proxy estão ativos e que o `PACKETVER` no `.env` corresponde ao configurado no cliente.
- **O idle não conecta:** confira `http://localhost:3339/api/health` e `docker compose logs -f idle-game database`.
- **Mapa ou sprite ausente:** confirme se o cliente local contém o recurso e se o asset-service consegue ler o GRF.

## Licença e créditos

O código do projeto e os componentes adaptados sob GPL são distribuídos sob **GNU GPL v3 ou posterior**. Consulte [`LICENSE`](LICENSE) e [`idle/THIRD_PARTY_NOTICES.md`](idle/THIRD_PARTY_NOTICES.md) para os créditos, fontes e limites de redistribuição.

Ragnarok Online e seus materiais visuais e sonoros pertencem a seus respectivos titulares. A licença do código não concede direitos sobre esses materiais; forneça somente arquivos do cliente que você esteja autorizado a usar.
