# RagIDLE no Windows

[Voltar ao projeto](../README.md) · [Instalação detalhada](SETUP.md)

## Quero apenas testar online

1. Baixe **RagIDLE-1.0.0-Windows-Preview.zip** na página de [Releases](https://github.com/djowww/ragnarok-old-times-idle/releases/latest).
2. Extraia o ZIP inteiro.
3. Abra **Jogar-Preview.cmd**.

O inicializador lê o endereço público do README incluído e abre seu navegador. Ele não instala Docker, não cria servidor e não guarda sua senha. Também é possível usar diretamente o link de preview do README.

## Quero executar em localhost

### Requisitos

- Windows 10/11 compatível com [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/), usando containers Linux.
- Docker Desktop aberto e funcionando.
- Internet no primeiro build.
- Recursos de um cliente Ragnarok compatível, obtidos por você; eles não acompanham o pacote.

### Preparação

1. Baixe **RagIDLE-1.0.0-Windows-Local.zip** e extraia o arquivo inteiro em uma pasta.
2. Coloque os GRFs e recursos em **client-data**, conforme [SETUP.md](SETUP.md#assets-do-cliente-ragnarok).
3. Tenha um **client-data/DATA.INI** que liste seus GRFs.
4. Abra **Iniciar-RagIDLE.cmd**.

A primeira execução gera um `.env` com senhas locais aleatórias, prepara os serviços e espera a API ficar saudável antes de abrir **http://localhost:3339/**. O primeiro build pode demorar vários minutos.

Se `.env` já existir, ele é preservado. O projeto Compose local se chama **ragidle-v1-local** e usa apenas `compose.yaml`; o inicializador não procura instalações de outros jogos.

### Parar e voltar depois

Abra **Parar-RagIDLE.cmd** para parar os containers dessa instalação. Os dados são preservados. Abra **Iniciar-RagIDLE.cmd** para voltar.

O pacote é um kit de código-fonte com inicializador para navegador. Não inclui executável nativo autossuficiente, Docker Desktop, GRFs ou música.

## Diagnóstico

| Situação | O que conferir |
| --- | --- |
| Docker não encontrado | Instale Docker Desktop e abra um novo terminal |
| Docker não responde | Abra Docker Desktop e aguarde o mecanismo Linux iniciar |
| Recursos ausentes | Confira `client-data/DATA.INI`, seus GRFs e o guia de instalação |
| Porta ocupada | Encerre a outra instalação que usa as portas locais; o inicializador não a encerra por você |
| API não fica saudável | Execute `docker compose -p ragidle-v1-local -f compose.yaml logs --tail 100 idle-game asset-service hercules` |
| Preview indisponível | Consulte o endereço e o estado atual no README do GitHub |

Não abra `idle/index.html` por `file://`: o jogo depende da API e do servidor de recursos.

## Integridade

A release fornece **SHA256SUMS.txt**. Para conferir um ZIP baixado:

```powershell
Get-FileHash .\RagIDLE-1.0.0-Windows-Local.zip -Algorithm SHA256
```

Compare o resultado com o arquivo da mesma release. O checksum verifica integridade; os inicializadores não possuem assinatura Authenticode.

## Limites da validação

A sintaxe e o fluxo do inicializador são verificados automaticamente. Isso não substitui testar Docker Desktop, WSL e recursos de cliente em cada configuração Windows real.
