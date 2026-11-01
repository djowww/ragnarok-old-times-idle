# Correções de animação, profundidade, esgoto e diário

Pedido: revisar ataques em oito direções e várias armas; corrigir personagem piscando perto de árvores, movimento/BGM do esgoto e ícones do livro/diário.

## Restrições

Usar o worktree existente, preservar progresso e alterações anteriores. Comparar com o cliente original fixado e os GRFs locais. Correções de causa comprovada; sem refatoração ou features paralelas. Sem testes automatizados, wipe, publicação, commits ou dependências. Typecheck, build e inspeção manual permitidos. A autorização do usuário cobre as correções e execução sem novos gates de processo.

## Propriedade e sequência

- [x] Ataques: auditar renderer/weapon e cliente original para todas as direções, classes atuais e tipos de armas. Corrigir somente divergências comprovadas; dono attack_directions_audit.
- [x] Árvores: investigar propriedade do desenho nativo/canvas e profundidade; corrigir handoff, retenção de poses e liberação explícita. Dono tree_flicker_debug em nativeActors e patch; Scene coordenado pelo root.
- [x] Esgoto: conferir mp3nametable/BGM real, terreno GAT e trajetória do farm; corrigir mapeamento ou navegação conforme evidência. Dono sewer_map_debug; arquivos de Scene/motor exigem coordenação.
- [x] Diário: bitmaps clássicos têm 30×20; o menu os comprime para 22px e ignora magenta transparente. Decodificar pelo helper existente e manter dimensões nativas, rótulos acessíveis e textos legíveis. Dono root em App e CSS.
- [x] Revisão independente do diff exato contra .superpowers/sdd/attack-map-debug/baseline, correção de achados.
- [x] Typecheck, build/deploy Docker e inspeção final de cena/menus/esgoto; registrar limites da verificação de todas as combinações de armas.

## Evidência inicial

Cliente original BasicInfoV0 usa os mesmos btn_* como botões completos de 30×20. DOM do jogo confirma naturalWidth=30, naturalHeight=20, renderedWidth=22. Dataset inicial: cinco atores nativos, zero corpos no canvas. Leitura do bridge revela que uma textura nova pode restaurar um corpo no canvas apesar do desenho nativo anterior; o timeout nativo pode cessar sem liberar a propriedade confirmada ao parent. A sombra não escreve no depth buffer. BGM do esgoto e navegação ainda em diagnóstico; não substituir por música arbitrária.
