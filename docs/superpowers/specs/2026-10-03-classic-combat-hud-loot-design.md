# Combate clássico, HUD e loot no chão

## Objetivo

Corrigir a apresentação do combate do Ragnarok Old Times Idle no navegador: lanças mágicas descendo sobre o monstro, conjuração visível, personagem e arma voltados ao alvo, proporções naturais dos sprites, interface pré-renewal, dano legível e itens visíveis no chão antes da coleta automática. O servidor continua responsável por combate, sorteio e inventário.

## Referências e diagnóstico

- [Fire Bolt clássico, 0:05](https://www.youtube.com/watch?v=YQgmo6BJDHk&t=5s) e [Cold Bolt clássico, 0:01–0:03](https://www.youtube.com/watch?v=VhQK1nsR0R0&t=1s): as lanças entram de cima, com a pequena inclinação da perspectiva isométrica; o mago não lança uma faixa horizontal entre os personagens. O [guia oficial](https://renewal.playragnarok.com/gameguide/classes_skill.aspx?c=3) descreve as lanças como vindas do céu.
- [BasicInfoV0 do roBrowserLegacy pinado](https://raw.githubusercontent.com/MrAntares/roBrowserLegacy/d88a3cd4acde0582530e3fc1908532a92e9accea/src/UI/Components/BasicInfo/BasicInfoV0/BasicInfoV0.html) e [manual oficial da interface](https://ragnarokonline.gungho.jp/navi/manual/screen/game.html): mapa ocupa o centro; Basic Info, minimapa, chat e atalhos ficam em janelas compactas sobre ele. Os BMPs originais já são servidos em `/assets/data/texture/유저인터페이스/basic_interface/`.
- O efeito atual pinta `불화살1.tga` (128×64) como retângulo horizontal e começa junto com o dano. O renderer não oferece ação `SKILL`. A cena fixa tanto herói quanto monstro a 123/96 px, ampliando Poring e Fabre. O ACT da arma precisa acompanhar a direção da pose do corpo. O cliente recebe apenas eventos de loot textuais.
- A fonte de drops é o Hercules pré-renewal no commit `410b9738c049ab1825d67b36b072d837c1d0b33a`. O exportador descarta 59 entradas por falta de efeito idle. A tabela completa deve informar o sorteio; efeitos ainda não modelados podem ser coletados e vendidos. As entradas `MvpDrops` também pertencem ao loot de chefes.

## Comportamento

1. Cada evento de magia tem conjuração estacionária com pose ACT `SKILL` do personagem, glifo/círculo de cast, liberação e um ou mais impactos verticais curtos sobre o alvo. O popup de dano aparece no impacto, respeitando `prefers-reduced-motion`. Nome da habilidade aparece no cast, não se repete em cada frame. Fire/Cold Bolt usam textura original reorientada, não uma faixa esticada. Nível da habilidade via evento para reproduzir o número visual de lanças, com limite visual que evite longa fila.
2. Em batalha, herói olha para leste/direita e monstro para oeste/esquerda; corpo, cabeça e arma usam a mesma direção ACT, com fallback seguro quando alguma ação direcional falta. Ataque corpo a corpo alcança o alvo sem atravessá-lo; ataque à distância não avança.
3. A escala do mundo deriva das dimensões naturais do corpo/cabeça do herói, excluindo a arma. A mesma escala é aplicada aos monstros; só chefes muito grandes recebem limite para não ultrapassar o canvas. Os pés repousam no mesmo solo. Popups e efeitos usam a altura efetiva de cada ator. `monster.size` permanece dado de combate, nunca escala visual.
4. O servidor rola cada entrada de `Drops` e `MvpDrops` uma vez por vitória, credita o inventário uma única vez e emite eventos estruturados `kill` e `loot` com `itemId` e quantidade. A cena mostra os SPR/ACT originais do item no chão junto ao monstro, aguarda um breve intervalo e anima a coleta rumo à mochila. A interface deixa claro que o item já foi creditado. Não há clique manual ou segunda adição ao inventário.
5. HUD: mapa dominante; Basic Info compacto no canto superior esquerdo com nome, classe, HP/SP, Base/Job EXP, peso/zeny e botões clássicos que abrem seções existentes; minimapa no canto superior direito; barra de habilidades/atalhos no rodapé do mapa; diário com visual de chat; controles idle imediatamente abaixo do mapa. Manter acessíveis todas as ações atuais, indicação de conexão, navegação por teclado, responsividade e área de toque adequada no celular. Use os BMPs locais quando houver; fallback CSS caso o arquivo não carregue.
6. A fila visual comprime eventos antigos de polling/aba suspensa e limita backlog; a simulação e o inventário nunca dependem da animação. A vitória mantém o oponente até o golpe, morte e loot terminarem, mesmo se o snapshot já mostrar o próximo encontro.

## Dados e limites

- `GameEvent` permanece compatível com eventos antigos; campos novos são opcionais (`itemId`, `quantity`, `skillLevel`).
- Itens sem efeito implementado são coletáveis, mas não devem executar script Hercules desconhecido. A UI informa quando um efeito não é aplicado, sem falsificar bônus.
- Arte e BGM continuam vindas dos dados locais do cliente; o repositório não incorpora arquivos GRF. A coreografia em Canvas é uma aproximação 2D da renderização original de efeitos 3D.
- O projeto permanece local em Docker, sem novas dependências de runtime.

## Aceite

- Uma lança cai de cima sobre o alvo após o cast; herói reproduz pose de magia.
- Arma e corpo apontam para o monstro; Poring/Fabre são visualmente menores sem distorção.
- HUD lembra o layout pré-renewal e conserva todas as funções idle.
- Loot original aparece no solo, voa à mochila e já consta nela exatamente uma vez.
- Drops catalogados correspondem às entradas do Hercules para os monstros incluídos, incluindo MVP.
- TypeScript compila, imagem Docker sobe e inspeção visual do combate e layout confirma o resultado.
