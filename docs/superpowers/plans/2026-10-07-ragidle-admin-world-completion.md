# RagIDLE: painel administrativo e expansão do mundo

> Plano para dar continuidade ao objetivo aprovado de tornar a experiência idle jogável, preservar o combate existente, oferecer novas áreas clássicas e permitir administração segura do perfil.

## Escopo

- Painel de administração separado dos comandos públicos, protegido por uma chave configurada somente no servidor.
- Operações administrativas: conceder níveis Base, alterar classe, conceder zeny e adicionar itens existentes no catálogo.
- Expansão inicial de dez para quatorze áreas usando mapas, monstros e BGM existentes no cliente/catálogo.
- Preservar a simulação do servidor, perfil MariaDB, histórico e equipamentos; não executar wipe.
- Verificar fluidez do ciclo de caça e da apresentação de combate sem trocar o motor autoritativo.

## Implementação

1. `idle/server/admin.ts`: autenticação por chave, cookie HttpOnly/SameSite, limitação de tentativas, validação das ações e mutações atômicas via repositório.
2. `idle/server/app.ts`, `idle/server/index.ts`, `compose.yaml`, `compose.override.yaml`, `compose.production.yaml`, `.env.example`, `.env.production.example`: ligar as rotas e encaminhar a variável `RAGIDLE_ADMIN_TOKEN` sem expor seu valor ao navegador.
3. `idle/web/panels/Admin.tsx`, `idle/web/admin.css`, `idle/web/App.tsx`: entrada do painel, autenticação e formulários no mesmo sistema de janelas do jogo.
4. `idle/content/rules.json`, `idle/content/catalog.json`, `idle/content/source-manifest.json`, `idle/server/catalog.ts`, `idle/web/components/OriginalMap.tsx`: acrescentar quatro mapas clássicos e manter catálogo, BGM, allowlist e validação consistentes.
5. `idle/tests/content.test.ts`: atualizar somente expectativas existentes de quantidade de áreas/monstros para o novo catálogo.
6. `README.md` e `README.en.md`: documentar configuração segura do segredo, ações oferecidas e limites.

## Verificação

- `pnpm build` em `idle` para validar a aplicação e a API.
- Fazer revisão de diff e conferir que o catálogo aponta para mapas e músicas conhecidos, que comandos normais não aceitam ações de GM e que as rotas administrativas exigem sessão autenticada.
- Verificar o estado e o health endpoint antes de considerar uma publicação.

## Conferência da meta em 2026-10-08

- Publicação confirmada de 29 áreas; administração autenticada de Base, alteração de classe, zeny e itens validada em imagem isolada.
- Simulação administrativa liquida o tempo decorrido sem consumir o resumo offline. Proxy recebe confiança apenas por IP explícito do peer imediato.
- Ataques recebem relógio de apresentação próprio para preservar o início, o impacto e a morte, sem alterar ASPD. A posição de contato usa a trajetória conectada; testes cobrem chegada entre snapshots e terreno desconectado.
- Assets obrigatórios auditados em 204 combinações válidas de classe/sexo/arma, oito direções. Essa verificação estrutural não equivale a observação visual de todas as classes.
- Publicação atual `vps-20261008-sol61-combat2-verified`: 164 testes aprovados, 7 testes opt-in de banco ignorados, typecheck/build aprovados, arquivos da imagem e bundle público com hashes conferidos.

### Controle de nível Job que ainda faltava

A operação de trocar classe não substitui a concessão de níveis de classe mencionada na meta. Acrescentar `jobLevels`, com 1 a 20 níveis por pedido e os limites/curvas Job do catálogo. Reutilizar a progressão normal para os pontos de habilidades; preservar Base, equipamentos, inventário, sexo e classe atual. A operação mantém a transação, a liquidação da simulação, a proteção de sessão e os recibos idempotentes existentes.

- API e painel: concessão de níveis Job separada de alteração da classe.
- Testes: pontos de habilidade, EXP/nível máximo, validação e repetição de recibo nos caminhos de transação existentes.
- Verificação/publicação: testes administrativos focados, suite completa, typecheck/build, canário isolado e conferência do serviço público; nenhum grant em personagens reais para validar.

Entregue em `vps-20261008-sol61-adminjob`: 36/36 testes administrativos e 182 testes da suíte aprovados (7 testes opt-in de banco ignorados), typecheck/build aprovados, canário com cinco operações, serviço saudável, hashes completos da imagem e bundle público conferidos.

### Cobertura solo pendente

A auditoria confirmou habilidades solo ainda indisponíveis. Próximos pacotes: Gank/Strip Shield; Enchant Poison; Hindsight/Double Casting/Memorize; armadilhas de controle; Pneuma/Defender/Endure; Identify e suprimento/efeitos de EDP. Preservar regras do commit Hercules fixado, testar cada mecânica antes de marcar a habilidade suportada e manter hashes do catálogo/manifesto consistentes. Essas pendências impedem afirmar cobertura completa das habilidades clássicas.

### Pacote solo inicial

