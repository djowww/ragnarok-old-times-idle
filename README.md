![RagIDLE — Ragnarok Old Times Idle](docs/assets/banner.svg)

# RagIDLE · v1.0

**Ragnarok clássico no seu ritmo.** Um RPG idle de navegador: escolha a caça, prepare sua estratégia e acompanhe seu personagem explorando Rune-Midgard.

[**Jogar a preview pública →**][preview] · [**Baixar para Windows →**](https://github.com/djowww/ragnarok-old-times-idle/releases/latest) · [Instalação](docs/SETUP.md) · [Roadmap](docs/ROADMAP.md) · [English](README.en.md)

[![Release](https://img.shields.io/github/v/release/djowww/ragnarok-old-times-idle)](https://github.com/djowww/ragnarok-old-times-idle/releases/latest)
[![Publicação segura](https://github.com/djowww/ragnarok-old-times-idle/actions/workflows/publication-safety.yml/badge.svg?branch=main)](https://github.com/djowww/ragnarok-old-times-idle/actions/workflows/publication-safety.yml)
[![GPL v3+](https://img.shields.io/badge/license-GPL_v3%2B-315d70)](LICENSE)

## Entre e jogue

1. Abra a **preview pública**, crie sua conta e escolha seu personagem.
2. Selecione um campo ou dungeon. O personagem procura alvos, caminha até eles e combate automaticamente.
3. Organize habilidades, distribua atributos e melhore equipamentos para avançar.

A preview roda no navegador, sem instalar o servidor. A música começa desligada: ative-a no jogo. Este é um ambiente de testes; progresso e disponibilidade podem mudar entre versões. As contas da preview foram reiniciadas para esta publicação.

## O que existe na v1.0

| Sistema | Disponível |
| --- | --- |
| Mundo | 38 áreas de caça: campos e dungeons; colisão, monstros no mapa e respawn |
| Progressão | 40 classes nas árvores de evolução, níveis Base/Job, atributos e renascimento |
| Combate | Caça AFK, alcance, conjuração, recargas e prioridade automática de habilidades |
| Habilidades | 348 importadas do Hercules; 298 com suporte declarado e 50 indisponíveis |
| Equipamentos | Mochila, cartas, raridades, identificação individual/em lote e refino |
| Desafios | 81 desafios de mini-chefes/MVPs no catálogo |
| Jornada | 8 missões de progressão e resumo de até 12 horas offline |
| Prontera | Loja de poções, ferreiro, estilista e acesso pela HUD |
| Interface | Janelas reposicionáveis, minimapa, diário de combate e chat global |
| Contas | Cadastro, login, seleção do personagem salvo, painel e ranking |
| Administração | Concessão de Base/Job, classe, zeny e itens; acesso por chave e registro de ações |

As quantidades vêm do [catálogo versionado](idle/content/catalog.json). “Suporte declarado” descreve o estado da implementação; não significa reprodução integral ou validação manual de cada efeito do Ragnarok original.

## O que ainda falta

- Completar as **50 habilidades indisponíveis**, incluindo efeitos que dependem de parceiros, guildas, comércio e objetos/células de mapa.
- Desenvolver PvP/WoE, grupos, guildas e comércio entre jogadores.
- Ampliar quests de NPCs, eventos e conteúdo de longo prazo.
- Refinar animações, navegação, desempenho e balanceamento em mais classes, armas e dispositivos.
- Oferecer distribuição totalmente independente dos recursos de cliente fornecidos pelo operador.

Veja o [roadmap](docs/ROADMAP.md) e a [lista nominal de habilidades indisponíveis](docs/SKILL_COVERAGE.md). A v1.0 é a primeira publicação organizada do projeto; o desenvolvimento continua.

## Windows: escolha como testar

| Download | Como funciona |
| --- | --- |
| **Windows Preview** | Extraia e abra `Jogar-Preview.cmd`. Abre a versão online no navegador; não instala servidor. |
| **Windows Local** | Extraia e abra `Iniciar-RagIDLE.cmd`. Usa Docker Desktop e abre `http://localhost:3339/`. Requer os recursos de um cliente compatível. |

O pacote local inclui código-fonte e inicializador, não um executável nativo autossuficiente. Na primeira execução, ele gera credenciais locais e prepara os serviços. `Parar-RagIDLE.cmd` encerra apenas essa instalação, preservando os dados.

[Guia Windows e requisitos →](docs/WINDOWS.md)

## Para desenvolver ou hospedar

**TypeScript · React · Fastify · MariaDB · Docker Compose**

O motor Idle possui progresso próprio e usa o Hercules como referência de regras/dados. O cliente clássico é integrado com roBrowserLegacy.

| Guia | Assunto |
| --- | --- |
| [Instalação](docs/SETUP.md) | Recursos de cliente, serviços, localhost e hospedagem |
| [Desenvolvimento](docs/DEVELOPMENT.md) | Estrutura, comandos, testes e exportação |
| [Alquimia](docs/ALCHEMY.md) · [Falcão](docs/FALCON.md) · [Refino](docs/WEAPON_REFINEMENT.md) | Mecânicas e limites |
| [Contribuir](CONTRIBUTING.md) · [Segurança](SECURITY.md) | Bugs, melhorias e divulgação responsável |
| [Changelog](CHANGELOG.md) | Histórico de publicações |

Para relatar um bug, abra uma [issue](https://github.com/djowww/ragnarok-old-times-idle/issues) com os passos, classe/arma, mapa e uma captura. Não anexe senhas, bancos ou arquivos de cliente.

## Licença e créditos

Projeto de fã independente, sem afiliação ou endosso da Gravity Co., Ltd. Código sob **GPL v3 ou posterior**: [licença](LICENSE) e [créditos de terceiros](idle/THIRD_PARTY_NOTICES.md).

Mapas, sprites, efeitos, ícones e músicas originais não são distribuídos no repositório ou nos pacotes Windows. O operador deve fornecer recursos de um cliente que tenha direito de usar.

[preview]: https://15.204.210.74:8443/
