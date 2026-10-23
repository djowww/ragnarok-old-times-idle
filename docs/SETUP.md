# Instalação e execução

[Voltar ao projeto](../README.md) · [Desenvolvimento](DEVELOPMENT.md)

Este guia é para quem deseja executar sua própria instalação. Para testar a versão hospedada, use o botão de acesso no README.

## Preparação

### Requisitos

- Docker Desktop atualizado com Docker Compose v2.
- Um cliente Ragnarok compatível, obtido e instalado por você. Os arquivos do cliente não fazem parte deste repositório.
- Windows com PowerShell, ou um terminal compatível com Docker Compose.

### Preparar e iniciar

Na raiz do repositório:

```powershell
Copy-Item .env.example .env
```

Edite `.env` e substitua as senhas locais de exemplo. Depois, inicie a stack:

```powershell
docker compose up --build -d
docker compose ps
```

O painel administrativo é opcional e fica desativado até receber uma chave privada. Gere uma chave aleatória com `openssl rand -base64 32`, adicione `RAGIDLE_ADMIN_TOKEN=<chave>` ao `.env` e recrie apenas o serviço do jogo:

```powershell
docker compose up -d --force-recreate idle-game
```

No jogo, abra **Livro do aventureiro → Administração** e entre com a chave. A sessão usa um cookie `HttpOnly` com validade de oito horas e pertence à conta que entrou com ela. O painel pode buscar personagens vinculados a outras contas e conceder níveis Base e Job, trocar a classe, adicionar zeny e entregar itens do catálogo. As concessões registram conta de origem, destino e ação no banco. A troca de classe exige que o personagem esteja na cidade; o painel não altera personagens do Hercules.

Para limitar o painel a uma conta específica, defina `RAGIDLE_ADMIN_ACCOUNT_ID` no `.env` privado com o ID estável dessa conta e recrie o serviço `idle-game`. Se a variável não estiver definida, qualquer conta que conheça a chave administrativa pode usar o painel. O ID não deve ser colocado neste documento nem no repositório público.

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

Perfis legados existentes não são associados automaticamente: qualquer
associação exige uma ação explícita. As migrações do portal são aditivas e
preservam o progresso salvo no volume do banco.

### Hospedar atrás de HTTPS

Ao publicar o site, configure `PUBLIC_ORIGIN` e `RAGIDLE_ALLOWED_ORIGINS` com
a origem HTTPS exata do portal. Defina `WS_ALLOWED_ORIGINS` com a origem exata
do cliente clássico, por exemplo `https://jogo.example.com`. Não use curingas.
Para distinguir clientes nos limites de login, configure
`RAGIDLE_TRUSTED_PROXY_ADDRESSES` com os IPs exatos do proxy que conecta ao
container. Esse proxy deve sobrescrever `X-Real-IP` com `$remote_addr`;
cabeçalhos de um peer não confiável são ignorados. Sem proxy, deixe a lista vazia.
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

Depois que o serviço de assets estiver pronto, reinicie o Idle para carregar as células transitáveis dos mapas:

```powershell
docker compose restart idle-game
```

O portal pode iniciar sem recursos locais, mas a aventura depende dos arquivos GAT dos mapas do catálogo ou de seu cache validado. Se esse carregamento falhar, o jogo fica indisponível e o progresso permanece preservado. Mapas, sprites, ícones e música também dependem do cliente local. As faixas começam desligadas e são servidas localmente; não são copiadas para a imagem Docker nem para o Git.

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


## Diagnóstico rápido

- **Tela preta ou loading em 100%:** verifique `http://127.0.0.1:8080/api/health`, os GRFs em `client-data/` e `docker compose logs -f asset-service web-client`.
- **O cliente clássico não conecta:** confirme que o Hercules e o proxy estão ativos e que o `PACKETVER` no `.env` corresponde ao configurado no cliente.
- **O idle não conecta:** confira `http://localhost:3339/api/health` e `docker compose logs -f idle-game database`.
- **Mapa ou sprite ausente:** confirme se o cliente local contém o recurso e se o asset-service consegue ler o GRF.