1. Testar e executar Gank antes do dano de ataques normais bem sucedidos, reutilizando Furto sem custo extra; incluir a remoção de escudo na categoria aditiva de redução de DEF do Hercules.
2. Testar Encantar com Veneno como encantamento de arma com chance de envenenamento em ataques normais, mantendo a resistência e a duração do monstro e a substituição de outros encantamentos.
3. Acrescentar Identificar por habilidade na mochila, mediante aprendizado/classe e pagamento de SP. Manter a Lupa como opção e excluir a habilidade manual da rotação automática.
4. Cobrir os pontos de integração no combate, regenerar o catálogo a partir das fontes com hashes conferidos e fazer a suíte completa, typecheck/build e revisão antes da publicação.
5. Publicar preservando os perfis e conferir imagem, serviço e bundle público, usando o mesmo procedimento com backup e manifesto único.

Pacote entregue em `vps-20261008-sol61-solo1`: Gank, remoção de escudo, Encantar com Veneno e Identificar disponíveis no catálogo (186 habilidades suportadas). Os oito testes de integração verificam também Double/Triple Attack, ataque fatal, custo de SP, substituição de encantamentos, duração primária de 165 segundos no nível 10 e exclusão de habilidades manuais da rotação. Suíte: 223 aprovados, 7 testes opt-in de banco ignorados; typecheck/build aprovados. Canários isolados administrativos e solo, hashes dos 35 arquivos da imagem e bundle público conferidos. A observação online registrou o ataque desde 6 ms até 424 ms de uma animação de 439 ms, com a morte pendente antes do impacto. A meta permanece ativa para os demais mecanismos solo pendentes.

### Pacote de conjuração e defesa

1. Hindsight exige escolha explícita de uma magia aprendida permitida pelo menu do Hercules. Persistir essa escolha com comando validado e mostrar o seletor na própria janela de habilidades. O encantamento ativo mantém a escolha feita ao ativá-lo até ser conjurado novamente.
2. Double Casting agenda a repetição das Lanças com chance e atraso originais, sem cobrar novamente ou gerar repetição recursiva. Hindsight preserva o ataque básico e usa efeitos com movimento de ator desativado.
3. Memorize inicia cinco cargas de redução de conjuração; consumir somente quando uma conjuração elegível realmente começa, preservando o comportamento após interrupção e reconexão.
4. Pneuma permanece no ponto de solo escolhido, protege apenas dentro do grupo de células e não acompanha o personagem. Defender aplica a redução correta aos ataques físicos à distância, a penalidade de ASPD e a velocidade de caminhada. Endure mantém MDEF e o contador de golpes do status original sem cancelar a conjuração como efeito adicional inventado.
5. Adicionar testes de integração do relógio/custos/expiração/movimento e fonte, habilitar apenas mecanismos executados, verificar suíte/build e publicar com os mesmos backups e hashes.

Pacote entregue em `vps-20261008-sol61-casting1`: Desejo Arcano, Conjuração Dupla, Memorize, Pneuma, Vigor e Defender executados (192 habilidades suportadas). Seleção explícita de magia, repetições sem custo/recursão, cinco cargas consumidas no início, campos fixos com colisão e grupos independentes, limpeza ao trocar de mapa, redução de dano/ASPD/velocidade e cancelamento manual de Defender. O review corrigiu também a repetição de Lanças fora do alcance inicial, o custo/RNG de procs em golpes fatais e cargas órfãs sem buff ativo.

Verificação final: 262 testes aprovados, 7 testes opt-in de banco ignorados; typecheck/build e diff check aprovados. Canários de imagem isolados verificaram cinco operações administrativas, o pacote solo anterior e as seis novas habilidades. Os 37 hashes foram conferidos na imagem e no contêiner ativo; serviço saudável, HTTPS 200 e bundle público idêntico ao build. Perfis preservados: djow Base 55/Job 39 em caça. Observação pública registrou 18 amostras do ataque de 439 ms, desde 27 ms com morte pendente até 426 ms após o impacto, renderização nativa e zero atores de fallback. Nenhum erro/aviso no console. A meta permanece ativa para os mecanismos solo que ainda faltam.

### Pacote de armadilhas de controle do Caçador

1. Auditar colocação, célula de disparo, chance, duração e resistência de Skid Trap, Ankle Snare, Sandman e Flasher nas fontes Hercules fixadas.
2. Acrescentar unidades persistentes no chão e acionar quando monstros realmente entram na área. Separar imobilização de caminhada e bloqueio de ataques; expirar e limpar ao mudar de mapa.
3. Mostrar as armadilhas no cenário até seu disparo/expiração; aplicar custo e animação apenas na colocação, sem repetir recursos ao disparar.
4. Escrever testes de regras e integração antes da implementação, conferir continuidade do relógio de combate, regenerar catálogo e habilitar apenas as habilidades executadas.
5. Revisar, verificar suite/typecheck/build, publicar com backup/hash e conferir o serviço e o impacto dos ataques novamente.

