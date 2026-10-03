# Task 6 — interface de jogo

Implementação concluída em 2026-10-03 no worktree `C:/Users/Usuário/.codex/worktrees/ragnarok-browser-local/RagIDLE`.

## Entrega

- Cockpit React/TypeScript em português com pergaminho claro, molduras azuis discretas, acento de latão e barras de HP/SP/EXP.
- Personagem e sete posições de equipamento à esquerda, cena e preparação de caça ao centro, jornada e diário à direita.
- Oito painéis completos: mochila, loja, atributos/habilidades, mapa, missões, bestiário, classes e desafios.
- Cena Canvas original com paisagens por área, sprites locais SPR/ACT, corpo/cabeça, espera/ataque/dano/derrota e números derivados exclusivamente dos eventos do servidor.
- Enquadramento calculado das camadas ACT para não cortar cabeças e não ampliar demais o personagem. Ícones locais BMP pela API do agente de recursos.
- A 360 px, a cena vem primeiro; os atalhos inferiores persistem, abrem o painel e permitem voltar à caça. O diário pode ser expandido. A compra fica acima da lista de mercadorias e a seleção de item abre seus detalhes.
- Foco visível, navegação de abas com setas/Home/End, labels, região de alerta, janela nativa de resumo e respeito a `prefers-reduced-motion`.
- Estados de carregamento, vazio, erro de conexão, proteção de venda, requisitos não atendidos e indisponibilidade de recursos.

## Todos os comandos conectados

| Comando | Controle |
|---|---|
| `startHunt` | Seleção de área/cena e mapa |
| `stop`, `rest` | Cidade, desistência de desafio e descanso |
| `setGender` | Avatar do Aprendiz antes da evolução |
| `allocate` | Seis atributos com custo real por aumento |
| `learnSkill`, `setRotation` | Habilidades, aprendizado, melhoria e até três prioridades com ordenação/remoção |
| `buy` | Loja, quantidade inteira, total e saldo |
| `sell`, `sellLoot` | Venda individual e loot comum na cidade, com proteção indicada |
| `equip`, `unequip`, `favorite` | Detalhe da mochila e posições do personagem |
| `refine` | Material, custo, probabilidade e proteção do refinamento existente |
| `socket` | Carta compatível, preview de efeitos/posição, consumo e inserção |
| `changeClass`, `rebirth` | Evolução elegível, ramo/gênero e confirmação de renascimento |
| `setPotions`, `setAutoResume` | Limites HP/SP, desativação por 0% e retomada após recuperação |
| `claimQuest`, `challenge` | Progresso/recompensas e desafios com nível/intervalo |
| `dismissOffline` | Continuar aventura no resumo do retorno |

## Autoridade e transporte

- O cliente envia somente intenções tipadas; não gera EXP, drops, dano, zeny ou recompensas.
- Sessão e comandos compartilham um bloqueio. Um comando aguarda a sessão em curso; cliques repetidos são bloqueados enquanto uma intenção está enfileirada ou enviada. Não há polling sobreposto.
- Snapshots com revisão menor, ou com mesmo número de revisão e tempo anterior, são descartados.
- Erros preservam a última apresentação válida. Uma falha com resultado desconhecido conserva o UUID original e bloqueia novas intenções até recuperar a mesma ação pelo botão de retry.
- Falha de recurso mantém o jogo utilizável com representação de reserva e aviso. O botão para recarregar recursos preserva o progresso do servidor.
- Música opcional foi omitida; nenhum arquivo de áudio confirmado foi fornecido e não há um botão sem efeito.

## Verificação observada

1. `node node_modules/typescript/bin/tsc --noEmit`: exit 0; nenhum erro de UI. O primeiro passe durante integração mostrou erros apenas no servidor, posteriormente resolvidos pelo coordenador.
2. `node node_modules/vite/bin/vite.js build`: exit 0, sem warning de CSS. Resultado final: `index-CfdzhbpU.js` e `index-CJKuGemQ.css`; JS 285,84 kB / gzip 88,36 kB, CSS 44,23 kB / gzip 10,51 kB.
3. Chrome real, UI em Vite 5173 conectada à API/MariaDB 3339, seguida pela aplicação instalada em 3339. Nenhum erro de console nos fluxos normais.
4. Caça normal em Sul de Prontera: sprites reais de Aprendiz, Lunatic/Drops/Poring, animações, redução de HP/SP, consumo de poções, aumento de Base/Job, abates e loot. O personagem avançou naturalmente de Base 1/Job 1 a Base 7/Job 6 durante a verificação. Não houve injeção de XP, SQL ou endpoint de concessão.
5. Compra de uma Red Potion: saldo 200 → 150 z, quantidade 3 → 4. Venda de loot comum: saldo 150 → 250 z, preservando Knife, Cotton Shirt e consumíveis. Desequipar/equipar a faca: ATQ 18 → 1 → 18. Estas foram interações normais autorizadas.
6. Largura 360 px: grid de uma coluna, cena primeiro, atalhos inferiores fixos, compra legível, detalhes de itens utilizáveis. Medição DOM: `innerWidth=360`, `clientWidth=345`, `scrollWidth=345` (15 px de scrollbar); nenhuma rolagem horizontal.
7. Ausência real de 82 segundos: resumo com quatro abates, +72 EXP base, +44 EXP classe, +1 Job, oito poções, Apple e Jellopy. Dismiss permaneceu sem concessão adicional.
8. Proxy QA temporário, que encaminhou o catálogo e o estado reais e injetou somente respostas 503: falha de recursos exibiu reserva/aviso e controles utilizáveis; falha de API manteve Base 7/Job 6/250 z na tela com retry.
9. Regressão do P2 encontrado pelo revisor: `dismissOffline` com 503 exibe retry habilitado **dentro** da janela. Restaurar API e clicar nesse retry fechou o resumo sem recarregar, usando o mesmo receipt. O controle atrás da janela não é mais necessário para recuperar a ação.
10. Preview de carta selecionada exibe `ItemFacts` antes de “Inserir carta”: nome, efeitos traduzidos, porcentagens e posição compatível. Não foi concedida artificialmente uma carta para exercitar essa ação no perfil inicial.

## Evidência visual

Diretório absoluto: `C:/Users/Usuário/.codex/worktrees/ragnarok-browser-local/RagIDLE/.superpowers/sdd/2026-10-03-ragnarok-old-times-idle/screenshots/`.

- `mobile-hunt.jpg`: caça real a 360 px.
- `offline-return.jpg`: retorno natural com ganhos.
- `offline-dismiss-error.jpg`: retry acessível na janela após 503.
- `resource-fallback.jpg`: reserva de recursos com valores e comandos disponíveis.
- `api-error-preserved-state.jpg`: falha de API com estado anterior preservado.
- `desktop-final.jpg` e `mobile-final.jpg`: capturas finais da instalação em 3339 após o rebuild final do coordenador.

## Limites da verificação

- Renascimento, refinamento alto, inserção real de carta, segunda classe e chefes exigem progresso que o perfil inicial ainda não possui. Os controles foram conectados e inspecionados contra os contratos/regras reais; sua execução completa pertence aos testes de motor/integracão do coordenador. Nenhuma condição bloqueada é apresentada como vitória observada no navegador.
- O motor e os decoders pertencem a outros agentes; não foram editados por esta tarefa. O coordenador informou a passagem da suíte integrada de 86 testes com banco/recursos reais.
- As capturas são evidência local ignorada pelo Git. Somente os fontes da UI e este relatório entram no commit. Os helpers de Vite/QA são encerrados ao finalizar; 3339 permanece como o jogo instalado.
