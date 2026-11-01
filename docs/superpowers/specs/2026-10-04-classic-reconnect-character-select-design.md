# Tela clássica de loading e seleção ao reconectar

## Objetivo

Substituir a imagem inadequada do loading por arte local de Ragnarok apropriada ao cenário e exigir uma confirmação visual de entrada ao abrir/reconectar, em uma tela inspirada na seleção clássica de personagem.

## Contexto confirmado

- `ClassicLoading` atualmente carrega `data/texture/basepic/loading01.jpg`. O recurso responde HTTP 200, mas é uma arte promocional coreana da atualização de emotes; não é uma tela de carregamento neutra/clássica.
- O cliente local já serve `data/texture/유저인터페이스/worldmap.jpg`, mapa original de Rune-Midgard sem texto promocional coreano.
- O jogo suporta um perfil local persistente (`local-djow`), não uma coleção de personagens. Seu nome, avatar, classe, níveis, equipamentos e status de caça vivem em `GameSnapshot`.
- `useGame()` permanece montado e consulta `/api/session` a cada 250 ms durante a caça. A simulação e o salvamento AFK não devem depender de o mapa ou a tela do mundo estarem montados.

## Design

1. **Loading de página inteira:** usar o mapa-múndi original como arte local, sem cortar o título ou deformar a proporção; preencher as laterais com a própria textura em uma camada escurecida/desfocada. Preservar a tela opaca que cobre mapa, HUD, personagens e diálogos. Mostrar somente o percentual sobre a arte durante o carregamento; manter a mensagem e a ação de retry apenas em erro.
2. **Seleção local de personagem:** depois de receber catálogo e perfil, ocultar completamente o mundo e apresentar uma janela full-screen em moldura clássica, sobre o mapa original. A única vaga disponível é o perfil local atual, com sprite original incluindo cabeça e arma identificada quando equipada, nome, classe, níveis e estado da caça. O jogador seleciona a vaga e pressiona “Entrar no mundo”.
3. **Reconexão:** um refresh sempre começa na seleção. A primeira conexão após abrir não conta como uma reconexão; se uma sessão já conectada perder a conexão e recuperá-la, volta à seleção e fecha diálogos da sessão anterior. Uma falha temporária não pausa nem altera a intenção de caça persistida.
4. **Separação de dados e apresentação:** nenhum ID de personagem novo, endpoint, migração, comando de gameplay ou alteração no estado do servidor. O perfil permanece único e persistente. Enquanto a vaga é exibida, o hook da sessão continua processando os updates AFK. A cena do mapa só monta após “Entrar”; nesse ponto a tela de loading cobre a carga do mapa.
5. **Resumo offline:** não abrir diálogo modal por cima do seletor nem da tela de loading. Preservar o resumo existente para depois da entrada no mundo e da carga do mapa.

## Fora de escopo

- Criar, apagar, renomear ou alternar entre vários perfis/personagens.
- Alterar o motor de combate, banco de dados, servidor Hercules, política de duração AFK ou limites offline.
- Copiar/exportar arte cliente local ou introduzir dependências externas.

## Critérios de aceitação

- O loading usa a textura original de Rune-Midgard, preenche a janela e mantém a arte central sem distorção nem corte do mapa; nenhum elemento do mundo aparece atrás.
- O boot exibe a seleção após carregar o perfil e antes de montar a cena.
- O jogador entra com clique/teclado apenas após selecionar a vaga, e vê loading cobrindo a montagem do mapa.
- Um estado de caça permanece `hunting` enquanto a seleção está aberta e reflete os snapshots AFK seguintes; falha/reconexão após uma sessão conectada exige escolher a vaga novamente.
- Resumo offline, erro recuperável e acessibilidade (título, botão, seleção e foco) continuam disponíveis sem sobrepor loading/seleção.
- Funciona em viewport desktop e estreita sem alargar a arte ou esconder o botão de entrada.