Ruling: execução continua com tarefas auxiliares independentes no modelo 6.1 Sol solicitado, mantendo encontros, tipos e exportação sob um único integrador. Publicação e testes permanecem autorizados; nenhum perfil real será modificado para canários.

Pacote publicado em `vps-20261008-sol61-traps1`: Skid Trap, Ankle Snare, Sandman e Flasher disponíveis (196 habilidades suportadas / 152 indisponíveis). Unidades fixas no chão, timer de um segundo, custo apenas na colocação, estados usados/capturados, resistência, duração e recuo pela direção retida. Armadilhas não usadas devolvem uma unidade pelo caminho de loot visível/coleta automática do Idle. Item 1065 à venda por 100 zeny; Flasher mantém custo de duas unidades.

Ruling: a geometria autoritativa permanece nas células normalizadas do cenário. Colisão com paredes GAT e flags noknockback de mapas não são simuladas neste pacote; essa adaptação está no manifesto, sem alegar equivalência integral ao servidor RO. As minas de dano anteriores não foram convertidas neste pacote.

Review: corrigida a direção de Skid contra inimigo parado/preso. Inspeção visual encontrou e corrigiu transcrição do diretório coreano do sprite; o caminho correto é `data/sprite/이팩트/기본트랩.act/.spr`. Recursos públicos 200 (ACT788 / SPR1402 bytes); cena isolada mostrou cinco unidades nativas, zero atores de fallback e console sem erros. O carregador tem duas tentativas adicionais limitadas e remove falhas do cache.

Verificação: 287 testes aprovados, 7 testes optativos de banco ignorados; typecheck/build/diff check aprovados. Canários isolados: quatro armadilhas, seis habilidades de conjuração/defesa, quatro mecanismos solo anteriores e cinco operações administrativas. Os 38 hashes foram conferidos na imagem e contêiner ativo; serviço saudável e HTTPS200. Bundle público `index-CcBPlJqT.js` com hash idêntico ao build. Perfil djow preservado Base55/Job39, em caça. Observação final do ataque registrada no ledger privado da publicação. Meta ativa para os demais mecanismos solo pendentes.

Observação pública final deste pacote: 19 amostras do ataque, dos 26 aos 436 ms de um movimento de 439 ms. Oito amostras antes do impacto mantiveram a morte pendente; renderização do jogador nativa, zero atores de fallback e nenhum aviso/erro de console. Isso verifica a apresentação observada, sem equivaler a benchmark de FPS ou cobertura visual de todas as classes.

### Pacote de estados solo e revisão do contato

1. Implementar Corpo Fechado, Frenesi e Encantar com Veneno Mortal a partir dos arquivos Hercules fixados: atributos, custos, bloqueios, timers e efeitos no dano. Fornecer Garrafa de Veneno pela loja como adaptação explícita do Idle.
2. Testar ativação, expiração, recursos, ataques permitidos, recuperação, persistência e veneno mortal antes de habilitar as três habilidades no catálogo.
3. A investigação de fluidez reproduziu duas ações do mesmo ator separadas por 439 ms que chegam em respostas separadas por 250 ms: o início deslocado da segunda suprime o final da primeira. Em um lote contendo dois alvos, o golpe fatal anterior perde sua animação. Substituir a seleção exclusiva da última ação por uma fila visual curta, preservando tempos de origem e sincronizando impacto/morte, sem repetir minutos de eventos offline.
4. Acrescentar regressões para esses dois casos, prioridade sobre cast atual e limite de replay; revisar a integração completa, rodar suite/typecheck/build e publicar com backup, hashes e canários isolados.

Ruling: recuperação bloqueada após Frenesi dura 300 segundos nesta fonte Hercules (SkillData1), e não 10 segundos; 10 é o nível do status de bloqueio. O timer de drenagem usa 15 segundos de SkillData2. Recursos e danos são autoritativos; a fila limita somente a apresentação no navegador.

Pacote publicado em `vps-20261008-sol61-stances1`: Corpo Fechado, Frenesi e Encantar com Veneno Mortal disponíveis (199 habilidades suportadas / 149 indisponíveis). Custos, defesas, ASPD, caminhada, drenagem e bloqueios seguem as fontes fixadas. Garrafa de Veneno é um reagente vendido por 5.000 zeny; sua bebida e fabricação não foram simuladas. Após Frenesi, somente recuperação natural é bloqueada: passivas de recuperação continuam. Migração de um estado antigo conserva o relógio original e não cura nem renova a duração.

Verificação: 329 testes aprovados, sete testes optativos de banco ignorados; typecheck/build aprovados, revisão independente sem bloqueadores. Canários de imagem verificaram as três posturas e os pacotes anteriores, incluindo cinco operações administrativas. Todos os 41 hashes conferidos na imagem e no contêiner saudável; HTTPS e bundle público conferidos. Perfis preservados, djow Base56/Job40 em caça.

