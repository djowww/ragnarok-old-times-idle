# Plano: hub de serviços de Prontera

**Spec:** `../specs/2026-10-04-prontera-services-design.md`

## Restrições

Reutilizar a worktree `codex/ragnarok-browser-local`; preservar todas as alterações/progresso existentes. Sem wipe, commit ou publicação. Não adicionar nem executar testes automatizados sem pedido. Fazer typecheck, build e verificação manual local como validação de implementação.

## Etapas

1. [x] **Persistência e comando de aparência** — tipo `Appearance`, defaults para perfil novo e legado, comando atômico com faixa limitada e condição de cidade.
2. [x] **Paletas e hairstyle real** — preservar os índices do SPR, carregar `.pal` do cliente para cabelo/roupa, resolver cabelo 1–28 e limitar o cache de atores; fallback seguro para recurso opcional ausente.
3. [x] **Prévia e aplicação no jogador** — personagem em cena, seleção e equipamento recebem a aparência salva; estilista usa a mesma prévia ao editar.
4. [x] **Janela estilista** — seletor de penteado e cores, preview, salvar/descartar, estado ocupado e CSS no tema RO.
5. [x] **Ferreiro e quadro de quests futuro** — Oridecon/Elunium com compra existente, refino com regras do engine e card de quests “Em breve”.
6. [x] **Cidade e acesso na HUD** — janelas `city`/`blacksmith`/`stylist`, hub, botão retorna pelo comando existente, serviços restritos ao status de cidade e foco acessível.
7. [x] **Verificação** — `pnpm typecheck`, build Vite, imagem Docker, serviço refeito e health `200`; bundle inclui hub/serviços e os pares SPR/ACT do penteado 28 respondem `200`. Navegação manual confirmou retorno à cidade, hub, loja, ferreiro e estilista; prévia de cabelo/paletas funcionou e foi descartada. Nenhum item foi comprado nem aparência salva. O resumo offline foi reconhecido (os ganhos já estavam aplicados) e o personagem ficou em Prontera com o hub aberto.

## Interfaces de implementação

- `Appearance = { hairStyle: number; hairColor: number; clothesColor: number }`, defaults `{0,0,0}`; usuário usa faixas Hercules hairstyle `0–27`, cabelo `0–8`, roupa `0–4`.
- `GameCommand` ganha `{type:"changeAppearance"; hairStyle:number; hairColor:number; clothesColor:number}`.
- `loadActor(asset, weaponVisual?, appearance?)` mantém compatibilidade com todos os chamadores atuais; atores não-player recebem `undefined`.
- Janela `city` apresenta atalhos para `shop`, `blacksmith`, `stylist` e quadro “Em breve”.
- Ferreiro usa `buy` para IDs 984/985 e `refine` por UID de equipamento.

## Revisão do plano

- Separar mecânica persistida da apresentação do hub.
- Evitar mudança do catálogo e do equilíbrio de compra/refino: ambos já têm autoridade no servidor.
- Preservar compatibilidade com perfil schema v1 adicionando default no decode; não exigir wipe/schema bump.
- Hairstyle/cor aplicam só nos pixels do ator do jogador, com cache por appearance e fallback quando assets faltarem.
- Revisão de código encontrou e corrigiu o pareamento do `.act` ao trocar o `.spr` do penteado; ambos agora usam o mesmo índice de estilo e gênero.
- Trabalho sequencial por causa da interface compartilhada em `App.tsx`, `Scene.tsx`, `renderer.ts` e contratos de estado.
