# Mundo, loot e qualidade de vida

## Objetivo

Dar mais presença aos sprites originais, caçar os monstros já visíveis no mapa e permitir organizar a HUD. Acrescentar identificação com lupa, raridades de equipamentos e reiniciar os personagens locais do Rag Idle conforme solicitado.

## Decisões

- Zoom real de câmera de 20%, mantendo a proporção entre terreno, personagem e monstros; desenho dos sprites sem interpolação borrada. Loading original cobre toda a tela com `object-fit: cover`.
- Monstros de cenário nas hunts passam a ser a população do encontro, com identidades estáveis, posições visíveis e reposição após morte. O servidor continua escolhendo alvos, resolvendo dano/loot/EXP; não há monstros decorativos duplicados da população caçável. NPCs permanecem ambientação.
- NPCs usam falas curtas e emotes originais, espaçados para não poluir o cenário. Descansar preserva o mapa e a posição visual, usando a ação original de sentar.
- Recargas aparecem discretamente nos próprios atalhos, com máscara e tempo restante derivados dos timestamps do servidor.
- HUD, minimapa, chat, atalhos, exploração e janelas têm alças de arrasto, posições persistidas localmente e limites do viewport. Controles dentro das janelas continuam clicáveis. Livro oferece restaurar posições.
- Equipamento usa a janela clássica: retrato central e slots de cabeça superior/meio/inferior, arma, escudo, armadura, capa, calçado e acessórios, respeitando os slots atualmente suportados pelo motor. Não inventar slots funcionais que a base não contém; apresentar os visuais adicionais como vazios até haver dados de equipamentos.
- Retirar habilidades de família Baby/Call Parent/Call Baby e Increase Weight Limit da árvore do mago e evoluções. Filtrar pela identidade da fonte; não alterar skills legítimas de outras classes.
- Equipamentos de drops vêm não identificados e exigem uma lupa (item 611) para equipar, refinar ou receber cartas. Equipamento inicial e da loja vem identificado. Raridade e atributo são sorteados uma vez no servidor, ficam ocultos visualmente até identificar e não podem ser rerrolados pela lupa.
- Raridades: comum 65%, incomum 22%, raro 9%, épico 3%, lendário 1%. As quatro raridades especiais recebem um atributo aleatório entre STR, AGI, VIT, INT, DEX e LUK com valor inteiro +1 até +5. Cor e descrição aparecem somente após a identificação. Bônus entra nas fórmulas clássicas existentes; raridade é uma extensão do modo idle.
- Wipe somente das tabelas de personagens/perfis do Rag Idle e dados dependentes, preservando contas/servidor RO clássico. Parar o serviço idle, salvar backup recuperável e executar reset transacional; reiniciar já com o código novo. Não resetar volumes Docker.

## Verificação e limites

Revisão independente, typecheck, build Docker e inspeção visual/funcional solicitada. Não adicionar nem executar testes automatizados nesta rodada. Preservar alterações anteriores, sem commit ou publicação não solicitada. Sprites/arte vêm dos assets locais existentes; geometria usa a câmera e o terreno original e mantém o limite de oclusão 2D atual.
