# Mapas e músicas originais no Ragnarok Old Times Idle

Data: 2026-10-03. Complemento à [especificação do idle](2026-10-03-ragnarok-old-times-idle-design.md), solicitado pelo usuário após jogar a primeira versão.

## Objetivo

As dez áreas de caça e a cidade devem mostrar o cenário do mapa correspondente do cliente local do Ragnarok, com sua geometria, modelos e texturas originais. Cada mapa deve tocar a BGM indicada pela tabela original do cliente quando o jogador ligar a música. O Aprendiz deve executar os quadros de ataque do seu arquivo ACT a cada golpe apresentado, inclusive no golpe final.

O jogo permanece idle: combate, EXP, loot e salvamento continuam no servidor atual. O mapa aqui é a cena visual do local de caça. Navegação livre, NPCs e missões do cliente tradicional continuam acessíveis pelo modo clássico já instalado.

## Decisão de implementação

Usar o **MapViewer** do mesmo commit fixado do roBrowserLegacy (`d88a3cd4acde0582530e3fc1908532a92e9accea`) como uma camada WebGL dentro da cena do idle. O visualizador lê os arquivos `.rsw`, `.gnd`, `.gat`, modelos e texturas diretamente do `client-data/data.grf`, por meio do serviço local de assets. A aplicação idle informa ao visualizador apenas o nome do mapa, de uma lista fechada. O Canvas2D do idle continua responsável por personagens, monstros, dano e interface sobre o cenário. O visualizador não se conecta ao Hercules nem controla o estado do jogo.

O `web-client` construirá e servirá o MapViewer ao lado do PWA clássico. Uma adaptação pequena e versionada do MapViewer fixado iniciará seu `Client` diretamente com o servidor de assets local e lerá o mapa permitido pelo fragmento da URL. A cena troca de mapa remontando somente o visualizador; este avisa ao idle quando o cenário está pronto. Isso evita criar um segundo protocolo para o worker de GRF. A interface acompanha carregamento/erro e mostra um estado recuperável se o renderer ou os arquivos locais faltarem. O cenário desenhado à mão deixa de ser a apresentação normal dos mapas.

Para as músicas, a referência é `data/mp3nametable.txt` dentro do GRF local. O mapeamento das onze localidades atuais é pequeno e versionado; os MP3 continuam apenas no `client-data/BGM/`, fora do Git e das imagens. O controle de música começa desligado e só solicita áudio após clique do usuário; ao trocar de área, muda para a trilha correspondente e mantém a escolha de ligado/desligado. Prontera usa sua trilha de cidade.

Para combate, o renderizador de sprites deve usar os cinco quadros da ação PC 40 presentes no ACT de Aprendiz (100 ms por quadro no cliente local) em resposta a um evento de dano causado. A linha de tempo da animação começa quando o navegador recebe o evento, em vez de usar o relógio global do Canvas. Ela precisa ser visível quando o golpe mata o alvo ou coincide com dano recebido. Um alvo derrotado pode ficar visível durante a conclusão da animação, sem alterar recompensas ou cadência do motor.

Se uma resposta trouxer vários golpes, a cena apresenta seus ciclos em sequência, até terminar os golpes recentes. Em navegadores com `prefers-reduced-motion`, mantém uma pose estática de ataque durante esse intervalo em respeito à preferência de movimento reduzido.

## Mapeamento de locais

| Local | Mapa original | BGM original |
| --- | --- | --- |
| Cidade | `prontera` | `08.mp3` |
| Sul de Prontera | `prt_fild08` | `12.mp3` |
| Esgotos | `prt_sewb1` | `19.mp3` |
| Campos dos Rockers | `prt_fild04` | `05.mp3` |
| Bosque de Prontera | `prt_fild03` | `05.mp3` |
| Caverna de Payon | `pay_dun00` | `20.mp3` |
| Byalan | `iz_dun01` | `29.mp3` |
| Vila dos Orcs | `gef_fild10` | `35.mp3` |
| Pirâmide | `moc_pryd02` | `22.mp3` |
| Calabouço de Geffen | `gef_dun02` | `50.mp3` |
| Cavalaria de Glast Heim | `gl_knt01` | `44.mp3` |

## Requisitos de apresentação e operação

- O mapa deve trocar ao iniciar ou mudar a área, e voltar a `prontera` na cidade. Pausa e descanso em área conservam o mapa ativo.
- O visualizador deve caber no quadro responsivo atual, sem capturar os controles de caça e sem adicionar login.
- Sprites sobrepostos devem preservar o pixel art e a leitura de dano/HP. O mapa fica atrás dos personagens e das etiquetas.
- O modo clássico em `:3338` deve continuar disponível. O idle em `:3339` deve abrir com os dados oficiais locais, sem exigir copiar GRFs ou MP3 para o repositório.
- Sem recurso local, a interface deve explicar qual mapa falhou e permitir recarregar; não deve afirmar que um cenário substituto é o mapa original.
- Uma cena fiel significa usar os arquivos de cenário originais do cliente, não prometer equivalência do idle às fórmulas, scripts ou navegação do MMORPG.

## Evidências de origem

- [MapViewer do roBrowserLegacy no commit usado pelo projeto](https://github.com/MrAntares/roBrowserLegacy/blob/d88a3cd4acde0582530e3fc1908532a92e9accea/src/App/MapViewer.js) usa o MapRenderer e oferece `init`, `load` e `stop` por mensagem.
- `GET http://127.0.0.1:8080/data/prt_fild08.rsw` e `.gnd` responderam 200 com dados do GRF local em 2026-10-03.
- `data/mp3nametable.txt` foi lido do GRF local para os onze mapeamentos; os dez arquivos MP3 distintos estão em `client-data/BGM/`.
- Os arquivos ACT de Aprendiz local têm a ação 40 com cinco quadros de 100 ms.
