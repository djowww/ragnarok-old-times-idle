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

Produzir um item não habilita seu script original automaticamente. Poções compactas, resistências, Anodyne, Aloevera e Embrião permanecem materiais com uso indisponível; os frascos de invocação e revestimento também aguardam suas habilidades consumidoras. O painel identifica esses limites. Poções comuns e os reagentes das habilidades já implementadas seguem seus consumidores existentes.

Fonte: [receitas originais](https://github.com/HerculesWS/Hercules/blob/410b9738c049ab1825d67b36b072d837c1d0b33a/db/produce_db.txt#L329-L380), [vendedor do Alquimista](https://github.com/HerculesWS/Hercules/blob/410b9738c049ab1825d67b36b072d837c1d0b33a/npc/merchants/alchemist.txt#L42-L179).
