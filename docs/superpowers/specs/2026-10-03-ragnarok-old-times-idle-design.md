# Ragnarok Old Times Idle — especificação da primeira versão jogável

Data: 2026-10-03. Estado: aprovada pelo usuário, com execução autônoma do plano autorizada sem novas confirmações de processo.

## Objetivo e entendimento do pedido

Criar um jogo idle de navegador com a nostalgia do Ragnarok clássico, inspirado no ciclo de caça, saque, preparação e evolução de Tibidle, Huntera e jogos Pokémon idle. O usuário delegou o planejamento e a execução e já autorizou o uso local de Docker, Hercules Pre-Renewal, roBrowserLegacy e recursos do cliente oficial instalados neste worktree.

O resultado esperado é abrir uma tela própria de jogo, escolher onde caçar, ver o personagem combater automaticamente, receber EXP e itens, melhorar a build e retornar depois de fechar a aba com progresso persistido. Uma página demonstrativa com números simulados apenas no navegador não atende ao pedido.

Decisões propostas para esta entrega: experiência local e solo, interface em português, nome inicial `djow`, uma única economia de zeny e nenhum pagamento. O personagem idle terá progresso próprio. O personagem `djow` do Ragnarok tradicional e sua conta Admin continuam acessíveis no modo clássico.

## Produto e escopo da versão 0.1

O jogador começa como Aprendiz, prepara sua build e percorre áreas reconhecíveis de Rune-Midgard. As decisões são a área de caça, atributos, classe, habilidades, equipamentos, cartas e uso de consumíveis. Ataques e coleta acontecem automaticamente.

A entrega inclui:

- Caça automática com HP/SP, alvo atual, animações, dano, habilidades, loot, EXP base e EXP de classe.
- Cidade para descansar, comprar consumíveis, vender loot, equipar itens, refinar e distribuir atributos.
- Dez áreas de caça e 25 monstros clássicos, com drops suportados escolhidos explicitamente do catálogo Pre-Renewal. Campos de Prontera, esgotos, caverna de Payon, Byalan, Vila dos Orcs, Pirâmide, calabouço de Geffen e Glast Heim formam o percurso.
- Aprendiz e as seis primeiras classes: Espadachim, Mago, Arqueiro, Noviço, Mercador e Gatuno. Mudança na cidade a partir de Job 10.
- Segundas classes das seis famílias, com escolha a partir de Job 40 e limite de Job 50. A rota do Arqueiro oferece Caçador e Bardo/Odalisca conforme o avatar escolhido. Cada classe recebe um conjunto pequeno de habilidades adequadas ao idle; não promete toda a árvore de habilidades do cliente tradicional.
- Base até 99. Renascimento ao atingir Base 99 e Job 50, reiniciando os níveis e habilidades, preservando a mochila e liberando a variante transcendental da família, com Job até 70. Bônus e curvas vêm das tabelas disponíveis; efeitos adicionais usados para balancear o idle ficam explicitamente identificados como adaptações.
- Mochila com itens empilháveis e equipamentos individuais; sete posições iniciais de equipamento (arma, armadura, escudo, cabeça, capa, calçado e acessório), refinamento até +7 e um conjunto de oito cartas com efeitos suportados.
- Auto poção configurável por limite de HP/SP, venda de loot comum e proteção dos itens equipados, refinados, com cartas ou marcados como favoritos.
- Missões de introdução e marcos de progressão, um bestiário com abates e coleção de cartas, e três desafios: Mastering, Angeling e Besouro-Ladrão Dourado. Os desafios têm acesso por progressão, duração máxima e recompensa concedida uma vez por conclusão.
- Progresso offline por até 12 horas desde o último contato do navegador, resumo de retorno, salvamento no MariaDB e recuperação após reiniciar os serviços.
- Interface responsiva para computador e celular. Música é opcional e só começa depois de uma ação do jogador.

Todos os controles apresentados devem funcionar. Conteúdo posterior não aparece como botão que leva a uma tela vazia.

## Alternativas técnicas avaliadas

### A. Serviço idle autoritativo com catálogo do Hercules — recomendado

