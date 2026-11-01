# Mundo, loot e qualidade de vida — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement the independent tasks and a final independent review. No automated tests requested; do not add or run them.

**Goal:** Integrar caça no cenário e loot identificado/raridades, com interface clássica reorganizável e wipe local.

**Architecture:** Estender estado/commands existentes para equipamentos; manter combate e loot autoritativos no motor. Separar posicionamento de janelas num hook de UI e renderização clássica de equipamento num componente próprio. Integrar população do mapa com encontros existentes e câmera roBrowser.

**Tech Stack:** TypeScript, React, Canvas, roBrowserLegacy, Hercules, MariaDB, Docker.

**Spec:** ../specs/2026-10-04-world-loot-qol-design.md

## Global constraints

Sem testes automatizados, sem commit/push, preservando modificações anteriores. Assets originais locais. Wipe explicitamente solicitado, com backup antes e serviço parado. IDs/atributos/cooldowns calculados no servidor.

## Review focus

Identificação repetida não consome/revela novamente; não equipado continua sem bônus. Drag em controles não movimenta janela e viewport menor recupera a janela. Morte/loot deve manter identidade do monstro visto. Descanso preserva hunt sem ataques/casts restantes. Wipe não pode ser revertido involuntariamente por gravações em andamento.

### Task 1 — Loot

- [x] Estender InventoryEntry e comando identify com validação.
- [x] Sortear raridade/atributo uma vez por drop; exigir lupa 611 e identificação nas ações de equipamento.
- [x] Aplicar bônus em stats e apresentar identidade/cores/ações na mochila e loja de lupas.
- [x] Conferir tipos e invariantes por revisão de código.

### Task 2 — Janelas

- [x] Criar hook de arrasto/persistência/clamp e aplicá-lo à HUD e a todos os menus.
- [x] Criar equipamento clássico em componente separado, reutilizando slots/commands existentes.
- [x] Mostrar máscara/segundos de recarga nos atalhos e restaurar layout pelo Livro.
- [x] Conferir pointer lifecycle, teclado, viewport e estilos.

### Task 3 — Mundo

- [x] Aplicar zoom real de 20% e cover na arte de loading.
- [x] Substituir mobs decorativos de hunt pela população autoritativa targetável com posições estáveis.
- [x] Acrescentar falas/emotes de NPC e sentar ao descansar mantendo posição/mapa.
- [x] Conferir distância/cast/loot/identidade e projeção.

### Task 4 — Integração e wipe

- [x] Retirar skills não solicitadas da árvore de mago na origem da exportação e no catálogo servido.
- [x] Revisão independente dos subsistemas e correções.
- [x] Typecheck e build de idle/web-client; inspeção de navegador.
- [x] Backup das tabelas locais de perfis, parar idle e apagar perfis/dependências transacionalmente.
- [x] Reiniciar serviços, conferir perfis novos e entregar captura da versão atualizada.

## Resultado da integração — 2026-10-04

- Revisões independentes de loot/wipe, janelas e população concluídas; correções importantes aplicadas.
- Typecheck final e builds Docker de idle-game/web-client concluídos com exit 0.
- Navegador: cooldown durante cast, população visível, descanso sentado no campo e retomada disponível; identificação de um drop real consumiu uma Lupa e liberou equipar.
- UI: equipamento reposicionado pelo teclado, restauração pelo Livro, loading opaco cobrindo toda a tela, viewport atual 508×618 sem scroll externo; captura final salva em arquivo local.
- Wipe com serviço parado: 1 perfil apagado, 0 perfis/comandos/chat antes da reinicialização. Backup privado 2026-10-04-174604-before-wipe.sql, 69163 bytes, SHA256 9F552814B812044BF9E7033463EB2EC12B07E7CC728E24531DDF09E85DC41BF1.
- Leitura após reinicialização: local-djow, Aprendiz, Base/Job 1, 200 zeny, 0 abates e 4 pilhas iniciais. Health ok; database/idle-game saudáveis.
- Assets de equipamento: remover labels duplicados quando o bitmap carrega e botão fechar sem chave magenta.
- Nenhum teste automatizado, commit ou push nesta etapa.