A revisão do contato reproduziu a substituição precoce de um golpe por outro. A fila visual preserva até três ações recentes, limita espera a 1.600 ms e mantém posição/alvo/impacto de cada uma. Cena isolada renderizada entregou dois golpes de 439 ms com intervalo de 254 ms; foram observados até 426 ms e 407 ms, com morte pendente até o impacto, jogador nativo, nenhum ator de fallback e nenhum erro/aviso. Essa amostragem não comprova FPS nem todas as classes/armas/direções. A meta permanece ativa.

### Próximo pacote solo: estados reativos

A auditoria separou habilidades solo de dependências sociais. Priorizar Full Strip, Reject Sword e Auto Berserk, com parâmetros e hooks reais de dano/HP do Hercules. Auto Counter exige direção persistente do herói; Detoxify, Cure, Slow Poison e Status Recovery exigem estados negativos do jogador antes de oferecer benefício real. Poison React depende do caminho de ataque recebido e de contadores persistentes. Não habilitar habilidades apenas pelo nome sem executar seus efeitos. As demais mecânicas solo, inimigos conjuradores e homúnculos continuam pendentes.

Etapas do pacote reativo:

1. Testar regras puras: tentativa conjunta de Full Strip, proteções individuais, três cargas de Reject, autoprovoke no limite estrito de um quarto de HP. Aplicar truncamentos e etapas originais, sem alterar hard DEF do jogador por Provoke.
2. Integrar Full Strip aos quatro estados existentes, usando DEX efetiva do monstro e permitindo bosses conforme `sc_config.conf`. Corrigir remoção de arma para o percentual aditivo de ATK e preservar VIT/INT antes das defesas.
3. Integrar Reject após barreiras e após calcular a reflexão normal; o contra-dano é direto, sem defesa/acerto adicional ou ação visual inventada. Recompensar morte uma vez, persistir três cargas e duração infinita.
4. Oferecer Auto Berserk como toggle manual aprendido, custo de um SP ao ligar, sem rotação que alterne automaticamente. A projeção de autoprovoke acompanha HP/maxHP em todos os cálculos; uma mudança de maxHP também reconcilia o limiar como adaptação explícita do Idle. Preservar o ownership de Provoke externo na API de regras; debuffs inimigos no jogador continuam pendentes.
5. Rodar regressões de integração, suíte completa, typecheck/build, revisão independente e canários. Publicar com backup/manifesto preservando os perfis e conferir a apresentação dos ataques online.

Resultado: pacote reativo publicado como `vps-20261008-sol61-reactive1`, 202 habilidades disponíveis / 146 indisponíveis. Os 359 testes, typecheck e build passaram; sete testes optativos de banco permaneceram ignorados. Review encontrou morte simultânea sem recompensa e fórmula incorreta de VIT do jogador: ambos foram reproduzidos por regressões, corrigidos e revisados novamente. Proteção química também passou a impedir Weapon Strip individual. A imagem passou nos seis canários de pacotes e nos 42 hashes antes e depois da ativação. Nenhum perfil recebeu comandos administrativos, wipe ou importação.

Observação pública: 12 segundos e 215 amostras, com 40 quadros amostrados em ataque, do início aos 436 ms de uma animação de 439 ms. Renderização do jogador nativa, contador de esperas por textura estável e nenhum erro/aviso de console. Instinto de Sobrevivência apareceu aprendido no menu com o controle Ativar; não foi acionado durante a verificação. A meta completa continua ativa: outros mecanismos solo ainda precisam de implementação real.

### Depuração adicional do contato solicitada pelo usuário

- Erro demonstrável no código: a barra/seleção de um monstro é removida assim que `deadAt` é marcado, mesmo antes do instante de impacto. Reproduzir com o canário de golpe letal e medir a barra, alvo selecionado e relógios visuais antes de corrigir.
- Hipótese a medir: o ataque conserva `sourceGround` enquanto a rota do servidor avança. No primeiro quadro após terminar o movimento, registrar a diferença entre a posição congelada e a posição projetada; verificar se há salto real e corrigir a continuidade da apresentação se confirmado.
- Hipótese de dados ausentes: eventos de ação anteriores aos dois últimos segmentos de movimento usam a última posição renderizada. Criar replay com vários replanos entre ação e resposta; verificar a posição de contato. Um evento com posição de origem autoritativa deve manter compatibilidade com saves anteriores.
- Hipótese de primeiro uso: camadas nativas podem conservar o quadro anterior enquanto faltam texturas e, ao recebê-las, pular para o quadro atual. Correlacionar primeiro ataque, nova direção/arma, esperas e ACKs antes de alterar aquecimento ou política de renderização.
- A observação com cache aquecido não confirma as três últimas hipóteses nem constitui benchmark de FPS. Conservar essa distinção nos relatos e validar qualquer correção no navegador antes de publicá-la.

