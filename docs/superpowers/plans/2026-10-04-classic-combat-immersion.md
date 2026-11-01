# Combate clássico e imersão — 04/10/2026

## Escopo autorizado

Aplicar a interface clássica, ampliar a área do jogo, corrigir loja e escalas, adicionar encontros com vários monstros e entrada pelas bordas, chat local compartilhado, prioridade circular de nove habilidades e regras pré-renovação. O usuário confirmou todas as classes atuais e autorizou execução sem novas confirmações de processo.

## Fonte e limites

Usar o Hercules fixado no projeto para árvores de habilidades, custos, tempos, multiplicadores, bônus de classe e defesa. Dados originais permanecem no serviço local de assets. Mecânicas que dependem de grupos, PvP, casamento ou fabricação devem ser indicadas como indisponíveis neste modo solo, sem simular dano inventado.

## Implementação

1. Exportar as árvores completas das classes atuais, mantendo os IDs já salvos; incluir requisitos e metadados de conjuração.
2. Introduzir inimigos com identidade própria, chegada e posição; manter os campos antigos da batalha sincronizados para compatibilidade. Resolver dano, morte e loot por alvo.
3. Verificar recursos ao começar a conjuração e debitar somente ao concluir com sucesso, conforme o Hercules; aplicar efeito no término. Usar AoE e estados de combate no servidor e recuperação passiva por tempo acumulado.
4. Integrar a loja compacta, roda de habilidades, miniaturas naturais e chat ao viewport. Remover rates.
5. Sincronizar escala de sprites com a câmera do mapa, melhorar deslocamento/entrada dos monstros e apresentar conjuração/área de efeito.
6. Verificar tipos/build e casos de comportamento relevantes; reconstruir apenas os serviços locais necessários, preservando saves e volumes.

## Divisão

- Regras e exportador: classic_rules_skills.
- Loja, desafios e roda: classic_ui.
- API persistente e janela de chat: global_chat.
- Motor, integração, cena, câmera e entrega local: agente principal.

## Resultado da implementação

- Catálogo: 351 habilidades de 40 árvores; 176 com execução e 175 com limitações específicas exibidas na interface. Preservados os IDs dos perfis existentes.
- Combate: grupos de até três, conjuração/interrupção e custos no término; combos, esferas, efeitos persistentes e resistências de status com fonte pré-renovação. Veneno, cegueira, petrificação e congelamento alteram o combate.
- Câmera: escala e posição dos atores projetadas com a matriz e alturas GAT; ordenação por pés projetados. Sem ocultação por modelos 3D.
- Interface: viewport ampliado, compra com controles fixos, miniaturas em escala natural, prioridade circular e chat compartilhado entre sessões locais. Rates retiradas.
- Otimização: simulação em passos de 250 ms para casts/ataques curtos, com salto dos passos vazios da cidade quando o personagem está totalmente recuperado.
- Limites: composição 2D dos efeitos originais; geometria de campos/armadilhas usa a formação do encontro; party, fabricação, homúnculos e quebra/reparo continuam indisponíveis.

- Revisão final: recuperação passiva de HP/SP com contadores separados; Magnificat reduz o intervalo de SP para 4s; Veneno encerra no limiar da fonte. Peso/capacidade e bloqueio de recuperação usam a mesma função na HUD e no motor.
- Inspeção da cena: encontros preservam a posição do herói após caminhar; cadáveres/loot conservam sua origem e somente o alvo atual recebe rótulo. Janelas fecham o seletor de caçadas para impedir sobreposição de controles.

Verificação final em 04/10/2026: `pnpm typecheck` e build Docker concluídos com código 0; idle-game/database saudáveis; mapa HTTP 200; catálogo servido com 351 habilidades/40 classes; leitura do chat funcionando. Loja, roda, cidade e caça inspecionadas no navegador, com Lanças de Fogo consumindo SP no término e produzindo dano mágico. Nenhum teste novo nem execução de testes nesta rodada.

## Ajustes de loading, distância e status — rodada seguinte

Requisitos do usuário: loading com arte clássica e percentual sem cenário/HUD, viewport completo, emotes proporcionais, atributos clássicos funcionais, monstros atacando ao contato, conjuração antes do contato e loot visível no chão.