Um serviço novo calcula o jogo idle, importa dados do Hercules e persiste o estado em tabelas próprias no MariaDB existente. Reutiliza os recursos locais do cliente para sprites e ícones. Dá controle sobre offline, ritmo e interface e permite entregar o ciclo completo sem alterar o núcleo do emulador. O combate é uma adaptação idle, não uma execução invisível do map-server.

### B. Plugin C e API nativa do Hercules

O Hercules instalado já inclui `api-server` e o plugin de exemplo `httpsample`, que encaminha requisições HTTP aos servidores do jogo. É uma base real para compartilhar personagens futuramente. Porém, o exemplo de mapa depende de um personagem online; caça desconectada, autenticação e sincronização de inventário exigem trabalho adicional no emulador. Essa integração merece uma etapa própria quando o ciclo idle estiver validado.

### C. Cliente automático conectado por pacotes

Mantém combate dentro do Hercules, mas exige um cliente conectado por jogador, incluindo login, seleção, navegação, busca de alvos, reconexão e compatibilidade de pacotes. Isso aumenta a dependência do cliente tradicional e dificulta o progresso offline.

A opção A atende melhor ao pedido nesta entrega. Ela preserva uma fronteira explícita entre os dois jogos e permite uma ponte pelo plugin/API posteriormente. Não se escreverá diretamente em `char` ou `inventory`: o estado em memória e os saves do Hercules poderiam sobrescrever essas alterações.

## Arquitetura

```text
Navegador :3339
  ├─ interface idle e cena Canvas2D
  ├─ comandos HTTP ──> idle-game ──> MariaDB / tabelas idle_*
  └─ /assets/* ──────> proxy do idle-game ──> asset-service / GRF local

Catálogo versionado do idle
  └─ exportador ──> db/pre-re do mesmo commit do Hercules

Modo clássico :3338
  └─ roBrowserLegacy ──> proxy WebSocket ──> Hercules ──> tabelas clássicas
```

O novo serviço `idle-game` é adicionado ao Compose e publica somente `127.0.0.1:3339`. Serve frontend e API na mesma origem. Usa React/TypeScript para a interface e Node.js/TypeScript para API, simulação e acesso ao MariaDB. O motor de jogo é uma biblioteca sem dependência de HTTP, DOM ou SQL; repositório, catálogo e apresentação têm interfaces separadas.

O serviço pode reiniciar sem perder progresso. Sua migração cria somente tabelas com prefixo `idle_`. A conta MariaDB de desenvolvimento já existente é suficiente. O perfil solo local dispensa cadastro e credenciais de jogador na versão 0.1; esse modo fica limitado a localhost. Publicação e múltiplos jogadores exigem uma futura camada de autenticação e operação.

## Conteúdo e procedência

Hercules está fixado no commit `410b9738c049ab1825d67b36b072d837c1d0b33a`. O exportador usa esse mesmo commit e produz um catálogo compacto e determinístico contendo IDs originais, nomes, nível, HP, ataque, defesa, atributos, EXP, drops, preços, requisitos de equipamento e curvas de nível. Um manifesto registra commit, arquivos de origem e hash do resultado.

Fontes confirmadas dentro de `/opt/hercules`:

| Fonte | Uso |
| --- | --- |
| `db/pre-re/mob_db.conf` | Monstros, EXP e drops |
| `db/pre-re/item_db.conf` | Itens, preços, ataque, defesa, slots e requisitos |
| `db/pre-re/exp_group_db.conf` | Curvas de EXP e limites de nível |
| `db/pre-re/job_db.conf` | Famílias de classe, HP/SP e velocidade |
| `db/pre-re/skill_db.conf` e `skill_tree.conf` | Referência das habilidades selecionadas |
| `db/pre-re/attr_fix.conf` e `size_fix.txt` | Referência elemental e de tamanho |

Drops usam escala de 1 a 10000; por exemplo, 7000 corresponde a 70% e 1 a 0,01%. O importador não executa os blocos `Script` dos itens. Efeitos das cartas e habilidades selecionadas são traduzidos para operações suportadas e revisáveis pelo motor.

O catálogo atual contém também conteúdo posterior ao período clássico. Por isso a seleção é explícita por ID/nome, sem importar indiscriminadamente todos os monstros e classes.

