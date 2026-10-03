# Plano: combate e HUD clássicos

**Spec:** `docs/superpowers/specs/2026-10-03-combat-hud-fidelity-design.md`

**Objetivo:** corrigir repouso e ataque sem arma, mostrar magia, dano e emotes no mapa original e dar mais espaço à cena na HUD.

**Restrições:** preservar engine idle, banco, GRF local, música, modo clássico e ações existentes. Não adicionar/rodar testes automatizados. Usar o worktree `codex/ragnarok-browser-local`; não versionar recursos oficiais.

## Tarefa 1 — Composição do personagem

Arquivos: `idle/web/assets/renderer.ts`, módulo de caminhos de arma se necessário, tipos compartilhados apenas se indispensável.

- [x] Estabilizar idle sem percorrer `doridori`.
- [x] Derivar ação PC do tipo de arma, inclusive Aprendiz + adaga masculino/feminino.
- [x] Carregar SPR/ACT de arma existente no GRF local e compor camadas pelo mesmo quadro/posição; fallback seguro.

## Tarefa 2 — Eventos e apresentação de efeitos

Arquivos: `idle/shared/types.ts`, `idle/engine/state.ts`, `idle/engine/combat.ts`, módulos novos em `idle/web/assets/`.

- [x] Acrescentar metadados opcionais em eventos de skill/dano/erro/cura; manter persistidos legíveis.
- [x] Carregar e desenhar recursos locais de dígitos, MISS, emotes e efeitos simples de magia.
- [x] Prover visual elemental distinto quando o recurso original exigir STR/3D não suportado, sem bloquear render.

## Tarefa 3 — Cena e linha de tempo

Arquivos: `idle/web/components/Scene.tsx`.

- [x] Consumir skill, dano, miss e cura por ordem de evento, animando golpe ou magia correta e balão de dano no impacto.
- [x] Avanço de melee, manutenção do alvo em golpe final, emotes aleatórios somente nos momentos ociosos.
- [x] Respeitar `prefers-reduced-motion`, aba oculta, área trocada e recursos ausentes.

## Tarefa 4 — HUD

Arquivos: `idle/web/App.tsx`, `idle/web/main.tsx`, novo `idle/web/hud.css`.

- [x] Mover Equipamento para depois da cena na ordem do DOM e preservar desequipar.
- [x] Construir grade desktop de cena dominante, vitais compactos e faixa inferior de apoio.
- [x] Adaptar <=960 e <=640 sem perder ações, acessibilidade ou comportamento das abas.

## Tarefa 5 — Integração e revisão

- [x] Fazer build/typecheck, inspecionar diff/recursos locais e observar desktop/mobile no navegador.
- [x] Revisar problemas de fidelidade e integração; corrigir.
- [x] Atualizar documentação operacional se necessário, registrar limites reais e commit no branch isolado.
