# Ragnarok no browser — ambiente local

Esta stack liga o emulador Hercules ao cliente roBrowserLegacy no navegador, usando Docker Compose. Ela roda localmente; o banco e as portas do jogo ficam na rede privada do Compose.

## Iniciar

Pré-requisitos: Docker Desktop com Docker Compose habilitado.

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

## Arquivos do cliente e GRFs

Os arquivos do cliente Ragnarok não são incluídos nem baixados por esta stack. Forneça seus próprios arquivos compatíveis dentro de `client-data/`, na raiz deste projeto. O arquivo `client-data/DATA.INI` deve listar os GRFs pelo nome; por exemplo:

```ini
[Data]
0=data.grf
1=rdata.grf
```

Coloque os GRFs listados ao lado do `DATA.INI` e mantenha os nomes iguais aos da lista. O serviço também pode ler as pastas opcionais `data/`, `System/`, `BGM/` e `AI/` dentro de `client-data/`. A pasta é ignorada pelo Git e montada somente para leitura no container.

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

A configuração do cliente usa o mesmo valor e mantém a packet obfuscation desligada nas duas pontas. Se uma mudança de versão causar falha, confira os logs do Hercules e do `web-client` antes de testar outra data.

## Portas e serviços

| Porta | Uso | Acesso |
| --- | --- | --- |
| `3338` | Página do roBrowserLegacy | `http://localhost:3338/` |
| `5999` | Proxy WebSocket do jogo | Usada pelo cliente browser |
| `8080` | Remote Client para assets | `http://127.0.0.1:8080/` |
| `3306` | MariaDB | Apenas rede interna do Compose |
| `6900`, `6121`, `5121` | Login, personagens e mapa do Hercules | Apenas rede interna do Compose; o proxy encaminha as conexões |

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

## Diagnóstico e limite desta etapa

- **`asset-service` retorna `503`:** confira se `client-data/DATA.INI` e todos os GRFs que ele cita existem e podem ser lidos; depois reinicie o serviço.
- **A conexão do jogo não avança:** confira se `PACKETVER` coincide e se os logs do proxy mostram redirecionamento para as portas do Hercules.
- **O banco ou Hercules não inicia:** use `docker compose ps` e `docker compose logs -f database hercules`; verifique também as credenciais no `.env`.
- **A página abre, mas faltam telas ou elementos do jogo:** sem os GRFs compatíveis, o cliente não consegue carregar os mapas, sprites, sons e outros recursos.

Com a pasta de assets vazia, esta etapa confirma a infraestrutura, a página browser e o diagnóstico de dados ausentes. A validação visual do fluxo completo — login, criação/seleção de personagem, entrada no mapa e movimento — depende de fornecer GRFs compatíveis com o `PACKETVER` escolhido.
