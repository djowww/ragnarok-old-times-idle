![Ragnarok Old Times Idle — Rune-Midgard no seu ritmo](docs/assets/banner.svg)

# Ragnarok Old Times Idle

**Um RPG idle no navegador inspirado no Ragnarok Online clássico.** Explore Rune-Midgard, evolua sua classe e prepare seu personagem para continuar caçando entre uma sessão e outra.

### [Jogar a versão de testes →](https://187.77.238.51:8443/)

[Como jogar](#comece-sua-aventura) · [Recursos](#o-que-você-vai-encontrar) · [Instalação](docs/SETUP.md) · [Contribuir](CONTRIBUTING.md) · [Alquimia](docs/ALCHEMY.md) · [English](README.en.md)

[![Publicação segura](https://github.com/djowww/ragnarok-old-times-idle/actions/workflows/publication-safety.yml/badge.svg?branch=main)](https://github.com/djowww/ragnarok-old-times-idle/actions/workflows/publication-safety.yml) [![Licença: GPL v3+](https://img.shields.io/badge/licen%C3%A7a-GPL_v3%2B-315d70)](LICENSE) [![Status: em desenvolvimento](https://img.shields.io/badge/status-em_desenvolvimento-b59b5b)](#estado-do-projeto)

## Comece sua aventura

1. **Entre no portal** pelo link de testes e crie sua conta, ou faça login.
2. **Escolha seu personagem e uma área de caça.** Ele procura os monstros do mapa, caminha até o alvo e combate automaticamente.
3. **Prepare sua estratégia.** Organize habilidades, distribua atributos e melhore seus equipamentos para avançar.

A versão hospedada abre diretamente no navegador. Você não precisa instalar Docker nem configurar o servidor para participar dos testes. Ative a música dentro do jogo para ouvir a trilha do mapa.

## O que você vai encontrar

| Explore | Evolua | Prepare-se |
| --- | --- | --- |
| Campos e dungeons, monstros, mini-chefes e MVPs | Classes clássicas, renascimento e atributos | Equipamentos, cartas, identificação, raridades e refino |
| Caça AFK com movimentação e respawn no mapa | Progresso salvo e resumo de até 12 horas offline | Prioridade automática de habilidades, conjuração e recargas |

- **Interface clássica:** HUD inspirada no RO, janelas reposicionáveis, inventário e diário com chat.
- **Vida em Prontera:** loja, ferreiro, estilista e retorno à cidade pela HUD.
- **Combate no servidor:** alcance, colisão do mapa, recursos e recompensas resolvidos pela simulação autoritativa.

## Estado do projeto

A versão de testes está em desenvolvimento e recebe melhorias frequentes.

| Conteúdo disponível no código atual | Quantidade |
| --- | ---: |
| Áreas de caça | 31 |
| Classes nas árvores de progressão | 40 |
| Habilidades importadas do Hercules | 348 |
| Habilidades implementadas | 265 |

Habilidades que dependem de sistemas ainda ausentes aparecem como indisponíveis. O idle adapta algumas regras e recompensas; a reprodução integral de todos os sistemas e efeitos do RO ainda não está concluída.

As regras e suas fontes estão registradas no [catálogo](idle/content/) e no [manifesto do Hercules](idle/content/source-manifest.json).


### Consumíveis na mochila

Poções comuns e compactas, Anodyne, Aloevera e resistências elementais podem ser usados pela mochila. A cura automática utiliza o mesmo cálculo do consumo manual. Veja os [efeitos e limites da alquimia](docs/ALCHEMY.md).

## Para desenvolver ou hospedar

O projeto combina **TypeScript, React, Fastify e MariaDB**, com execução via Docker Compose. O motor Idle tem progresso próprio, e o cliente clássico usa Hercules e roBrowserLegacy.

| Guia | Conteúdo |
| --- | --- |
| [Instalação e execução](docs/SETUP.md) | Requisitos, cliente local, serviços, HTTPS e diagnóstico |
| [Desenvolvimento](docs/DEVELOPMENT.md) | Estrutura do código, comandos, testes e exportação do catálogo |
| [Como contribuir](CONTRIBUTING.md) | Relatar bugs e preparar uma contribuição |
| [Issues](https://github.com/djowww/ragnarok-old-times-idle/issues) | Problemas conhecidos e sugestões |

## Licença e créditos

Projeto de fã independente, sem afiliação ou endosso da Gravity Co., Ltd. O código é distribuído sob **GPL v3 ou posterior**; consulte a [licença](LICENSE) e os [créditos de terceiros](idle/THIRD_PARTY_NOTICES.md).

Mapas, sprites, efeitos, ícones e música originais não são distribuídos neste repositório. Esses materiais pertencem a seus respectivos titulares e devem ser fornecidos pelo operador a partir de um cliente que esteja autorizado a usar.