Resultado CONTACT3 em validação: reprodução local confirmou remoção prematura da barra e destaque (393 amostras; oito quadros antes do impacto sem barra, alvo B). Após correção, os sete quadros antes do impacto capturados mantiveram barra/alvo A. O evento grava HP anterior e posição de origem antes do golpe/replano. A retomada da rota usa orçamento de distância e ACT de caminhada até a chegada visual; 394 amostras locais incluíram 63 quadros de caminhada, com saídas do ataque de 0 e 0,09352 células, sem salto imediato ao destino. Revisão independente apontou desordem com reflexão imediata e pose idle durante retomada; regressões corrigiram ambos, incluindo guarda de início futuro/pausa.

Renderizador: quadros da ação/direção atual são aquecidos antes do warmup geral. ACK separa pose solicitada, desenhada e retida. Houve RED/GREEN para upload/evicção/protocolo e execução do módulo real em VM. O patch foi aplicado e compilado na revisão fixada do roBrowser na VPS. Testes finais: 376 passaram, oito ignorados (sete banco optativo e um fixture de assets); typecheck/build/scoped diff passam. Os sete canários isolados e 42 hashes da imagem passaram antes de ativação. Publicação e GPU/browser ainda precisam de comprovação final; registro privado em .superpowers/sdd/ragidle-online-20261008/20261008-sol61-contact3. A meta maior segue ativa para mecanismos solo pendentes.
CONTACT3 publicado e verificado em https://tibia74.tech:8443/ com imagens novas do jogo e do renderizador. Backup verificado e preservação dos perfis; ambos processos ativos, zero reinícios, manifesto de 42 arquivos conferido em produção, sete conjuntos de canários aprovados. Hashes públicos do JS e MapViewer iguais aos artefatos das imagens. Browser: 393 amostras/87 quadros de ataque de 0,1 a 438 ms em motion439; 36 quadros anteriores ao impacto mantiveram barra; nenhum dos 87 indicou pose retida por textura. Mais 219 amostras incluíram 140 quadros de caminhada; transição após golpe de 0,111296 células em 50 ms, sem salto imediato para o endpoint. Console sem erro/aviso, captura online-scene.png. Perfil djow Base56/Job40 caça preservado; apenas o resumo offline já creditado foi dispensado para observar a cena. Isso verifica o cenário atual de Espadachim/arma/mapa, não todas as combinações ou FPS com cache frio. A meta maior continua ativa para outros mecanismos solo pendentes.
### Campos de solo: Venom Dust e Spider Web

1. Auditar layouts, timers, resistências, custos, limite de três teias, vínculo ao alvo e reação a Fogo nas fontes fixadas do Hercules.
2. Criar grupos persistentes com células individuais, identidade, relógios e elegibilidade por alvo. Venom Dust avalia o solo a cada 100 ms, com intervalo de um segundo por grupo/alvo. Teia permite ataque, bloqueia caminhada e reduz FLEE enquanto presa.
3. Acrescentar RED/GREEN para colocação, custo único, cobertura cruz + alcance, alvo tardio, expiração, boss, fogo, limite, morte/saída, pausa e reconexão. A rotação automática evita reaplicação redundante; a regra de cargas continua representada para futuras ações manuais.
4. Mostrar pixels originais de particle3 e spiderweb do cliente local. A teia usa projeção no chão; coreografia de partículas de Venom Dust é uma aproximação ACT documentada, sem alegar reprodução do STR original.
5. Regenerar catálogo, revisar e validar suite/typecheck/build/canários; publicar somente após verificação visual e backup/manifesto. Ganbantein, Splasher, Revelação e Sight Blaster continuam na meta, com dependências próprias: remoção de células/Ice Wall, Poison React, ocultação inimiga e auras, respectivamente.

Ruling: o timer global de solo usa fase alinhada a múltiplos de 100 ms no Idle. Seu intervalo é o da fonte; a fase de inicialização do processo Hercules não é reproduzida. Persistência de Teia através de reconexão conserva o prazo original, uma adaptação necessária ao idle AFK frente ao flag NoSave. A geometria autoritativa permanece nas células normalizadas já compartilhadas entre combate e cena. Não executar alterações em perfis reais nos canários.

Em execução: testes iniciais RED mostraram ausência das unidades; a integração cobre colocação e custo. Revisão da fonte revelou entrada tardia independente do alvo anterior e cleanup após remoção da vítima; o relógio por alvo e a saída da teia foram acrescentados. A textura spiderweb.tga foi lida pelo proxy VPS: 65.580 bytes, 128x128, TGA tipo2,32bpp. Validação visual e publicação ainda pendentes. Cobweb custa184zeny na fonte fixada, sem preço inventado.

FIELDS1 publicado: Venom Dust e Spider Web habilitados, 204 habilidades suportadas/144 indisponíveis. Layout cruz + range1, timers100ms/per-alvo1s, custo único, máximo3teias, boss/FLEE/caminhada/Fogo, pausa/reconexão e cleanup. Revisão corrigiu overlap com traps e parâmetros de escala/altura GAT. Fonte cliente preservada por proxy; shading/depth/pulsação seguem adaptações registradas, sem alegar renderer original integral. Suíte395aprovados/8ignorados, typecheck/build/diff check e oito canários aprovados. Manifesto43arquivos e hash público conferidos, backup36880bytes; Idle saudável/restart0, serviçosHost ativos. Perfil djow Base56/Job15 em caça já constava no backup anterior à ativação; nenhum grant/import/wipe. Meta geral ativa.

