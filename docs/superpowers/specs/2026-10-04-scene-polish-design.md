# Cena clássica: integração, leitura e recompensas

## Intenção aprovada

O usuário pediu aplicar as seis melhorias sugeridas sobre sua captura: integrar sprites ao cenário; destacar alvo e vida; melhorar legibilidade da HUD; compactar controles; valorizar drops e conquistas; dar rotina aos NPCs. A autorização anterior permite planejar e executar sem novas confirmações de processo.

## Restrições

Reutilizar o worktree local existente. Preservar progresso, balanceamento Hercules, farm persistente, respawn de 6 segundos, loot visível de 4 segundos, BGM original, escala de atores 1.1 e zoom atual. Sem wipe, commits, publicação, novas dependências ou testes automatizados. Compilação, revisão de código e inspeção manual serão as verificações.

## HUD e controles

Manter acabamento Ragnarok clássico, fontes Tahoma/Arial e bordas azuis/cinza. Texto principal da HUD e chat com aproximadamente 11px; chat com fundo sólido ou opacidade de pelo menos 94%, preservando tamanho compacto e modo recolhido. Cartão de caça menor, texto sem corte e um único estado da caça apresentado ali; remover duplicação no cabeçalho. Barra de habilidades com opção persistida para recolher slots vazios, preservando todas as habilidades ocupadas, ataque básico, cooldowns e alça de arrastar. Sem rótulos F1–F9. Janelas seguem móveis e adaptadas à largura do navegador.

## Cena e alvo

Sombra suave ancorada aos pés com proporção do sprite/perspectiva, sem grandes discos pretos; profundidade entre os atores e integração real com objetos do mapa quando suportada pelo renderer nativo. Marcação de seleção no terreno apenas no alvo vivo atual, barra de HP e nome junto ao próprio monstro; remover caixa de alvo distante na direita. Preservar geometria e alcance do servidor. Oclusão exige informação real do renderer, não máscaras decorativas de árvores inventadas.

Auditoria do roBrowser confirmou que SpriteRenderer pode desenhar os atores antes de EntityManager/water/PostProcess, compartilhando o depth buffer dos modelos originais. O parent continua calculando poses e posições; envia texturas RGBA uma vez e listas pequenas de camadas/posições. O renderer usa a iluminação/sombra nativa, mantém o tamanho original com o fator 1.1 e os limites existentes. Somente atores confirmados no passe nativo deixam de ser pintados no canvas de reserva. Falha, carregamento, troca de mapa e mensagens antigas retornam ao fallback. Validar origem/mapa, limitar recursos e liberar texturas. Labels, alvo, drops e efeitos continuam no overlay; nenhuma alteração de combate.

## Recompensas

Tooltip acessível do loot no chão com nome e quantidade durante seus quatro segundos existentes. Equipamento não identificado usa nome genérico e não revela raridade oculta. Notificações pequenas e temporárias para aumento de nível, missão concluída/pronta e descoberta de raridade após identificação, sem repetir eventos antigos no carregamento, roubar foco ou bloquear combate. Manter o resumo de missão já existente e evitar avisos duplicados de resgate.

## Vida do mapa

Patrulhas curtas somente para NPCs cujos sprites possuem ação de caminhada, nos segmentos walkable do GAT. Falas/emotes espaçados entre atores, sem todos ativarem juntos. Mob ambiente continua sendo exclusivamente a população real persistida do servidor, com deslocamentos existentes; não introduzir monstros decorativos que não possam ser alvos. Preferência de movimento reduzido preservada.

## Critério de entrega

Revisões independentes das tarefas; build e typecheck; deploy do serviço local; inspeção da cena, alvo, chat, controles recolhidos/expandidos e notificações relevantes. Captura final no navegador disponível. Progresso do jogador preservado.
