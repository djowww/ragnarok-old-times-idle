# Farm automático sobre população persistente

## Pedido e execução

Aumentar todos os personagens em 10%, retirar os rótulos F1–F9, trocar ondas por caminhada até monstros previamente presentes com respawn, e usar a BGM original do mapa. A autorização anterior permite executar sem novas confirmações de processo. Reutilizar a worktree e preservar personagens/progresso. Nenhum wipe, publicação ou commit nesta etapa.

## Farm

- `fieldPopulation` conserva autoridade sobre IDs, HP, posição e respawn. Campos atuais têm quatro monstros e dungeons três. Entrada e seleção não fabricam um monstro para cada ataque nem teleportam o alvo para o jogador.
- Um combate de campo é uma sessão contínua. O herói seleciona um alvo existente, caminha até o alcance de um ataque/habilidade ofensiva utilizável, para durante a ação/cast e procura o próximo após a morte. Foco prefere candidatos existentes; distância e ID desempatarão. Manter alvo durante perseguição.
- Monstro passivo permanece no mapa/patrulha até ser provocado. Agressividade e provocação permitem perseguição ao jogador e ataque com alcance real. Imobilizações conservam sua função.
- Remover a espera entre vítimas; seis segundos permanecem somente como respawn individual. AoE, status, efeitos de chão e efeitos atrasados usam posições reais e não se perdem ao selecionar outro alvo.
- Preservar relógios de ataque, movimento, cast e cooldown, além da alternância de apoio/ofensiva já implementada. Movimento e combatentes usam o mesmo relógio/interpolação autoritativos. Uma ação não pode atingir fora do alcance validado no servidor.
- Campo do herói pode informar `phase` (`seeking`, `chasing`, `fighting`, `waiting`) e `targetId`, opcionalmente para saves antigos. A UI mostra movimento mesmo com sessão de combate ativa. Descanso congela no local e mantém monstros/HP/IDs. Mudança de mapa enfileirada continua aplicando depois da vítima atual, sem ficar presa numa sessão eterna.
- Manter limite de 12 horas offline; ao pausar e retomar, congelar/rebasear posições e deadlines necessários, sem simular o intervalo descartado ou reiniciar progresso. Challenges mantêm seus encontros próprios.
- Usar velocidade original dos monstros quando disponível no catálogo; jogador segue velocidade padrão pre-renewal e modificadores suportados. Exportar dados fixados do Hercules e registrar adaptações.

## Renderização e atalhos

- `GAME_ACTOR_SCALE = 1.1` aumenta somente corpos/cabeças/armas de personagens, monstros e NPCs, mantendo pés no chão. Não alterar câmera, hitboxes, alcance, emotes, efeitos ou loot. Previews recebem espaço suficiente para não cortar os sprites.
- Remover os rótulos F1–F9, inclusive acessibilidade, e qualquer captura de teclas de função caso existente. Preservar nove posições de rotação, ícones, recargas e clique que abre habilidades. Remover o espaço dos rótulos nos ícones.
- A inspeção na janela nativa estreita revelou que a caminhada sai do enquadramento fixo. A câmera nativa acompanhará o herói com deslocamento suave, mantendo o zoom. `sceneFocus` fixa a origem de mapa para que atores, NPCs, cadáveres e loot permaneçam nas mesmas células durante o deslocamento. O bridge aceita somente mensagens do parent local autorizado, com coordenadas finitas dentro de 24 células da origem; pausa/descanso acompanham a posição congelada.

## BGM

- Usar `data/mp3nametable.txt` original do cliente local como autoridade. Exportar só os pares mapa/faixa e o hash da fonte; ignorar linhas comentadas. Nenhuma música é redistribuída.
- Prontera/loja `prt_in`: 08; Sul de Prontera: 12; esgoto: 19; fields 03/04: 05; Payon: 20; Izlude: 29; Orcs: 35; pirâmide: 22; Geffen: 50; castelo: 44. Todas essas faixas locais estão disponíveis.
- Passar o mapa exibido ao player de áudio. A loja usa `prt_in`, inclusive quando aberta a partir de uma hunt. A mesma faixa não reinicia entre mapas que a compartilham.
- Playback continua iniciado pelo botão Música, respeitando o gesto exigido pelo navegador. Proxy preserva range HTTP e metadados de resposta para áudio carregar corretamente.

## Conferência

Revisão independente, typecheck, build Docker e inspeção manual da instância. Não adicionar nem executar testes automatizados sem pedido do usuário. Preservar a janela V0, janelas movíveis, loading integral e loot visível por quatro segundos.