### CONTACT4: estreia do ataque com texturas frias

Reprodução isolada com atraso de upload220ms confirmou pose idle retida até194ms da ação; primeira pose attack observada277ms, com cadáver e HP jázero. Essa é reprodução controlada, não prova de latência220ms em toda conexão pública.

1. Preflight de texturas ACT do movimento/direção atuais apenas quando bridge nativa está utilizável e com ACK recente. Fallback Canvas não espera.
2. Conservar quadrozero e deslocar start/impact/efeitos/fila/watermark até residente; espera limitada450ms por identidade actor/actionAt/actionId. Não reiniciar depois da estreia, não alterar ASPD/simulação servidor.
3. Vincular cadáver e loot pelo cue terminal exato; DOT/reflexão independentes não são atrasados pelo aquecimento de outro golpe.
4. RED/GREEN para espera, HP letal, AoE/fila, watermark, dano independente, orçamento, fallback e gap230ms. Revisão encontrou cap100ms que liberava frame intermediário após jank; corrigido mantendo orçamento total450ms.
5. Browser com o mesmo atraso:423amostras; tempoACT0 durante retenção; primeira pose attack foi framezero com HP/barra intactos, depois elapsed33..217antesimpacto e267..atéfim. Validar publicação/online antes de declarar correção entregue.

Ruling: timeout450ms libera apresentação para não travar jogo em GPUs/caches sem capacidade. A estreia completa foi comprovada no cenário controlado dentro desse prazo; fora dele, o pacote não garante todos quadros. Suíte402aprovados/8ignorados, typecheck/build/scoped diffcheck aprovados. Catálogo permanece204/144; demais mecanismos solo continuam na meta.
CONTACT4 publicado e conferido: oito canários, 43 hashes ativos e hash público iguais; backup37053bytes, healthy/restart0. Browser público359amostras/80frames de ataque3.1..392.2ms de motion400;19préimpacto conservaram barra, nativo, nenhum held/erro/aviso. DjowCavaleiroBase57/Job17emcaça preservado; nenhum grant/import/wipe. A reprodução fria comprovou início emframezero após280.4ms de espera comupload220ms controlado. Meta geral continua ativa para habilidades solo pendentes.

### Próximo pacote: Poison React, Splasher e transição de dano recebido

1. Auditar os hooks do Hercules fixado, custos, duração, cargas, alvo boss e limiar de HP. Testar ativação sem dano imediato, contador persistente, contra-ataque TF_POISON5 e ataque único AS_POISONREACT contra corpo de Veneno.
2. Aplicar Splasher somente em alvo vivo não boss com HP até três quartos. Consumo uma vez no cast end, bomba ligada à identidade do alvo, detonação SkillData1+500ms e cooldown SkillData1+3000ms. Sem explosão após morte/saída do alvo. Pausa/reconexão preservam relógios.
3. Ruling: a revisão fixada declara IgnoreElement/IgnoreFlee e não SplitDamage para AS_SPLASHER; reproduzir o comportamento efetivo dessa revisão, sem divisão inventada. A contagem radius1 no código não ativa divisão sem NK_SPLASHSPLIT. A descrição do catálogo será corrigida.
4. Investigar ataque→hurt: a prioridade ofensiva atual oculta hurt e depois estreia no meio do ACT. Reproduzir antes de corrigir, conservar a cadência/ASPD e evitar uma fila de reações atrasadas. A escolha de apresentação será registrada como adaptação se os handlers originais não estiverem disponíveis.
5. Validar suíte/typecheck/build, revisão independente, canários e publicar na VPS com backup e manifesto, preservando o personagem real.

Pacote Poison React/Splasher executado: contador persistente, contra-ataques sem segundo custo, corpo de Veneno versus elemento da arma, Neutral no contra-ataque especial, bombas ligadas ao alvo, timer/cooldown/reagente e área sem divisão conforme fonte fixada. Revisão encontrou e corrigiu limpeza prematura nas hunts, cargas após derrota e bombas órfãs na população persistente. A pausa explícita preserva o timer; sair do encontro cancela a bomba como adaptação do Idle. Alvos inválidos são descartados antes de gastar SP, diferentemente da checagem tardia Hercules, para evitar desperdício automático. Cobertura 206/348; 142 habilidades indisponíveis, com dependências solo/sociais ainda pendentes.

