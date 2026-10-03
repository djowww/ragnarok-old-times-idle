# Classic Combat, HUD and Loot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Entregar combate, drops e HUD com apresentação clássica e escala fiel no jogo idle local.

**Architecture:** Hercules pré-renewal gera o catálogo e o servidor credita os itens; eventos estruturados conduzem apenas a apresentação. O Canvas usa ACTs, SPRs e texturas locais; React/CSS reorganiza a interface em janelas clássicas sobre um mapa dominante.

**Tech Stack:** TypeScript, React, Canvas 2D, Node, CSS, Docker, dados locais do cliente Ragnarok.

**Spec:** `docs/superpowers/specs/2026-10-03-classic-combat-hud-loot-design.md`

## Global Constraints

- Todos os recursos originais permanecem no `client-data` local; não incorporar GRF ao Git.
- O servidor faz o sorteio e credita cada drop uma única vez; Canvas nunca modifica inventário.
- Campos novos de eventos são opcionais para preservar perfis existentes.
- Sem novas dependências de runtime.
- Não criar nem executar testes automatizados nesta solicitação; o usuário pediu verificar escala, então usar typecheck, build e inspeção visual da cena.

## Review Focus

- Evento antigo sem `itemId`: permanece legível no diário sem quebrar animação.
- Vários drops iguais da mesma vitória: todos contabilizados, apresentação pode agrupá-los.
- Aba suspensa com múltiplas vitórias: mostrar encontro mais recente sem longa fila.
- Sprite ou BMP ausente: fallback visual, sem travar cena ou itens.
- Janela estreita: controles e mochila continuam alcançáveis.

---

### Task 1: Catálogo e vitória com drops completos

**Files:** `idle/tools/export-content.mjs`, `idle/shared/types.ts`, `idle/engine/combat.ts`, `idle/engine/state.ts`, catálogo/manifeste gerados.

**Interfaces:** `GameEvent` ganha `itemId?: number`, `quantity?: number`, `skillLevel?: number`; `Monster` ganha `mvpDrops?: Drop[]`; `event` aceita esses metadados opcionais.

- [x] Importar drops normais e MVP do Hercules, incluindo itens sem scripts idle; esses itens são coletáveis/vendáveis e não aplicam scripts desconhecidos.
- [x] Registrar nível da magia no evento; emitir `kill` antes dos eventos `loot` da vitória, cada qual com ID e quantidade, mantendo crédito único no servidor.
- [x] Regenerar catálogo/manifeste com a fonte pinada; revisar lista de entradas excluídas e o conteúdo de Poring/chefes.
- [x] Rodar `pnpm typecheck` em `idle` para checar contratos; revisar diff.

### Task 2: Direções ACT e magia

**Files:** `idle/web/assets/renderer.ts`, `idle/web/assets/sceneEffects.ts`.

**Interfaces:** `drawActor`/`getActorPose` recebem parâmetro opcional `direction: number` (`0` padrão); ação inclui `cast`; `drawSkillEffect` recebe `level?: number` e `castMs?: number` para renderizar cast e impactos de Fire/Cold Bolt.

- [x] Selecionar grupo ACT + direção coerente para corpo, cabeça e arma, incluindo `SKILL=12` para PC e fallback direcional.
- [x] Separar cast e impacto; pintar lanças estreitas descendo do topo com textura local, repetição visual limitada por nível e modo de movimento reduzido.
- [x] Rodar `pnpm typecheck` em `idle`; revisar diffs e registrar valores exatos de fase para integração.

### Task 3: HUD clássico

**Files:** `idle/web/App.tsx`, `idle/web/hud.css`, se necessário novo CSS focado na HUD.

**Interfaces:** Mantém props e comandos existentes; botões clássicos selecionam as abas atuais via `changeTab`.

- [x] Reorganizar cena como mapa principal com Basic Info, minimapa, atalhos e diário estilo chat; usar `basic_interface` local.
- [x] Preservar controles idle e painéis de mochila/equipamento/skills; implementar responsividade e foco/labels.
- [x] Rodar `pnpm typecheck` e build de produção; revisar desktop e largura móvel.

### Task 4: Integração da cena, loot e fluidez

**Files:** `idle/web/components/Scene.tsx`, novo `idle/web/assets/groundLoot.ts` se necessário.

**Interfaces:** Consome eventos de Task 1, direção/cast de Task 2; itens usam `catalog.items[itemId]` para buscar SPR/ACT original de chão.

- [x] Aplicar escala comum baseada no herói sem arma e direção leste/oeste, reposicionar efeitos/popups.
- [x] Programar cues de magia (cast, queda, impacto) e coordenar golpe/morte sem atrasos longos.
- [x] Desenhar cada drop no chão, pequena pausa e voo visual para a mochila; ignorar apenas eventos legados sem ID.
- [x] Limitar backlog e respeitar movimento reduzido; revisar evento kill seguido de loot e encontro seguinte.
- [x] Rodar `pnpm typecheck`, build e inspeção visual da cena desktop/mobile e drops.

### Task 5: Integração local e revisão

**Files:** Docker/configuração somente se necessário; documentação de operação se alterada.

- [x] Inspecionar diff contra a spec e corrigir lacunas de interfaces, acessibilidade ou drop.
- [x] Compilar o app e reconstruir/subir os containers locais existentes; confirmar `http://localhost:3339/` e recursos locais.
- [x] Inspecionar visualmente HUD, escala, orientação, magias e loot em perfil descartável; não alterar progresso de `djow`.
- [x] Registrar resultado e eventuais limites, commitar a branch isolada e sincronizar o checkout principal se estiver limpo.
