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

O modo idle adapta regras e recompensas para sessões curtas. Ele não executa scripts de itens nem pretende reproduzir integralmente todos os sistemas do emulador oficial.

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

Edite `.env` e substitua as senhas locais de exemplo. Depois, inicie a stack:

```powershell
docker compose up --build -d
docker compose ps
```

Abra o idle em **http://localhost:3339/**. O cliente clássico fica em **http://localhost:3338/applications/pwa/index.html**. O primeiro build compila os serviços e pode levar alguns minutos.

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