Auditoria da fluidez: a fonte roBrowser `d88a3cd4acde0582530e3fc1908532a92e9accea` define tempo por quadro em `DBManager.GetWeaponTypePCMotion`, `Entity` e `EntityRender`; a implementação anterior comprimira todos os quadros no amotion. Corrigido divisor 6, Aprendiz masculino 5.85 e Katar de Assassino 3. Monge/Champion desarmado usa o recorte de 5 quadros do cliente. Corpo/cabeça/arma/trilha compartilham o índice; SKILL e monstros conservam o próprio cálculo. Impacto de ataque normal ocorre no amotion e a animação pode ter duração total maior. Direção é travada por identidade da ação, compartilhada entre irmãos AoE e hits tardios; carregamento tardio reconcilia duração/fila sem deslocar o dano do golpe atual. Idle conserva prioridade ofensiva e suprime hurt oculto; o cliente original pode interromper ataque ao receber dano. Essa prioridade e retenção do último quadro pelo intervalo completo são adaptações de apresentação, sem mudança de ASPD ou dano do servidor.

Validação visual isolada: 2.411 amostras, 241 de ataque, quatro ações completas; motion 439 ms e playback 658,5 ms, observados até 655,2 ms. 82 amostras preservaram morte/barra antes do impacto; nativo, zero held e nenhum erro/aviso de console. Não equivale a benchmark de FPS nem validação visual de todas as classes/armas/direções.

Publicação intermediária `vps-20261008-sol61-poison-contact5`: 433 testes aprovados / 8 ignorados; typecheck/build/diffcheck, nove canários e 43 hashes ativos aprovados. Perfil djow Base 57/Job 19 em caça, backup 37.370 bytes/permissão 600, serviçohealthy/restart 0.

Bug adicional reproduzido na validação pública: arquivo HTML de tamanho igual e mtime 0 causava ETag idêntico (`W/"2fb-0"`) e 304 via If-Modified-Since, reaproveitando referência ao bundle removido. Bundles ausentes eram devolvidos como HTML. Regressão cobre HTML inicial/index/fallback SPA com os quatro condicionais, cache de bundles com hash e 404 de bundle inexistente. Corrigidos no-store do HTML, neutralização de condicionais antes do sender, cache immutable dos bundles e mtime real no pacote. Suíte 434 aprovados / 8 ignorados; typecheck/build aprovados. Publicação corretiva/observação final será registrada no ledger privado.

Publicação corretiva `vps-20261008-sol61-cache-contact6` concluída: dez conjuntos de canários, 43 hashes ativos e hash do bundle público conferidos; backup privado 37.639 bytes, serviço saudável sem reinícios. A requisição condicional que antes recebia 304 passou a receber 200/no-store, e bundle ausente recebe 404. Reload público abriu seleção e mundo. Browser público: 1.808 amostras, 1.068 de ataque, 21 ações nas direções 0/6/2; motion 392 ms, playback 588 ms, observados de 1,2 a 587,4 ms. 141 amostras conservaram barra/morte antes do impacto; jogador nativo, zero poses retidas e nenhum erro/aviso de console. Perfil djow Base 57/Job 20 em caça preservado. Meta continua ativa para mecanismos solo pendentes; esse registro não declara cobertura completa de classes/armas/direções ou FPS.

### Contra-Ataque e passivas de caça

1. Seguir battle.c:6867..6877, map.c:2928..2988 e status.c/skill.c da revisão fixada: postura de 400ms por nível, 3SP, sem arco; bloqueio de caminhada e novas skills. Interceptar ataque normal antes do RNG de esquiva/dano, dentro do alcance da mão direita +1 e frente ±1 direção, com exceção da mesma célula. Encerrar postura antes de resolver o contra-ataque físico, sem procs exclusivos de skill_id0; metade do amotion, crítico padrão quando CRIT final não é zero. Básico consome a postura no ramo crítico, preservando exceções de multihit/CRIT zero.
2. Persistir direção do herói; usar células normalizadas já compartilhadas pelo jogo e distância quadrada padrão. Ruling: a geometria continua uma adaptação Idle na grade existente de 12 células por unidade; não afirma navegação integral no GAT. A automação orienta a ativação ao alvo selecionado; guarda, custo e consumo seguem a fonte.
3. Aplicar BS_UNFAIRLYTRICK somente ao custo de Mammonita: custo menos desconto truncado de10%, no cálculo único de elegibilidade/pagamento. RG_TUNNELDRIVE permite caminhar escondido com speed_rate acrescido de120−6L; não libera ataques, recuperação ou drenagem.
4. RED/GREEN, revisão independente, suíte/typecheck/build, canários e publicação com backup/manifesto; preservar perfis. Não habilitar uma habilidade por possuir apenas uma linha importada no catálogo.
5. Próximo pacote obrigatório: recuperação sentada real, MO_SPIRITSRECOVERY e LK_TENSIONRELAX. Não somar seus bônus à cura acelerada de cidade/derrota. Auditoria privada remaining-solo-audit.md conserva113 pendências com uso solo/fundações e29 sociais/cosméticas; classificações amplas anteriores não reduzem o escopo aprovado.

Ruling: não implementar configuração alternativa auto_counter_type fora do padrão upstream autorizado; o jogo não expõe esse ajuste. Monstros ainda não possuem defesas reativas próprias/reflexão; o contra-ataque compartilha o resolvedor físico atual e essas interações deverão entrar com o sistema de habilidades inimigas, sem declarar cobertura PvP.

