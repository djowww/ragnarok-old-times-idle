# Plano: polimento da cena clássica

Spec: ../specs/2026-10-04-scene-polish-design.md

## Restrições globais

Preservar progresso, Hercules, farm real, respawn 6s, loot 4s, BGM original, escala 1.1, zoom e janelas móveis. Sem wipe, commits, publicação, dependências ou testes automatizados. Typecheck/build/revisão/inspeção manual permitidos. Não revelar raridade nem identidade de equipamentos antes da identificação.

## Tarefas e propriedade

- [x] 1. Auditoria do renderer nativo: determinar integração real de profundidade e contrato mínimo. Dono terrain_depth_audit; inicial somente leitura.
- [x] 2. HUD/controles/recompensas: App.tsx, ChatJournal/chat.css, novo CSS importado por main, novo componente de notificações. Texto legível, caça compacta sem duplicação, barra recolhível persistida sem perda de slots/cooldowns, toasts novos sem replay/foco. Dono hud_reward_polish.
- [x] 3. Cena/alvo/loot/NPC: Scene.tsx, mapLife.ts e estilos próprios da cena. Sombras suaves, seleção/HP no alvo real, tooltips do loot, patrulhas válidas/falas espaçadas. Dono scene_life_polish. Não editar App/main/native bridge.
- [x] 4. Integração de profundidade nativa se necessária: MapViewer patch, OriginalMap/mapProjection e componente/helper novo. Dono terrain_depth_audit após auditoria/contrato coordenado; comunicação com Scene owner antes da integração.
- [x] 5. Revisões independentes com diffs de baselines de cada tarefa; corrigir achados.
- [x] 6. Typecheck/build/deploy Docker local, inspeção manual e captura final. Dono root.

## Interfaces/preflight

HUD owner importa CSS próprio após fullscreen.css; Scene owner importa CSS próprio em Scene para evitar concorrência em estilos existentes. Scene mantém props atuais; event tooltip deriva catálogo/evento sem mudar engine. Notifications recebe snapshot/catalog e não altera servidor; primeira amostra estabelece baseline. Native contract só será usado em Scene depois de comunicado a ambos os donos.