O pacote usa os seguintes mapas e criaturas, confirmados nos dados e spawns Pre-Renewal. O nível de acesso é uma decisão de balanceamento do idle, não o nível histórico das criaturas:

| Área / mapa | Base mínima | Criaturas / IDs Hercules |
| --- | --- | --- |
| Sul de Prontera / `prt_fild08` | 1 | Poring 1002, Lunatic 1063, Drops 1113 |
| Esgotos / `prt_sewb1` | 5 | Thief Bug 1051, Tarou 1175 |
| Campos dos Rockers / `prt_fild04` | 8 | Rocker 1052, Creamy 1018 |
| Bosque de Prontera / `prt_fild03` | 12 | Poporing 1031, Smokie 1056, Yoyo 1057 |
| Caverna de Payon / `pay_dun00` | 15 | Skeleton 1076, Zombie 1015 |
| Byalan / `iz_dun01` | 20 | Kukre 1070, Vadon 1066, Marina 1141 |
| Vila dos Orcs / `gef_fild10` | 25 | Orc Warrior 1023, Orc Lady 1273 |
| Pirâmide / `moc_pryd02` | 35 | Soldier Skeleton 1028, Archer Skeleton 1016, Mummy 1041 |
| Calabouço de Geffen / `gef_dun02` | 50 | Deviruchi 1109, Nightmare 1061 |
| Cavalaria de Glast Heim / `gl_knt01` | 65 | Raydric 1163, Khalitzburg 1132, Abysmal Knight 1219 |

Desafios: Mastering 1090 a partir de Base 15; Angeling 1096 a partir de Base 40; Besouro-Ladrão Dourado 1086 a partir de Base 70. Há um intervalo de uma hora por desafio concluído e limite de dez minutos por combate; derrota ou desistência não concede o prêmio de conclusão.

As oito cartas iniciais são Poring, Drops, Lunatic, Thief Bug, Tarou, Rocker, Yoyo e Raydric. O catálogo ativo inclui materiais, consumíveis, equipamentos e cartas com efeitos suportados; preserva ID e chance original dos drops selecionados. O manifesto do exportador lista os drops excluídos por falta de efeito suportado. Nenhum item será anunciado como equipável sem ter seu efeito implementado.

### Classes e habilidades suportadas

O Aprendiz começa com faca, camiseta, 200 zeny, 20 poções vermelhas, cinco poções azuis e 20 pontos de atributo. Recebe um ponto de habilidade por nível de Job conquistado. Sua habilidade inicial é Primeiros Socorros.

| Família / armas | Habilidades de primeira classe | Ramos de segunda classe / habilidades adicionais | Variante transcendental |
| --- | --- | --- | --- |
| Espadachim / espada, adaga, lança | Golpe Fulminante, Impacto Explosivo, Recuperação de HP | Cavaleiro: Perfurar, Brandir Lança; Templário: Crux Divinum, Escudo Bumerangue | Lorde ou Paladino |
| Mago / cajado, adaga | Lanças de Fogo, Lanças de Gelo, Relâmpago | Bruxo: Trovão de Júpiter, Nevasca; Sábio: Desejo Arcano, Encantar com Chama | Arquimago ou Professor |
| Arqueiro / arco; instrumentos ou chicotes no ramo correspondente | Rajada de Flechas, Chuva de Flechas, Olhos de Coruja | Caçador: Ataque Aéreo, Flagelo das Feras; Bardo/Odalisca: Flecha Melódica, buff de velocidade de ataque | Atirador, Menestrel ou Cigana |
| Noviço / maça, cajado | Curar, Bênção, Luz Divina | Sacerdote: Kyrie Eleison, Santuário; Monge: Combo Triplo, Investigar | Sumo Sacerdote ou Mestre |
| Mercador / machado, maça, adaga | Mammonita, Grito de Guerra, Cavalo de Pau | Ferreiro: Adrenalina Pura, Manejo Perfeito; Alquimista: Terror Ácido, Arremessar Poção | Mestre Ferreiro ou Criador |
| Gatuno / adaga; katar no ramo correspondente | Ataque Duplo, Envenenar, Perícia em Esquiva | Mercenário: Lâminas Destruidoras, Encantar com Veneno; Arruaceiro: Ataque Surpresa, Furto de Moedas | Algoz ou Desordeiro |