Fonte cliente auditada: roBrowser SkillAction.js:383 mostra KN_AUTOCOUNTER como ATTACK no quadro zero, play:false/next:false. A ativação não entra na fila de conjuração; a postura inicia após o pacote noDamage100ms e usa a direção persistida com a projeção da câmera. skill_delay_fix permite aftercast zero neste caso, preservando o ataque básico já devido. A automação só ativa a postura perto do alvo; isso evita gastar a janela de400Lms enquanto ainda caminha à distância.

Revisão independente 6.1 Sol encontrou quatro falhas funcionais: ativação manual durante a postura, direção visual ignorada, startsAt sem deslocamento após pausa, projeção direcional usando grade diferente da cena. Todas reproduzidas RED/GREEN e corrigidas em uma passagem. Suíte final451aprovados/8ignorados, typecheck/build e diffcheck aprovados. Catálogo209suportadas/139indisponíveis. Canário isolado novo aprovou64relações direcionais, ataque básico após ativação instantânea, metade do motion, custo único, Mammonita900zeny e Tunnel321/285ms/célula; onze conjuntos passaram na imagem antes de ativação. Publicação e observação visual em andamento; meta maior permanece ativa.

### Recuperação sentada — contrato do pacote seguinte

1. Campo sentado usa seis acumuladores: naturalHP/SP, SM_RECOVERY/MG_SRECOVERY e MO_SPIRITSRECOVERYHP/SP. Sentar dobra a taxa natural (3000/4000ms), sem dobrar quantidade; Spirits usa10000ms ou20000ms com peso50%+. Levantar zera apenas canais extra sentados; preservar canais naturais/regulares, pausa e JSON.
2. Remover healFull/garantia30s apenas do descanso de campo. Retomar imediatamente por ação manual; autoresume apenas comHP/SP reais completos. Cidade/derrota conservam a política Idle, sem somar bônus fonte.
3. LK_TENSIONRELAX: ação manual validada por árvore/nível, custo15SP sujeito a modificadores normais, peso<90%, sem bloqueio de status; interrompe movimento e senta na hunt.180s máximos/18checagens10s;HP cheio encerra no próximo timer, levantar/morte encerram, término sozinho não levanta. SomenteHP natural/SM_RECOVERY aceleramx3 sem overweight; com overweight restauramHP semx3. Nenhuma drenagem12SP/10s, ausente no timer upstream.
4. Ruling: ação manual de Relaxar Musculatura segue o descanso na hunt do Idle; desafio continua sem retirada para descansar e cidade mantém recuperação própria — preserva os contratos já publicados. Para uma futura navegação livre/multiplayer, separar postura sentada da atividade/estado de batalha para habilitar uso em outras cenas.
5. Ruling: processamento de regen usa steps250ms existentes; truncamentos/intervalos seguem fonte, apresentação/rede podem observar tick no passo seguinte. Preservar ordem: extra sentada antes do corte de peso; Tension overweight reintroduzHP quando alguma flag de recuperação sobrevive, inclusive pósFrenzy com canal regular/sentado.
6. RED/GREEN, revisão6.1Sol, suite/typecheck/build, canários, backup, publicação e prova visual sentada. Não modificar pesos/SP/progresso do perfil real para validar.

Recuperação sentada executada/publicada:211/348suportadas;472testesaprovados/8ignorados,typecheck/build/diffcheck,12canários,44hashesativos e bundlepúblico conferidos. Revisão6.1Sol corrigiu flags/timers com recurso cheio e naturalmascarada, reset na morte real e custoSP modificado no botão manual. Sem grants/wipe. Prova funcional sentada usou canvas; observação pública Payon usou nativo,12ações/direções3/0/2/4,motion392/playback588ms,zeroheld/warn/error. Evidência privada completa emSitting1. Meta maior continua ativa para mecanismos solo pendentes e regressões de fluidez.

### Próximo diagnóstico de contato e primeira pintura

1. Reproduzir integração de seleção→startup→HP/cadáver quando o primeiro RAF útil chega depois de actionDuration. A auditoria readonly encontrou que a seleção pode retornar undefined antes de o gate ser chamado; não confundir com o teste existente de hold direto após gap.
2. Reproduzir espécie fria cujo sprite resolve depois do impacto/morte; separar atraso de primeira pintura do tempo real de animação. Verificar disponibilidade/deadAt/until e loot vinculados à identidade terminal.
3. Reproduzir ataque de monstro com idle residente e quadros de ataque frios; verificar ACK solicitado/desenhado e relógio consumido enquanto a pose anterior fica retida. Hoje o gate atende somente hero.
4. Corrigir apenas os caminhos reproduzidos, preservando ASPD/dano/simulação fonte, eventos independentes e compressão de história após reconexão. Cada regressão deve falhar antes da correção; revisão6.1Sol final e publicação com backup/hash após todos os gates.
5. Observação pública quente anterior não cobre estes casos. Nenhum ajuste de velocidade arbitrário deve ser apresentado como solução para o bug do usuário. Demais habilidades solo continuam no escopo já aprovado.
