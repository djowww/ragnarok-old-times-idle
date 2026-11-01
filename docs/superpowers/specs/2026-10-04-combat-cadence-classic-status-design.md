# Combate fluido e atributos clássicos

## Escopo e autorização

Pedido de 4 de outubro: corrigir Primeiros Socorros que impede ataques, remover habilidades de família de todas as classes, restringir Increase Weight Limit R à família Mercador, aumentar o zoom atual em mais 15% e reproduzir a janela antiga de atributos. A autorização anterior permite planejar e executar sem novas confirmações de processo. Não repetir o wipe anterior.

## Fontes

Hercules `410b9738c049ab1825d67b36b072d837c1d0b33a`: dados pre-renewal, movimento, ASPD, cast e delay. roBrowser `d88a3cd4acde0582530e3fc1908532a92e9accea`: WinStats V0 e ACTs. Usar os arquivos originais disponíveis no serviço de assets local.

## Regras do combate

- Primeiros Socorros mantém cura de 5 HP, custo de 3 SP e cast zero. A automação deve permitir uma ação ofensiva entre duas curas. A pose usa o tempo de movimento; o efeito de cura tem vida independente.
- Separar o prazo do ataque básico, a decisão automática de habilidades, a trava de movimento/cast/after-cast e os cooldowns individuais. O ataque básico mantém o intervalo calculado por ASPD.
- Processar prazos vencidos em ordem cronológica, usando o instante real no evento. Empates estáveis favorecem conclusão de cast antes do ataque inimigo no mesmo instante, preservando a regra atual de interrupção estritamente anterior.
- Eventos podem carregar `sourceActorId`, `targetActorId`, `actionId`, `actorAction` (`attack`, `skill`, `none`), `actionStartedAt`, `actionMotionMs` e `hitMotionMs`. AoE compartilha a ação do atacante, mas preserva cada reação do alvo. Ticks de veneno, reflexão e efeitos no chão não criam novos ataques do corpo.
- Animações independentes por ator: ação mais recente, reação com relógio próprio, ACT ajustado ao movimento da ação. Preservar arma, direção, casting real, morte, SIT, posições, população do mapa e loot visível por quatro segundos.
- Atualização do cliente a cada 250 ms em combate e 850 ms fora dele, sem pedidos sobrepostos. Campos novos são opcionais e compatíveis com saves existentes.
- Esta etapa cria uma base temporal para evolução do combate. Não implementa PvP, regras de jogadores contra jogadores, arena ou sincronização multiplayer.

## Conteúdo e câmera

- Remover todas as habilidades `WE_` das árvores de todas as classes, inclusive Aprendiz.
- Manter `ALL_INCCARRY` somente na família Mercador. Preservar `MC_INCCARRY` e as habilidades normais da classe.
- Nos saves existentes, retirar essas habilidades excluídas da aprendizagem/rotação/recarga e devolver os pontos previamente investidos, uma única vez. Não alterar os outros pontos nem o progresso.
- Exportar AttackMotion e DamageMotion dos monstros quando disponíveis na fonte.
- Aplicar mais 15% sobre o zoom atual de 20%: fator acumulado 1,38. Ajustar a câmera real, conservando a proporção mapa/personagem.

## Janela de atributos

WinStats V0 original: fundo `statwin0_bg.bmp`, corpo de 280 × 103 pixels e título de 17 pixels, linhas e valores nas posições originais. Usar fontes e controles pequenos do cliente; retirar cabeçalhos, colunas e rodapé extras. Exibir atributos base + bônus, custos e pontos, ATK/MATK/HIT/CRIT/DEF/MDEF/FLEE/ASPD. Clã permanece vazio sem sistema de guilda. Botões alocam um ponto com o custo e limite atuais do servidor. A janela continua movível e acessível por teclado.

## Entrega

Integrar na instância Docker local, revisar o código, executar typecheck e build, e inspecionar a UI real. Não adicionar nem executar testes automatizados sem pedido do usuário. Preservar alterações existentes; não publicar, fazer commit ou apagar personagens nesta etapa.