As tabelas de conteúdo definem os IDs, custos, níveis, intervalos e modificadores de cada habilidade; a importação identifica sua fonte e as adaptações. Habilidades ativas podem ocupar três posições de prioridade; passivas são aplicadas quando aprendidas. O catálogo da loja e dos drops deve oferecer armas elegíveis para cada ramo, incluindo lança, instrumento, chicote e katar. Não há consumo de munição no primeiro pacote; habilidades que gastam zeny, poções ou reagentes exibem e consomem os custos declarados.

O avatar masculino ou feminino é escolhido na primeira visita e determina Bardo ou Odalisca. Mudança de primeira/segunda classe acontece somente na cidade; mantém pontos de habilidade não gastos e habilidades já aprendidas, reinicia Job em 1 e não concede pontos duplicados. A segunda classe conserva a família de origem.

Renascimento custa 50.000 zeny e exige uma segunda classe em Base 99 / Job 50. Retorna a Alto Aprendiz Base 1 / Job 1, com os atributos e pontos iniciais; conserva o histórico de missões, bestiário e todos os itens. A família e o ramo já escolhidos são preservados. Alto Aprendiz muda para a primeira classe de sua família em Job 10 e para o ramo transcendental correspondente em Job 40; este tem limite de Job 70. As variantes transcendentais usam curvas próprias e o conjunto de habilidades suportadas da família, sem anunciar habilidades adicionais que ainda não existam no motor.

O perfil mantém EXP base/classe 4x e drop 1x como configuração do jogo. Curvas e dados originais continuam identificáveis; fórmulas de batalha, seleção de encontros, missões e ritmo são adaptações próprias do idle.

## Simulação, tempo e persistência

O servidor é a autoridade para relógio, aleatoriedade, dano, EXP, zeny, drops, inventário e requisitos. O navegador envia intenções como iniciar caça, parar, equipar, vender, refinar, comprar, atribuir pontos ou alterar a rotação. Não envia uma quantidade de EXP ou loot para ser aceita.

O estado inclui níveis, EXP, pontos, classe, atributos, equipamento, mochila, habilidades, configuração de poções, área, batalha atual, cursor de aleatoriedade, cursor de simulação e último contato. A aleatoriedade tem semente/cursor persistidos, para que segmentar o tempo em várias requisições produza o mesmo resultado.

A simulação usa passos inteiros de um segundo e avança até o horário informado pelo relógio do servidor. Processa em memória o tempo acumulado, preservando a fração de segundo para a próxima reconciliação. Um agendador do serviço avança caçadas ativas; toda leitura de sessão ou comando também reconcilia o tempo anterior primeiro.

Cada reconciliação e comando ocorre sob bloqueio da linha do perfil em uma transação. Estado, recompensas e cursor são gravados juntos. Revisão monotônica e identificador de comando impedem duas abas e repetição de uma requisição de conceder a mesma compra, venda ou recompensa duas vezes.

O limite offline é contado desde o último contato do navegador, não desde o último tick do servidor. Ao reconectar, primeiro se processa o intervalo anterior limitado a 12 horas; somente depois se registra o novo contato. Reiniciar Docker usa o mesmo procedimento. Ao esgotar esse limite, a caça fica pausada e o jogador recebe o resumo e um controle para continuar.

O resumo registra tempo processado, EXP, níveis, zeny, abates, itens, poções e derrotas desde a última visita. Ele pode ser dispensado sem conceder recompensas outra vez: as recompensas já fazem parte do estado.

## Regras de batalha e economia

Fórmulas de referência da versão 0.1: HP e SP partem das curvas exportadas da classe, com bônus de VIT/INT e equipamento. Ataque físico corpo a corpo usa `STR + floor(STR/10)^2 + floor(DEX/5) + floor(LUK/5)`, somado ao ataque da arma. Para arcos, instrumentos e chicotes, DEX ocupa o papel principal e STR o secundário. Ataque mágico usa uma faixa derivada de INT; precisão usa Base + DEX e esquiva Base + AGI. A chance de acerto é limitada entre 5% e 95%. Defesa reduz dano por percentual e atributo defensivo, sem permitir dano negativo. AGI/DEX reduzem o intervalo de ataque, limitado a pelo menos um segundo. Elemento, tamanho, crítico e cartas são modificadores explícitos. Os valores finais e as faixas das habilidades ficam em tabelas versionadas, sujeitos aos testes do motor e ao ajuste de ritmo na verificação jogável.

