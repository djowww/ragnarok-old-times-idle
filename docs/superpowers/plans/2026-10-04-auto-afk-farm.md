# Plano: auto AFK farm, sprites e BGM

**Spec:** `../specs/2026-10-04-auto-afk-farm-design.md`

## Restrições globais

Worktree `codex/ragnarok-browser-local`; manter progresso e mudanças anteriores. Sem testes automatizados, wipe, commits ou publicação. Fonte Hercules `410b9738c049ab1825d67b36b072d837c1d0b33a` e roBrowser `d88a3cd4acde0582530e3fc1908532a92e9accea`. Combate causal já corrigido, First Aid5HP3SPcast0, status/casts/ASPD/cooldowns e challenges preservados. Escala visual1.1 sem efeitos no alcance/câmera; loot quatro segundos. Música vem exclusivamente do cliente local.

## Tarefas

- [x] 1. Farm servidor: perseguição/alcance/seleção contínua, população e respawn, pausa/rest/recovery/mudança de mapa. Dono afk_farm_engine: engine encounters/commands/index/recovery; shared types/battleSpatial/fieldPopulation/hunt/combatRange.
- [x] 2. Sprites e barra: fator compartilhado, previews sem cortes, retirar F labels/compensação CSS. Dono sprite_shortcuts: renderer/helper, App/estilos/ShopScene; somente bloco ActorPreview/import da Scene, coordenado com root.
- [x] 3. BGM: exportar tabela original/hash, player usa mapping importado e mantém gesto/mesma faixa. Dono classic_map_bgm: mapBgm/AudioToggle se necessário, export-map-bgm/metadata. Source audio já correto para11 mapas; adicionar loja.
- [x] 4. Integrar Scene com movimento durante sessão, direção/posição/escala1.1 e estado visível de hunt; exportar velocidade original; corrigir prop de mapa da música e proxy Range. Dono root: Scene fora do preview, World, catálogo/exporter, server/app e docs. App prop de música delegado ao dono2.
- [x] 5. Revisões independentes e ajustes de integração.
- [x] 7. Correção observada na inspeção: camera follow nativo sem alterar zoom; bridge validado, origem sceneFocus estável e NPCs/loot preservados. Sprite owner: patch MapViewer; root: OriginalMap/mapProjection/mapLife/Scene; revisão independente.
- [x] 6. Typecheck/build, deploy local, saúde/inspeção da caminhada-alvo-morte-próximo/respawn/BGM e captura final.

## Interfaces

Engine publica fieldHero.phase?/targetId? e mantém trajetos interpoláveis pelos helpers compartilhados; renderer usa fieldHero mesmo com battle ativo. Sprite factor exportado pelo renderer, aplicado apenas aos actorPaints e previews. Metadata audio importado por mapBgm e reproduzível pela ferramenta própria. `Monster.moveSpeedMs?` vem de mob_db.conf MoveSpeed; campo opcional conserva saves/catalogs antigos.

## Diagnóstico

Já existe população de3/4 e respawn6s. O congelamento do jogador e redirecionamento do monstro criam a impressão de ondas; ao matar, a sessão termina antes de buscar os vivos. F1–F9 são somente rótulos (nenhum handler de função encontrado). mp3nametable original confirma faixas atuais e `prt_in=08`; proxy não encaminha Range. Execução concluída sob autorização persistente do usuário.
