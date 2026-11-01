# Plano: combate fluido e atributos clássicos

**Spec:** `../specs/2026-10-04-combat-cadence-classic-status-design.md`

## Restrições globais

Worktree `codex/ragnarok-browser-local`. Preservar o trabalho anterior. Não executar/adicionar testes, fazer commit/push ou repetir wipe. Hercules e roBrowser fixados na spec são a referência. Compatibilidade com saves existentes, cura 5 HP/3 SP/cast zero, loot quatro segundos, direção/arma/SIT/cast real preservados. PvP está fora do escopo.

## Tarefas

- [x] 1. Motor: separar relógios, corrigir alternância de cura/ofensiva, ordenar eventos por prazo e emitir metadados de ator. Dono: combat_cadence; `encounters.ts`, `state.ts`, `types.ts`, helper temporal se necessário.
- [x] 2. Apresentação: ações e reações independentes por ator, pose breve da cura e ajuste ACT ao movimento. Dono: combat_visual_timeline; `Scene.tsx`, `renderer.ts`, helper visual se necessário. Consome metadados opcionais da tarefa 1.
- [x] 3. Atributos: reproduzir WinStats V0 com bitmap/posições/controles originais e alocação real. Dono: classic_attributes; `Build.tsx`, `classic-status.css`, componente próprio se necessário.
- [x] 4. Integração: árvores de habilidades, campos de movimento do catálogo, +15% câmera real, polling em combate. Dono: root; exporter/catálogo/manifest, patch mapviewer, `api.ts`, leitura de cooldown se necessária.
- [x] 5. Revisão independente das tarefas e integração; resolver achados relevantes.
- [x] 6. Typecheck, builds Docker, saúde dos serviços e inspeção manual do jogo; registrar evidência e limitações.

## Interfaces

Eventos: `sourceActorId`, `targetActorId`, `actionId`, `actorAction`, `actionStartedAt`, `actionMotionMs`, `hitMotionMs`. Monster: `attackMotionMs?`, `damageMotionMs?`. Campos opcionais; renderer mantém fallback dos eventos antigos. Arquivos de cada dono não devem ser editados por outro implementador sem aviso.

## Progresso

Diagnóstico: First Aid reinicia o relógio de ataque e sua pose de um segundo encobre ataques novos; eventos agrupados por fase perdem a ordem dos prazos; renderer usa uma fila global e confunde dano de efeitos com ataques. Interface V0 original e fontes locais identificadas. Execução autorizada pelo usuário sem novas confirmações de processo.

## Resultado

Implementado e servido em `http://localhost:3339/`. Revisões independentes corrigiram três achados: manutenção futura afetando ações anteriores, prontidão de suporte divergente entre HUD e motor, e pose antiga retomada depois da expiração da ação mais recente. Revisões das correções e integração aprovadas.

Typecheck e builds de idle-game/web-client concluídos com saída 0. Serviços locais ativos, idle-game e banco saudáveis. Inspeção do navegador confirmou o fundo original de atributos, 280×120 px, recolher para 17 px, expandir e movimentar por teclado. O diário da hunt mostrou Primeiros Socorros de 5 HP intercalado com ataques. Captura final: `C:/Users/Usuário/.codex/tmp/ragidle-classic-combat-final.png`.

Não foram executados testes automatizados. Poções e regeneração conservam a cadência externa de 250 ms, após os eventos de combate vencidos. PvP permanece fora desta entrega; seus sistemas de sessão, rede e regras entre jogadores ainda precisarão de uma etapa própria.
