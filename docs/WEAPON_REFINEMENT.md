# Refino de Arma

A habilidade **Refino de Arma (WS_WEAPONREFINE)** tem uma janela própria no painel de habilidades. Ela usa as taxas normais do Hercules pré-renovação e permite refinar armas até o nível aprendido, com máximo de **+10**.

> **Na falha, a arma é destruída, incluindo cartas, raridade e bônus.** Cada tentativa precisa de confirmação explícita. Uma arma marcada como favorita também pode ser perdida nessa tentativa.

## Como usar

1. Aprenda a habilidade pela árvore da sua classe e cumpra os pré-requisitos exibidos.
2. Identifique a arma e deixe-a desequipada na mochila.
3. Abra **Habilidades → Refinar arma**. Abrir o menu consome **5 SP base**, sujeitos aos modificadores de custo existentes, mesmo se não houver arma disponível.
4. Escolha uma arma e confira refino atual, próximo nível, material, limite aprendido e chance com seu Job atual.
5. Marque a confirmação de risco e confirme uma única tentativa.

Selecionar, responder ou cancelar não cobra SP novamente. Cancelar não devolve o SP da abertura. Retomar um menu já aberto, inclusive após reconectar, não cobra outra abertura. Depois de encerrar esse menu, a próxima abertura tem seu próprio custo.

A janela é movível e a caça continua enquanto ela está aberta. Para abrir uma nova lista, fique em pé; um menu pago anteriormente pode ser concluído durante o descanso. Derrota, mudança de mapa, mudança incompatível de classe/habilidade ou atualização dos dados do catálogo encerram a autorização sem devolver SP.

## Materiais

Cada tentativa válida usa **uma unidade** do minério correspondente ao nível da arma. Não há taxa de zeny nesta habilidade.

| Nível da arma | Minério |
|---|---|
| 1 | Phracon |
| 2 | Emveretarcon |
| 3 ou 4 | Oridecon |

Esses minérios ficam protegidos da venda automática de loot comum. A disponibilidade segue as fontes e aquisições já existentes no jogo.

## Chances normais

A tabela abaixo é a chance em **Job 50**, pelo refino que será obtido:

| Nível da arma | +1 | +2 | +3 | +4 | +5 | +6 | +7 | +8 | +9 | +10 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 60% | 40% | 19% |
| 2 | 100% | 100% | 100% | 100% | 100% | 100% | 60% | 40% | 20% | 19% |
| 3 | 100% | 100% | 100% | 100% | 100% | 60% | 50% | 20% | 20% | 19% |
| 4 | 100% | 100% | 100% | 100% | 60% | 40% | 40% | 20% | 20% | 9% |

Cada Job acima de 50 acrescenta **0,5 ponto percentual**; cada Job abaixo de 50 retira a mesma quantidade. Assim, Job 49 pode ter 99,5% onde a tabela mostra 100%, e Job 70 acrescenta 10 pontos percentuais. A janela exibe a chance atual, limitada visualmente entre 0% e 100%.

## Resultado e diferenças em relação ao ferreiro

No sucesso, a arma recebe +1 e mantém suas outras propriedades. Uma arma quebrada permanece quebrada: refino não é reparo. Na falha, a entrada selecionada é removida com suas cartas e bônus; outras armas iguais da mochila permanecem intactas.

O serviço do NPC ferreiro continua separado: tem custo de zeny, máximo +7 e suas próprias regras. As taxas, materiais e destruição descritos nesta página são da **habilidade Refino de Arma**.

## Base e adaptações

Fonte fixada: Hercules `410b9738c049ab1825d67b36b072d837c1d0b33a` — [tabela pré-renovação](https://github.com/HerculesWS/Hercules/blob/410b9738c049ab1825d67b36b072d837c1d0b33a/db/pre-re/refine_db.conf), [executor nativo](https://github.com/HerculesWS/Hercules/blob/410b9738c049ab1825d67b36b072d837c1d0b33a/src/map/skill.c#L18100) e [lista e resposta do menu](https://github.com/HerculesWS/Hercules/blob/410b9738c049ab1825d67b36b072d837c1d0b33a/src/map/clif.c#L7005).

Adaptações do Idle: o menu é durável por personagem; a resposta repete as verificações de classe/habilidade legítima, identificação e arma desequipada. O servidor também valida a mesma instância e assinatura do item antes da tentativa. Favoritos e armas quebradas continuam elegíveis, como na seleção nativa. O sistema de fama de armas forjadas ainda não existe neste domínio.

Regras e proveniência executáveis ficam em [weaponRefineRules.ts](../idle/shared/weaponRefineRules.ts) e [source-manifest.json](../idle/content/source-manifest.json). Nenhum script arbitrário de item é executado.