- A build deriva de STR, AGI, VIT, INT, DEX e LUK, classe, nível, equipamento, cartas e habilidades.
- O motor calcula HP/SP máximos, ataque físico, ataque mágico, defesa, precisão, esquiva e intervalo de ataque. As fórmulas suportadas são documentadas e testadas; não se anuncia reprodução integral do cálculo C do Hercules.
- A rotação tem prioridade, custo de SP e condição de uso. Ataque básico sempre oferece uma saída quando nenhuma habilidade pode ser usada.
- Auto poção consome uma unidade real da mochila quando o limite configurado é atingido e respeita intervalo de uso. Sem poções, o personagem continua com os recursos existentes.
- Derrota encerra o encontro e retorna à cidade. O primeiro pacote evita perda de itens; após recuperação o jogador decide retomar a área ou escolher outra. A configuração pode permitir retorno automático para caçadas seguras.
- Cada abate concede EXP e avalia os drops somente uma vez. Zeny vem de recompensas e venda; não é criado por uma animação no cliente.
- Mudanças de classe, renascimento e distribuição de pontos validam todos os requisitos no servidor e consomem pontos no mesmo salvamento.
- A segunda classe reinicia Job e mantém as habilidades da primeira classe. Renascimento reinicia níveis, atributos distribuídos e habilidades; preserva todos os itens e devolve os equipamentos à mochila, para serem utilizados novamente quando seus requisitos forem cumpridos.
- Equipar verifica propriedade, classe, nível, posição e número de slots. Item equipado não pode ser vendido inadvertidamente.
- Cada tentativa de refinamento custa `500 × nível pretendido` zeny e uma unidade de Oridecon para armas ou Elunium para as demais posições elegíveis. +1 a +4 é seguro; as chances de chegar a +5, +6 e +7 são 60%, 40% e 20%. Falha consome os custos e mantém exatamente o refinamento anterior: tentar +6 com um item +5 e falhar deixa o item +5. Esse comportamento é apresentado como regra do idle. Materiais de refinamento podem ser obtidos em drops selecionados e na loja.
- Cartas aplicam somente efeitos suportados, respeitam o slot e são consumidas quando inseridas. A interface apresenta o efeito antes da confirmação.
- Missões registram recompensa resgatada permanentemente. Desafios persistem um ID único por tentativa; a vitória concede EXP, drops e recompensa dessa tentativa uma vez e inicia o intervalo de uma hora. Conquistas de primeira vitória são permanentes e concedidas somente uma vez; recompensas de novas tentativas continuam disponíveis após o intervalo.

## Interface e identidade visual

A tela deve transmitir a lembrança de preparar uma build e ir aos campos de Prontera. Usa painéis compactos em pergaminho claro, molduras azuis discretas, acentos de latão, barras verdes/azuis e sprites pixelados legíveis. A composição é uma interface de jogo, não uma landing page.

No computador, a faixa superior reúne nome, classe, Base/Job e zeny. A coluna esquerda mostra personagem, atributos e equipamento; o centro tem cena de batalha, área e controles de caça; a direita traz resultados recentes e diário. A parte inferior alterna mochila, habilidades, mapa, missões e bestiário. No celular, a cena e o controle de caça vêm primeiro, com navegação persistente para esses mesmos painéis.

A cena Canvas2D usa sprites SPR e ações ACT dos GRFs locais, com animações de espera, ataque, dano e derrota. A composição do cenário é própria e leve; não precisa carregar o renderizador de mapas completo do roBrowser. Ícones de itens usam a correspondência de ID para `identifiedResourceName` disponível no cliente.

O mapeamento de monstros usa o ID e a tabela de recursos do cliente, pois o `SpriteName` do Hercules nem sempre é o nome do arquivo: Soldier Skeleton usa `skel_soldier` e Archer Skeleton usa `skel_archer`. Os 50 arquivos SPR/ACT do pacote de 25 monstros e os SPRs dos três desafios foram verificados no serviço local.

