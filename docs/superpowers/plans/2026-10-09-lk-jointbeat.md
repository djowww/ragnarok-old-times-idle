# Golpe das Juntas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Habilitar Golpe das Juntas (LK_JOINTBEAT) na caça solo com dano e efeitos corporais calculados conforme o Hercules pré-renovação fixado.

**Architecture:** Uma regra pura escolhe a parte do corpo, o multiplicador e a chance. O fluxo existente de ataque aplica `SC_JOINTBEAT` somente após acerto e mantém as partes cumulativas por instância; os consumidores de combate aplicam as penalidades ao monstro. O exportador promove apenas esta habilidade e registra a adaptação usada.

**Tech Stack:** TypeScript, Vitest, JSON gerado pelo `idle/tools/export-content.mjs`; fonte de regras Hercules em `../.superpowers/sdd/ragidle-solo-20261008/hercules` no worktree.

**Spec:** `docs/superpowers/specs/2026-10-03-ragnarok-old-times-idle-design.md` e escopo já aprovado nesta conversa: completar primeiro as habilidades solo das classes existentes. Contrato mecânico exato segue o Hercules no commit `410b9738c049ab1825d67b36b072d837c1d0b33a`.

## Global Constraints

- Preservar profiles, histórico e dados; não executar wipe, grant ou alteração de progresso.
- Não mudar fórmulas compartilhadas que não sejam necessárias a LK_JOINTBEAT.
- Não adicionar dependências.
- Usar somente regras do Hercules fixado; manter habilidades de grupo/PvP fora deste pacote.
- Não publicar uma imagem parcial na VPS durante a meta maior.

## Review Focus

- A parte é escolhida antes do ataque e ainda consome a escolha em caso de esquiva; os efeitos de status só rolam após acerto.
- Pescoço dobra somente o modificador aditivo da skill, não todo o dano base.
- Partes atingidas acumulam enquanto `SC_JOINTBEAT` está ativo e a reaplicação atualiza a duração de 30 s.
- `SC_JOINTBEAT` uses the source's base chance and boss rejection; its database has no extra VIT/AGI status-resistance case. Nested `SC_BLOODING` still uses its own source resistance.
- Quebra do pescoço aplica sangramento só quando o status principal foi aceito; o sangramento termina e para de causar dano ao expirar ou morrer o alvo.

---

### Task 1: Regras puras e probabilidades

**Files:**
- Create: `idle/engine/jointBeatRules.ts`
- Create: `idle/tests/jointBeatRules.test.ts`

**Interfaces:**
- Produces `JointBeatPart`, `chooseJointBeatPart(roll: number)`, `jointBeatDamagePercent(level: number, part: JointBeatPart)`, `jointBeatStatusChancePercent(level: number)`, and `mergeJointBeatParts(existing: readonly JointBeatPart[], next: JointBeatPart)`.
- A ordem das partes segue `skill.c:4964-4971`: tornozelo, pulso, joelho, ombro, cintura, pescoço.
- Dano normal usa `100 + (10 * level - 50)`%; pescoço usa `100 + 2 * (10 * level - 50)`%; chance do status `5 * level + 5`%; duração 30.000 ms conforme `skill_db.conf`.

- [ ] **Step 1: Write failing pure-rule tests** para as seis faixas de `roll`, níveis 1/5/10 com e sem pescoço, extremos 0/1 e acúmulo sem duplicar partes.
- [ ] **Step 2: Run `pnpm exec vitest run tests/jointBeatRules.test.ts`** e confirmar falha por APIs ausentes.
- [ ] **Step 3: Implement apenas as regras puras em `engine/jointBeatRules.ts`.** Clamp do roll em `[0, 1)` e do nível em `[1, 10]`.
- [ ] **Step 4: Rerun the focused tests** e confirmar GREEN.

### Task 2: Ataque, efeito e consumidor de combate

**Files:**
- Modify: `idle/shared/types.ts`
- Modify: `idle/engine/encounters.ts`
- Modify: `idle/engine/classicStatuses.ts` ou consumidor focado existente de atributos de monstros
- Create: `idle/tests/jointBeatCombatFlow.test.ts`

**Interfaces:**
- Guardar partes ativas e expiração em `BattleEnemy.statuses.SC_JOINTBEAT`; gravar sangramento separado como `SC_BLOODING`.
- Selecionar a parte uma vez antes de resolver o ataque. Usar o multiplicador de dano específico daquela parte, elemento de arma e demais regras comuns. Só aplicar a chance `5 + 5*nível` após um golpe bem-sucedido; respeitar imunidade/resistência do pipeline clássico.
- Acumular flags no mesmo status por 30 s. Cintura: ATQ do monstro −25%; ombro: DEF −50%, ou cintura DEF −25%; pulso: +25% no intervalo de ataque; joelho: +10% no intervalo e lentidão de 30%; tornozelo: lentidão de 50%. Os valores de movimento somam (até 80%). Pescoço: tentar `SC_BLOODING` a 100% de chance base por 30 s, ainda sujeito à resistência própria desse status.
- Sangramento usa pulsos a cada 10 s de 200–799 HP, limitado para não matar o monstro sem um jogador como fonte; sua expiração e morte encerram os pulsos.

- [ ] **Step 1: Write RED combat-flow tests** para parte determinística/dano, status após acerto versus esquiva, acumulação e expiração, cada penalidade consumida no combate e sangramento por pescoço.
- [ ] **Step 2: Run `pnpm exec vitest run tests/jointBeatCombatFlow.test.ts`** e confirmar as falhas comportamentais esperadas.
- [ ] **Step 3: Implement a menor integração** no produtor da skill e nos consumidores de dano, DEF, ataque e movimento; não alterar a cadência global nem a vida dos monstros.
- [ ] **Step 4: Rerun the combat-flow tests**; adicionar regressões focadas se qualquer boundary de expiração/reaplicação falhar.

### Task 3: Promoção do catálogo e gates

**Files:**
- Modify: `idle/tools/export-content.mjs`
- Modify/generated: `idle/content/catalog.json`, `idle/content/source-manifest.json`, `idle/content/rules.json` apenas se a descrição localizada for mantida nas regras.
- Modify: testes exatos de cobertura/manifesto relacionados a skills solo.

**Interfaces:**
- Remover `LK_JOINTBEAT` do conjunto `unsupported`, incluí-lo no conjunto de skills ativas somente depois que o fluxo de combate estiver GREEN e registrar os arquivos/linhas-fonte e a adaptação de efeitos no manifesto.
- Manter nível máximo, arma, alcance, custo SP, modificadores base, pós-conjuração, árvore de pré-requisitos e duração exatamente como importados.

- [ ] **Step 1: Add failing coverage and source-manifest assertions** para `lk_jointbeat` suportada e sem mudança nas skills adjacentes.
- [ ] **Step 2: Run focused exporter/content tests** e confirmar RED.
- [ ] **Step 3: Promote only LK_JOINTBEAT**, exportar usando os recursos locais pinned já disponíveis e atualizar a descrição portuguesa com efeitos/limites.
- [ ] **Step 4: Run focused tests, `pnpm test`, `pnpm typecheck`, and `pnpm build`** from `idle`; registrar contagens, avisos e bundle sem declarar efeitos visuais/native não verificados.
