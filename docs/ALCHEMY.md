# Preparar poções

Alquimistas e Criadores podem abrir **Preparar poções** pelos serviços de Prontera ou pela janela de habilidades. É necessário aprender a habilidade, carregar o manual e reunir os materiais da receita.

- Há 20 receitas originais, conferidas no Hercules pré-renovação.
- Cada tentativa consome 5 SP base, uma Vasilha de Mistura e os ingredientes, inclusive quando falha. Reduções de SP se aplicam.
- O manual precisa estar na mochila e permanece após a fabricação.
- A chance usa Preparar Poções e Pesquisa de Poções aprendidas, nível de classe e INT, DES e SOR efetivos.
- A previsão não consome recursos. Um lote repete tentativas individuais e exige recursos e capacidade para o pior caso antes da confirmação. Este fluxo de previsão/lote e a concentração dos vendedores em Prontera são adaptações do Idle.
- A loja vende recipientes, materiais de Embrião e manuais de NPC pelos preços originais. Manuais e Vasilha de Mistura têm preço fixo; recipientes da loja normal aceitam desconto.

## Limites atuais

O manual de resistência elemental depende da pesquisa original de Pisruik; essa aquisição ainda não está disponível e o manual não é vendido. Alguns materiais ainda exigem novas rotas de caça.

Embrião ainda depende do sistema de Homunculus. Os frascos de invocação e revestimento aguardam suas habilidades consumidoras. O painel identifica esses limites.

## Usar os produtos

Selecione o item na **Mochila** e clique em **Usar item**. O servidor consome uma unidade e registra o recibo da ação; repetir uma requisição não cobra novamente.

| Produto | Efeito |
| --- | --- |
| Poções compactas vermelha, amarela e branca | Cura base de 55, 205 e 365 HP, com VIT, Recuperação de HP e Pesquisa de Poções. Também participam da cura automática. |
| Anodyne | Vigor 1: 10 segundos, +1 DEFM e supressão da reação de dano por um contador limitado de golpes. Preserva um Vigor mais forte e compartilha sua recarga de 10 segundos. |
| Aloevera | Provocar 1 em si: 30 segundos, +5% ATQ e −10% defesa de VIT; preserva a defesa do equipamento. Instinto de Sobrevivência pode substituir o efeito. |
| Fireproof / Coldproof / Earthproof / Thunderproof | 20 minutos: +20% contra o elemento indicado e −15% contra sua vulnerabilidade. Efeitos diferentes coexistem; repetir o mesmo renova o prazo. |

Poções de resistência afetam os ataques elementais suportados pelo motor, sem mudar o elemento da armadura. As quatro juntas oferecem +5% em cada um dos quatro elementos. Morte remove resistências e Aloevera; Vigor conserva seu prazo original.

A cura determinística usa o ponto médio do intervalo original. Consumo manual e automático compartilham a recarga de 2 segundos do Idle. Anodyne e Aloevera não gastam SP; exigem estar em pé e sem conjuração ativa. Nesta interface, uma tentativa bloqueada é rejeitada sem consumir o item. Essas são adaptações explícitas do fluxo de itens do cliente clássico.

Referências: [scripts dos produtos](https://github.com/HerculesWS/Hercules/blob/410b9738c049ab1825d67b36b072d837c1d0b33a/db/pre-re/item_db.conf), [status pré-renovação](https://github.com/HerculesWS/Hercules/blob/410b9738c049ab1825d67b36b072d837c1d0b33a/db/pre-re/sc_config.conf).

Fonte: [receitas originais](https://github.com/HerculesWS/Hercules/blob/410b9738c049ab1825d67b36b072d837c1d0b33a/db/produce_db.txt#L329-L380), [vendedor do Alquimista](https://github.com/HerculesWS/Hercules/blob/410b9738c049ab1825d67b36b072d837c1d0b33a/npc/merchants/alchemist.txt#L42-L179).

## Arremessar Poção Compacta

Criadores com a habilidade aprendida podem escolher o nível na janela de habilidades e usar manualmente ou na rotação automática. Níveis 1–5 usam Red Slim Potion, 6–9 Yellow Slim Potion e 10 White Slim Potion. Cada uso consome uma poção e 30 SP ao concluir a conjuração.

A conjuração base é de um segundo, reduzida por DEX; a pós-conjuração é de um segundo. A cura considera os níveis aprendidos de Arremessar Poção Compacta, Arremessar Poção e Preparar Poção, além da VIT e recuperação do alvo, com truncamento inteiro por etapa. No modo solo, a área é centrada no próprio personagem. Mantemos os pontos médios de recuperação das poções usados pelo Idle.

## Encontrar Minério

Ferreiros e Mestres Ferreiros com Encontrar Minério aprendida podem obter um minério extra ao derrotar um monstro. A seleção usa a cadeia de vinte itens do Hercules: um sorteio uniforme da entrada e outro da chance dessa entrada. A chance total é de 1,4275% por abate elegível, sem multiplicadores de drop, nível ou LUK.

O minério segue o fluxo normal de loot e capacidade; mochila cheia conserva o item na fila de coleta. A elegibilidade exige o jogador vivo no instante do abate. A implementação atual cobre o mundo individual de caça, onde o jogador é o atacante e dono do dano; mortes por aliados, mascotes ou Homunculus aguardam esses sistemas.
