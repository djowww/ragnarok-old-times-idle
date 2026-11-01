# Impacto Explosivo — contrato e desenho

## Objetivo

Habilitar Impacto Explosivo (WZ_SIGHTBLASTER) para Mago Bruxo e Arquimago na caça solo, respeitando o Hercules pré-renovação já fixado no projeto e o ciclo automático de habilidades do RagIDLE. A sequência maior de skills solo continua aberta; este documento cobre apenas esta habilidade.

## Contrato observado no Hercules

Fonte local: cache pinado em `410b9738c049ab1825d67b36b072d837c1d0b33a`.

- `db/pre-re/skill_db.conf:18587-18610`: nível 1, alvo próprio, skill mágica de Fogo, alcance de splash 1, conjuração interrompível de 2.000 ms, duração de 120.000 ms e custo de 40 SP.
- `src/map/skill.c:7568-7583`: WZ_SIGHTBLASTER inicia `SC_WZ_SIGHTBLASTER` no próprio conjurador após conjurar.
- `src/map/status.c:8297-8303,12422-12434,13361-13375`: o status visita alvos em raio 1 a cada 20 ms; aplica ataque mágico e termina depois do primeiro pulso que acerta alvos elegíveis. Todos os alvos visitados naquele pulso podem ser atingidos.
- `src/map/battle.c:4019-4065` e `skill_db.conf`: o ataque usa o cálculo mágico normal, elemento Fogo, 100% MATK e knockback de 3 células.
- `src/map/skill.c:3085-3145`: o empurrão é afastando do conjurador e não ocorre em mapa `noknockback`, monstro `MD_NOKNOCKBACK` ou boss.
- `db/pre-re/sc_config.conf:1264-1273`: o status tem `NoSave` e `NoDeathReset`.

## Desenho escolhido

1. O ciclo automático só inicia a conjuração quando o movimento atual do alvo prevê entrada no raio de 1 célula até o fim da própria conjuração. Isso conserva a prioridade da rotação sem gastar 40 SP quando os monstros ainda estão longe ou parados.
2. O estado armado é um buff de 120 segundos. A simulação calcula o instante de entrada do primeiro inimigo no raio durante a linha do tempo já existente e agenda um único prazo de contato; não cria uma repetição de 20 ms. O pulso local é resolvido na entrada calculada, uma diferença máxima de 20 ms em relação à cadência do Hercules.
3. O pulso usa a fórmula mágica comum do RagIDLE, centrada no jogador, atingindo os monstros vivos dentro do raio fonte. O status é consumido no primeiro pulso que encontra inimigos elegíveis. Dano, mortes, loot e registros seguem o caminho normal.
4. Alvos sobreviventes recebem empurrão de 3 células para longe do jogador, salvo nas três imunidades verificadas no código fonte. Colisão com GAT não é simulada neste mapa normalizado.
5. O status `NoSave` fica volátil no `SessionStateRepository`: permanece durante requests da mesma conexão, mas não entra no estado durável e é removido quando começa uma nova sessão. Uma reinicialização do processo também o perde.
6. Os metadados já existentes (ícone, classe, nível, cast, elemento, custo e duração) permanecem; o exportador deixa de marcá-lo como indisponível após a mecânica estar testada.

## Fora de escopo

Não há cliente PvP, armadilhas de jogador, colisão GAT, animação/partículas originais ou alteração de fórmulas mágicas globais. O mapa idle usa as posições normalizadas que o motor já calcula.

## Critérios de aceite

- O alvo longe ou sem trajetória de aproximação não provoca conjuração antecipada.
- Ao concluir o cast de 2 s, são cobrados 40 SP uma vez e o estado armado expira em 120 s caso não haja contato.
- A entrada de inimigo no raio 1 causa um único pulso de 100% MATK Fogo; os demais inimigos dentro do raio naquele pulso também recebem dano.
- O pulso consome a carga e aplica knockback de 3 células somente a alvos elegíveis.
- O buff não aparece em gravação durável nem atravessa uma nova conexão; requests e repetição idempotente da mesma conexão preservam o estado.
- WZ_SIGHTBLASTER é exportada como implementada para Wizard e High Wizard sem alterar a árvore de habilidades ou saves existentes.
