# Combate e HUD clássicos no Ragnarok Old Times Idle

Data: 2026-10-03. Complementa a especificação do idle e a de mapas/BGM originais.

## Problemas observados

O Canvas percorre continuamente os três quadros idle do corpo e cabelo do Aprendiz; esses quadros incluem a animação de cabeça `doridori`. O ataque usa sempre a ação ACT 40 e desenha apenas corpo/cabeça, embora a Knife inicial esteja equipada. Herói e monstro ficam afastados por 30% da largura da cena. O servidor emite eventos de habilidades, mas a cena ignora `skill`; os danos aparecem apenas como texto genérico. A HUD divide a tela em três colunas de peso semelhante e restringe o mapa original a 333 px de altura.

## Direção aprovada pela autorização anterior

Apresentar o combate idle como uma cena de RO: sprites locais originais, ação selecionada pela arma quando houver recurso, aproximação curta no contato, efeitos de habilidades vinculados ao evento real, dígitos e emotes originais do GRF. O mapa continua sendo o cenário original do MapViewer; HUD, herói e monstros ficam em camadas acima. Preservar o motor de combate, cálculos, economia, salvamento, modo clássico e música.

### Ações e equipamento

- Fixar o primeiro quadro idle do corpo e da cabeça, seguindo o tratamento de repouso do roBrowserLegacy, em vez de animar `doridori` sem solicitação.
- Identificar o tipo de arma equipada no estado. Quando houver SPR/ACT de arma para classe e gênero, carregar e compor a arma com corpo e cabeça, usando o mesmo quadro de ação.
- Para Aprendiz com adaga, usar ação 80 no masculino e 88 no feminino, conforme WeaponAction do cliente fixado. Para outras classes/armas, usar mapeamento do cliente onde conhecido; sem recurso, conservar corpo/cabeça e informar indisponibilidade apenas se houver falha de arquivo, sem desenhar arma fictícia.
- Durante ataques físicos, o herói avança brevemente até o alcance visual do alvo e retorna; o número de dano aparece no momento de contato. Ataques mágicos permanecem à distância. Morte, erro e múltiplos golpes enfileirados continuam visíveis.

### Habilidades e efeitos

- Acrescentar metadados opcionais (`skillId`, crítico e cura efetiva) aos eventos do servidor, mantendo leitura de eventos antigos. A cena determina a apresentação a partir desses eventos, sem inventar dano ou consumo.
- Para habilidades com recurso simples no GRF, mostrar o SPR/ACT original, começando por Bênção. Para Lanças de Fogo, usar as texturas originais se o formato puder ser lido com segurança; outras magias recebem um efeito elemental distinguível e o nome da habilidade junto ao alvo, até existir suporte para os efeitos STR/3D do cliente. Não chamar esses efeitos substitutos de equivalência pixel a pixel.
- Exibir dano com os dígitos `숫자.spr` do cliente: claro no alvo, vermelho no herói, amarelo no crítico, verde na cura; mostrar `MISS` do recurso local para erro. Animar por cerca de 1,5 s em arco curto, com alternativa estática para redução de movimento.
- Sortear emotes cosméticos em intervalos moderados (18–35 s), desenhando ações do `emotion.act/.spr` local sobre o personagem. Pausar ao ocultar a aba e não competir com ataque ou morte. O sorteio não altera o RNG nem o estado persistido do jogo.

### HUD

- Tornar a cena de mapa dominante no desktop (aprox. 400–500 px de altura) e deixar personagem compacto na lateral. Caça e automação ficam junto ao palco; Equipamento e Jornada formam a faixa inferior, com Diário fácil de consultar.
- Preservar todas as ações: em particular o botão de desequipar no painel Equipamento, seleção de área, descanso, loja, abas e controles de auto poção.
- Em telas até 960 px, empilhar Personagem, Cena, Equipamento e Jornada. Até 640 px, compactar vitais e dar pelo menos 44 px de altura aos controles de caça. Nenhuma ação depende só de hover. Os valores das barras continuam textuais; teclado e rótulos permanecem acessíveis.
- Usar a linguagem de janelas do RO clássico, mas diminuir molduras repetidas e títulos redundantes. As regras novas ficam em `hud.css` após o CSS existente para evitar alterações amplas de inventário/loja.

## Limites e operação

Recursos oficiais continuam exclusivamente no `client-data/data.grf`; nenhum sprite, textura, GRF ou MP3 extraído entra no Git ou na imagem Docker. A cena precisa tolerar arquivos ausentes sem travar o jogo. A fidelidade visual é ao material local disponível; o idle não substitui o cliente MMORPG nem todos os renderizadores de efeito STR/3D. Não acrescentar nem executar testes automatizados nesta entrega, conforme instrução vigente; validar por build, inspeção do navegador e dados locais sem alterar o perfil do usuário.