Os recursos são buscados pelo proxy `/assets/`, a partir do `asset-service` existente. São confirmados os arquivos de Poring, Lunatic, Fabre, Rocker, Mandragora, Poporing, Drops, Yoyo, Smokie e Savage, além de `System/itemInfo.lub`. GRFs, sprites extraídos e música não entram no Git ou nas imagens do projeto.

Código de decoder e dados derivados mantêm as atribuições, cabeçalhos e arquivos de licença dos projetos de origem. A importação registra o que é proveniente do Hercules e o que foi definido para o idle.

Ausência de recurso não deve travar a tela em 100%: o jogo mostra a criatura e seus valores com uma representação de reserva e um aviso recuperável. Falha de banco/API mostra estado de conexão e opção de tentar novamente, preservando a última apresentação disponível.

## Limites desta entrega

- Um perfil local, com economia própria e independente da conta clássica.
- Sem chat, guildas, PvP, negociação entre jogadores, monetização ou publicação na internet.
- Sem importação automática de progresso do `djow` clássico.
- Sem prometer todas as habilidades, cidades, quests e cartas do Ragnarok tradicional.
- Sem executar scripts dos itens ou redistribuir o cliente oficial.

Esses limites não impedem o ciclo completo de uma primeira versão jogável. A ponte nativa com Hercules e recursos sociais ficam como etapas posteriores, após validação do jogo.

## Critérios de aceite e verificação

1. `docker compose up --build -d` inicia a stack ampliada, mantendo o modo clássico acessível e o MariaDB saudável.
2. Abrir `http://localhost:3339/` apresenta o perfil idle e permite iniciar uma caça com sprites locais, sem abrir o cliente tradicional.
3. Ataques, EXP, drops e consumo de poções são calculados no servidor; reduzir FPS, ocultar a aba ou abrir uma segunda aba não acelera o jogo.
4. Parar, trocar área, voltar à cidade, comprar, vender, equipar, refinar, inserir carta, configurar habilidade e distribuir atributos mudam o estado persistido e respeitam os requisitos.
5. Fechar a aba e voltar produz progresso e resumo. Reiniciar o serviço preserva o perfil. Reconciliar o mesmo intervalo novamente não duplica recompensas.
6. O motor é verificado com relógio e aleatoriedade controlados para comparar execução contínua e offline, limite de 12 horas, mudança de classe, caps, derrota, transações de inventário, repetição de comando e concorrência.
7. A evolução de classe e o renascimento respeitam os marcos propostos, e o pacote de áreas/equipamentos permite avançar sem depender de uma funcionalidade ausente.
8. A interface é conferida no browser em larguras de computador e celular; botões, estados vazios, erros e retorno offline são percorridos.
9. README registra URLs, startup, diferença entre perfis clássico/idle, origem do conteúdo e limites da versão. Código, catálogo reproduzível e documentação são salvos no branch do worktree.

## Referências consultadas

- [Ciclo de jogo do Tibidle](https://tibidle.com/wiki/como-o-tibidle-funciona)
- [Caçada com o jogo fechado no Tibidle](https://tibidle.com/wiki/a-cacada-com-o-jogo-fechado)
- [PokéClicker — projeto oficial](https://github.com/pokeclicker/pokeclicker)
- [Huntera — site oficial](https://huntera.com.br) (a consulta automatizada retornou HTTP 403; seus mecanismos não foram assumidos a partir de descrições de terceiros)
- [Hercules — catálogo de monstros no commit instalado](https://raw.githubusercontent.com/HerculesWS/Hercules/410b9738c049ab1825d67b36b072d837c1d0b33a/db/pre-re/mob_db.conf)
- [Hercules — plugin HTTP de exemplo](https://raw.githubusercontent.com/HerculesWS/Hercules/410b9738c049ab1825d67b36b072d837c1d0b33a/src/plugins/httpsample/httpsample.c)
- [roBrowserLegacy — renderizador de sprites](https://github.com/MrAntares/roBrowserLegacy/blob/d88a3cd4acde0582530e3fc1908532a92e9accea/src/Renderer/SpriteRenderer.js)
