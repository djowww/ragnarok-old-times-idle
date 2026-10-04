# Janelas clássicas dentro da cena e loja de poções

## Objetivo

Fazer a interface idle parecer uma sessão de Ragnarok pré-renewal: mapa como palco principal, botões legíveis no Basic Info, janelas de jogo sobre a cena, ícones originais e uma ida visual à loja de poções de Prontera. A lógica de combate, compras, inventário e missões continua no servidor.

## Diagnóstico e recursos locais

- Os botões BMP de 30 × 20 px estão espremidos em uma linha de um Basic Info de 280 px. Status e habilidades apontam para o mesmo painel; equipamento e mochila também. O destino fica numa seção abaixo do mapa.
- O cliente local contém os 45 ícones das habilidades do catálogo, a espada `item 1101`, poções vermelha `501` e azul `505`, `prt_in.rsw/.gnd/.gat`, o NPC original `1_m_innkeeper` e `worldmap.jpg` em `data/texture/유저인터페이스/`.
- O vendedor original do Hercules fica em `prt_in,126,76`. A compra continua sujeita à regra de estar na cidade.

## Comportamento

1. O Basic Info tem botões clássicos com área clicável e legenda legível para Atributos, Equipamento, Mochila, Mapa e Habilidades. O diário permanece acessível. Cada botão abre uma janela distinta na própria cena; atalhos para Loja, Missões, Bestiário, Classes e Desafios também ficam na interface do jogo. Uma janela por vez, fechar por botão ou Escape. Todas as funções atuais continuam alcançáveis por mouse e teclado.
2. HP e SP têm controles compactos imediatamente ao lado das barras. O primeiro mostra a poção vermelha e ajusta o limiar de cura; o segundo, a poção azul e o limiar de mana. O valor salvo no servidor aparece no botão; 0% desativa aquele uso. A edição cabe no Basic Info, sem formulário abaixo do mapa.
3. O hotbar usa os BMPs reais de habilidades automáticas nos três primeiros slots. Ataque básico tem somente o ícone original da espada em um slot; os demais slots podem ficar vazios. Itens e janelas têm seus próprios botões do HUD, sem letras fingindo ícones de skills.
4. Inventário, equipamento, atributos e habilidades aparecem em janelas separadas e roláveis sobre o mapa. O usuário pode inspecionar/aprender/equipar sem ser levado a uma seção abaixo da página. Em telas estreitas, a janela ocupa uma folha dentro da área do jogo e preserva a opção de fechar.
5. Ao abrir Loja, o palco mostra `prt_in` com o NPC original em frente ao balcão e a janela de compra. Fechar Loja restaura a cena anterior sem alterar a caça. Se o personagem está fora da cidade, o painel informa que é preciso voltar para comprar; não interrompe a caça automaticamente.
6. A página usa o mapa-múndi original como pano de fundo sutil, com molduras e acentos de pergaminho/metal. A cena continua visualmente dominante; controles idle permanecem próximos dela. Missões e progressão detalhada ficam nas respectivas janelas, reduzindo informação exposta continuamente.
7. Ao reivindicar uma missão, aparece um cartão breve de conclusão com nome e recompensas da missão, visível e fechável. O cartão não se repete ao carregar um save já reivindicado nem altera a concessão no servidor. Respeita movimento reduzido.

## Limites e aceite

- Arte e mapas são carregados do GRF local por `/assets/`; nenhum arquivo protegido é copiado ao repositório. Sem nova dependência de runtime ou alteração de schema do save.
- Devem permanecer acessíveis comandos idle, quests, classes, desafios, áudio, minimapa, diário e equipamento.
- Confirmar compilação TypeScript, build e inspeção visual funcional em navegador desktop/estreito. O pedido não requer criação ou execução de testes automatizados.
