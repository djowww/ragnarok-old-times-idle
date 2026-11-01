# Impacto Explosivo (WZ_SIGHTBLASTER) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar Impacto Explosivo de acordo com o Hercules pré-renovação na caça solo de Bruxo e Arquimago.

**Architecture:** O scheduler existente agenda a entrada contínua do monstro no raio de um buff temporário, resolve um único pulso com o caminho normal de dano/loot e remove a carga. O status `NoSave` permanece em memória no wrapper da sessão e só é promovido no exportador depois de coberto por testes.

**Tech Stack:** TypeScript, Vitest, pnpm, exportador Hercules `idle/tools/export-content.mjs`.

**Spec:** `docs/superpowers/specs/2026-10-09-wz-sightblaster-design.md`

## Global Constraints

- Usar Hercules pin `410b9738c049ab1825d67b36b072d837c1d0b33a` como fonte.
- Preservar IDs de saves, catálogo não relacionado e progresso dos jogadores; sem wipe, grants ou reset.
- Não simular 6.000 eventos de 20 ms; resolver a entrada calculada com erro temporal máximo de 20 ms.
- Manter fora de escopo colisão GAT, PvP, traps de jogador e efeitos originais de cliente.

## Review Focus

1. Um inimigo imóvel ou distante não deve fazer a rotação queimar 40 SP; teste elegibilidade de conjuração por trajetória.
2. Vários inimigos no raio recebem exatamente um pulso coletivo, sem repetir em prazos posteriores; teste multicriatura.
3. Boss, monstro `noKnockback` e mapa `noKnockback` recebem dano mas não deslocamento; teste de imunidade fonte.
4. Morte e loot seguem o caminho normal e não deixam a skill consumida reaparecer; teste de morte do alvo e carga.
5. Buff `NoSave` não vaza para armazenamento ou nova sessão e sobrevive a replay idempotente na mesma conexão; teste do wrapper.

---

### Task 1: TDD do pulso de combate

**Files:**
- Test: `idle/tests/sightBlasterCombatFlow.test.ts`
- Modify: `idle/engine/encounters.ts`
- Reference: `idle/shared/battleSpatial.ts`

**Interfaces:**
- Consome `battleHeroAt`, `enemyPositionAt`, `classicMagicDamage`, `damageEnemies` e prazos de `runCombatTimeline` já existentes.
- Produz agendamento de contato calculado, consumo de buff, dano em área e deslocamento sem novo estado persistido.

- [ ] Escrever testes que habilitam WZ_SIGHTBLASTER apenas na cópia de catálogo do fixture e provam: não conjura contra alvo parado/longe; inicia quando a entrada no raio ocorre até o fim do cast; mantém o buff sem dano antes do contato; no contato acerta todos os alvos vivos no raio uma vez; empurra 3 células e respeita boss/noKnockback.
- [ ] Executar `pnpm test -- sightBlasterCombatFlow.test.ts` em `idle/` e confirmar falha por comportamento ausente.
- [ ] Implementar previsão de contato usando interseção dos trajetos hero/mob e prazo do scheduler; consumir status e chamar o caminho normal de dano/loot; adicionar o empurrão nas condições Hercules.
- [ ] Reexecutar o teste focado e confirmar todos os casos verdes.

### Task 2: Estado `NoSave` por sessão

**Files:**
- Test: `idle/tests/sightBlasterSession.test.ts` (ou extensão focada de `trickDeadSession.test.ts`)
- Modify: `idle/server/sessionState.ts`

**Interfaces:**
- Consome `SessionStateRepository` e seu lock/recibo atuais.
- Mantém a mesma política existente de Trick Dead e adiciona apenas `sight_blaster` ao conjunto volátil.

- [ ] Escrever testes para retenção entre requests e replay, ausência no JSON durável e limpeza ao abrir outra conexão.
- [ ] Executar o teste focado e confirmar que SightBlaster vaza ou não é hidratado no comportamento atual.
- [ ] Generalizar a captura/hidratação/remoção volátil para os IDs `nv_trickdead` e `sight_blaster`, sem mudar o limite/idempotência de conexões.
- [ ] Reexecutar o teste focado e o conjunto atual de testes de sessão.

### Task 3: Exportar como suportada

**Files:**
- Test: `idle/tests/sightBlasterContent.test.ts`
- Modify: `idle/tools/export-content.mjs`
- Regenerate: `idle/content/catalog.json`, `idle/content/source-manifest.json`

**Interfaces:**
- Consome a fórmula existente `magicRatios.WZ_SIGHTBLASTER = 100` e as referências fonte já presentes.
- Produz metadata `implementation: supported`, remove apenas a justificativa de indisponibilidade desta skill e registra as adaptações descritas na spec.

- [ ] Escrever teste no catálogo real para classe/nível, 40 SP, 2.000 ms, Fogo, raio 1, 120.000 ms e implementação suportada.
- [ ] Executar o teste focado e confirmar a falha atual de `implementation`.
- [ ] Remover a entrada WZ_SIGHTBLASTER da lista de indisponíveis do exportador e registrar os caminhos de status/timer/knockback e a adaptação de prazos.
- [ ] Executar `pnpm export-content` e o teste de conteúdo; revisar o diff gerado para limitar mudança a WZ_SIGHTBLASTER e hashes derivados.

### Task 4: Verificação e encerramento do pacote

**Files:**
- Verify all changed runtime/content files and append packet evidence to `.superpowers/sdd/ragidle-admin-world-completion/progress.md`.

- [ ] Executar suíte completa serialmente, `pnpm typecheck` e `pnpm build` em `idle/`.
- [ ] Revisar diff e hashes do catálogo/manifests.
- [ ] Não publicar até pacote local passar revisão independente, canários, pacote imutável e preflight de produção preservando DB e web-client.
- [ ] Registrar resultado e continuar o próximo item da fila de skills solo; não marcar a meta ampla como concluída.