1. Usar `data/texture/basepic/loading01.jpg` do GRF local, referenciada pelo serviço de assets. Centralizar a cobertura opaca no App e encaminhar progresso real `MAP_PROGRESS` do roBrowser. Liberar somente após mapa e sprite do herói; manter erro recuperável.
2. Ajustar cabeçalho, cenário e controles à altura do navegador. Emotes usam a escala projetada do herói.
3. Compartilhar trajetória e distância entre motor e cena; exportar alcance de arma, monstro e bônus de habilidades. Engajar monstros passivos ao iniciar uma ação ofensiva, respeitando alcance e estados de controle.
4. Mostrar status compacto com seis atributos, bônus/custo e prévia sem gastar pontos. Aplicar fórmulas pré-renovação de CRIT, esquiva perfeita, MDEF e defesa de refino da fonte fixada.
5. Preservar cada drop na posição da morte: 190ms de queda, 4s no chão e 600ms de coleta. Não bloquear os próximos encontros por loot antigo.
6. Revisão independente, typecheck, rebuild local e inspeção de navegador. Nenhum teste solicitado nesta rodada; não adicionar ou executar testes. Preservar saves, volumes e mudanças anteriores.

Resultado: arte e percentual isolados numa camada opaca, incluindo o resumo offline; viewport ajustado à altura útil, emotes proporcionais e janela clássica compacta. Alcances compartilhados também controlam a indicação de disponibilidade dos atalhos. Ataques anteriores ao término/início de conjurações são drenados em ordem temporal, com estado de cast válido somente no seu intervalo; revisão independente confirmou os caminhos de interrupção, reflexão e morte.

Verificação desta rodada: `pnpm typecheck` e os builds Docker de `web-client`/`idle-game` terminaram com código 0. API health `ok`; serviços idle/database saudáveis; arte HTTP 200; catálogo servido com 351 skills/40 classes e novos alcances. Loading observado com somente imagem/percentual no navegador. Status, ataques dos monstros e loot no cenário inspecionados sem gastar atributos/habilidades ou mudar a caçada. Patch do roBrowser validado por aplicação reversa; diff de código sem erros de whitespace (o arquivo de patch tem marcadores de contexto de diff).

Limites técnicos mantidos: formação de encontros e aproximação em três segundos, simulação em janelas de 250ms, sem pathfinding completo nem conjuração de habilidades próprias dos monstros. A cena não tem oclusão por modelos 3D. Loot nascido e encerrado inteiramente entre snapshots conserva a duração visual, mas sua origem exata pode usar o ponto de fallback.

## Tela inteira e vida no mapa — ajustes seguintes

- Removido o cabeçalho externo. A janela ocupa `100dvh`; zeny e estado de salvamento permanecem na HUD clássica, e o cliente RO fica acessível pelo Livro do aventureiro.
- HUD compacta no alto à esquerda; chat translúcido no canto inferior esquerdo, com atalhos e hunts alinhados embaixo. Regras de telas estreitas evitam sobreposição e mantêm o corpo do seletor rolável. Em janelas curtas, o botão de exploração fica abaixo do minimapa e seu drawer usa temporariamente o espaço do chat.
- A última morte da onda agenda seis segundos de busca, ou sete com foco específico. Caminhada usa distância em células e segmentos caminháveis do GAT, com desvio curto quando o caminho direto está bloqueado.
- NPCs originais e monstros distantes compõem a ambientação: quatro NPCs em Prontera, até dois NPCs e quatro monstros nos campos, três monstros nas masmorras. Atores ambientais não geram combate nem recompensas; carregamento reutiliza o cache de sprites, rotas têm pausas e respeitam movimento reduzido.
- Patch do roBrowser passa uma amostra de 65×65 células com alturas e máscara de terreno caminhável. A projeção, escala natural e ordenação pelos pés são compartilhadas com os atores do combate.

Verificação desta rodada: revisão independente seguida de correções de encaixe/acessibilidade; `pnpm typecheck` e builds Docker concluídos com código 0; API health `ok`, idle/database saudáveis, patch com aplicação reversa válida, diff de código sem erros de whitespace. Inspeção de navegador em 1280×720, 390×844, 540×480 e 390×420. Na captura final, viewport e página são 1280×720, jogo começa em y=0 e o cabeçalho externo está ausente. Nenhum teste adicionado ou executado; perfil, atributos, equipamentos e caçada não foram alterados para inspeção.
